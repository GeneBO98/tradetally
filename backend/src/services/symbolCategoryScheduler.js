/**
 * Symbol Category Scheduler
 * Runs periodically to pre-categorize all traded symbols with industry data
 *
 * Default schedule: Every 6 hours
 * - Finds symbols in trades that don't have categories in symbol_categories table
 * - Fetches company profiles from Finnhub (industry, sector, company name)
 * - Stores results permanently in symbol_categories table
 * - Once a symbol is categorized, it never needs re-fetching (company sector doesn't change)
 */

const symbolCategories = require('../utils/symbolCategories');

const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // Run every 6 hours

class SymbolCategoryScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRunDate = null;
  }

  /**
   * Categorize uncategorized symbols
   */
  async processCategories() {
    if (this.isRunning) {
      console.log('[CATEGORY-SCHEDULER] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const logPrefix = '[CATEGORY-SCHEDULER]';

    try {
      console.log(`${logPrefix} Starting scheduled symbol categorization...`);

      const result = await symbolCategories.categorizeNewSymbols();

      this.lastRunDate = new Date().toISOString();

      if (result.total === 0) {
        console.log(`${logPrefix} All symbols already categorized`);
      } else {
        console.log(`${logPrefix} Categorization complete - processed: ${result.processed}/${result.total}`);
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
    console.log('[CATEGORY-SCHEDULER] Starting symbol category scheduler...');
    console.log('[CATEGORY-SCHEDULER] Scheduled to run every 6 hours');

    // Run immediately on start to categorize any new symbols
    this.processCategories().catch(error => {
      console.error('[CATEGORY-SCHEDULER] Initial run failed:', error);
    });

    // Schedule periodic runs
    this.interval = setInterval(() => {
      this.processCategories().catch(error => {
        console.error('[CATEGORY-SCHEDULER] Scheduled run failed:', error);
      });
    }, CHECK_INTERVAL);

    console.log('[CATEGORY-SCHEDULER] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('[CATEGORY-SCHEDULER] Stopping symbol category scheduler...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('[CATEGORY-SCHEDULER] Scheduler stopped');
  }

  /**
   * Force run now (for manual triggering/testing)
   */
  async runNow() {
    console.log('[CATEGORY-SCHEDULER] Manual run triggered...');
    return await this.processCategories();
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
module.exports = new SymbolCategoryScheduler();
