/**
 * Dividend Scheduler
 * Runs daily to check for and record dividends for open trade positions
 *
 * Default schedule: 6:00 AM local time
 * - Fetches dividend history from Finnhub/Alpha Vantage
 * - Calculates shares held at ex-dividend dates
 * - Records dividends to trade_dividends table
 */

const IntervalScheduler = require('./schedulers/IntervalScheduler');
const DividendService = require('./dividendService');

// Run daily at 6 AM (in milliseconds from midnight)
const SCHEDULER_HOUR = 6; // 6 AM
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour if it's time to run
const LOG_PREFIX = '[DIVIDEND-SCHEDULER]';

class DividendScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      messages: {
        startLogs: [
          `${LOG_PREFIX} Starting dividend scheduler...`,
          `${LOG_PREFIX} Scheduled to run daily at ${SCHEDULER_HOUR}:00`
        ],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping dividend scheduler...`,
        stopped: `${LOG_PREFIX} Scheduler stopped`,
        skip: `${LOG_PREFIX} Previous run still in progress, skipping...`,
        runError: `${LOG_PREFIX} [ERROR] Scheduler error:`,
        initialError: `${LOG_PREFIX} Initial check failed:`,
        scheduledError: `${LOG_PREFIX} Scheduled check failed:`,
        manualRun: `${LOG_PREFIX} Manual run triggered...`,
        shouldRunTriggered: `${LOG_PREFIX} Scheduled time reached, starting dividend processing...`
      }
    });
  }

  /**
   * Check if it's time to run (once per day at SCHEDULER_HOUR)
   */
  shouldRun() {
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0];

    // Only run if:
    // 1. It's the scheduled hour (6 AM)
    // 2. We haven't run today yet
    return currentHour === SCHEDULER_HOUR && this.lastRunDate !== today;
  }

  /**
   * Process dividends for all users
   */
  async processDividends() {
    return this.runGuarded();
  }

  async execute() {
    const logPrefix = LOG_PREFIX;

    console.log(`${logPrefix} Starting scheduled dividend check...`);

    const summary = await DividendService.processAllDividends();

    // Update last run date
    this.lastRunDate = new Date().toISOString().split('T')[0];

    console.log(`${logPrefix} Scheduled dividend check complete`);
    return summary;
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.interval !== null,
      processing: this.isRunning,
      scheduledHour: SCHEDULER_HOUR,
      lastRunDate: this.lastRunDate,
      checkIntervalMinutes: CHECK_INTERVAL / 60000
    };
  }
}

// Export singleton instance
module.exports = new DividendScheduler();
