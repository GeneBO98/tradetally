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
      
      // Monitor queue status and run recovery every 30 seconds
      this.statusInterval = setInterval(async () => {
        try {
          // Run stuck job recovery first
          await this.processStuckJobs();
          
          const status = await jobQueue.getQueueStatus();
          
          // Only log if there are pending/processing jobs (not just completed ones)
          const hasActiveJobs = status.some(s => 
            (s.status === 'pending' || s.status === 'processing') && parseInt(s.count) > 0
          );
          const hasIssues = status.some(s => 
            s.status === 'failed' && parseInt(s.count) > 0
          );
          
          if (hasActiveJobs || hasIssues) {
            logger.logImport('📊 Job Queue Status:', status);
          }
          
          // Always check for alerts and auto-recover
          const failedJobs = status.find(s => s.status === 'failed');
          if (failedJobs && parseInt(failedJobs.count) > 50) {
            logger.logError(`⚠️ HIGH FAILED JOB COUNT: ${failedJobs.count} failed jobs - may need investigation`);
          }
          
          const processingJobs = status.find(s => s.status === 'processing');
          if (processingJobs && parseInt(processingJobs.count) > 10) {
            logger.logError(`⚠️ MANY PROCESSING JOBS: ${processingJobs.count} jobs in processing state - running recovery`);
            // Run recovery immediately if too many processing jobs
            await this.processStuckJobs();
          }

          // Auto-restart workers if they seem to have died
          await this.ensureWorkersRunning();
          
        } catch (error) {
          logger.logError('Failed to get queue status:', error.message);
        }
      }, 30000); // Every 30 seconds (more frequent monitoring)

      // Handle graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
      
      logger.logImport('✅ Background worker started successfully');
      
      // Process any stuck jobs immediately and more aggressively
      setTimeout(async () => {
        try {
          await this.processStuckJobs();
          // Run again after 10 seconds to catch any remaining issues
          setTimeout(() => this.processStuckJobs(), 10000);
        } catch (error) {
          logger.logError('Failed to process stuck jobs:', error.message);
        }
      }, 1000); // Start after just 1 second, not 5
      
    } catch (error) {
      this.isRunning = false;
      this.shouldStop = true;
      logger.logError('❌ Failed to start background worker:', error.message);
      throw error;
    }
  }

  /**
   * Process jobs that are stuck in 'processing' status - BULLETPROOF VERSION
   */
  async processStuckJobs() {
    try {
      const db = require('../config/database');
      
      // Find jobs that have been processing for more than 30 seconds (VERY aggressive)
      const stuckJobs = await db.query(`
        UPDATE job_queue 
        SET status = 'pending', started_at = NULL, retry_count = COALESCE(retry_count, 0) + 1
        WHERE status = 'processing' 
        AND started_at < NOW() - INTERVAL '30 seconds'
        RETURNING id, type, retry_count
      `);
      
      if (stuckJobs.rows.length > 0) {
        logger.logImport(`🔄 Reset ${stuckJobs.rows.length} stuck jobs back to pending`);
        
        // For jobs that have been stuck multiple times, mark as failed
        const persistentlyStuckJobs = stuckJobs.rows.filter(job => job.retry_count >= 5);
        if (persistentlyStuckJobs.length > 0) {
          await db.query(`
            UPDATE job_queue 
            SET status = 'failed', 
                completed_at = CURRENT_TIMESTAMP, 
                error = 'Job stuck repeatedly - marked as failed to prevent infinite loops'
            WHERE id = ANY($1)
          `, [persistentlyStuckJobs.map(job => job.id)]);
          
          logger.logError(`❌ Marked ${persistentlyStuckJobs.length} persistently stuck jobs as failed`);
        }
      }

      // Also check for jobs that have been pending for too long (over 1 hour)
      const zombieJobs = await db.query(`
        UPDATE job_queue 
        SET status = 'failed', 
            completed_at = CURRENT_TIMESTAMP,
            error = 'Job abandoned - pending for over 1 hour'
        WHERE status = 'pending' 
        AND created_at < NOW() - INTERVAL '1 hour'
        AND retry_count > 3
        RETURNING id, type
      `);

      if (zombieJobs.rows.length > 0) {
        logger.logError(`❌ Abandoned ${zombieJobs.rows.length} zombie jobs that were pending too long`);
      }

    } catch (error) {
      logger.logError('Failed to process stuck jobs:', error.message);
    }
  }

  /**
   * Ensure workers are still running and restart if needed
   */
  async ensureWorkersRunning() {
    try {
      const parallelJobQueue = require('../utils/parallelJobQueue');
      const status = parallelJobQueue.getStatus();
      
      // Check if any workers have stopped
      const expectedWorkers = ['cusip_resolution', 'strategy_classification', 'news_enrichment'];
      for (const workerType of expectedWorkers) {
        if (!status.workers || !status.workers[workerType] || !status.workers[workerType].isRunning) {
          logger.logError(`⚠️ Worker ${workerType} is not running - restarting`);
          
          // Restart the specific worker
          if (workerType === 'cusip_resolution') {
            parallelJobQueue.startWorkerForJobType('cusip_resolution', 3);
          } else if (workerType === 'strategy_classification') {
            parallelJobQueue.startWorkerForJobType('strategy_classification', 5);
          } else if (workerType === 'news_enrichment') {
            parallelJobQueue.startWorkerForJobType('news_enrichment', 2);
          }
        }
      }

      // If parallel processing completely stopped, restart it
      if (!parallelJobQueue.isRunning) {
        logger.logError('🚨 Parallel job queue stopped - restarting');
        parallelJobQueue.startParallelProcessing();
      }

    } catch (error) {
      logger.logError('Failed to ensure workers running:', error.message);
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