/**
 * Watchlist Pillars Scheduler Service
 * Pre-computes 8 Pillars analysis for all watchlist stocks daily
 * so data is cached before users visit the page
 * Runs at 4 AM daily
 */

const cron = require('node-cron');
const db = require('../config/database');
const EightPillarsService = require('./eightPillarsService');

class WatchlistPillarsScheduler {
  constructor() {
    this.job = null;
    this.running = false;
  }

  /**
   * Initialize the scheduler
   * Runs daily at 4 AM to pre-compute pillars for all watchlist stocks
   */
  initialize() {
    try {
      console.log('[WATCHLIST PILLARS] Initializing scheduler...');

      // Daily at 4 AM
      this.job = cron.schedule('0 4 * * *', async () => {
        await this.run();
      });

      console.log('[WATCHLIST PILLARS] Scheduled daily at 4 AM');
    } catch (error) {
      console.error('[WATCHLIST PILLARS] Error initializing:', error);
    }
  }

  /**
   * Run the pre-computation job
   * Finds all unique symbols across all user watchlists and ensures
   * they have fresh 8 Pillars analysis cached
   */
  async run() {
    if (this.running) {
      console.log('[WATCHLIST PILLARS] Already running, skipping');
      return;
    }

    this.running = true;
    const startTime = Date.now();

    try {
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
    } catch (error) {
      console.error('[WATCHLIST PILLARS] Error during run:', error.message);
    } finally {
      this.running = false;
    }
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[WATCHLIST PILLARS] Stopped scheduler');
    }
  }
}

module.exports = new WatchlistPillarsScheduler();
