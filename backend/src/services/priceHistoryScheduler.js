const cron = require('node-cron');
const PortfolioService = require('./portfolioService');

class PriceHistoryScheduler {
  constructor() {
    this.job = null;
  }

  start() {
    if (this.job) {
      console.log('[PRICE-HISTORY] Scheduler already running');
      return;
    }

    // Default: 02:30 daily (overnight, after market close, minimal user traffic).
    const cronExpression = process.env.PRICE_HISTORY_BACKFILL_CRON || '30 2 * * *';
    if (!cron.validate(cronExpression)) {
      console.error(`[PRICE-HISTORY] Invalid cron expression: ${cronExpression}`);
      return;
    }

    this.job = cron.schedule(cronExpression, async () => {
      try {
        console.log('[PRICE-HISTORY] Refreshing price history for held symbols...');
        const summary = await PortfolioService.refreshHeldSymbolHistory();
        console.log(`[PRICE-HISTORY] Done: ${summary.backfilled} backfilled, ${summary.cached} already current, ${summary.failed} failed (${summary.symbols} symbols)`);
      } catch (error) {
        console.error('[PRICE-HISTORY] Refresh run failed:', error);
      }
    }, {
      timezone: process.env.TZ || 'UTC'
    });

    console.log(`[PRICE-HISTORY] Scheduler started (${cronExpression})`);
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[PRICE-HISTORY] Scheduler stopped');
    }
  }

  async runNow(referenceDate = null) {
    return PortfolioService.refreshHeldSymbolHistory(referenceDate);
  }
}

module.exports = new PriceHistoryScheduler();
