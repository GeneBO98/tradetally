const jobQueue = require('../utils/jobQueue');
const logger = require('../utils/logger');

/**
 * Background worker for processing queued jobs
 * This runs continuously to process API calls and enrichment tasks
 */
class BackgroundWorker {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
  }

  /**
   * Start the background worker
   */
  async start() {
    if (this.isRunning) {
      logger.logImport('Background worker is already running');
      return;
    }

    try {
      this.isRunning = true;
      this.shouldStop = false;
      
      logger.logImport('🚀 Starting background worker for trade enrichment');
      
      // Test database connection first
      const db = require('../config/database');
      await db.query('SELECT 1');
      logger.logImport('✓ Database connection verified');
      
      // Start the job queue processing
      jobQueue.startProcessing();
      logger.logImport('✓ Job queue processing started');
      
      // Verify job queue is actually processing
      if (!jobQueue.isProcessing) {
        throw new Error('Job queue failed to start processing');
      }
      
      // Monitor queue status every minute
      this.statusInterval = setInterval(async () => {
        try {
          const status = await jobQueue.getQueueStatus();
          if (status.length > 0) {
            logger.logImport('📊 Job Queue Status:', status);
            
            // Alert if too many failed jobs
            const failedJobs = status.find(s => s.status === 'failed');
            if (failedJobs && parseInt(failedJobs.count) > 100) {
              logger.logError(`⚠️ HIGH FAILED JOB COUNT: ${failedJobs.count} failed jobs`);
            }
            
            // Alert if jobs are stuck in processing
            const processingJobs = status.find(s => s.status === 'processing');
            if (processingJobs && parseInt(processingJobs.count) > 10) {
              logger.logError(`⚠️ MANY PROCESSING JOBS: ${processingJobs.count} jobs in processing state`);
            }
          }
        } catch (error) {
          logger.logError('Failed to get queue status:', error.message);
        }
      }, 60000); // Every minute

      // Handle graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
      
      logger.logImport('✅ Background worker started successfully');
      
      // Process any stuck jobs immediately
      setTimeout(async () => {
        try {
          await this.processStuckJobs();
        } catch (error) {
          logger.logError('Failed to process stuck jobs:', error.message);
        }
      }, 5000);
      
    } catch (error) {
      this.isRunning = false;
      this.shouldStop = true;
      logger.logError('❌ Failed to start background worker:', error.message);
      throw error;
    }
  }

  /**
   * Process jobs that are stuck in 'processing' status
   */
  async processStuckJobs() {
    try {
      const db = require('../config/database');
      
      // Find jobs that have been processing for more than 10 minutes
      const stuckJobs = await db.query(`
        UPDATE job_queue 
        SET status = 'pending', started_at = NULL
        WHERE status = 'processing' 
        AND started_at < NOW() - INTERVAL '10 minutes'
        RETURNING id, type
      `);
      
      if (stuckJobs.rows.length > 0) {
        logger.logImport(`🔄 Reset ${stuckJobs.rows.length} stuck jobs back to pending`);
      }
    } catch (error) {
      logger.logError('Failed to process stuck jobs:', error.message);
    }
  }

  /**
   * Stop the background worker
   */
  async stop() {
    if (!this.isRunning) return;

    logger.logImport('🛑 Stopping background worker...');
    
    this.shouldStop = true;
    this.isRunning = false;
    
    // Stop job processing
    jobQueue.stopProcessing();
    
    // Clear status monitoring
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    logger.logImport('✅ Background worker stopped');
    process.exit(0);
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      shouldStop: this.shouldStop,
      queueProcessing: jobQueue.isProcessing
    };
  }
}

// Create singleton instance
const backgroundWorker = new BackgroundWorker();

// Auto-start if this file is run directly
if (require.main === module) {
  backgroundWorker.start().catch(error => {
    logger.logError('Failed to start background worker:', error.message);
    process.exit(1);
  });
}

module.exports = backgroundWorker;