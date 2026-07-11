const CronScheduler = require('./schedulers/CronScheduler');

/**
 * Edge Report Scheduler
 * Runs the weekly AI edge report batch (opted-in users only).
 * Default: Monday 11:30 UTC (pre-market for US sessions), covering the
 * prior Monday-Sunday week. Override with EDGE_REPORT_CRON.
 */
class EdgeReportScheduler extends CronScheduler {
  constructor() {
    super({
      logPrefix: '[EDGE-REPORT]',
      cronEnvVar: 'EDGE_REPORT_CRON',
      defaultCron: '30 11 * * 1',
      guardRestart: true,
      returnBoolean: true,
      getScheduleOptions: () => ({
        scheduled: true,
        timezone: process.env.TZ || 'UTC'
      }),
      skipReturnValue: null,
      errorReturnValue: null,
      errorLogsMessageOnly: true,
      messages: {
        alreadyStarted: '[EDGE-REPORT] Scheduler already running',
        started: (cronExpression) => `[EDGE-REPORT] Scheduler started (cron: ${cronExpression})`,
        stopped: '[EDGE-REPORT] Scheduler stopped',
        skip: '[EDGE-REPORT] Batch already in progress, skipping this run',
        runError: '[EDGE-REPORT] Weekly batch failed:'
      }
    });
  }

  getStatus() {
    return {
      schedulerRunning: Boolean(this.job),
      batchInProgress: this.running,
      cronExpression: process.env.EDGE_REPORT_CRON || '30 11 * * 1'
    };
  }

  onTick() {
    return this.runBatch();
  }

  async runBatch() {
    return this.runExclusive();
  }

  async execute() {
    const EdgeReportService = require('./edgeReportService');
    return await EdgeReportService.runWeeklyBatch();
  }
}

module.exports = new EdgeReportScheduler();
