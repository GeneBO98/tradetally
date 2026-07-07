const db = require('../config/database');
const logger = require('./logger');
const { PARALLEL_JOB_TYPES } = require('./jobQueueConfig');

class ParallelJobQueue {
  constructor() {
    this.workers = new Map(); // job_type -> worker_info
    this.isRunning = false;
    this.maxConcurrentJobs = 5; // Process up to 5 jobs simultaneously
    this.activeJobs = new Set();
  }

  /**
   * Start parallel job processing with multiple workers.
   * Job type ownership is defined in utils/jobQueueConfig.js; the sequential
   * queue skips these types so each type has exactly one owner.
   */
  startParallelProcessing() {
    if (this.isRunning) {
      logger.logImport('Parallel job queue already running');
      return;
    }

    this.isRunning = true;
    logger.logImport('[START] Starting parallel job queue processing');

    const concurrencyByType = {
      cusip_resolution: 3, // 3 concurrent CUSIP workers
      strategy_classification: 5, // 5 concurrent strategy workers (optimized)
      news_enrichment: 2 // 2 news workers
    };

    for (const jobType of PARALLEL_JOB_TYPES) {
      this.startWorkerForJobType(jobType, concurrencyByType[jobType] || 1);
    }

    logger.logImport(`Started ${this.workers.size} parallel workers`);
  }

  /**
   * Start a worker for a specific job type (self-scheduling poll loop with
   * idle backoff: 500ms base, doubling after 6 consecutive empty polls up to
   * 5s; any claimed job or an in-process enqueue resets it to 500ms).
   */
  startWorkerForJobType(jobType, maxConcurrent = 1) {
    if (this.workers.has(jobType)) {
      return; // Worker already exists
    }

    const workerInfo = {
      jobType,
      maxConcurrent,
      activeJobs: new Set(),
      timer: null,
      stopped: false,
      basePollIntervalMs: 500,
      maxPollIntervalMs: 5000,
      idleThreshold: 6,
      consecutiveEmptyPolls: 0,
      currentPollIntervalMs: 500
    };

    this.workers.set(jobType, workerInfo);
    this.scheduleWorkerPoll(workerInfo, workerInfo.currentPollIntervalMs);
    logger.logImport(`Started worker for ${jobType} (max concurrent: ${maxConcurrent})`);
  }

  /**
   * Schedule the next poll for a worker, replacing any pending timer
   */
  scheduleWorkerPoll(workerInfo, delayMs) {
    if (!this.isRunning || workerInfo.stopped) return;

    if (workerInfo.timer) {
      clearTimeout(workerInfo.timer);
    }
    workerInfo.timer = setTimeout(() => this.workerPoll(workerInfo), delayMs);
    if (typeof workerInfo.timer.unref === 'function') {
      workerInfo.timer.unref();
    }
  }

  /**
   * Run one poll for a worker, adjust idle backoff, reschedule
   */
  async workerPoll(workerInfo) {
    if (!this.isRunning || workerInfo.stopped) return;

    let claimed = false;
    const atCapacity = workerInfo.activeJobs.size >= workerInfo.maxConcurrent;

    if (!atCapacity) {
      try {
        claimed = await this.processNextJobOfType(workerInfo.jobType, workerInfo);
      } catch (error) {
        logger.logError(`Error in ${workerInfo.jobType} worker:`, error.message);
      }
    }

    if (claimed || atCapacity) {
      // Found work (or already saturated) - stay on the fast interval
      workerInfo.consecutiveEmptyPolls = 0;
      workerInfo.currentPollIntervalMs = workerInfo.basePollIntervalMs;
    } else {
      workerInfo.consecutiveEmptyPolls++;
      if (workerInfo.consecutiveEmptyPolls >= workerInfo.idleThreshold) {
        workerInfo.currentPollIntervalMs = Math.min(
          workerInfo.currentPollIntervalMs * 2,
          workerInfo.maxPollIntervalMs
        );
      }
    }

    this.scheduleWorkerPoll(workerInfo, workerInfo.currentPollIntervalMs);
  }

  /**
   * Reset a worker's idle backoff (called by jobQueue.addJob/addBatchJobs
   * after enqueueing a job of this type in-process)
   */
  nudge(jobType) {
    const workerInfo = this.workers.get(jobType);
    if (!workerInfo || workerInfo.stopped || !this.isRunning) return;

    workerInfo.consecutiveEmptyPolls = 0;
    const wasSlow = workerInfo.currentPollIntervalMs !== workerInfo.basePollIntervalMs;
    workerInfo.currentPollIntervalMs = workerInfo.basePollIntervalMs;
    if (wasSlow) {
      this.scheduleWorkerPoll(workerInfo, workerInfo.currentPollIntervalMs);
    }
  }

  /**
   * Claim and process the next job of a specific type. Returns true when a
   * job was claimed. Processing is intentionally not awaited so a single
   * worker loop can run up to maxConcurrent jobs simultaneously (matching
   * the previous overlapping setInterval behavior).
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
        return false; // No jobs of this type available
      }

      const job = result.rows[0];
      workerInfo.activeJobs.add(job.id);

      logger.logImport(`[START] [${jobType}] Processing job ${job.id}`);

      // Process the job without blocking the poll loop (processJobByType
      // handles its own errors and always removes the job from activeJobs)
      this.processJobByType(job, workerInfo).catch(error => {
        logger.logError(`Unhandled error processing ${jobType} job ${job.id}:`, error.message);
        workerInfo.activeJobs.delete(job.id);
      });

      return true;
    } catch (error) {
      logger.logError(`Error processing ${jobType} job:`, error.message);
      return false;
    }
  }

  /**
   * Process job based on its type with timeout protection
   */
  async processJobByType(job, workerInfo) {
    const JOB_TIMEOUT = 30000; // 30 seconds max per job
    let timeoutId;
    
    try {
      let data;
      if (typeof job.data === 'string') {
        data = JSON.parse(job.data);
      } else {
        data = job.data;
      }

      // Create timeout promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Job ${job.id} timed out after ${JOB_TIMEOUT}ms`));
        }, JOB_TIMEOUT);
      });

      let result;
      const jobQueue = require('./jobQueue'); // Use existing processors

      // Race the job processing against the timeout
      const jobPromise = (async () => {
        switch (job.type) {
          case 'cusip_resolution':
            return await jobQueue.processCusipResolution(data);
          case 'strategy_classification':
            return await jobQueue.processStrategyClassification(data);
          case 'news_enrichment':
            return await jobQueue.processNewsEnrichment(data);
          default:
            throw new Error(`Unknown job type: ${job.type}`);
        }
      })();

      // Wait for either completion or timeout
      result = await Promise.race([jobPromise, timeoutPromise]);
      
      // Clear timeout if job completed successfully
      if (timeoutId) clearTimeout(timeoutId);

      // Mark job as completed
      await this.completeJob(job.id, result);
      
      // CRITICAL: Update trade enrichment status when job completes
      await this.updateTradeEnrichmentStatus(job, data);
      
      logger.logImport(`[${job.type}] Job ${job.id} completed in time`);

    } catch (error) {
      // Clear timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      logger.logError(`[ERROR] [${job.type}] Job ${job.id} failed:`, error.message);
      
      // Check if this is a timeout or regular failure
      if (error.message.includes('timed out')) {
        await this.timeoutJob(job.id, error.message);
      } else {
        await this.failJob(job.id, error.message);
      }
    } finally {
      // ALWAYS remove from active jobs
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
      SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = $2, retry_count = retry_count + 1
      WHERE id = $1
    `;
    await db.query(query, [jobId, error]);
  }

  /**
   * Mark job as timed out and potentially retry
   */
  async timeoutJob(jobId, error) {
    // Get current retry_count
    const getAttemptsQuery = `SELECT retry_count FROM job_queue WHERE id = $1`;
    const result = await db.query(getAttemptsQuery, [jobId]);
    const retry_count = result.rows[0]?.retry_count || 0;

    if (retry_count < 2) {
      // Retry timed out jobs up to 2 times
      const retryQuery = `
        UPDATE job_queue 
        SET status = 'pending', started_at = NULL, retry_count = retry_count + 1, error = $2
        WHERE id = $1
      `;
      await db.query(retryQuery, [jobId, `Timeout retry ${retry_count + 1}: ${error}`]);
      logger.info(`Job ${jobId} timed out, retrying (attempt ${retry_count + 1})`, 'import');
    } else {
      // Give up after 2 retries
      const failQuery = `
        UPDATE job_queue 
        SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = $2, retry_count = retry_count + 1
        WHERE id = $1
      `;
      await db.query(failQuery, [jobId, `Failed after timeout retries: ${error}`]);
      logger.logError(`[ERROR] Job ${jobId} failed permanently after timeout retries`);
    }
  }

  /**
   * Update trade enrichment status when job completes - CRITICAL FOR SYNC
   */
  async updateTradeEnrichmentStatus(job, data) {
    try {
      const db = require('../config/database');
      
      // For strategy classification jobs, mark the trade as enrichment completed
      if (job.type === 'strategy_classification' && data.tradeId) {
        await db.query(`
          UPDATE trades 
          SET enrichment_status = 'completed',
              enrichment_completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [data.tradeId]);
        
        logger.info(`Updated trade ${data.tradeId} enrichment status to completed`, 'import');
      }
      
      // For CUSIP resolution jobs, mark all affected trades as completed
      if (job.type === 'cusip_resolution' && data.userId) {
        await db.query(`
          UPDATE trades 
          SET enrichment_status = 'completed',
              enrichment_completed_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 
          AND enrichment_status != 'completed'
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        `, [data.userId]);
        
        logger.info(`Updated CUSIP trades for user ${data.userId} to completed`, 'import');
      }
      
    } catch (error) {
      logger.logError(`Failed to update trade enrichment status: ${error.message}`);
    }
  }

  /**
   * Stop all workers
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    for (const [jobType, workerInfo] of this.workers) {
      workerInfo.stopped = true;
      if (workerInfo.timer) {
        clearTimeout(workerInfo.timer);
        workerInfo.timer = null;
      }
      logger.logImport(`[STOP] Stopped worker for ${jobType}`);
    }
    
    this.workers.clear();
    logger.logImport('[STOP] All parallel workers stopped');
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
        pollIntervalMs: workerInfo.currentPollIntervalMs,
        isRunning: !workerInfo.stopped
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
