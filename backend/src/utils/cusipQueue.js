const db = require('../config/database');
const cache = require('./cache');
const finnhub = require('./finnhub');

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
    const query = `
      UPDATE cusip_lookup_queue 
      SET status = 'completed', error_message = NULL
      WHERE cusip = $1
    `;
    await db.query(query, [cusip]);
    console.log(`CUSIP ${cusip} successfully resolved to ${ticker}`);
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

      // Attempt to resolve CUSIP
      const ticker = await finnhub.lookupCusip(cusip);
      
      if (ticker) {
        await this.markAsCompleted(cusip, ticker);
        return { success: true, ticker };
      } else {
        await this.markAsFailed(cusip, 'No symbol found');
        return { success: false, error: 'No symbol found' };
      }
    } catch (error) {
      await this.markAsFailed(cusip, error.message);
      return { success: false, error: error.message };
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