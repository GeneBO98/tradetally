const db = require('../config/database');
const logger = require('./logger');

class ParallelJobQueue {
  constructor() {
    this.workers = new Map(); // job_type -> worker_info
    this.isRunning = false;
    this.maxConcurrentJobs = 5; // Process up to 5 jobs simultaneously
    this.activeJobs = new Set();
  }

  /**
   * Start parallel job processing with multiple workers
   */
  startParallelProcessing() {
    if (this.isRunning) {
      logger.logImport('Parallel job queue already running');
      return;
    }

    this.isRunning = true;
    logger.logImport('🚀 Starting parallel job queue processing');

    // Start workers for different job types
    this.startWorkerForJobType('cusip_resolution', 2); // 2 concurrent CUSIP workers
    this.startWorkerForJobType('strategy_classification', 3); // 3 concurrent strategy workers
    this.startWorkerForJobType('news_enrichment', 1); // 1 news worker (API rate limited)
    
    logger.logImport(`✅ Started ${this.workers.size} parallel workers`);
  }

  /**
   * Start a worker for a specific job type
   */
  startWorkerForJobType(jobType, maxConcurrent = 1) {
    if (this.workers.has(jobType)) {
      return; // Worker already exists
    }

    const workerInfo = {
      jobType,
      maxConcurrent,
      activeJobs: new Set(),
      interval: null
    };

    // Start processing loop for this job type
    workerInfo.interval = setInterval(async () => {
      if (workerInfo.activeJobs.size >= maxConcurrent) {
        return; // At max capacity for this job type
      }

      try {
        await this.processNextJobOfType(jobType, workerInfo);
      } catch (error) {
        logger.logError(`Error in ${jobType} worker:`, error.message);
      }
    }, 1000); // Check every second

    this.workers.set(jobType, workerInfo);
    logger.logImport(`✅ Started worker for ${jobType} (max concurrent: ${maxConcurrent})`);
  }

  /**
   * Process next job of specific type
   */
  async processNextJobOfType(jobType, workerInfo) {
    // Get next job of this specific type
    const query = `
      UPDATE job_queue 
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM job_queue 
        WHERE status = 'pending' AND type = $1
        ORDER BY priority ASC, created_at ASC 
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    try {
      const result = await db.query(query, [jobType]);
      
      if (result.rows.length === 0) {
        return; // No jobs of this type available
      }

      const job = result.rows[0];
      workerInfo.activeJobs.add(job.id);
      
      logger.logImport(`🚀 [${jobType}] Processing job ${job.id}`);

      // Process the job
      await this.processJobByType(job, workerInfo);
      
    } catch (error) {
      logger.logError(`Error processing ${jobType} job:`, error.message);
    }
  }

  /**
   * Process job based on its type
   */
  async processJobByType(job, workerInfo) {
    try {
      let data;
      if (typeof job.data === 'string') {
        data = JSON.parse(job.data);
      } else {
        data = job.data;
      }

      let result;
      const jobQueue = require('./jobQueue'); // Use existing processors

      switch (job.type) {
        case 'cusip_resolution':
          result = await jobQueue.processCusipResolution(data);
          break;
        case 'strategy_classification':
          result = await jobQueue.processStrategyClassification(data);
          break;
        case 'news_enrichment':
          result = await jobQueue.processNewsEnrichment(data);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await this.completeJob(job.id, result);
      logger.logImport(`✅ [${job.type}] Job ${job.id} completed`);

    } catch (error) {
      logger.logError(`❌ [${job.type}] Job ${job.id} failed:`, error.message);
      await this.failJob(job.id, error.message);
    } finally {
      // Remove from active jobs
      workerInfo.activeJobs.delete(job.id);
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, result) {
    const query = `
      UPDATE job_queue 
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, result = $2
      WHERE id = $1
    `;
    await db.query(query, [jobId, JSON.stringify(result)]);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error) {
    const query = `
      UPDATE job_queue 
      SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = $2
      WHERE id = $1
    `;
    await db.query(query, [jobId, error]);
  }

  /**
   * Stop all workers
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    for (const [jobType, workerInfo] of this.workers) {
      if (workerInfo.interval) {
        clearInterval(workerInfo.interval);
      }
      logger.logImport(`🛑 Stopped worker for ${jobType}`);
    }
    
    this.workers.clear();
    logger.logImport('🛑 All parallel workers stopped');
  }

  /**
   * Get status of all workers
   */
  getStatus() {
    const workerStatus = {};
    
    for (const [jobType, workerInfo] of this.workers) {
      workerStatus[jobType] = {
        maxConcurrent: workerInfo.maxConcurrent,
        activeJobs: workerInfo.activeJobs.size,
        isRunning: workerInfo.interval !== null
      };
    }

    return {
      isRunning: this.isRunning,
      totalWorkers: this.workers.size,
      workers: workerStatus
    };
  }

  /**
   * Get processing statistics
   */
  async getStats() {
    try {
      const query = `
        SELECT 
          type,
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
        FROM job_queue 
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY type, status
        ORDER BY type, status
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.logError('Error getting job stats:', error.message);
      return [];
    }
  }
}

module.exports = new ParallelJobQueue();