/**
 * Stock Scanner Scheduler Service
 * Manages the quarterly Russell 2000 8 Pillars scan
 * Scans Russell 2000 stocks and caches results in database
 * Runs at 3 AM on the 1st of each quarter (Jan, Apr, Jul, Oct)
 */

const CronScheduler = require('./schedulers/CronScheduler');
const StockScannerService = require('./stockScannerService');

class StockScannerScheduler extends CronScheduler {
  constructor() {
    super({
      logPrefix: '[SCANNER SCHEDULER]',
      // Cron expression: minute hour day-of-month month day-of-week
      defaultCron: '0 3 1 1,4,7,10 *', // 3 AM on 1st of quarter months
      validateExpression: false,
      messages: {
        startLogs: ['[SCANNER SCHEDULER] Initializing...'],
        started: [
          '[SCANNER SCHEDULER] Scheduled quarterly Russell 2000 scan (Jan 1, Apr 1, Jul 1, Oct 1 at 3 AM)',
          '[SCANNER SCHEDULER] Initialized successfully'
        ],
        stopped: '[SCANNER SCHEDULER] Stopped quarterly scan job'
      }
    });
    this.enabled = true;
  }

  /**
   * Initialize the scheduler
   * Starts the quarterly Russell 2000 scan job (3 AM on 1st of quarter)
   */
  initialize() {
    try {
      super.start();
    } catch (error) {
      console.error('[SCANNER SCHEDULER] Error initializing:', error);
    }
  }

  onTick() {
    return this.executeQuarterlyScan();
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
