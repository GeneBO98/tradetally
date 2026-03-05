/**
 * Earnings Scheduler
 * Runs periodically to pre-fetch and cache the earnings calendar
 *
 * Default schedule: Every 4 hours
 * - Fetches 2-week earnings calendar from Finnhub (single API call)
 * - Stores results in dashboard_earnings_cache table
 * - Cleans up stale cache entries
 */

const EarningsService = require('./earningsService');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // Run every 4 hours

class EarningsScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRunDate = null;
  }

  /**
   * Fetch and cache earnings calendar
   */
  async processEarnings() {
    if (this.isRunning) {
      console.log('[EARNINGS-SCHEDULER] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const logPrefix = '[EARNINGS-SCHEDULER]';

    try {
      console.log(`${logPrefix} Starting scheduled earnings fetch...`);

      const result = await EarningsService.fetchAndCache();

      // Clean up old entries
      await EarningsService.cleanupOldEntries();

      this.lastRunDate = new Date().toISOString();

      if (result !== null) {
        console.log(`${logPrefix} Earnings fetch complete - ${result.length} entries cached`);
      } else {
        console.log(`${logPrefix} Earnings fetch failed, will retry next cycle`);
      }

      return result;
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
    console.log('[EARNINGS-SCHEDULER] Starting earnings scheduler...');
    console.log('[EARNINGS-SCHEDULER] Scheduled to run every 4 hours');

    // Run immediately on start to populate cache
    this.processEarnings().catch(error => {
      console.error('[EARNINGS-SCHEDULER] Initial run failed:', error);
    });

    // Schedule periodic runs
    this.interval = setInterval(() => {
      this.processEarnings().catch(error => {
        console.error('[EARNINGS-SCHEDULER] Scheduled run failed:', error);
      });
    }, CHECK_INTERVAL);

    console.log('[EARNINGS-SCHEDULER] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('[EARNINGS-SCHEDULER] Stopping earnings scheduler...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('[EARNINGS-SCHEDULER] Scheduler stopped');
  }

  /**
   * Force run now (for manual triggering/testing)
   */
  async runNow() {
    console.log('[EARNINGS-SCHEDULER] Manual run triggered...');
    return await this.processEarnings();
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
module.exports = new EarningsScheduler();
