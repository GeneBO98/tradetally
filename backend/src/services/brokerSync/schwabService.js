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

const SCHWAB_API_BASE = 'https://api.schwabapi.com/trader/v1';
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
      'https://api.schwabapi.com/v1/oauth/token',
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
   * Get encrypted account numbers (required for all account-specific API calls)
   * @param {string} accessToken - Valid access token
   * @returns {Promise<Array<{accountNumber: string, hashValue: string}>>}
   */
  async getAccountNumbers(accessToken) {
    console.log('[SCHWAB] Fetching encrypted account numbers...');

    const response = await axios.get(
      `${SCHWAB_API_BASE}/accounts/accountNumbers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log(`[SCHWAB] Found ${response.data?.length || 0} accounts`);
    return response.data || [];
  }

  /**
   * Get account information
   * @param {string} accessToken - Valid access token
   * @returns {Promise<object>}
   */
  async getAccounts(accessToken) {
    console.log('[SCHWAB] Fetching accounts...');

    const response = await axios.get(
      `${SCHWAB_API_BASE}/accounts`,
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
   * @param {string} accountHash - Encrypted account hash value
   * @param {string} startDate - Start date (ISO-8601 format)
   * @param {string} endDate - End date (ISO-8601 format)
   * @returns {Promise<Array>}
   */
  async getTransactions(accessToken, accountHash, startDate, endDate) {
    // Format dates as full ISO-8601 with time component
    const start = this.formatDateForApi(startDate || this.getDefaultStartDate());
    const end = this.formatDateForApi(endDate || new Date().toISOString().split('T')[0]);

    console.log(`[SCHWAB] Fetching transactions from ${start} to ${end}...`);
    console.log(`[SCHWAB] Account hash: ${accountHash?.substring(0, 10)}...`);

    try {
      const response = await axios.get(
        `${SCHWAB_API_BASE}/accounts/${accountHash}/transactions`,
        {
          params: {
            types: 'TRADE',
            startDate: start,
            endDate: end
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      console.log(`[SCHWAB] Fetched ${response.data?.length || 0} transactions`);
      return response.data || [];
    } catch (error) {
      console.error('[SCHWAB] Transaction fetch error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Format date for Schwab API (requires full ISO-8601 with milliseconds)
   * @param {string} dateStr - Date string (YYYY-MM-DD or ISO format)
   * @returns {string} - Formatted date string
   */
  formatDateForApi(dateStr) {
    // If already in full ISO format, return as is
    if (dateStr.includes('T') && dateStr.includes('Z')) {
      return dateStr;
    }

    // Convert YYYY-MM-DD to full ISO-8601 format
    // Use start of day for startDate
    const date = new Date(dateStr + 'T00:00:00.000Z');
    return date.toISOString();
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
   * Based on Schwab API response structure with transferItems
   * @param {object} tx - Raw transaction
   * @returns {object|null} - Parsed trade or null if not a valid trade
   */
  parseTransaction(tx) {
    // Only process TRADE type transactions
    if (tx.type !== 'TRADE') {
      return null;
    }

    // Get the transfer items (contains instrument and trade details)
    const transferItems = tx.transferItems || [];
    if (transferItems.length === 0) {
      return null;
    }

    // Use the first transfer item for the main instrument
    const item = transferItems[0];
    const instrument = item.instrument || {};

    const symbol = instrument.symbol;
    if (!symbol) {
      console.warn('[SCHWAB] Transaction missing symbol, skipping');
      return null;
    }

    // Determine side from positionEffect
    let side;
    const positionEffect = item.positionEffect;
    const amount = item.amount || 0;

    // OPENING with positive amount = buy/long entry
    // OPENING with negative amount = short entry
    // CLOSING with positive amount = buy to cover (closing short)
    // CLOSING with negative amount = sell (closing long)
    if (positionEffect === 'OPENING') {
      side = amount > 0 ? 'long' : 'short';
    } else if (positionEffect === 'CLOSING') {
      side = amount > 0 ? 'long' : 'short'; // Buy to cover or sell
    } else {
      // Default based on amount sign
      side = amount > 0 ? 'long' : 'short';
    }

    // Determine instrument type
    let instrumentType = 'stock';
    let optionType = null;
    let strikePrice = null;
    let expirationDate = null;
    let underlyingSymbol = null;

    const instType = instrument.type?.toUpperCase();
    if (instType === 'OPTION' || instType === 'EQUITY_OPTION') {
      instrumentType = 'option';
      // Parse option details from symbol if available
      // Schwab option symbols are typically in OCC format
    } else if (instType === 'FUTURE') {
      instrumentType = 'future';
    }

    const quantity = Math.abs(parseFloat(amount) || 0);
    const price = parseFloat(item.price) || 0;

    // Extract commission from transferItems with feeType = COMMISSION
    let commission = 0;
    let fees = 0;
    for (const ti of transferItems) {
      if (ti.feeType === 'COMMISSION') {
        commission += Math.abs(parseFloat(ti.cost) || 0);
      } else if (ti.feeType) {
        fees += Math.abs(parseFloat(ti.cost) || 0);
      }
    }

    const tradeDate = tx.tradeDate?.split('T')[0] || tx.time?.split('T')[0];
    const entryTime = tx.tradeDate || tx.time;

    // Net amount from transaction (includes P&L for closing trades)
    const netAmount = tx.netAmount;

    return {
      symbol,
      side,
      quantity,
      entryPrice: price,
      exitPrice: null, // Will be filled if this is a closing trade
      entryTime,
      exitTime: null,
      tradeDate,
      commission,
      fees,
      pnl: positionEffect === 'CLOSING' ? netAmount : null,
      broker: 'schwab',
      instrumentType,
      optionType,
      strikePrice,
      expirationDate,
      underlyingSymbol: instrumentType === 'option' ? underlyingSymbol : null,
      cusip: instrument.cusip,
      executionData: [{
        datetime: entryTime,
        entryTime,
        entryPrice: price,
        quantity,
        side,
        commission,
        fees,
        orderId: tx.orderId?.toString() || tx.activityId?.toString()
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

    // First, get the encrypted account hash
    const accounts = await this.getAccountNumbers(accessToken);
    if (!accounts || accounts.length === 0) {
      throw new Error('No Schwab accounts found');
    }

    // Find the matching account or use the first one
    let accountHash = null;
    for (const account of accounts) {
      if (account.accountNumber === connection.schwabAccountId) {
        accountHash = account.hashValue;
        break;
      }
    }

    // If we didn't find a match by account number, use the first account
    if (!accountHash && accounts.length > 0) {
      accountHash = accounts[0].hashValue;
      console.log(`[SCHWAB] Using first available account: ${accounts[0].accountNumber}`);
    }

    if (!accountHash) {
      throw new Error('Could not find encrypted account hash');
    }

    // Fetch transactions
    const transactions = await this.getTransactions(
      accessToken,
      accountHash,
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
