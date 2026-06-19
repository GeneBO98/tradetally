const cron = require('node-cron');

/**
 * Edge Report Scheduler
 * Runs the weekly AI edge report batch (opted-in users only).
 * Default: Monday 11:30 UTC (pre-market for US sessions), covering the
 * prior Monday-Sunday week. Override with EDGE_REPORT_CRON.
 */
class EdgeReportScheduler {
  constructor() {
    this.job = null;
    this.running = false;
  }

  getStatus() {
    return {
      schedulerRunning: Boolean(this.job),
      batchInProgress: this.running,
      cronExpression: process.env.EDGE_REPORT_CRON || '30 11 * * 1'
    };
  }

  start() {
    if (this.job) {
      console.log('[EDGE-REPORT] Scheduler already running');
      return false;
    }

    const cronExpression = process.env.EDGE_REPORT_CRON || '30 11 * * 1';
    if (!cron.validate(cronExpression)) {
      console.error(`[EDGE-REPORT] Invalid cron expression: ${cronExpression}`);
      return false;
    }

    this.job = cron.schedule(cronExpression, () => this.runBatch(), {
      scheduled: true,
      timezone: process.env.TZ || 'UTC'
    });

    console.log(`[EDGE-REPORT] Scheduler started (cron: ${cronExpression})`);
    return true;
  }

  async runBatch() {
    if (this.running) {
      console.log('[EDGE-REPORT] Batch already in progress, skipping this run');
      return null;
    }

    this.running = true;
    try {
      const EdgeReportService = require('./edgeReportService');
      return await EdgeReportService.runWeeklyBatch();
    } catch (error) {
      console.error('[EDGE-REPORT] Weekly batch failed:', error.message);
      return null;
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[EDGE-REPORT] Scheduler stopped');
    }
  }
}

module.exports = new EdgeReportScheduler();
