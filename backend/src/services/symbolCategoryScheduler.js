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

const IntervalScheduler = require('./schedulers/IntervalScheduler');
const symbolCategories = require('../utils/symbolCategories');

const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // Run every 6 hours
const LOG_PREFIX = '[CATEGORY-SCHEDULER]';

class SymbolCategoryScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      messages: {
        startLogs: [
          `${LOG_PREFIX} Starting symbol category scheduler...`,
          `${LOG_PREFIX} Scheduled to run every 6 hours`
        ],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping symbol category scheduler...`,
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
   * Categorize uncategorized symbols
   */
  async processCategories() {
    return this.runGuarded();
  }

  async execute() {
    const logPrefix = LOG_PREFIX;

    console.log(`${logPrefix} Starting scheduled symbol categorization...`);

    const result = await symbolCategories.categorizeNewSymbols();

    this.lastRunDate = new Date().toISOString();

    if (result.total === 0) {
      console.log(`${logPrefix} All symbols already categorized`);
    } else {
      console.log(`${logPrefix} Categorization complete - processed: ${result.processed}/${result.total}`);
    }

    return result;
  }
}

// Export singleton instance
module.exports = new SymbolCategoryScheduler();
