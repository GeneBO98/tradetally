const jobQueue = require('../utils/jobQueue');
const parallelJobQueue = require('../utils/parallelJobQueue');
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
      
      // Start parallel job queue processing for better performance
      parallelJobQueue.startParallelProcessing();
      logger.logImport('✓ Parallel job queue processing started');
      
      // Also start sequential processing as fallback for other job types
      jobQueue.startProcessing();
      logger.logImport('✓ Sequential job queue also running as fallback');
      
      // Verify parallel job queue is actually processing
      const parallelStatus = parallelJobQueue.getStatus();
      if (!parallelStatus.isRunning) {
        throw new Error('Parallel job queue failed to start processing');
      }
      
      // Monitor queue status every minute
      this.statusInterval = setInterval(async () => {
        try {
          const status = await jobQueue.getQueueStatus();
          
          // Only log if there are jobs or issues
          const hasJobs = status.some(s => s.status !== 'completed' || parseInt(s.count) > 1000);
          
          if (hasJobs) {
            logger.logImport('📊 Job Queue Status:', status);
          }
          
          // Always check for alerts regardless of logging
          const failedJobs = status.find(s => s.status === 'failed');
          if (failedJobs && parseInt(failedJobs.count) > 50) {
            logger.logError(`⚠️ HIGH FAILED JOB COUNT: ${failedJobs.count} failed jobs - may need investigation`);
          }
          
          const processingJobs = status.find(s => s.status === 'processing');
          if (processingJobs && parseInt(processingJobs.count) > 10) {
            logger.logError(`⚠️ MANY PROCESSING JOBS: ${processingJobs.count} jobs in processing state`);
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
    parallelJobQueue.stop();
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
      queueProcessing: jobQueue.isProcessing,
      parallelQueue: parallelJobQueue.getStatus()
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