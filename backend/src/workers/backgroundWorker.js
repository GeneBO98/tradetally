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

    this.isRunning = true;
    this.shouldStop = false;
    
    logger.logImport('🚀 Starting background worker for trade enrichment');
    
    // Start the job queue processing
    jobQueue.startProcessing();
    
    // Monitor queue status every minute
    this.statusInterval = setInterval(async () => {
      try {
        const status = await jobQueue.getQueueStatus();
        if (status.length > 0) {
          logger.logImport('📊 Job Queue Status:', status);
        }
      } catch (error) {
        logger.logError('Failed to get queue status:', error.message);
      }
    }, 60000); // Every minute

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    
    logger.logImport('✅ Background worker started successfully');
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