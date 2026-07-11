/**
 * Watchlist Pillars Scheduler Service
 * Pre-computes 8 Pillars analysis for all watchlist stocks daily
 * so data is cached before users visit the page
 * Runs at 4 AM daily
 */

const CronScheduler = require('./schedulers/CronScheduler');
const db = require('../config/database');
const EightPillarsService = require('./eightPillarsService');

class WatchlistPillarsScheduler extends CronScheduler {
  constructor() {
    super({
      logPrefix: '[WATCHLIST PILLARS]',
      defaultCron: '0 4 * * *', // Daily at 4 AM
      validateExpression: false,
      errorLogsMessageOnly: true,
      messages: {
        startLogs: ['[WATCHLIST PILLARS] Initializing scheduler...'],
        started: '[WATCHLIST PILLARS] Scheduled daily at 4 AM',
        stopped: '[WATCHLIST PILLARS] Stopped scheduler',
        skip: '[WATCHLIST PILLARS] Already running, skipping',
        runError: '[WATCHLIST PILLARS] Error during run:'
      }
    });
  }

  /**
   * Initialize the scheduler
   * Runs daily at 4 AM to pre-compute pillars for all watchlist stocks
   */
  initialize() {
    try {
      super.start();
    } catch (error) {
      console.error('[WATCHLIST PILLARS] Error initializing:', error);
    }
  }

  onTick() {
    return this.run();
  }

  /**
   * Run the pre-computation job
   * Finds all unique symbols across all user watchlists and ensures
   * they have fresh 8 Pillars analysis cached
   */
  async run() {
    return this.runExclusive();
  }

  async execute() {
    const startTime = Date.now();

    // Get all unique symbols from all watchlists
    const result = await db.query(`
      SELECT DISTINCT wi.symbol
      FROM watchlist_items wi
      JOIN watchlists w ON wi.watchlist_id = w.id
      ORDER BY wi.symbol
    `);

    const symbols = result.rows.map(r => r.symbol.toUpperCase());

    if (symbols.length === 0) {
      console.log('[WATCHLIST PILLARS] No watchlist symbols to analyze');
      return;
    }

    console.log(`[WATCHLIST PILLARS] Pre-computing pillars for ${symbols.length} symbols...`);

    let analyzed = 0;
    let cached = 0;
    let failed = 0;

    for (const symbol of symbols) {
      try {
        // analyzeStock checks cache first - only computes if stale
        const analysis = await EightPillarsService.analyzeStock(symbol);
        if (analysis) {
          analyzed++;
          // Check if it was a cache hit (log already says "Using cached")
          // Either way the cache is now warm
        }
      } catch (error) {
        failed++;
        console.error(`[WATCHLIST PILLARS] Failed to analyze ${symbol}: ${error.message}`);
      }

      // Rate limit: 1 second between stocks to avoid API throttling
      if (analyzed + failed < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[WATCHLIST PILLARS] Complete: ${analyzed} analyzed, ${failed} failed, ${duration}s`);
  }
}

module.exports = new WatchlistPillarsScheduler();
