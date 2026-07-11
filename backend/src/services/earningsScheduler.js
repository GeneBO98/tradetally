/**
 * Earnings Scheduler
 * Runs periodically to pre-fetch and cache the earnings calendar
 *
 * Default schedule: Every 4 hours
 * - Fetches 2-week earnings calendar from Finnhub (single API call)
 * - Stores results in dashboard_earnings_cache table
 * - Cleans up stale cache entries
 */

const IntervalScheduler = require('./schedulers/IntervalScheduler');
const EarningsService = require('./earningsService');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // Run every 4 hours
const LOG_PREFIX = '[EARNINGS-SCHEDULER]';

class EarningsScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      useUnref: true,
      messages: {
        startLogs: [
          `${LOG_PREFIX} Starting earnings scheduler...`,
          `${LOG_PREFIX} Scheduled to run every 4 hours`
        ],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping earnings scheduler...`,
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
   * Fetch and cache earnings calendar
   */
  async processEarnings() {
    return this.runGuarded();
  }

  async execute() {
    const logPrefix = LOG_PREFIX;

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
  }
}

// Export singleton instance
module.exports = new EarningsScheduler();
