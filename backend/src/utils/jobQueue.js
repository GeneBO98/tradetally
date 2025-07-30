const db = require('../config/database');
const logger = require('./logger');

class JobQueue {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
  }

  /**
   * Add a job to the queue
   * @param {string} type - Job type (cusip_resolution, strategy_classification, symbol_enrichment, mae_mfe_estimation)
   * @param {object} data - Job data
   * @param {number} priority - Priority (1=highest, 5=lowest)
   * @param {string} userId - User ID for the job
   */
  async addJob(type, data, priority = 3, userId = null) {
    const query = `
      INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
      RETURNING id
    `;
    
    try {
      let serializedData;
      try {
        serializedData = JSON.stringify(data);
      } catch (stringifyError) {
        logger.logError(`Failed to serialize job data: ${stringifyError.message}`);
        logger.logError(`Job data: ${data}`);
        throw new Error(`Cannot serialize job data: ${stringifyError.message}`);
      }
      const result = await db.query(query, [type, serializedData, priority, userId]);
      logger.logImport(`Added job ${result.rows[0].id} of type ${type} to queue`);
      
      // Start processing if not already running
      this.startProcessing();
      
      return result.rows[0].id;
    } catch (error) {
      logger.logError(`Failed to add job to queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add multiple jobs in batch
   */
  async addBatchJobs(jobs) {
    if (!jobs || jobs.length === 0) return [];

    const values = [];
    const placeholders = [];
    
    jobs.forEach((job, index) => {
      const baseIndex = index * 5;
      placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`);
      values.push(job.type, JSON.stringify(job.data), job.priority || 3, job.userId || null, 'pending');
    });

    const query = `
      INSERT INTO job_queue (type, data, priority, user_id, status)
      VALUES ${placeholders.join(', ')}
      RETURNING id, type
    `;

    try {
      const result = await db.query(query, values);
      logger.logImport(`Added ${result.rows.length} jobs to queue`);
      
      // Start processing if not already running
      this.startProcessing();
      
      return result.rows;
    } catch (error) {
      logger.logError(`Failed to add batch jobs to queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get next job to process
   */
  async getNextJob() {
    const query = `
      UPDATE job_queue 
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' 
        ORDER BY priority ASC, created_at ASC 
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    try {
      const result = await db.query(query);
      
      if (result.rows[0]) {
        logger.logImport(`✅ Claimed job ${result.rows[0].id} of type ${result.rows[0].type}`);
        return result.rows[0];
      }
      
      // No jobs found - this is normal when queue is empty, don't log it
      return null;
    } catch (error) {
      logger.logError(`❌ Failed to get next job: ${error.message}`);
      return null;
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, result = null) {
    const query = `
      UPDATE job_queue 
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, result = $2
      WHERE id = $1
      RETURNING *
    `;

    try {
      const jobResult = await db.query(query, [jobId, result ? JSON.stringify(result) : null]);
      const job = jobResult.rows[0];
      logger.logImport(`Job ${jobId} completed successfully`);
      
      // Check if this job was for trade enrichment
      if (job && job.data) {
        const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;
        const tradesToCheck = new Set();
        
        // Collect all trade IDs that need enrichment status check
        if (data.tradeId) {
          tradesToCheck.add(data.tradeId);
        }
        if (data.tradeIds) {
          data.tradeIds.forEach(id => tradesToCheck.add(id));
        }
        
        // Also check trades affected by CUSIP resolution
        if (result && result.affectedTradeIds) {
          result.affectedTradeIds.forEach(id => tradesToCheck.add(id));
        }
        
        // Check enrichment status for all affected trades
        for (const tradeId of tradesToCheck) {
          await this.checkAndUpdateTradeEnrichmentStatus(tradeId);
        }
      }
    } catch (error) {
      logger.logError(`Failed to complete job ${jobId}: ${error.message}`);
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error) {
    const query = `
      UPDATE job_queue 
      SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = $2, retry_count = retry_count + 1
      WHERE id = $1
    `;

    try {
      const errorMessage = typeof error === 'string' ? error : error.message || JSON.stringify(error);
      await db.query(query, [jobId, errorMessage]);
      logger.logError(`Job ${jobId} failed: ${errorMessage}`);
    } catch (dbError) {
      logger.logError(`Failed to mark job ${jobId} as failed: ${dbError.message}`);
    }
  }

  /**
   * Start processing jobs
   */
  startProcessing() {
    if (this.isProcessing) {
      logger.logImport('Job queue processing already started');
      return;
    }

    this.isProcessing = true;
    logger.logImport('🚀 Starting job queue processing');

    // Process jobs every 5 seconds
    this.processingInterval = setInterval(async () => {
      try {
        const processed = await this.processNextJob();
        // Only log when we actually process a job or there's an issue
        if (processed === null) {
          // Job processing failed, already logged in processNextJob
        }
        // Don't log when processed === false (no jobs found) - this is normal
      } catch (error) {
        logger.logError(`❌ Error in job processing: ${error.message}`);
        logger.logError(`Stack trace: ${error.stack}`);
      }
    }, 5000);
    
    logger.logImport('✅ Job queue processing interval started (every 5 seconds)');
  }

  /**
   * Stop processing jobs
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    logger.logImport('Stopped job queue processing');
  }

  /**
   * Process the next job in queue
   */
  async processNextJob() {
    const job = await this.getNextJob();
    if (!job) {
      return false; // No job found - this is normal, don't log it
    }

    logger.logImport(`🚀 Processing job ${job.id} of type ${job.type}`);

    try {
      let data;
      // Handle both string (text) and object (jsonb) data types
      if (typeof job.data === 'string') {
        try {
          data = JSON.parse(job.data);
        } catch (parseError) {
          logger.logError(`Failed to parse job data for job ${job.id}: ${parseError.message}`);
          logger.logError(`Raw job data: ${job.data}`);
          throw new Error(`Invalid job data format: ${parseError.message}`);
        }
      } else if (typeof job.data === 'object' && job.data !== null) {
        // Data is already parsed (jsonb column type)
        data = job.data;
      } else {
        logger.logError(`Unexpected job data type for job ${job.id}: ${typeof job.data}`);
        logger.logError(`Raw job data: ${job.data}`);
        throw new Error(`Unexpected job data type: ${typeof job.data}`);
      }
      let result = null;

      switch (job.type) {
        case 'cusip_resolution':
          result = await this.processCusipResolution(data);
          break;
        case 'strategy_classification':
          result = await this.processStrategyClassification(data);
          break;
        case 'symbol_enrichment':
          result = await this.processSymbolEnrichment(data);
          break;
        case 'mae_mfe_estimation':
          result = await this.processMaeMfeEstimation(data);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await this.completeJob(job.id, result);
      logger.logImport(`✅ Job ${job.id} completed successfully`);
      return true; // Job was processed
    } catch (error) {
      logger.logError(`❌ Job ${job.id} failed: ${error.message}`);
      logger.logError(`Stack trace: ${error.stack}`);
      await this.failJob(job.id, error.message);
      return true; // Job was processed (but failed)
    }
  }

  /**
   * Process CUSIP resolution job
   */
  async processCusipResolution(data) {
    const cusipResolver = require('./cusipResolver');
    const { cusips, userId } = data;
    
    logger.logImport(`Resolving ${cusips.length} CUSIPs for user ${userId}`);
    const results = await cusipResolver.batchResolveCusips(cusips, userId);
    
    // Update trades with resolved symbols and track affected trade IDs
    const affectedTradeIds = new Set();
    
    for (const [cusip, symbol] of Object.entries(results)) {
      if (symbol) {
        const updateQuery = `
          UPDATE trades 
          SET symbol = $1 
          WHERE symbol = $2 
          ${userId ? 'AND user_id = $3' : ''}
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          RETURNING id
        `;
        
        const values = [symbol, cusip];
        if (userId) values.push(userId);
        
        const updateResult = await db.query(updateQuery, values);
        updateResult.rows.forEach(row => affectedTradeIds.add(row.id));
      }
    }
    
    // Store affected trade IDs in the result for enrichment status tracking
    return { 
      ...results, 
      affectedTradeIds: Array.from(affectedTradeIds) 
    };
  }

  /**
   * Process strategy classification job
   */
  async processStrategyClassification(data) {
    const Trade = require('../models/Trade');
    const enrichmentCacheService = require('../services/enrichmentCacheService');
    
    // Handle both single trade and batch formats
    let tradesToProcess = [];
    if (data.tradeIds) {
      // Old batch format
      tradesToProcess = data.tradeIds.map(id => ({ tradeId: id }));
    } else if (data.tradeId) {
      // New single trade format
      tradesToProcess = [data];
    } else {
      throw new Error('No trade ID(s) provided in strategy classification job');
    }
    
    logger.logImport(`Classifying strategies for ${tradesToProcess.length} trades`);
    
    for (const tradeData of tradesToProcess) {
      try {
        // Use provided trade data if available, otherwise fetch from DB
        let trade;
        if (tradeData.symbol && tradeData.entry_time) {
          // Use the provided trade data directly
          trade = {
            id: tradeData.tradeId,
            symbol: tradeData.symbol,
            entry_time: tradeData.entry_time,
            exit_time: tradeData.exit_time,
            entry_price: tradeData.entry_price,
            exit_price: tradeData.exit_price,
            quantity: tradeData.quantity,
            side: tradeData.side,
            pnl: tradeData.pnl,
            hold_time_minutes: tradeData.hold_time_minutes
          };
        } else {
          // Fetch from database
          trade = await Trade.findById(tradeData.tradeId);
        }
        
        if (trade && (!trade.strategy || trade.strategy === 'day_trading' || 
            (trade.classification_metadata && JSON.parse(trade.classification_metadata).needsFullClassification))) {
          
          const classification = await Trade.classifyTradeStrategyWithAnalysis(trade);
          
          if (classification && typeof classification === 'object') {
            await db.query(`
              UPDATE trades 
              SET strategy = $1, strategy_confidence = $2, classification_method = $3, classification_metadata = $4
              WHERE id = $5
            `, [
              classification.strategy,
              Math.round((classification.confidence || 0.5) * 100),
              classification.method || 'background_analysis',
              JSON.stringify({
                signals: classification.signals || [],
                holdTimeMinutes: classification.holdTimeMinutes,
                priceMove: classification.priceMove,
                analysisTimestamp: new Date().toISOString(),
                backgroundProcessed: true
              }),
              trade.id
            ]);
            
            logger.logImport(`Updated strategy for trade ${trade.id}: ${classification.strategy} (${Math.round((classification.confidence || 0.5) * 100)}% confidence)`);
            
            // Store the classification data in enrichment cache
            try {
              await enrichmentCacheService.storeTradeEnrichmentData(trade, 'strategy_classification', {
                strategy: classification.strategy,
                confidence: classification.confidence,
                method: classification.method,
                signals: classification.signals,
                api_provider: 'finnhub'
              });
            } catch (cacheError) {
              logger.logError(`Failed to cache strategy classification for trade ${trade.id}: ${cacheError.message}`);
            }
          }
        }
      } catch (error) {
        logger.logError(`Failed to classify trade ${tradeData.tradeId}: ${error.message}`);
      }
    }
    
    return { processed: tradesToProcess.length };
  }

  /**
   * Process symbol enrichment job
   */
  async processSymbolEnrichment(data) {
    const symbolCategories = require('./symbolCategories');
    const { symbols } = data;
    
    logger.logImport(`Enriching ${symbols.length} symbols`);
    
    for (const symbol of symbols) {
      try {
        await symbolCategories.enrichSymbol(symbol);
      } catch (error) {
        logger.logError(`Failed to enrich symbol ${symbol}: ${error.message}`);
      }
    }
    
    return { processed: symbols.length };
  }

  /**
   * Process MAE/MFE estimation job
   */
  async processMaeMfeEstimation(data) {
    const maeEstimator = require('./maeEstimator');
    const enrichmentCacheService = require('../services/enrichmentCacheService');
    const { tradeIds } = data;
    
    logger.logImport(`Estimating MAE/MFE for ${tradeIds.length} trades`);
    
    for (const tradeId of tradeIds) {
      try {
        const trade = await db.query('SELECT * FROM trades WHERE id = $1', [tradeId]);
        if (trade.rows[0]) {
          const tradeData = trade.rows[0];
          const estimates = await maeEstimator.estimateMAEMFE(tradeData);
          
          if (estimates.mae !== null || estimates.mfe !== null) {
            await db.query(`
              UPDATE trades 
              SET mae = $1, mfe = $2
              WHERE id = $3
            `, [estimates.mae, estimates.mfe, tradeId]);
            
            // Store MAE/MFE data in enrichment cache
            try {
              await enrichmentCacheService.storeTradeEnrichmentData(tradeData, 'mae_mfe_estimation', {
                typical_mae_percent: estimates.mae,
                typical_mfe_percent: estimates.mfe,
                confidence: estimates.confidence || 70, // Default confidence
                api_provider: 'internal_calculation'
              });
            } catch (cacheError) {
              logger.logError(`Failed to cache MAE/MFE data for trade ${tradeId}: ${cacheError.message}`);
            }
          }
        }
      } catch (error) {
        logger.logError(`Failed to estimate MAE/MFE for trade ${tradeId}: ${error.message}`);
      }
    }
    
    return { processed: tradeIds.length };
  }

  /**
   * Get queue status
   */
  async getQueueStatus() {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest_job
      FROM job_queue 
      GROUP BY status
    `;

    try {
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.logError(`Failed to get queue status: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if all enrichment jobs for a trade are completed and update status
   */
  async checkAndUpdateTradeEnrichmentStatus(tradeId) {
    try {
      // First check if the trade still exists
      const tradeExistsQuery = `SELECT id FROM trades WHERE id = $1`;
      const tradeExists = await db.query(tradeExistsQuery, [tradeId]);
      
      if (tradeExists.rows.length === 0) {
        logger.logImport(`Trade ${tradeId} no longer exists - skipping enrichment status update`);
        return;
      }
      
      // Check if there are any pending or processing jobs for this trade
      const pendingJobsQuery = `
        SELECT COUNT(*) as pending_count
        FROM job_queue
        WHERE status IN ('pending', 'processing')
        AND (
          (data->>'tradeId' = $1)
          OR (data->'tradeIds' ? $1)
        )
      `;
      
      const pendingResult = await db.query(pendingJobsQuery, [tradeId]);
      const pendingCount = parseInt(pendingResult.rows[0].pending_count);
      
      if (pendingCount === 0) {
        // No pending jobs, update trade enrichment status to completed
        const updateQuery = `
          UPDATE trades
          SET enrichment_status = 'completed',
              enrichment_completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
          AND enrichment_status != 'completed'
        `;
        
        const updateResult = await db.query(updateQuery, [tradeId]);
        
        if (updateResult.rowCount > 0) {
          logger.logImport(`Trade ${tradeId} enrichment completed - all background jobs finished`);
          
          // Send real-time enrichment update notification
          try {
            const updatedTrade = updateResult.rows[0];
            if (updatedTrade && updatedTrade.user_id) {
              const notificationsController = require('../controllers/notifications.controller');
              
              // Get current enrichment status for this user
              const enrichmentStatusQuery = `
                SELECT enrichment_status, COUNT(*) as count
                FROM trades 
                WHERE user_id = $1
                GROUP BY enrichment_status
                ORDER BY enrichment_status
              `;
              const statusResult = await db.query(enrichmentStatusQuery, [updatedTrade.user_id]);
              
              await notificationsController.sendEnrichmentUpdateToUser(updatedTrade.user_id, {
                tradeId: tradeId,
                tradeEnrichment: statusResult.rows.map(row => ({
                  enrichment_status: row.enrichment_status,
                  count: row.count
                }))
              });
            }
          } catch (notificationError) {
            logger.logError(`Failed to send enrichment notification for trade ${tradeId}: ${notificationError.message}`);
          }
        }
      }
    } catch (error) {
      logger.logError(`Failed to update trade enrichment status for ${tradeId}: ${error.message}`);
    }
  }

  /**
   * Clean up jobs for deleted trades
   */
  async cleanupJobsForDeletedTrades() {
    try {
      // Find jobs that reference trades that no longer exist
      const staleJobsQuery = `
        SELECT DISTINCT jq.id, jq.data
        FROM job_queue jq
        WHERE jq.status IN ('pending', 'processing', 'completed')
        AND (
          (jq.data->>'tradeId' IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM trades t WHERE t.id = (jq.data->>'tradeId')::uuid
          ))
        )
      `;
      
      const staleJobs = await db.query(staleJobsQuery);
      
      if (staleJobs.rows.length > 0) {
        // Update these jobs to 'cancelled' status
        const jobIds = staleJobs.rows.map(job => job.id);
        
        await db.query(`
          UPDATE job_queue 
          SET status = 'failed', 
              completed_at = CURRENT_TIMESTAMP,
              error = 'Trade no longer exists'
          WHERE id = ANY($1)
        `, [jobIds]);
        
        logger.logImport(`Cancelled ${staleJobs.rows.length} jobs for deleted trades`);
        return staleJobs.rows.length;
      }
      
      return 0;
    } catch (error) {
      logger.logError(`Failed to cleanup jobs for deleted trades: ${error.message}`);
      return 0;
    }
  }
}

// Create singleton instance
const jobQueue = new JobQueue();

module.exports = jobQueue;