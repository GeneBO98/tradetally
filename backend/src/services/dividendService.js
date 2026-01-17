/**
 * Dividend Service
 * Handles automatic dividend tracking for trade-based holdings
 *
 * Features:
 * - Fetch dividend history from Finnhub (primary) or Alpha Vantage (fallback)
 * - Calculate shares held at ex-dividend date from trade executions
 * - Record dividends to trade_dividends table
 * - Prevent duplicates via UNIQUE constraint
 */

const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');

class DividendService {
  /**
   * Fetch dividend history for a symbol
   * Uses Finnhub if configured, falls back to Alpha Vantage
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of dividend objects
   */
  static async fetchDividendHistory(symbol) {
    const logPrefix = '[DIVIDEND-SERVICE]';

    // Try Finnhub first if configured
    if (finnhub.isConfigured()) {
      try {
        const dividends = await finnhub.getDividends(symbol);
        if (dividends && dividends.length > 0) {
          console.log(`${logPrefix} Got ${dividends.length} dividends from Finnhub for ${symbol}`);
          return dividends.map(d => ({
            ...d,
            provider: 'finnhub'
          }));
        }
      } catch (error) {
        console.warn(`${logPrefix} Finnhub dividend fetch failed for ${symbol}: ${error.message}`);
      }
    }

    // Fall back to Alpha Vantage
    if (alphaVantage.isConfigured()) {
      try {
        const dividends = await alphaVantage.getDividends(symbol);
        if (dividends && dividends.length > 0) {
          console.log(`${logPrefix} Got ${dividends.length} dividends from Alpha Vantage for ${symbol}`);
          return dividends.map(d => ({
            ...d,
            provider: 'alphavantage'
          }));
        }
      } catch (error) {
        console.warn(`${logPrefix} Alpha Vantage dividend fetch failed for ${symbol}: ${error.message}`);
      }
    }

    console.log(`${logPrefix} No dividend data available for ${symbol}`);
    return [];
  }

  /**
   * Calculate shares held at a specific date for a user/symbol
   * Looks at all trades and their executions to determine position
   * @param {string} userId - User ID
   * @param {string} symbol - Stock symbol
   * @param {Date|string} targetDate - The date to calculate position for (ex-dividend date)
   * @returns {Promise<number>} Number of shares held
   */
  static async getSharesHeldAtDate(userId, symbol, targetDate) {
    const logPrefix = '[DIVIDEND-SERVICE]';
    const targetDateObj = new Date(targetDate);
    const targetDateStr = targetDateObj.toISOString().split('T')[0];

    // Query all trades for this symbol that were potentially open on targetDate
    // A trade is relevant if: entry_time <= targetDate AND (exit_time IS NULL OR exit_time >= targetDate)
    const query = `
      SELECT t.id, t.entry_time, t.exit_time, t.executions, t.quantity, t.side
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol = $2
        AND t.side = 'long'
        AND DATE(t.entry_time) <= $3
        AND (t.exit_time IS NULL OR DATE(t.exit_time) >= $3)
    `;

    const result = await db.query(query, [userId, symbol.toUpperCase(), targetDateStr]);
    const trades = result.rows;

    let totalShares = 0;

    for (const trade of trades) {
      const executions = trade.executions || [];

      // If no executions, use the trade quantity
      if (executions.length === 0) {
        totalShares += parseFloat(trade.quantity) || 0;
        continue;
      }

      // Sum executions up to and including targetDate
      let position = 0;
      for (const exec of executions) {
        const execDate = new Date(exec.datetime || exec.entry_time || exec.exit_time);

        // Only count executions on or before the target date
        if (execDate <= targetDateObj) {
          const qty = parseFloat(exec.quantity) || 0;
          const action = (exec.action || exec.side || '').toLowerCase();

          if (action === 'buy' || action === 'long') {
            position += qty;
          } else if (action === 'sell' || action === 'short') {
            position -= qty;
          }
        }
      }

      totalShares += Math.max(0, position);
    }

    console.log(`${logPrefix} User ${userId} held ${totalShares} shares of ${symbol} on ${targetDateStr}`);
    return totalShares;
  }

  /**
   * Process dividends for a specific user and symbol
   * Fetches dividend history, calculates eligible shares, records to database
   * @param {string} userId - User ID
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Processing result with counts
   */
  static async processUserSymbolDividends(userId, symbol) {
    const logPrefix = '[DIVIDEND-SERVICE]';
    const result = { symbol, processed: 0, recorded: 0, skipped: 0, errors: 0 };

    try {
      // Fetch dividend history
      const dividends = await this.fetchDividendHistory(symbol);
      if (dividends.length === 0) {
        return result;
      }

      // Process each dividend
      for (const dividend of dividends) {
        result.processed++;

        try {
          const exDate = dividend.date;
          if (!exDate) {
            console.warn(`${logPrefix} Skipping dividend without ex-date for ${symbol}`);
            result.skipped++;
            continue;
          }

          // Check if already recorded (using ON CONFLICT DO NOTHING)
          const sharesHeld = await this.getSharesHeldAtDate(userId, symbol, exDate);

          if (sharesHeld <= 0) {
            // User didn't hold shares on ex-dividend date
            result.skipped++;
            continue;
          }

          const dividendAmount = parseFloat(dividend.amount) || 0;
          if (dividendAmount <= 0) {
            result.skipped++;
            continue;
          }

          const totalAmount = sharesHeld * dividendAmount;

          // Insert dividend record (ON CONFLICT prevents duplicates)
          const insertQuery = `
            INSERT INTO trade_dividends (
              user_id, symbol, ex_dividend_date, payment_date,
              dividend_per_share, shares_held, total_amount,
              source, data_provider
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (user_id, symbol, ex_dividend_date) DO NOTHING
            RETURNING id
          `;

          const insertResult = await db.query(insertQuery, [
            userId,
            symbol.toUpperCase(),
            exDate,
            dividend.payDate || null,
            dividendAmount,
            sharesHeld,
            totalAmount,
            'auto',
            dividend.provider || 'unknown'
          ]);

          if (insertResult.rows.length > 0) {
            console.log(`${logPrefix} Recorded dividend for ${symbol}: $${totalAmount.toFixed(2)} (${sharesHeld} shares @ $${dividendAmount}/share)`);
            result.recorded++;
          } else {
            // Already existed
            result.skipped++;
          }
        } catch (error) {
          console.error(`${logPrefix} Error processing dividend for ${symbol}: ${error.message}`);
          result.errors++;
        }
      }
    } catch (error) {
      console.error(`${logPrefix} Error processing dividends for ${userId}/${symbol}: ${error.message}`);
      result.errors++;
    }

    return result;
  }

  /**
   * Get all unique symbols from open trades across all users
   * @returns {Promise<Array>} Array of { symbol, user_ids[] } objects
   */
  static async getSymbolsWithOpenTrades() {
    const query = `
      SELECT DISTINCT t.symbol, array_agg(DISTINCT t.user_id) as user_ids
      FROM trades t
      WHERE t.exit_price IS NULL
        AND t.side = 'long'
        AND t.symbol IS NOT NULL
        AND t.symbol != ''
      GROUP BY t.symbol
      ORDER BY t.symbol
    `;

    const result = await db.query(query);
    return result.rows.map(row => ({
      symbol: row.symbol,
      userIds: row.user_ids
    }));
  }

  /**
   * Get all dividends for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of dividend records
   */
  static async getUserDividends(userId) {
    const query = `
      SELECT *
      FROM trade_dividends
      WHERE user_id = $1
      ORDER BY ex_dividend_date DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get dividend totals for a user grouped by symbol
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Map of symbol -> { totalAmount, lastDividendDate }
   */
  static async getUserDividendsBySymbol(userId) {
    const query = `
      SELECT
        symbol,
        COALESCE(SUM(total_amount), 0) as total_amount,
        MAX(payment_date) as last_dividend_date,
        COUNT(*) as dividend_count
      FROM trade_dividends
      WHERE user_id = $1
      GROUP BY symbol
    `;

    const result = await db.query(query, [userId]);

    const dividendsBySymbol = {};
    for (const row of result.rows) {
      dividendsBySymbol[row.symbol] = {
        totalAmount: parseFloat(row.total_amount) || 0,
        lastDividendDate: row.last_dividend_date,
        dividendCount: parseInt(row.dividend_count) || 0
      };
    }

    return dividendsBySymbol;
  }

  /**
   * Get total dividends for a specific symbol and user
   * @param {string} userId - User ID
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} { totalAmount, lastDividendDate, count }
   */
  static async getSymbolDividends(userId, symbol) {
    const query = `
      SELECT
        COALESCE(SUM(total_amount), 0) as total_amount,
        MAX(payment_date) as last_dividend_date,
        COUNT(*) as count
      FROM trade_dividends
      WHERE user_id = $1 AND symbol = $2
    `;

    const result = await db.query(query, [userId, symbol.toUpperCase()]);
    const row = result.rows[0] || {};

    return {
      totalAmount: parseFloat(row.total_amount) || 0,
      lastDividendDate: row.last_dividend_date || null,
      count: parseInt(row.count) || 0
    };
  }

  /**
   * Process all dividends for all users with open trades
   * This is the main entry point for the scheduler
   * @returns {Promise<Object>} Summary of processing results
   */
  static async processAllDividends() {
    const logPrefix = '[DIVIDEND-SERVICE]';
    const startTime = Date.now();

    console.log(`${logPrefix} Starting dividend processing for all users...`);

    const summary = {
      symbolsProcessed: 0,
      usersProcessed: 0,
      dividendsRecorded: 0,
      dividendsSkipped: 0,
      errors: 0
    };

    try {
      // Get all symbols with open trades
      const symbolsWithUsers = await this.getSymbolsWithOpenTrades();
      console.log(`${logPrefix} Found ${symbolsWithUsers.length} symbols with open trades`);

      // Process each symbol
      for (const { symbol, userIds } of symbolsWithUsers) {
        summary.symbolsProcessed++;

        // Add delay between symbols to respect rate limits
        if (summary.symbolsProcessed > 1) {
          await this.sleep(1000); // 1 second delay between API calls
        }

        // Process for each user holding this symbol
        for (const userId of userIds) {
          try {
            const result = await this.processUserSymbolDividends(userId, symbol);
            summary.usersProcessed++;
            summary.dividendsRecorded += result.recorded;
            summary.dividendsSkipped += result.skipped;
            summary.errors += result.errors;
          } catch (error) {
            console.error(`${logPrefix} Error processing ${symbol} for user ${userId}: ${error.message}`);
            summary.errors++;
          }
        }
      }
    } catch (error) {
      console.error(`${logPrefix} Fatal error in dividend processing: ${error.message}`);
      summary.errors++;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${logPrefix} Dividend processing complete in ${duration}s:`);
    console.log(`${logPrefix}   Symbols: ${summary.symbolsProcessed}`);
    console.log(`${logPrefix}   Dividends recorded: ${summary.dividendsRecorded}`);
    console.log(`${logPrefix}   Skipped: ${summary.dividendsSkipped}`);
    console.log(`${logPrefix}   Errors: ${summary.errors}`);

    return summary;
  }

  /**
   * Sleep helper
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DividendService;
