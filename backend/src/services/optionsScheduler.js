const db = require('../config/database');

class OptionsScheduler {
  constructor() {
    this.interval = null;
  }

  async closeExpiredOptions() {
    const logPrefix = '[OPTIONS SCHEDULER]';

    try {
      console.log(`${logPrefix} Starting automatic expired options closure check`);

      const today = new Date().toISOString().split('T')[0];
      const closedAt = new Date();

      // Find all expired options across all users
      const findQuery = `
        SELECT id, user_id, symbol, expiration_date, quantity, entry_price, contract_size
        FROM trades
        WHERE instrument_type = 'option'
          AND exit_time IS NULL
          AND expiration_date < $1
        ORDER BY user_id, expiration_date DESC
      `;

      const result = await db.query(findQuery, [today]);
      const expiredOptions = result.rows;

      if (expiredOptions.length === 0) {
        console.log(`${logPrefix} No expired options found to close`);
        return;
      }

      console.log(`${logPrefix} Found ${expiredOptions.length} expired options to close`);

      // Close each expired option
      const updateQuery = `
        UPDATE trades
        SET exit_time = $1,
            exit_price = 0,
            pnl = CASE
              WHEN side = 'long' THEN (0 - entry_price) * quantity * COALESCE(contract_size, 100)
              WHEN side = 'short' THEN (entry_price - 0) * quantity * COALESCE(contract_size, 100)
            END,
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

          console.log(
            `${logPrefix} Closed expired option: ${option.symbol} (ID: ${option.id}) ` +
            `for user ${option.user_id} - Expiration: ${option.expiration_date}`
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
      Object.keys(userSummary).forEach(userId => {
        console.log(`${logPrefix} User ${userId}: ${userSummary[userId]} options closed`);
      });

    } catch (error) {
      console.error(`${logPrefix} [ERROR] Error in automatic expired options closure:`, error);
    }
  }

  start() {
    console.log('[OPTIONS SCHEDULER] Starting options scheduler...');

    // Run immediately on startup to catch any options that expired while server was down
    setTimeout(async () => {
      console.log('[OPTIONS SCHEDULER] Running initial expired options check on startup');
      await this.closeExpiredOptions();
    }, 5000); // Wait 5 seconds after startup

    // Run every hour to catch newly expired options
    this.interval = setInterval(async () => {
      console.log('[OPTIONS SCHEDULER] Running scheduled expired options closure');
      await this.closeExpiredOptions();
    }, 60 * 60 * 1000); // 1 hour

    console.log('[OPTIONS SCHEDULER] Scheduler started - will run every hour');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[OPTIONS SCHEDULER] Scheduler stopped');
    }
  }

  stopScheduler() {
    this.stop();
  }
}

module.exports = new OptionsScheduler();
