/**
 * Schwab API Integration Service
 * Fetches trade data from Charles Schwab using their Developer API
 *
 * API Documentation: https://developer.schwab.com
 *
 * Note: Schwab requires:
 * 1. Developer account registration at developer.schwab.com
 * 2. App approval (can take a few days)
 * 3. Think or Swim enabled account
 * 4. Manual re-authentication every 7 days (refresh token limitation)
 */

const axios = require('axios');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const db = require('../../config/database');

const SCHWAB_API_BASE = 'https://api.schwabapi.com';
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiration

class SchwabService {
  /**
   * Check if tokens need refresh and refresh if necessary
   * @param {object} connection - BrokerConnection with credentials
   * @returns {Promise<{accessToken: string, needsReauth: boolean}>}
   */
  async ensureValidToken(connection) {
    // Handle missing or invalid expiration date
    if (!connection.schwabTokenExpiresAt) {
      console.log('[SCHWAB] No token expiration date, attempting refresh...');
      try {
        const newTokens = await this.refreshAccessToken(connection.schwabRefreshToken);
        await BrokerConnection.updateSchwabTokens(
          connection.id,
          newTokens.accessToken,
          newTokens.refreshToken,
          newTokens.expiresAt
        );
        return { accessToken: newTokens.accessToken, needsReauth: false };
      } catch (error) {
        console.error('[SCHWAB] Token refresh failed:', error.message);
        await BrokerConnection.updateStatus(connection.id, 'expired', 'Refresh token expired - please re-authenticate');
        return { accessToken: null, needsReauth: true };
      }
    }

    const expiresAt = new Date(connection.schwabTokenExpiresAt);
    const now = new Date();

    // Check if expiration date is invalid
    if (isNaN(expiresAt.getTime())) {
      console.log('[SCHWAB] Invalid token expiration date, attempting refresh...');
      try {
        const newTokens = await this.refreshAccessToken(connection.schwabRefreshToken);
        await BrokerConnection.updateSchwabTokens(
          connection.id,
          newTokens.accessToken,
          newTokens.refreshToken,
          newTokens.expiresAt
        );
        return { accessToken: newTokens.accessToken, needsReauth: false };
      } catch (error) {
        console.error('[SCHWAB] Token refresh failed:', error.message);
        await BrokerConnection.updateStatus(connection.id, 'expired', 'Refresh token expired - please re-authenticate');
        return { accessToken: null, needsReauth: true };
      }
    }

    // Check if token is expired or about to expire
    if (expiresAt.getTime() - now.getTime() < TOKEN_REFRESH_BUFFER) {
      console.log('[SCHWAB] Token expired or expiring soon, refreshing...');

      try {
        const newTokens = await this.refreshAccessToken(connection.schwabRefreshToken);

        // Update connection with new tokens
        await BrokerConnection.updateSchwabTokens(
          connection.id,
          newTokens.accessToken,
          newTokens.refreshToken,
          newTokens.expiresAt
        );

        return { accessToken: newTokens.accessToken, needsReauth: false };
      } catch (error) {
        // Refresh token likely expired (7 day limit)
        console.error('[SCHWAB] Token refresh failed:', error.message);
        await BrokerConnection.updateStatus(connection.id, 'expired', 'Refresh token expired - please re-authenticate');
        return { accessToken: null, needsReauth: true };
      }
    }

    return { accessToken: connection.schwabAccessToken, needsReauth: false };
  }

  /**
   * Refresh the access token using the refresh token
   * @param {string} refreshToken - Current refresh token
   * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: Date}>}
   */
  async refreshAccessToken(refreshToken) {
    console.log('[SCHWAB] Refreshing access token...');

    const response = await axios.post(
      `${SCHWAB_API_BASE}/v1/oauth/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.SCHWAB_CLIENT_ID,
          password: process.env.SCHWAB_CLIENT_SECRET
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    console.log('[SCHWAB] Token refreshed successfully');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt
    };
  }

  /**
   * Get account information
   * @param {string} accessToken - Valid access token
   * @returns {Promise<object>}
   */
  async getAccounts(accessToken) {
    console.log('[SCHWAB] Fetching accounts...');

    const response = await axios.get(
      `${SCHWAB_API_BASE}/trader/v1/accounts`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  }

  /**
   * Get transactions for an account
   * @param {string} accessToken - Valid access token
   * @param {string} accountId - Schwab account ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>}
   */
  async getTransactions(accessToken, accountId, startDate, endDate) {
    console.log(`[SCHWAB] Fetching transactions from ${startDate} to ${endDate}...`);

    // Format dates for Schwab API
    const start = startDate || this.getDefaultStartDate();
    const end = endDate || new Date().toISOString().split('T')[0];

    const response = await axios.get(
      `${SCHWAB_API_BASE}/trader/v1/accounts/${accountId}/transactions`,
      {
        params: {
          types: 'TRADE', // Only get trade transactions
          startDate: start,
          endDate: end
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log(`[SCHWAB] Fetched ${response.data.length || 0} transactions`);

    return response.data || [];
  }

  /**
   * Get default start date (30 days ago)
   */
  getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  }

  /**
   * Parse Schwab transactions into TradeTally trade format
   * @param {Array} transactions - Raw Schwab transactions
   * @returns {Array} - Parsed trades
   */
  parseTransactions(transactions) {
    const trades = [];

    for (const tx of transactions) {
      try {
        const trade = this.parseTransaction(tx);
        if (trade) {
          trades.push(trade);
        }
      } catch (error) {
        console.warn('[SCHWAB] Failed to parse transaction:', error.message);
      }
    }

    return trades;
  }

  /**
   * Parse a single Schwab transaction
   * @param {object} tx - Raw transaction
   * @returns {object|null} - Parsed trade or null if not a valid trade
   */
  parseTransaction(tx) {
    // Skip non-equity transactions for now
    if (!tx.transactionItem || tx.type !== 'TRADE') {
      return null;
    }

    const item = tx.transactionItem;
    const instrument = item.instrument;

    // Determine side from transaction type
    const instruction = item.instruction;
    let side;
    if (instruction === 'BUY' || instruction === 'BUY_TO_COVER') {
      side = 'long';
    } else if (instruction === 'SELL' || instruction === 'SELL_SHORT') {
      side = 'short';
    } else {
      return null; // Skip unknown instruction types
    }

    // Determine instrument type
    let instrumentType = 'stock';
    let optionType = null;
    let strikePrice = null;
    let expirationDate = null;
    let underlyingSymbol = null;

    if (instrument.assetType === 'OPTION') {
      instrumentType = 'option';
      optionType = instrument.putCall?.toLowerCase();
      strikePrice = instrument.strikePrice;
      expirationDate = instrument.expirationDate;
      underlyingSymbol = instrument.underlyingSymbol;
    } else if (instrument.assetType === 'FUTURE') {
      instrumentType = 'future';
    }

    const symbol = instrument.symbol || instrument.underlyingSymbol;
    const quantity = Math.abs(parseFloat(item.amount || item.quantity || 0));
    const price = parseFloat(item.price || 0);
    const commission = Math.abs(parseFloat(tx.fees?.commission || 0));
    const fees = Math.abs(parseFloat(tx.fees?.regFee || 0)) +
                 Math.abs(parseFloat(tx.fees?.additionalFee || 0)) +
                 Math.abs(parseFloat(tx.fees?.cdscFee || 0));

    const tradeDate = tx.transactionDate?.split('T')[0];
    const entryTime = tx.transactionDate;

    // For completed (closed) trades, calculate P&L
    let exitPrice = null;
    let exitTime = null;
    let pnl = null;

    if (tx.netAmount && instruction.includes('SELL')) {
      // This is likely a closing trade
      // Schwab provides net amount which includes P&L
      pnl = parseFloat(tx.netAmount);
    }

    return {
      symbol,
      side,
      quantity,
      entryPrice: price,
      exitPrice,
      entryTime,
      exitTime,
      tradeDate,
      commission,
      fees,
      pnl,
      broker: 'schwab',
      instrumentType,
      optionType,
      strikePrice,
      expirationDate,
      underlyingSymbol: instrumentType === 'option' ? underlyingSymbol : null,
      executionData: [{
        datetime: entryTime,
        entryTime,
        entryPrice: price,
        quantity,
        side,
        commission,
        fees,
        orderId: tx.orderId || tx.transactionId
      }]
    };
  }

  /**
   * Sync trades from Schwab
   * @param {object} connection - BrokerConnection with credentials
   * @param {object} options - Sync options
   */
  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;

    console.log(`[SCHWAB] Starting sync for connection ${connection.id}`);

    // Ensure we have a valid token
    const { accessToken, needsReauth } = await this.ensureValidToken(connection);

    if (needsReauth) {
      throw new Error('Schwab authentication expired. Please re-connect your account.');
    }

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    }

    // Fetch transactions
    const transactions = await this.getTransactions(
      accessToken,
      connection.schwabAccountId,
      startDate,
      endDate
    );

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing', {
        tradesFetched: transactions.length
      });
    }

    // Parse transactions to trades
    const trades = this.parseTransactions(transactions);
    console.log(`[SCHWAB] Parsed ${trades.length} trades from ${transactions.length} transactions`);

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    }

    // Import trades
    const result = await this.importTrades(connection.userId, trades);

    console.log(`[SCHWAB] Sync complete: ${result.imported} imported, ${result.duplicates} duplicates`);

    return result;
  }

  /**
   * Import parsed trades into the database
   */
  async importTrades(userId, trades) {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let duplicates = 0;

    const existingTrades = await this.getExistingTrades(userId);

    for (const tradeData of trades) {
      try {
        // Check for duplicates
        const isDuplicate = this.isDuplicateTrade(tradeData, existingTrades);

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        // Create trade
        await Trade.create(userId, tradeData, {
          skipAchievements: true,
          skipApiCalls: true
        });

        imported++;
      } catch (error) {
        console.error(`[SCHWAB] Failed to import trade:`, error.message);
        failed++;
      }
    }

    return { imported, skipped, failed, duplicates };
  }

  /**
   * Get existing trades for duplicate checking
   */
  async getExistingTrades(userId) {
    const query = `
      SELECT symbol, side, quantity, entry_price, entry_time, executions, trade_date
      FROM trades
      WHERE user_id = $1 AND broker = 'schwab'
      ORDER BY entry_time DESC
      LIMIT 1000
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Check if trade is a duplicate
   */
  isDuplicateTrade(newTrade, existingTrades) {
    const symbol = newTrade.symbol?.toUpperCase();

    for (const existing of existingTrades) {
      if (existing.symbol?.toUpperCase() !== symbol) continue;

      // Check execution data match (by order ID)
      if (newTrade.executionData?.length > 0 && existing.executions) {
        let existingExecs = existing.executions;
        if (typeof existingExecs === 'string') {
          try {
            existingExecs = JSON.parse(existingExecs);
          } catch {
            existingExecs = [];
          }
        }

        const newOrderIds = new Set(
          newTrade.executionData.map(e => e.orderId).filter(Boolean)
        );

        const hasMatch = existingExecs.some(exec =>
          exec.orderId && newOrderIds.has(exec.orderId)
        );

        if (hasMatch) return true;
      }

      // Fallback: compare entry time and price
      const entryTimeMatch = Math.abs(
        new Date(existing.entry_time).getTime() -
        new Date(newTrade.entryTime).getTime()
      ) < 1000;

      const entryPriceMatch = Math.abs(
        parseFloat(existing.entry_price) -
        parseFloat(newTrade.entryPrice)
      ) < 0.01;

      if (entryTimeMatch && entryPriceMatch) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate Schwab OAuth setup
   */
  validateConfig() {
    const required = ['SCHWAB_CLIENT_ID', 'SCHWAB_CLIENT_SECRET', 'SCHWAB_REDIRECT_URI'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      return {
        valid: false,
        message: `Missing Schwab configuration: ${missing.join(', ')}`
      };
    }

    return { valid: true };
  }
}

module.exports = new SchwabService();
