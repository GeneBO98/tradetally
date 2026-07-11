/**
 * News Scheduler
 * Runs periodically to pre-fetch and cache company news for open positions
 *
 * Default schedule: Every hour
 * - Queries all distinct symbols with open trades
 * - Fetches news from Finnhub with rate-limit-respecting delays
 * - Stores results in dashboard_news_cache table
 * - Skips symbols already fetched within the last hour
 */

const IntervalScheduler = require('./schedulers/IntervalScheduler');
const NewsService = require('./newsService');

const CHECK_INTERVAL = 60 * 60 * 1000; // Run every hour
const LOG_PREFIX = '[NEWS-SCHEDULER]';

class NewsScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      useUnref: true,
      messages: {
        startLogs: [
          `${LOG_PREFIX} Starting news scheduler...`,
          `${LOG_PREFIX} Scheduled to run every hour`
        ],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping news scheduler...`,
        stopped: `${LOG_PREFIX} Scheduler stopped`,
        skip: `${LOG_PREFIX} Previous run still in progress, skipping...`,
        runError: `${LOG_PREFIX} [ERROR] Scheduler error:`,
        initialError: `${LOG_PREFIX} Initial run failed:`,
        scheduledError: `${LOG_PREFIX} Scheduled run failed:`,
        manualRun: `${LOG_PREFIX} Manual run triggered...`
      }
    });
  }

  /**
   * Process news for all open position symbols
   */
  async processNews() {
    return this.runGuarded();
  }

  async execute() {
    const logPrefix = LOG_PREFIX;

    console.log(`${logPrefix} Starting scheduled news fetch...`);

    const symbols = await NewsService.getAllTrackedSymbols();

    if (symbols.length === 0) {
      console.log(`${logPrefix} No tracked symbols found, skipping news fetch`);
      this.lastRunDate = new Date().toISOString();
      return;
    }

    console.log(`${logPrefix} Found ${symbols.length} tracked symbols (open positions + watchlists)`);

    const summary = await NewsService.fetchAndCacheAll(symbols);

    this.lastRunDate = new Date().toISOString();

    console.log(`${logPrefix} News fetch complete - fetched: ${summary.fetched}, skipped (cached): ${summary.skipped}, errors: ${summary.errors}`);
    return summary;
  }
}

// Export singleton instance
module.exports = new NewsScheduler();
