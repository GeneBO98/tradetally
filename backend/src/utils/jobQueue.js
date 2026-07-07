const db = require('../config/database');
const logger = require('./logger');
const marketData = require('./finnhub');
const { PARALLEL_JOB_TYPES } = require('./jobQueueConfig');

class JobQueue {
  constructor() {
    this.isProcessing = false;
    this.pollTimer = null;
    this.pollInFlight = false;
    // Idle backoff: after idleThreshold consecutive empty polls the interval
    // doubles per empty poll up to maxPollIntervalMs; any claimed job (or an
    // in-process enqueue) resets it to basePollIntervalMs.
    this.basePollIntervalMs = 5000;
    this.maxPollIntervalMs = 30000;
    this.idleThreshold = 6;
    this.consecutiveEmptyPolls = 0;
    this.currentPollIntervalMs = this.basePollIntervalMs;
  }

  /**
   * Add a job to the queue
   * @param {string} type - Job type (cusip_resolution, strategy_classification, news_enrichment, news_backfill, quality_backfill, mae_recalc, leaderboard_update, verification_email, password_reset_email, account_lockout_email, support_request_email)
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
      // Wake the owning poller back up to its fast interval
      this.notifyJobEnqueued([type]);

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
      // Wake the owning pollers back up to their fast interval
      this.notifyJobEnqueued([...new Set(result.rows.map(row => row.type))]);

      return result.rows;
    } catch (error) {
      logger.logError(`Failed to add batch jobs to queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify pollers that new jobs were enqueued in-process so backoff resets
   * and the next poll happens at the fast interval. Types owned by the
   * parallel queue nudge that queue's worker instead of this one.
   */
  notifyJobEnqueued(types = []) {
    try {
      const parallelTypes = types.filter(type => PARALLEL_JOB_TYPES.includes(type));
      const sequentialTypes = types.filter(type => !PARALLEL_JOB_TYPES.includes(type));

      if (sequentialTypes.length > 0) {
        this.resetBackoff();
      }
      if (parallelTypes.length > 0) {
        // Lazy require to avoid a module cycle (parallelJobQueue requires
        // this module inside its job processor)
        const parallelJobQueue = require('./parallelJobQueue');
        for (const type of parallelTypes) {
          parallelJobQueue.nudge(type);
        }
      }
    } catch (error) {
      logger.logError(`Failed to notify pollers of enqueued jobs: ${error.message}`);
    }
  }

  /**
   * Reset idle backoff to the fast polling interval
   */
  resetBackoff() {
    this.consecutiveEmptyPolls = 0;
    const wasSlow = this.currentPollIntervalMs !== this.basePollIntervalMs;
    this.currentPollIntervalMs = this.basePollIntervalMs;
    // If a slow poll is already scheduled, pull it forward. When a poll is
    // in flight its completion handler reschedules using the (now reset)
    // interval, which also covers processMAERecalc re-enqueueing itself.
    if (this.isProcessing && wasSlow && !this.pollInFlight) {
      this.scheduleNextPoll(this.currentPollIntervalMs);
    }
  }

  /**
   * Get next job to process. Job types owned by the parallel queue
   * (see utils/jobQueueConfig.js) are excluded so each type has exactly
   * one owner.
   */
  async getNextJob() {
    const query = `
      UPDATE job_queue
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM job_queue
        WHERE status = 'pending'
          AND NOT (type = ANY($1))
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    try {
      const result = await db.query(query, [PARALLEL_JOB_TYPES]);
      
      if (result.rows[0]) {
        logger.logImport(`Claimed job ${result.rows[0].id} of type ${result.rows[0].type}`);
        return result.rows[0];
      }
      
      // No jobs found - this is normal when queue is empty, don't log it
      return null;
    } catch (error) {
      logger.logError(`[ERROR] Failed to get next job: ${error.message}`);
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
   * Start processing jobs (self-scheduling poll loop with idle backoff)
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.consecutiveEmptyPolls = 0;
    this.currentPollIntervalMs = this.basePollIntervalMs;
    logger.logImport('[START] Starting job queue processing');

    this.scheduleNextPoll(this.currentPollIntervalMs);

    logger.logImport(`[SUCCESS] Job queue polling started (base ${this.basePollIntervalMs}ms, idle backoff up to ${this.maxPollIntervalMs}ms)`);
  }

  /**
   * Schedule the next poll, replacing any pending timer
   */
  scheduleNextPoll(delayMs) {
    if (!this.isProcessing) return;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => this.pollOnce(), delayMs);
    if (typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref();
    }
  }

  /**
   * Run a single poll, adjust backoff based on the outcome, reschedule
   */
  async pollOnce() {
    if (!this.isProcessing) return;

    this.pollInFlight = true;
    let processed = false;
    try {
      processed = await this.processNextJob();
    } catch (error) {
      logger.logError(`[ERROR] Error in job processing: ${error.message}`);
      logger.logError(`Stack trace: ${error.stack}`);
    } finally {
      this.pollInFlight = false;
    }

    if (processed) {
      this.consecutiveEmptyPolls = 0;
      this.currentPollIntervalMs = this.basePollIntervalMs;
    } else {
      this.consecutiveEmptyPolls++;
      if (this.consecutiveEmptyPolls >= this.idleThreshold) {
        this.currentPollIntervalMs = Math.min(this.currentPollIntervalMs * 2, this.maxPollIntervalMs);
      }
    }

    this.scheduleNextPoll(this.currentPollIntervalMs);
  }

  /**
   * Stop processing jobs
   */
  stopProcessing() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
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

    logger.logImport(`[START] Processing job ${job.id} of type ${job.type}`);

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
        case 'news_backfill':
          result = await this.processNewsBackfill(data);
          break;
        case 'news_enrichment':
          result = await this.processNewsEnrichment(data);
          break;
        case 'quality_backfill':
          result = await this.processQualityBackfill(data);
          break;
        case 'mae_recalc':
          result = await this.processMAERecalc(data);
          break;
        case 'leaderboard_update':
          result = await this.processLeaderboardUpdate(data);
          break;
        case 'verification_email':
          result = await this.processVerificationEmail(data);
          break;
        case 'password_reset_email':
          result = await this.processPasswordResetEmail(data);
          break;
        case 'account_lockout_email':
          result = await this.processAccountLockoutEmail(data);
          break;
        case 'support_request_email':
          result = await this.processSupportRequestEmail(data);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await this.completeJob(job.id, result);
      logger.logImport(`Job ${job.id} completed successfully`);
      return true; // Job was processed
    } catch (error) {
      logger.logError(`[ERROR] Job ${job.id} failed: ${error.message}`);
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
    
    // Use the full CusipResolver process which handles mapping storage
    await cusipResolver.processCusipResolution(userId, cusips);
    
    // Return simple success result
    return { success: true, cusipCount: cusips.length };
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
                api_provider: marketData.providerName || 'finnhub'
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

  /**
   * Process news backfill job
   */
  async processNewsBackfill(data) {
    const newsEnrichmentService = require('../services/newsEnrichmentService');
    const { userId, batchSize = 50, maxTrades = null } = data;

    logger.logImport(`Starting news backfill for user ${userId || 'all users'}`);

    await newsEnrichmentService.backfillTradeNews({
      userId,
      batchSize,
      maxTrades
    });

    return { message: 'News backfill completed' };
  }

  /**
   * Process quality backfill job
   */
  async processQualityBackfill(data) {
    const tradeQualityService = require('../services/tradeQuality.service');
    const { userId, batchSize = 10, maxTrades = null } = data;
    const staleQualityCondition = tradeQualityService.getStaleQualityCondition();

    logger.logImport(`Starting quality backfill for user ${userId}`);

    // Get trades that need quality grading
    const tradesQuery = `
      SELECT id, symbol, entry_time, entry_price, side, news_sentiment,
             instrument_type, underlying_symbol, strike_price, expiration_date, option_type
      FROM trades
      WHERE user_id = $1
        AND ${staleQualityCondition}
        AND (instrument_type IS NULL OR instrument_type != 'future')
      ORDER BY trade_date DESC
      ${maxTrades ? `LIMIT ${maxTrades}` : ''}
    `;

    const result = await db.query(tradesQuery, [userId]);
    const trades = result.rows;

    logger.logImport(`Found ${trades.length} trades to grade for quality`);

    let graded = 0;
    let skipped = 0;

    // Process in batches to avoid overwhelming the Finnhub API
    for (let i = 0; i < trades.length; i += batchSize) {
      const batch = trades.slice(i, i + batchSize);

      for (const trade of batch) {
        try {
          const quality = await tradeQualityService.calculateQuality(
            trade.symbol,
            trade.entry_time,
            trade.entry_price,
            trade.side,
            userId,
            trade.news_sentiment,
            {
              instrumentType: trade.instrument_type,
              underlyingSymbol: trade.underlying_symbol,
              strikePrice: trade.strike_price,
              expirationDate: trade.expiration_date,
              optionType: trade.option_type
            }
          );

          if (quality && (quality.grade || quality.metrics)) {
            // Update trade with quality data, including partial metrics when
            // coverage is insufficient so a later threshold change can re-grade.
            await db.query(
              `UPDATE trades
               SET quality_grade = $1,
                   quality_score = $2,
                   quality_metrics = $3
               WHERE id = $4`,
              [quality.grade, quality.score, JSON.stringify(quality.metrics), trade.id]
            );
            if (quality.grade) graded++;
            else skipped++;
          } else {
            skipped++;
          }
        } catch (error) {
          logger.logError(`Failed to grade quality for trade ${trade.id}: ${error.message}`);
          skipped++;
        }
      }

      // Add delay between batches to respect API rate limits
      if (i + batchSize < trades.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.logImport(`Quality backfill completed: ${graded} graded, ${skipped} skipped`);
    return { message: `Quality backfill completed: ${graded} graded, ${skipped} skipped` };
  }

  /**
   * Recalculate persisted MAE/MFE for a user's trades where the fields are
   * NULL. NULL is the system's "needs recalculation" marker, so data-fix
   * migrations invalidate derived values by nulling them and enqueue one of
   * these jobs per affected user (see migration 222).
   *
   * Processes up to maxTrades per run and re-enqueues itself while it is
   * still making progress; a pass with zero successful updates stops the
   * chain so trades whose candle data simply doesn't exist (delisted or
   * too-old symbols) can't cause an infinite requeue loop.
   */
  async processMAERecalc(data) {
    const MAEEstimator = require('./maeEstimator');
    const AnalyticsCache = require('../services/analyticsCache');
    const { userId, batchSize = 5, maxTrades = 50 } = data;

    const pendingCondition = `
      user_id = $1
      AND mae IS NULL AND mfe IS NULL
      AND entry_time IS NOT NULL AND exit_time IS NOT NULL
      AND entry_price IS NOT NULL AND exit_price IS NOT NULL
      AND pnl IS NOT NULL
    `;

    const result = await db.query(
      `SELECT id, symbol, entry_time, exit_time, entry_price, exit_price, side,
              pnl, commission, fees, quantity, instrument_type, point_value,
              underlying_asset, contract_size
       FROM trades
       WHERE ${pendingCondition}
       ORDER BY entry_time DESC
       LIMIT ${parseInt(maxTrades, 10) || 50}`,
      [userId]
    );
    const trades = result.rows;

    logger.logImport(`MAE recalc: found ${trades.length} trades needing MAE/MFE for user ${userId}`);

    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < trades.length; i += batchSize) {
      const batch = trades.slice(i, i + batchSize);

      for (const trade of batch) {
        if (!MAEEstimator.isValidTradeForEstimation(trade)) {
          skipped++;
          continue;
        }
        try {
          const { mae, mfe } = await MAEEstimator.calculateFromCandleData(trade);
          await db.query('UPDATE trades SET mae = $1, mfe = $2 WHERE id = $3', [mae, mfe, trade.id]);
          updated++;
        } catch (error) {
          logger.logError(`MAE recalc failed for trade ${trade.id} (${trade.symbol}): ${error.message}`);
          skipped++;
        }
      }

      // Delay between batches to respect market-data API rate limits
      if (i + batchSize < trades.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (updated > 0) {
      await AnalyticsCache.invalidate(userId);
    }

    // Continue in a follow-up job while progress is being made
    if (updated > 0) {
      const remaining = await db.query(
        `SELECT COUNT(*)::int AS n FROM trades WHERE ${pendingCondition}`,
        [userId]
      );
      if (remaining.rows[0].n > 0) {
        await this.addJob('mae_recalc', { userId, batchSize, maxTrades }, 4, userId);
        logger.logImport(`MAE recalc: ${remaining.rows[0].n} trades remaining for user ${userId}, re-enqueued`);
      }
    }

    logger.logImport(`MAE recalc completed for user ${userId}: ${updated} updated, ${skipped} skipped`);
    return { message: `MAE recalc completed: ${updated} updated, ${skipped} skipped` };
  }

  /**
   * Rebuild all active leaderboards. Enqueued (debounced) by
   * achievementService when achievements are awarded, instead of running the
   * full rebuild inline on the award path.
   */
  async processLeaderboardUpdate() {
    const LeaderboardService = require('../services/leaderboardService');

    logger.logImport('Processing leaderboard update job');
    await LeaderboardService.updateLeaderboards();

    return { message: 'Leaderboards updated' };
  }

  /**
   * Process news enrichment job for recently imported trades
   */
  async processNewsEnrichment(data) {
    const newsEnrichmentService = require('../services/newsEnrichmentService');
    const { userId, importId, tradeCount } = data;

    logger.logImport(`Starting news enrichment for ${tradeCount} trades from import ${importId}`);

    // Get trades from the import that need news enrichment. Open trades need
    // sentiment too because setup quality consumes stored news_sentiment.
    const tradesQuery = `
      SELECT id, symbol, underlying_symbol, instrument_type, trade_date, entry_time
      FROM trades
      WHERE user_id = $1
        AND import_id = $2
        AND (has_news = FALSE OR has_news IS NULL OR news_checked_at IS NULL)
      ORDER BY trade_date DESC
    `;

    try {
      const result = await db.query(tradesQuery, [userId, importId]);
      const trades = result.rows;

      logger.logImport(`Found ${trades.length} trades to enrich with news`);

      let enriched = 0;
      let skipped = 0;

      for (const trade of trades) {
        try {
          const newsData = await newsEnrichmentService.getNewsForSymbolAndDate(
            newsEnrichmentService.resolveNewsLookupSymbol(trade),
            new Date(trade.trade_date),
            userId
          );

          // Update trade with news data
          await db.query(`
            UPDATE trades
            SET has_news = $1,
                news_events = $2,
                news_sentiment = $3,
                news_checked_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [
            newsData.hasNews,
            newsData.newsEvents ? JSON.stringify(newsData.newsEvents) : null,
            newsData.sentiment,
            trade.id
          ]);

          enriched++;
          logger.logImport(`Enriched trade ${trade.id} (${trade.symbol}): hasNews=${newsData.hasNews}`);
        } catch (error) {
          logger.logError(`Failed to enrich trade ${trade.id}: ${error.message}`);
          skipped++;
        }
      }

      return {
        enriched,
        skipped,
        total: trades.length
      };
    } catch (error) {
      logger.logError(`News enrichment job failed: ${error.message}`);
      throw error;
    }
  }

  async processVerificationEmail(data) {
    const EmailService = require('../services/emailService');
    const { email, token } = data;

    if (!email || !token) {
      throw new Error('Verification email job is missing email or token');
    }

    await EmailService.sendVerificationEmail(email, token);
    return { sent: true, email };
  }

  async processPasswordResetEmail(data) {
    const EmailService = require('../services/emailService');
    const { email, token } = data;

    if (!email || !token) {
      throw new Error('Password reset email job is missing email or token');
    }

    await EmailService.sendPasswordResetEmail(email, token);
    return { sent: true, email };
  }

  async processAccountLockoutEmail(data) {
    const EmailService = require('../services/emailService');
    const { email, token } = data;

    if (!email || !token) {
      throw new Error('Account lockout email job is missing email or token');
    }

    await EmailService.sendAccountLockoutEmail(email, token);
    return { sent: true, email };
  }

  async processSupportRequestEmail(data) {
    const EmailService = require('../services/emailService');
    await EmailService.sendSupportRequest(data);
    return { sent: true, recipient: data.to };
  }
}

// Create singleton instance
const jobQueue = new JobQueue();

module.exports = jobQueue;
