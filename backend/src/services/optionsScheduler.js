const IntervalScheduler = require('./schedulers/IntervalScheduler');
const db = require('../config/database');
const AnalyticsCache = require('./analyticsCache');
const OptionStrategyGroupingService = require('./optionStrategyGroupingService');

class OptionsScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: 60 * 60 * 1000, // 1 hour
      runOnStart: false,
      initialDelayMs: 5000, // Wait 5 seconds after startup
      useUnref: true,
      useRunningGuard: false,
      stopLogAlways: false,
      messages: {
        startLogs: ['[OPTIONS SCHEDULER] Starting options scheduler...'],
        initialDelayFired: '[OPTIONS SCHEDULER] Running initial expired options check on startup',
        tick: '[OPTIONS SCHEDULER] Running scheduled expired options closure',
        started: '[OPTIONS SCHEDULER] Scheduler started - will run every hour',
        stopped: '[OPTIONS SCHEDULER] Scheduler stopped'
      }
    });
  }

  async closeExpiredOptions() {
    const logPrefix = '[OPTIONS SCHEDULER]';

    try {
      console.log(`${logPrefix} Starting automatic expired options closure check`);

      const today = new Date().toISOString().split('T')[0];
      const closedAt = new Date();

      // Find all expired options for users who have auto-close enabled
      const findQuery = `
        SELECT t.id, t.user_id, t.symbol, t.side, t.expiration_date, t.quantity, t.entry_price, t.contract_size
        FROM trades t
        INNER JOIN user_settings us ON t.user_id = us.user_id
        WHERE t.instrument_type = 'option'
          AND t.exit_time IS NULL
          AND t.expiration_date < $1
          AND us.auto_close_expired_options = true
        ORDER BY t.user_id, t.expiration_date DESC
      `;

      const result = await db.query(findQuery, [today]);
      const expiredOptions = result.rows;

      if (expiredOptions.length === 0) {
        console.log(`${logPrefix} No expired options found to close (only checking users with auto-close enabled)`);
        return;
      }

      console.log(`${logPrefix} Found ${expiredOptions.length} expired options to close (from users with auto-close enabled)`);

      // Close each expired option
      const updateQuery = `
        UPDATE trades
        SET exit_time = $1,
            exit_price = 0,
            pnl = CASE
              WHEN side = 'long' THEN (0 - entry_price) * quantity * COALESCE(contract_size, 100)
              WHEN side = 'short' THEN (entry_price - 0) * quantity * COALESCE(contract_size, 100)
            END,
            pnl_percent = CASE
              WHEN side = 'long' THEN -100.0
              WHEN side = 'short' THEN 100.0
            END,
            auto_closed = true,
            auto_close_reason = 'Option expired worthless (scheduler)',
            notes = CASE
              WHEN notes IS NULL OR notes = '' THEN 'Auto-closed: Option expired worthless'
              ELSE notes || ' | Auto-closed: Option expired worthless'
            END,
            updated_at = $1
        WHERE id = $2
      `;

      let closedCount = 0;
      const userSummary = {};

      for (const option of expiredOptions) {
        try {
          await db.query(updateQuery, [closedAt, option.id]);
          closedCount++;

          // Track per-user statistics
          if (!userSummary[option.user_id]) {
            userSummary[option.user_id] = 0;
          }
          userSummary[option.user_id]++;

          const pnlPercent = option.side === 'long' ? '-100%' : '+100%';
          console.log(
            `${logPrefix} Closed expired ${option.side} option: ${option.symbol} (ID: ${option.id}) ` +
            `for user ${option.user_id} - Expiration: ${option.expiration_date} - P&L: ${pnlPercent}`
          );
        } catch (error) {
          console.error(
            `${logPrefix} Failed to close option ${option.id} (${option.symbol}):`,
            error.message
          );
        }
      }

      // Log summary
      console.log(`${logPrefix} [SUCCESS] Closed ${closedCount} expired options`);
      for (const userId of Object.keys(userSummary)) {
        console.log(`${logPrefix} User ${userId}: ${userSummary[userId]} options closed`);
        await OptionStrategyGroupingService.rebuildUserGroupsSafe(userId, 'expired option scheduler');
        await AnalyticsCache.invalidate(userId);
      }

    } catch (error) {
      console.error(`${logPrefix} [ERROR] Error in automatic expired options closure:`, error);
    }
  }

  async execute() {
    return this.closeExpiredOptions();
  }

  stopScheduler() {
    this.stop();
  }
}

module.exports = new OptionsScheduler();
