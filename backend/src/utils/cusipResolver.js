const finnhub = require('./finnhub');
const Trade = require('../models/Trade');
const logger = require('./logger');
const NotificationService = require('../services/notificationService');
const db = require('../config/database');

class CusipResolver {
  constructor() {
    this.isRunning = false;
    this.queue = [];
  }

  // Schedule CUSIP resolution for a user
  async scheduleResolution(userId, cusips) {
    if (!cusips || cusips.length === 0) return;
    
    logger.logImport(`Scheduling CUSIP resolution for ${cusips.length} CUSIPs for user ${userId}`);
    
    // Use the job queue instead of local queue
    const jobQueue = require('./jobQueue');
    const uniqueCusips = [...new Set(cusips)]; // Remove duplicates
    
    // Add job to the queue
    await jobQueue.addJob(
      'cusip_resolution',
      {
        cusips: uniqueCusips,
        userId: userId
      },
      2, // High priority
      userId
    );
    
    logger.logImport(`Added CUSIP resolution job to queue for ${uniqueCusips.length} unique CUSIPs`);
  }

  async processQueue() {
    if (this.isRunning || this.queue.length === 0) return;
    
    this.isRunning = true;
    logger.logImport('Starting CUSIP resolution background job');

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        await this.processCusipResolution(job.userId, job.cusips);
        
        // Small delay between users to avoid overwhelming APIs
        if (this.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      logger.logError(`CUSIP resolution background job failed: ${error.message}`);
    } finally {
      this.isRunning = false;
      logger.logImport('CUSIP resolution background job completed');
    }
  }

  async processCusipResolution(userId, cusips) {
    logger.logImport(`Processing CUSIP resolution for user ${userId}: ${cusips.length} CUSIPs`);
    
    try {
      // First check existing mappings in database
      const existingMappings = await this.checkExistingMappings(cusips, userId);
      logger.logImport(`Found ${Object.keys(existingMappings).length} existing mappings`);
      
      // Apply existing mappings to trades
      if (Object.keys(existingMappings).length > 0) {
        await this.updateTradeSymbols(userId, existingMappings);
      }
      
      // Filter out CUSIPs that already have mappings
      const unmappedCusips = cusips.filter(cusip => !existingMappings[cusip]);
      
      if (unmappedCusips.length === 0) {
        logger.logImport('All CUSIPs already have mappings');
        return;
      }
      
      logger.logImport(`${unmappedCusips.length} CUSIPs need new resolution`);
      
      // Use Finnhub batch API for unmapped CUSIPs
      const resolved = await this.batchResolveCusips(unmappedCusips, userId);
      
      if (Object.keys(resolved).length > 0) {
        // Store new global mappings and update trades
        await this.storeCusipMappings(resolved, 'finnhub', null);
        await this.updateTradeSymbols(userId, resolved);
        logger.logImport(`Resolved and updated ${Object.keys(resolved).length} new symbols for user ${userId}`);
      }
      
      // If some CUSIPs are still unresolved, try other sources for the remainder
      const stillUnresolved = unmappedCusips.filter(cusip => !resolved[cusip]);
      if (stillUnresolved.length > 0) {
        logger.logImport(`${stillUnresolved.length} CUSIPs still unresolved, trying additional sources`);
        
        // Try individual lookups for remaining CUSIPs (slower but more thorough)
        const additionalResolved = await this.individualResolveCusips(stillUnresolved, userId);
        
        if (Object.keys(additionalResolved).length > 0) {
          // Store AI-resolved mappings as user-specific with lower confidence
          await this.storeCusipMappings(additionalResolved, 'ai', userId, 70);
          await this.updateTradeSymbols(userId, additionalResolved);
          logger.logImport(`Resolved and updated ${Object.keys(additionalResolved).length} additional symbols for user ${userId}`);
        }
      }
      
    } catch (error) {
      logger.logError(`CUSIP resolution failed for user ${userId}: ${error.message}`);
    }
  }

  async batchResolveCusips(cusips, userId = null) {
    try {
      // Use Finnhub batch lookup with user context for AI fallback
      return await finnhub.batchLookupCusips(cusips, userId);
    } catch (error) {
      logger.logError(`Batch CUSIP lookup failed: ${error.message}`);
      return {};
    }
  }

  async individualResolveCusips(cusips, userId = null) {
    const resolved = {};
    
    // Limit to avoid overwhelming APIs
    const maxIndividualLookups = 20;
    const cusipsToProcess = cusips.slice(0, maxIndividualLookups);
    
    for (const cusip of cusipsToProcess) {
      try {
        const ticker = await finnhub.lookupCusip(cusip, userId);
        if (ticker) {
          resolved[cusip] = ticker;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.logError(`Individual CUSIP lookup failed for ${cusip}: ${error.message}`);
      }
    }
    
    return resolved;
  }

  async updateTradeSymbols(userId, cusipToTickerMap) {
    const updates = [];
    const successfulMappings = {};
    
    for (const [cusip, ticker] of Object.entries(cusipToTickerMap)) {
      try {
        const result = await Trade.updateSymbolForCusip(userId, cusip, ticker);
        if (result.affectedRows > 0) {
          updates.push({ cusip, ticker, trades: result.affectedRows });
          successfulMappings[cusip] = ticker;
          logger.logImport(`Updated ${result.affectedRows} trades: ${cusip} -> ${ticker}`);
        }
      } catch (error) {
        logger.logError(`Failed to update symbol for CUSIP ${cusip}: ${error.message}`);
      }
    }
    
    // Send real-time notification for successful mappings
    if (Object.keys(successfulMappings).length > 0) {
      try {
        await NotificationService.sendCusipResolutionNotification(userId, successfulMappings);
      } catch (error) {
        logger.logError(`Failed to send CUSIP resolution notification: ${error.message}`);
      }
    }
    
    return updates;
  }

  // Check existing CUSIP mappings in database (user-specific first, then global)
  async checkExistingMappings(cusips, userId) {
    try {
      const mappings = {};
      
      // Use the database function to get best mapping for each CUSIP
      for (const cusip of cusips) {
        const query = `SELECT * FROM get_cusip_mapping($1, $2)`;
        const result = await db.query(query, [cusip, userId]);
        
        if (result.rows.length > 0) {
          const mapping = result.rows[0];
          mappings[cusip] = mapping.ticker;
          logger.logImport(`Found existing mapping: ${cusip} -> ${mapping.ticker} (${mapping.resolution_source}${mapping.is_user_override ? ', user override' : ', global'})`);
        }
      }
      
      return mappings;
    } catch (error) {
      logger.logError(`Error checking existing CUSIP mappings: ${error.message}`);
      return {};
    }
  }

  // Store CUSIP mappings in database
  async storeCusipMappings(cusipToTickerMap, source, userId = null, confidence = 100) {
    try {
      const mappingsToStore = [];
      
      for (const [cusip, ticker] of Object.entries(cusipToTickerMap)) {
        if (ticker && cusip) {
          mappingsToStore.push({
            cusip: cusip.toUpperCase(),
            ticker: ticker.toUpperCase(),
            source,
            userId,
            confidence
          });
        }
      }
      
      if (mappingsToStore.length === 0) {
        return;
      }
      
      let successfulMappings = 0;
      let conflictCount = 0;
      
      // Process mappings one by one to handle conflicts properly
      for (const mapping of mappingsToStore) {
        try {
          // For global mappings (userId = null), use the conflict resolution function
          if (userId === null) {
            // Check if this mapping can be inserted without conflicts
            const conflictCheckQuery = `SELECT resolve_cusip_mapping_conflict($1, $2, $3, $4, $5) as can_insert`;
            const conflictResult = await db.query(conflictCheckQuery, [
              mapping.cusip,
              mapping.ticker,
              mapping.source,
              mapping.userId,
              mapping.confidence
            ]);
            
            if (!conflictResult.rows[0].can_insert) {
              logger.logImport(`Skipping CUSIP mapping ${mapping.cusip} → ${mapping.ticker} due to conflict resolution`);
              conflictCount++;
              continue;
            }
          }
          
          // Insert the mapping
          const insertQuery = `
            INSERT INTO cusip_mappings (cusip, ticker, company_name, resolution_source, user_id, confidence_score)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (cusip, user_id) DO UPDATE SET
              ticker = EXCLUDED.ticker,
              resolution_source = EXCLUDED.resolution_source,
              confidence_score = EXCLUDED.confidence_score,
              updated_at = CURRENT_TIMESTAMP
          `;
          
          await db.query(insertQuery, [
            mapping.cusip,
            mapping.ticker,
            null, // company_name - to be filled later if needed
            mapping.source,
            mapping.userId,
            mapping.confidence
          ]);
          
          successfulMappings++;
          
        } catch (error) {
          // If it's a validation trigger error, log it and continue with other mappings
          if (error.message.includes('is already mapped to a different CUSIP')) {
            logger.logImport(`Skipping duplicate ticker mapping: ${mapping.cusip} → ${mapping.ticker} (${error.message})`);
            conflictCount++;
          } else {
            // Re-throw other errors
            throw error;
          }
        }
      }
      
      logger.logImport(`Stored ${successfulMappings} CUSIP mappings (source: ${source}, user: ${userId || 'global'})`);
      if (conflictCount > 0) {
        logger.logImport(`Skipped ${conflictCount} mappings due to conflicts (prevents duplicate ticker assignments)`);
      }
      
    } catch (error) {
      logger.logError(`Error storing CUSIP mappings: ${error.message}`);
    }
  }

  // Get queue status
  getStatus() {
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      currentJob: this.isRunning ? this.queue[0] : null
    };
  }
}

module.exports = new CusipResolver();