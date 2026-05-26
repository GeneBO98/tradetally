const cron = require('node-cron');
const PortfolioService = require('./portfolioService');

class PortfolioSnapshotScheduler {
  constructor() {
    this.job = null;
  }

  start() {
    if (this.job) {
      console.log('[PORTFOLIO-SNAPSHOTS] Scheduler already running');
      return;
    }

    const cronExpression = process.env.PORTFOLIO_SNAPSHOT_CRON || '15 20 * * 1-5';
    if (!cron.validate(cronExpression)) {
      console.error(`[PORTFOLIO-SNAPSHOTS] Invalid cron expression: ${cronExpression}`);
      return;
    }

    this.job = cron.schedule(cronExpression, async () => {
      try {
        console.log('[PORTFOLIO-SNAPSHOTS] Creating daily portfolio snapshots...');
        const summary = await PortfolioService.createDailySnapshotsForAllUsers();
        console.log(`[PORTFOLIO-SNAPSHOTS] Snapshot run complete for ${summary.usersProcessed} users`);
      } catch (error) {
        console.error('[PORTFOLIO-SNAPSHOTS] Snapshot run failed:', error);
      }
    }, {
      timezone: process.env.TZ || 'UTC'
    });

    console.log(`[PORTFOLIO-SNAPSHOTS] Scheduler started (${cronExpression})`);
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[PORTFOLIO-SNAPSHOTS] Scheduler stopped');
    }
  }

  async runNow(snapshotDate = null) {
    return PortfolioService.createDailySnapshotsForAllUsers(snapshotDate);
  }
}

module.exports = new PortfolioSnapshotScheduler();
