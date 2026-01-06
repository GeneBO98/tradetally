/**
 * Stock Scanner Scheduler Service
 * Manages the quarterly Russell 2000 8 Pillars scan
 * Scans Russell 2000 stocks and caches results in database
 * Runs at 3 AM on the 1st of each quarter (Jan, Apr, Jul, Oct)
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
   * Starts the quarterly Russell 2000 scan job (3 AM on 1st of quarter)
   */
  initialize() {
    try {
      console.log('[SCANNER SCHEDULER] Initializing...');

      // Schedule quarterly scan at 3 AM on the 1st of Jan, Apr, Jul, Oct
      // Cron expression: minute hour day-of-month month day-of-week
      const cronExpression = '0 3 1 1,4,7,10 *'; // 3 AM on 1st of quarter months

      this.job = cron.schedule(cronExpression, async () => {
        await this.executeQuarterlyScan();
      });

      console.log('[SCANNER SCHEDULER] Scheduled quarterly Russell 2000 scan (Jan 1, Apr 1, Jul 1, Oct 1 at 3 AM)');
      console.log('[SCANNER SCHEDULER] Initialized successfully');

    } catch (error) {
      console.error('[SCANNER SCHEDULER] Error initializing:', error);
    }
  }

  /**
   * Execute the quarterly Russell 2000 scan
   */
  async executeQuarterlyScan() {
    if (!this.enabled) {
      console.log('[SCANNER SCHEDULER] Scanner is disabled, skipping quarterly scan');
      return;
    }

    try {
      console.log('[SCANNER SCHEDULER] Starting quarterly Russell 2000 scan...');

      const result = await StockScannerService.runNightlyScan({ russell2000Only: true });

      console.log(`[SCANNER SCHEDULER] Quarterly Russell 2000 scan completed:`, result);

    } catch (error) {
      console.error('[SCANNER SCHEDULER] Error during quarterly scan:', error.message);
    }
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[SCANNER SCHEDULER] Stopped quarterly scan job');
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
      nextRun: this.job ? 'Quarterly (Jan 1, Apr 1, Jul 1, Oct 1 at 3:00 AM)' : 'Not scheduled'
    };
  }
}

module.exports = new StockScannerScheduler();
