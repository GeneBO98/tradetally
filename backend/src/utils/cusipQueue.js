const db = require('../config/database');
const cache = require('./cache');
const finnhub = require('./finnhub');
const adminSettingsService = require('../services/adminSettings');

class CusipQueueManager {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.retryDelays = [30000, 60000, 300000, 900000, 1800000]; // 30s, 1m, 5m, 15m, 30m
  }

  /**
   * Add CUSIPs to the lookup queue
   */
  async addToQueue(cusips, priority = 1) {
    if (!Array.isArray(cusips)) {
      cusips = [cusips];
    }

    const uniqueCusips = [...new Set(cusips.map(c => c.replace(/\s/g, '').toUpperCase()))];
    console.log(`Adding ${uniqueCusips.length} CUSIPs to lookup queue with priority ${priority}`);

    for (const cusip of uniqueCusips) {
      try {
        // Check if already in cache
        const cached = await cache.get('cusip_resolution', cusip);
        if (cached) {
          console.log(`CUSIP ${cusip} already resolved in cache: ${cached}`);
          continue;
        }

        // Add to queue if not already there
        const query = `
          INSERT INTO cusip_lookup_queue (cusip, priority) 
          VALUES ($1, $2)
          ON CONFLICT (cusip) 
          DO UPDATE SET 
            priority = GREATEST(cusip_lookup_queue.priority, EXCLUDED.priority),
            status = CASE 
              WHEN cusip_lookup_queue.status = 'failed' THEN 'pending'
              ELSE cusip_lookup_queue.status
            END
          RETURNING cusip, status
        `;
        
        const result = await db.query(query, [cusip, priority]);
        if (result.rows.length > 0) {
          console.log(`CUSIP ${cusip} added to queue with status: ${result.rows[0].status}`);
        }
      } catch (error) {
        console.error(`Failed to add CUSIP ${cusip} to queue:`, error.message);
      }
    }

    // Start processing if not already running
    this.startProcessing();
  }

  /**
   * Get pending CUSIPs from queue
   */
  async getPendingCusips(limit = 10) {
    const query = `
      SELECT cusip, attempts, last_attempt_at
      FROM cusip_lookup_queue 
      WHERE status = 'pending' 
        AND attempts < max_attempts
        AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '30 minutes')
      ORDER BY priority DESC, created_at ASC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }

  /**
   * Mark CUSIP as processing
   */
  async markAsProcessing(cusip) {
    const query = `
      UPDATE cusip_lookup_queue 
      SET status = 'processing', last_attempt_at = NOW()
      WHERE cusip = $1 AND status = 'pending'
    `;
    await db.query(query, [cusip]);
  }

  /**
   * Mark CUSIP as completed
   */
  async markAsCompleted(cusip, ticker) {
    // Update the queue status
    const queueQuery = `
      UPDATE cusip_lookup_queue 
      SET status = 'completed', error_message = NULL
      WHERE cusip = $1
    `;
    await db.query(queueQuery, [cusip]);
    
    // Update all trades that have this CUSIP as their symbol
    const tradesQuery = `
      UPDATE trades 
      SET symbol = $2
      WHERE symbol = $1
    `;
    const updateResult = await db.query(tradesQuery, [cusip, ticker]);
    
    console.log(`CUSIP ${cusip} successfully resolved to ${ticker} - Updated ${updateResult.rowCount} trades`);
    
    // Cache the resolution for future use
    await cache.set('cusip_resolution', cusip, ticker, 7 * 24 * 60 * 60); // 7 days TTL
  }

  /**
   * Mark CUSIP as failed with retry logic
   */
  async markAsFailed(cusip, errorMessage) {
    const query = `
      UPDATE cusip_lookup_queue 
      SET 
        status = CASE 
          WHEN attempts + 1 >= max_attempts THEN 'failed'
          ELSE 'pending'
        END,
        attempts = attempts + 1,
        error_message = $2,
        last_attempt_at = NOW()
      WHERE cusip = $1
      RETURNING attempts, max_attempts, status
    `;
    
    const result = await db.query(query, [cusip, errorMessage]);
    if (result.rows.length > 0) {
      const { attempts, max_attempts, status } = result.rows[0];
      if (status === 'failed') {
        console.log(`CUSIP ${cusip} failed permanently after ${attempts} attempts: ${errorMessage}`);
      } else {
        const nextRetry = this.getNextRetryTime(attempts);
        console.log(`CUSIP ${cusip} failed (attempt ${attempts}/${max_attempts}), will retry after ${nextRetry}ms: ${errorMessage}`);
      }
    }
  }

  /**
   * Get next retry time based on attempt count
   */
  getNextRetryTime(attempts) {
    const index = Math.min(attempts - 1, this.retryDelays.length - 1);
    return this.retryDelays[index];
  }

  /**
   * Process a single CUSIP lookup
   */
  async processCusip(cusip) {
    try {
      console.log(`Processing CUSIP lookup: ${cusip}`);
      await this.markAsProcessing(cusip);

      // Attempt to resolve CUSIP with Finnhub first
      const ticker = await finnhub.lookupCusip(cusip);
      
      if (ticker) {
        await this.markAsCompleted(cusip, ticker);
        return { success: true, ticker };
      } else {
        // Fallback to AI provider if Finnhub fails
        console.log(`Finnhub failed for CUSIP ${cusip}, attempting AI fallback...`);
        const aiTicker = await this.lookupCusipWithAI(cusip);
        
        if (aiTicker) {
          await this.markAsCompleted(cusip, aiTicker);
          return { success: true, ticker: aiTicker };
        } else {
          await this.markAsFailed(cusip, 'No symbol found (both Finnhub and AI failed)');
          return { success: false, error: 'No symbol found (both Finnhub and AI failed)' };
        }
      }
    } catch (error) {
      await this.markAsFailed(cusip, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lookup CUSIP using AI provider fallback
   */
  async lookupCusipWithAI(cusip) {
    try {
      // Get admin default AI settings
      const aiSettings = await adminSettingsService.getDefaultAISettings();
      
      if (!aiSettings.provider || !aiSettings.apiKey) {
        console.log('AI fallback not available - no AI provider configured');
        return null;
      }

      // Import AI service dynamically to avoid circular dependencies
      const aiService = require('./aiService');
      
      // Create a specialized prompt for CUSIP lookup
      const prompt = `Given the CUSIP "${cusip}", what is the corresponding stock ticker symbol? Please respond with ONLY the ticker symbol, no additional text.`;
      
      // Use AI provider directly with admin settings
      const provider = aiService.providers[aiSettings.provider];
      if (!provider) {
        console.log(`AI provider ${aiSettings.provider} not supported for CUSIP lookup`);
        return null;
      }

      const response = await provider(prompt, aiSettings, { maxTokens: 10 });
      const ticker = response.trim().toUpperCase();
      
      // Basic validation - ticker should be 1-5 characters, letters only
      if (ticker && /^[A-Z]{1,5}$/.test(ticker)) {
        console.log(`AI successfully resolved CUSIP ${cusip} to ${ticker}`);
        return ticker;
      } else {
        console.log(`AI returned invalid ticker format for CUSIP ${cusip}: ${ticker}`);
        return null;
      }
    } catch (error) {
      console.error(`AI CUSIP lookup failed for ${cusip}:`, error.message);
      return null;
    }
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('Starting CUSIP queue processing...');

    try {
      const pendingCusips = await this.getPendingCusips(5); // Process 5 at a time
      
      if (pendingCusips.length === 0) {
        console.log('No pending CUSIPs to process');
        this.isProcessing = false;
        return;
      }

      console.log(`Processing ${pendingCusips.length} pending CUSIPs`);

      for (const { cusip } of pendingCusips) {
        const result = await this.processCusip(cusip);
        
        // Add delay between lookups to respect rate limits
        if (pendingCusips.indexOf(pendingCusips.find(c => c.cusip === cusip)) < pendingCusips.length - 1) {
          console.log('Waiting 3 seconds before next CUSIP lookup...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Check if there are more pending items
      const remainingPending = await this.getPendingCusips(1);
      if (remainingPending.length > 0) {
        // Schedule next batch in 5 minutes to avoid overwhelming the API
        console.log('More CUSIPs pending, scheduling next batch in 5 minutes...');
        setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, 300000);
      } else {
        this.isProcessing = false;
        console.log('CUSIP queue processing completed');
      }

    } catch (error) {
      console.error('Error processing CUSIP queue:', error);
      this.isProcessing = false;
      
      // Retry in 10 minutes on error
      setTimeout(() => {
        this.processQueue();
      }, 600000);
    }
  }

  /**
   * Start automatic processing
   */
  startProcessing() {
    if (!this.processingInterval) {
      // Process immediately
      setTimeout(() => this.processQueue(), 1000);
      
      // Then process every 30 minutes
      this.processingInterval = setInterval(() => {
        this.processQueue();
      }, 1800000); // 30 minutes
      
      console.log('CUSIP queue processing started');
    }
  }

  /**
   * Stop automatic processing
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('CUSIP queue processing stopped');
    }
  }

  /**
   * Get queue stats
   */
  async getQueueStats() {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM cusip_lookup_queue 
      GROUP BY status
      ORDER BY status
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Update existing trades with already resolved CUSIPs
   */
  async updateExistingTrades() {
    console.log('Updating existing trades with resolved CUSIPs...');
    
    // Get all completed CUSIP resolutions that might need to update trades
    const query = `
      SELECT DISTINCT t.symbol as cusip
      FROM trades t
      WHERE LENGTH(t.symbol) = 9 
        AND t.symbol ~ '[0-9A-Z]{9}'
        AND EXISTS (
          SELECT 1 FROM cusip_lookup_queue q 
          WHERE q.cusip = t.symbol AND q.status = 'completed'
        )
    `;
    
    const result = await db.query(query);
    console.log(`Found ${result.rows.length} CUSIPs in trades that have been resolved`);
    
    for (const row of result.rows) {
      const cusip = row.cusip;
      
      // Get the resolved symbol from cache
      const ticker = await cache.get('cusip_resolution', cusip);
      if (ticker) {
        // Update trades with this CUSIP
        const updateQuery = `
          UPDATE trades 
          SET symbol = $2
          WHERE symbol = $1
        `;
        const updateResult = await db.query(updateQuery, [cusip, ticker]);
        console.log(`Updated ${updateResult.rowCount} trades: ${cusip} → ${ticker}`);
      }
    }
  }

  /**
   * Clean up old completed/failed entries
   */
  async cleanup() {
    const query = `
      DELETE FROM cusip_lookup_queue 
      WHERE status IN ('completed', 'failed') 
        AND created_at < NOW() - INTERVAL '7 days'
    `;
    
    const result = await db.query(query);
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} old CUSIP queue entries`);
    }
  }
}

// Create singleton instance
const cusipQueue = new CusipQueueManager();

// Start processing on module load
cusipQueue.startProcessing();

// Cleanup old entries daily
setInterval(() => {
  cusipQueue.cleanup();
}, 24 * 60 * 60 * 1000);

module.exports = cusipQueue;