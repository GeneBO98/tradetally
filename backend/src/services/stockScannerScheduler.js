/**
 * Stock Scanner Scheduler Service
 * Manages the nightly Russell 2000 8 Pillars scan
 * Runs at 3 AM daily (after market close, before open)
 */

const cron = require('node-cron');
const StockScannerService = require('./stockScannerService');

class StockScannerScheduler {
  constructor() {
    this.job = null;
    this.enabled = true;
  }

  /**
   * Initialize the scheduler
   * Starts the 3 AM nightly scan job
   */
  initialize() {
    try {
      console.log('[SCANNER SCHEDULER] Initializing...');

      // Schedule nightly scan at 3 AM
      // Cron expression: minute hour day-of-month month day-of-week
      const cronExpression = '0 3 * * *'; // 3 AM every day

      this.job = cron.schedule(cronExpression, async () => {
        await this.executeNightlyScan();
      });

      console.log('[SCANNER SCHEDULER] Scheduled nightly Russell 2000 scan at 3 AM');
      console.log('[SCANNER SCHEDULER] Initialized successfully');

    } catch (error) {
      console.error('[SCANNER SCHEDULER] Error initializing:', error);
    }
  }

  /**
   * Execute the nightly scan
   */
  async executeNightlyScan() {
    if (!this.enabled) {
      console.log('[SCANNER SCHEDULER] Scanner is disabled, skipping nightly scan');
      return;
    }

    try {
      console.log('[SCANNER SCHEDULER] Starting nightly Russell 2000 scan...');

      const result = await StockScannerService.runNightlyScan();

      console.log(`[SCANNER SCHEDULER] Nightly scan completed:`, result);

    } catch (error) {
      console.error('[SCANNER SCHEDULER] Error during nightly scan:', error.message);
    }
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[SCANNER SCHEDULER] Stopped nightly scan job');
    }
  }

  /**
   * Enable or disable the scheduler
   * @param {boolean} enabled - Whether to enable the scheduler
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[SCANNER SCHEDULER] Scanner ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get scheduler status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      enabled: this.enabled,
      jobActive: !!this.job,
      nextRun: this.job ? 'Daily at 3:00 AM' : 'Not scheduled'
    };
  }
}

module.exports = new StockScannerScheduler();
