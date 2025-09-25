const db = require('../config/database');
const jobQueue = require('../utils/jobQueue');
const logger = require('../utils/logger');

/**
 * Service to automatically recover from stuck enrichment jobs
 * Runs periodically to ensure no trades get stuck in pending status
 */
class JobRecoveryService {
  constructor() {
    this.isRunning = false;
    this.recoveryInterval = null;
    this.lastSummaryTime = 0;
  }

  /**
   * Start the automatic recovery service
   */
  start() {
    if (this.isRunning) {
      logger.logImport('Job recovery service already running');
      return;
    }

    this.isRunning = true;
    logger.logImport('🚑 Starting automatic job recovery service');

    // Run recovery every 5 minutes
    this.recoveryInterval = setInterval(async () => {
      try {
        await this.runRecovery();
      } catch (error) {
        logger.logError('Job recovery failed:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Run initial recovery immediately
    setTimeout(() => this.runRecovery(), 10000); // 10 seconds after startup

    logger.logImport('[SUCCESS] Job recovery service started (runs every 5 minutes)');
  }

  /**
   * Stop the recovery service
   */
  stop() {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    this.isRunning = false;
    logger.logImport('Job recovery service stopped');
  }

  /**
   * Run complete recovery process
   */
  async runRecovery() {
    // Don't log routine recovery checks - only log when action is taken
    const recoveryStats = {
      stuckJobsReset: 0,
      missingJobsCreated: 0,
      orphanedJobsCleaned: 0,
      tradesFixed: 0,
      oldJobsCleanedUp: 0
    };

    try {
      // 1. Reset stuck jobs
      recoveryStats.stuckJobsReset = await this.resetStuckJobs();

      // 2. Create missing jobs for pending trades
      recoveryStats.missingJobsCreated = await this.createMissingJobs();

      // 3. Clean up orphaned jobs (should be rare now due to cascade delete)
      recoveryStats.orphanedJobsCleaned = await this.cleanupOrphanedJobs();

      // 4. Fix trades with inconsistent status
      recoveryStats.tradesFixed = await this.fixInconsistentTrades();

      // 5. Clean up old failed jobs
      recoveryStats.oldJobsCleanedUp = await this.cleanupOldFailedJobs();

      // 6. Ensure background worker is running
      await this.ensureBackgroundWorkerRunning();

      // Log results
      const totalActions = Object.values(recoveryStats).reduce((sum, val) => sum + val, 0);
      
      if (totalActions > 0) {
        logger.logImport('🚑 Recovery completed:', recoveryStats);
        this.lastSummaryTime = Date.now();
      } else {
        // Only log a summary every hour when everything is healthy
        const now = Date.now();
        if (now - this.lastSummaryTime > 60 * 60 * 1000) { // 1 hour
          logger.logImport('[SUCCESS] Job recovery service healthy - no issues detected');
          this.lastSummaryTime = now;
        }
      }

    } catch (error) {
      logger.logError('Recovery process failed:', error.message);
    }
  }

  /**
   * Reset jobs that are stuck in processing status
   */
  async resetStuckJobs() {
    try {
      const stuckJobs = await db.query(`
        UPDATE job_queue 
        SET status = 'pending', started_at = NULL
        WHERE status = 'processing' 
        AND started_at < NOW() - INTERVAL '15 minutes'
        RETURNING id, type
      `);

      if (stuckJobs.rows.length > 0) {
        logger.logImport(`[PROCESS] Reset ${stuckJobs.rows.length} stuck jobs back to pending`);
      }

      return stuckJobs.rows.length;
    } catch (error) {
      logger.logError('Failed to reset stuck jobs:', error.message);
      return 0;
    }
  }

  /**
   * Create missing jobs for trades that are pending enrichment but have no jobs
   */
  async createMissingJobs() {
    try {
      // Find trades with pending enrichment but no active jobs
      const pendingTrades = await db.query(`
        SELECT t.id, t.symbol, t.user_id, t.created_at
        FROM trades t
        WHERE t.enrichment_status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM job_queue jq 
          WHERE jq.status IN ('pending', 'processing')
          AND (jq.data->>'tradeId' = t.id::text)
        )
        ORDER BY t.created_at DESC
        LIMIT 100
      `);

      if (pendingTrades.rows.length === 0) {
        return 0;
      }

      logger.logImport(`[CONFIG] Creating jobs for ${pendingTrades.rows.length} trades without jobs`);

      let jobsCreated = 0;
      for (const trade of pendingTrades.rows) {
        try {
          // Create strategy classification job
          await jobQueue.addJob('strategy_classification', {
            tradeId: trade.id
          }, 2, trade.user_id);
          jobsCreated++;

          // Create CUSIP resolution job if needed
          if (trade.symbol && trade.symbol.match(/^[A-Z0-9]{8}[0-9]$/)) {
            await jobQueue.addJob('cusip_resolution', {
              cusips: [trade.symbol],
              userId: trade.user_id
            }, 2, trade.user_id);
            jobsCreated++;
          }

          logger.logImport(`[SUCCESS] Created jobs for trade ${trade.id} (${trade.symbol})`);
        } catch (error) {
          logger.logError(`Failed to create jobs for trade ${trade.id}:`, error.message);
        }
      }

      return jobsCreated;
    } catch (error) {
      logger.logError('Failed to create missing jobs:', error.message);
      return 0;
    }
  }

  /**
   * Clean up jobs for trades that no longer exist
   */
  async cleanupOrphanedJobs() {
    try {
      const orphanedJobs = await db.query(`
        UPDATE job_queue 
        SET status = 'failed', 
            error = 'Trade no longer exists',
            completed_at = CURRENT_TIMESTAMP
        WHERE status IN ('pending', 'processing')
        AND data->>'tradeId' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM trades t 
          WHERE t.id = (job_queue.data->>'tradeId')::uuid
        )
        RETURNING id
      `);

      if (orphanedJobs.rows.length > 0) {
        logger.logImport(`[CLEAN] Cleaned up ${orphanedJobs.rows.length} orphaned jobs`);
      }

      return orphanedJobs.rows.length;
    } catch (error) {
      logger.logError('Failed to cleanup orphaned jobs:', error.message);
      return 0;
    }
  }

  /**
   * Fix trades with inconsistent enrichment status
   */
  async fixInconsistentTrades() {
    try {
      // Mark trades as completed if they have no pending jobs and no enrichment is needed
      const completedTrades = await db.query(`
        UPDATE trades 
        SET enrichment_status = 'completed',
            enrichment_completed_at = CURRENT_TIMESTAMP
        WHERE enrichment_status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM job_queue jq 
          WHERE jq.status IN ('pending', 'processing')
          AND (jq.data->>'tradeId' = trades.id::text)
        )
        AND (
          -- No CUSIP resolution needed
          symbol !~ '^[A-Z0-9]{8}[0-9]$'
        )
        AND (
          -- Strategy already classified or doesn't need classification
          strategy IS NOT NULL 
          AND strategy != 'day_trading'
        )
        RETURNING id
      `);

      if (completedTrades.rows.length > 0) {
        logger.logImport(`[SUCCESS] Marked ${completedTrades.rows.length} trades as enrichment completed`);
      }

      return completedTrades.rows.length;
    } catch (error) {
      logger.logError('Failed to fix inconsistent trades:', error.message);
      return 0;
    }
  }

  /**
   * Clean up old failed jobs to prevent accumulation
   */
  async cleanupOldFailedJobs() {
    try {
      // Delete failed jobs older than 7 days
      const oldFailedJobs = await db.query(`
        DELETE FROM job_queue 
        WHERE status = 'failed'
        AND completed_at < NOW() - INTERVAL '7 days'
        RETURNING id
      `);

      if (oldFailedJobs.rows.length > 0) {
        logger.logImport(`[INFO] Cleaned up ${oldFailedJobs.rows.length} old failed jobs (>7 days)`);
      }

      return oldFailedJobs.rows.length;
    } catch (error) {
      logger.logError('Failed to cleanup old failed jobs:', error.message);
      return 0;
    }
  }

  /**
   * Ensure background worker is running
   */
  async ensureBackgroundWorkerRunning() {
    try {
      const backgroundWorker = require('../workers/backgroundWorker');
      const status = backgroundWorker.getStatus();

      if (!status.isRunning || !status.queueProcessing) {
        logger.logImport('[WARNING] Background worker not running - attempting restart...');
        await backgroundWorker.start();
        logger.logImport('[SUCCESS] Background worker restarted');
      }
    } catch (error) {
      logger.logError('Failed to ensure background worker is running:', error.message);
    }
  }

  /**
   * Get recovery service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalActive: !!this.recoveryInterval
    };
  }

  /**
   * Manual recovery trigger (for testing/admin use)
   */
  async triggerRecovery() {
    logger.logImport('[INFO] Manual recovery triggered');
    await this.runRecovery();
  }
}

// Create singleton instance
const jobRecoveryService = new JobRecoveryService();

module.exports = jobRecoveryService;