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

const NewsService = require('./newsService');

const CHECK_INTERVAL = 60 * 60 * 1000; // Run every hour

class NewsScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRunDate = null;
  }

  /**
   * Process news for all open position symbols
   */
  async processNews() {
    if (this.isRunning) {
      console.log('[NEWS-SCHEDULER] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const logPrefix = '[NEWS-SCHEDULER]';

    try {
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
    } catch (error) {
      console.error(`${logPrefix} [ERROR] Scheduler error:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log('[NEWS-SCHEDULER] Starting news scheduler...');
    console.log('[NEWS-SCHEDULER] Scheduled to run every hour');

    // Run immediately on start to populate cache
    this.processNews().catch(error => {
      console.error('[NEWS-SCHEDULER] Initial run failed:', error);
    });

    // Schedule hourly runs
    this.interval = setInterval(() => {
      this.processNews().catch(error => {
        console.error('[NEWS-SCHEDULER] Scheduled run failed:', error);
      });
    }, CHECK_INTERVAL);

    console.log('[NEWS-SCHEDULER] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('[NEWS-SCHEDULER] Stopping news scheduler...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('[NEWS-SCHEDULER] Scheduler stopped');
  }

  /**
   * Force run now (for manual triggering/testing)
   */
  async runNow() {
    console.log('[NEWS-SCHEDULER] Manual run triggered...');
    return await this.processNews();
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.interval !== null,
      processing: this.isRunning,
      checkIntervalMinutes: CHECK_INTERVAL / 60000,
      lastRunDate: this.lastRunDate
    };
  }
}

// Export singleton instance
module.exports = new NewsScheduler();
