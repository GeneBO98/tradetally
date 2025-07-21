const finnhub = require('./finnhub');
const Trade = require('../models/Trade');
const logger = require('./logger');
const NotificationService = require('../services/notificationService');

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
      // Use Finnhub batch API first
      const resolved = await this.batchResolveCusips(cusips);
      
      if (Object.keys(resolved).length > 0) {
        await this.updateTradeSymbols(userId, resolved);
        logger.logImport(`Updated ${Object.keys(resolved).length} symbols for user ${userId}`);
      }
      
      // If some CUSIPs are still unresolved, try other sources for the remainder
      const stillUnresolved = cusips.filter(cusip => !resolved[cusip]);
      if (stillUnresolved.length > 0) {
        logger.logImport(`${stillUnresolved.length} CUSIPs still unresolved, trying additional sources`);
        
        // Try individual lookups for remaining CUSIPs (slower but more thorough)
        const additionalResolved = await this.individualResolveCusips(stillUnresolved);
        
        if (Object.keys(additionalResolved).length > 0) {
          await this.updateTradeSymbols(userId, additionalResolved);
          logger.logImport(`Updated ${Object.keys(additionalResolved).length} additional symbols for user ${userId}`);
        }
      }
      
    } catch (error) {
      logger.logError(`CUSIP resolution failed for user ${userId}: ${error.message}`);
    }
  }

  async batchResolveCusips(cusips) {
    try {
      // Use Finnhub batch lookup
      return await finnhub.batchLookupCusips(cusips);
    } catch (error) {
      logger.logError(`Batch CUSIP lookup failed: ${error.message}`);
      return {};
    }
  }

  async individualResolveCusips(cusips) {
    const resolved = {};
    
    // Limit to avoid overwhelming APIs
    const maxIndividualLookups = 20;
    const cusipsToProcess = cusips.slice(0, maxIndividualLookups);
    
    for (const cusip of cusipsToProcess) {
      try {
        const ticker = await finnhub.lookupCusip(cusip);
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