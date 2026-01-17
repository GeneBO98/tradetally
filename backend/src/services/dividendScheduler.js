/**
 * Dividend Scheduler
 * Runs daily to check for and record dividends for open trade positions
 *
 * Default schedule: 6:00 AM local time
 * - Fetches dividend history from Finnhub/Alpha Vantage
 * - Calculates shares held at ex-dividend dates
 * - Records dividends to trade_dividends table
 */

const DividendService = require('./dividendService');

// Run daily at 6 AM (in milliseconds from midnight)
const SCHEDULER_HOUR = 6; // 6 AM
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour if it's time to run

class DividendScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRunDate = null;
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
    if (this.isRunning) {
      console.log('[DIVIDEND-SCHEDULER] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const logPrefix = '[DIVIDEND-SCHEDULER]';

    try {
      console.log(`${logPrefix} Starting scheduled dividend check...`);

      const summary = await DividendService.processAllDividends();

      // Update last run date
      this.lastRunDate = new Date().toISOString().split('T')[0];

      console.log(`${logPrefix} Scheduled dividend check complete`);
      return summary;
    } catch (error) {
      console.error(`${logPrefix} [ERROR] Scheduler error:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if it's time to run and process if needed
   */
  async checkAndRun() {
    if (this.shouldRun()) {
      console.log('[DIVIDEND-SCHEDULER] Scheduled time reached, starting dividend processing...');
      await this.processDividends();
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log('[DIVIDEND-SCHEDULER] Starting dividend scheduler...');
    console.log(`[DIVIDEND-SCHEDULER] Scheduled to run daily at ${SCHEDULER_HOUR}:00`);

    // Check immediately on start (in case we missed today's run)
    this.checkAndRun().catch(error => {
      console.error('[DIVIDEND-SCHEDULER] Initial check failed:', error);
    });

    // Schedule hourly checks
    this.interval = setInterval(() => {
      this.checkAndRun().catch(error => {
        console.error('[DIVIDEND-SCHEDULER] Scheduled check failed:', error);
      });
    }, CHECK_INTERVAL);

    console.log('[DIVIDEND-SCHEDULER] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('[DIVIDEND-SCHEDULER] Stopping dividend scheduler...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('[DIVIDEND-SCHEDULER] Scheduler stopped');
  }

  /**
   * Force run now (for manual triggering/testing)
   */
  async runNow() {
    console.log('[DIVIDEND-SCHEDULER] Manual run triggered...');
    return await this.processDividends();
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
