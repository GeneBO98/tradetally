const CronScheduler = require('./schedulers/CronScheduler');
const PortfolioService = require('./portfolioService');

class PortfolioSnapshotScheduler extends CronScheduler {
  constructor() {
    super({
      logPrefix: '[PORTFOLIO-SNAPSHOTS]',
      cronEnvVar: 'PORTFOLIO_SNAPSHOT_CRON',
      defaultCron: '15 20 * * 1-5',
      guardRestart: true,
      getScheduleOptions: () => ({
        timezone: process.env.TZ || 'UTC'
      }),
      messages: {
        alreadyStarted: '[PORTFOLIO-SNAPSHOTS] Scheduler already running',
        started: (cronExpression) => `[PORTFOLIO-SNAPSHOTS] Scheduler started (${cronExpression})`,
        stopped: '[PORTFOLIO-SNAPSHOTS] Scheduler stopped'
      }
    });
  }

  async onTick() {
    try {
      console.log('[PORTFOLIO-SNAPSHOTS] Creating daily portfolio snapshots...');
      const summary = await PortfolioService.createDailySnapshotsForAllUsers();
      console.log(`[PORTFOLIO-SNAPSHOTS] Snapshot run complete for ${summary.usersProcessed} users`);
    } catch (error) {
      console.error('[PORTFOLIO-SNAPSHOTS] Snapshot run failed:', error);
    }
  }

  async runNow(snapshotDate = null) {
    return PortfolioService.createDailySnapshotsForAllUsers(snapshotDate);
  }
}

module.exports = new PortfolioSnapshotScheduler();
