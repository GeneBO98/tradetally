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
const AnalyticsCache = require('../analyticsCache');
const cache = require('../../utils/cache');
const db = require('../../config/database');

// Helper function to invalidate in-memory analytics cache for a user
function invalidateInMemoryCache(userId) {
  const cacheKeys = Object.keys(cache.data || {}).filter(key =>
    key.startsWith(`analytics:user_${userId}:`)
  );
  cacheKeys.forEach(key => cache.del(key));
  console.log(`[SCHWAB] Invalidated ${cacheKeys.length} in-memory analytics cache entries for user ${userId}`);
}

const SCHWAB_API_BASE = 'https://api.schwabapi.com/trader/v1';
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiration

class SchwabService {
  /**
   * Redact account number for privacy - show only last 4 characters
   * @param {string} accountNumber - Full account number
   * @returns {string} - Redacted account number (e.g., "****1234")
   */
  redactAccountNumber(accountNumber) {
    if (!accountNumber) return null;
    const str = String(accountNumber);
    if (str.length <= 4) return str;
    return '****' + str.slice(-4);
  }
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
   * Fetches year by year going backwards until 2 consecutive empty years or 25 years max
   * @param {string} accessToken - Valid access token
   * @param {string} accountHash - Encrypted account hash value
   * @param {string} startDate - Start date (YYYY-MM-DD format) - if provided, uses fixed range
   * @param {string} endDate - End date (YYYY-MM-DD format)
   * @returns {Promise<Array>}
   */
  async getTransactions(accessToken, accountHash, startDate, endDate) {
    console.log(`[SCHWAB] Account hash: ${accountHash?.substring(0, 10)}...`);

    // If specific date range provided, use that with chunking
    if (startDate) {
      return this.getTransactionsForRange(accessToken, accountHash, startDate, endDate);
    }

    // Otherwise, fetch all history by going backwards year by year
    return this.getTransactionsAllHistory(accessToken, accountHash);
  }

  /**
   * Fetch all transaction history by going backwards year by year
   * Stops after 2 consecutive years with no data or 25 years max
   */
  async getTransactionsAllHistory(accessToken, accountHash) {
    const allTransactions = [];
    const maxYears = 25;
    let consecutiveEmptyYears = 0;
    const today = new Date();

    for (let yearOffset = 0; yearOffset < maxYears; yearOffset++) {
      // Calculate year range (going backwards)
      const yearEnd = new Date(today);
      yearEnd.setFullYear(yearEnd.getFullYear() - yearOffset);

      const yearStart = new Date(yearEnd);
      yearStart.setFullYear(yearStart.getFullYear() - 1);
      yearStart.setDate(yearStart.getDate() + 1); // Day after to avoid overlap

      const startStr = yearStart.toISOString().split('T')[0];
      const endStr = yearEnd.toISOString().split('T')[0];

      console.log(`[SCHWAB] Fetching year ${yearOffset + 1}: ${startStr} to ${endStr}...`);

      try {
        const response = await axios.get(
          `${SCHWAB_API_BASE}/accounts/${accountHash}/transactions`,
          {
            params: {
              types: 'TRADE',
              startDate: this.formatDateForApi(startStr),
              endDate: this.formatDateForApi(endStr)
            },
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const count = response.data?.length || 0;
        console.log(`[SCHWAB] Year ${yearOffset + 1}: ${count} transactions`);

        if (count === 0) {
          consecutiveEmptyYears++;
          if (consecutiveEmptyYears >= 2) {
            console.log(`[SCHWAB] 2 consecutive empty years - stopping search`);
            break;
          }
        } else {
          consecutiveEmptyYears = 0;
          allTransactions.push(...response.data);
        }
      } catch (error) {
        // If we get an error (like "no data available"), treat as empty year
        console.error(`[SCHWAB] Year ${yearOffset + 1} fetch error:`, error.response?.data?.message || error.message);
        consecutiveEmptyYears++;
        if (consecutiveEmptyYears >= 2) {
          console.log(`[SCHWAB] 2 consecutive empty/error years - stopping search`);
          break;
        }
      }
    }

    console.log(`[SCHWAB] Total fetched for account: ${allTransactions.length} transactions`);
    return allTransactions;
  }

  /**
   * Fetch transactions for a specific date range (with chunking for ranges > 1 year)
   */
  async getTransactionsForRange(accessToken, accountHash, startDate, endDate) {
    const end = endDate || new Date().toISOString().split('T')[0];
    const chunks = this.getDateChunks(startDate, end);
    let allTransactions = [];

    for (const chunk of chunks) {
      console.log(`[SCHWAB] Fetching transactions from ${chunk.start} to ${chunk.end}...`);

      try {
        const response = await axios.get(
          `${SCHWAB_API_BASE}/accounts/${accountHash}/transactions`,
          {
            params: {
              types: 'TRADE',
              startDate: this.formatDateForApi(chunk.start),
              endDate: this.formatDateForApi(chunk.end)
            },
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const count = response.data?.length || 0;
        console.log(`[SCHWAB] Fetched ${count} transactions for this period`);
        allTransactions = allTransactions.concat(response.data || []);
      } catch (error) {
        console.error('[SCHWAB] Transaction fetch error:', error.response?.data || error.message);
        throw error;
      }
    }

    return allTransactions;
  }

  /**
   * Split date range into chunks of max 1 year each (Schwab API limit)
   */
  getDateChunks(startDate, endDate) {
    const chunks = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const maxDays = 364;

    let chunkStart = new Date(start);

    while (chunkStart < end) {
      let chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + maxDays);

      if (chunkEnd > end) {
        chunkEnd = end;
      }

      chunks.push({
        start: chunkStart.toISOString().split('T')[0],
        end: chunkEnd.toISOString().split('T')[0]
      });

      chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() + 1);
    }

    return chunks;
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
   * Parse Schwab transactions into TradeTally trade format
   * Matches opening and closing transactions to create complete trades
   * @param {Array} transactions - Raw Schwab transactions
   * @returns {Array} - Parsed trades (matched with entry and exit)
   */
  parseTransactions(transactions) {
    // First, extract valid trade transactions
    const validTransactions = [];
    for (const tx of transactions) {
      const parsed = this.parseTransactionDetails(tx);
      if (parsed) {
        validTransactions.push(parsed);
      }
    }

    console.log(`[SCHWAB] Found ${validTransactions.length} valid trade transactions`);

    // Sort by time (oldest first for FIFO matching)
    validTransactions.sort((a, b) => new Date(a.time) - new Date(b.time));

    // Match opening and closing transactions using FIFO
    const trades = this.matchTransactions(validTransactions);

    console.log(`[SCHWAB] Matched into ${trades.length} complete trades`);

    return trades;
  }

  /**
   * Match opening and closing transactions into complete trades using FIFO
   * Works across days - open Monday, close Tuesday = one complete trade
   * Then groups multiple executions of the same symbol on the same day
   */
  matchTransactions(transactions) {
    const rawTrades = [];
    // Track open positions by symbol: { symbol: [{ qty, price, time, ... }] }
    const openPositions = {};

    // Sort all transactions by time
    const sorted = [...transactions].sort((a, b) => new Date(a.time) - new Date(b.time));

    // Debug: Log position effects we're seeing
    const effectCounts = {};
    for (const tx of sorted) {
      const effect = tx.positionEffect || 'UNKNOWN';
      effectCounts[effect] = (effectCounts[effect] || 0) + 1;
    }
    console.log('[SCHWAB] Position effects found:', effectCounts);

    for (const tx of sorted) {
      const symbol = tx.symbol;

      // Handle transactions without positionEffect - try to infer from context
      let positionEffect = tx.positionEffect;
      if (!positionEffect) {
        // For TOS trades that might not have positionEffect, try to infer it
        // If we have open positions for this symbol, assume it's closing
        // Otherwise, assume it's opening
        console.log(`[SCHWAB] Transaction without positionEffect: ${symbol} qty=${tx.quantity} price=${tx.price} - attempting to infer`);

        if (openPositions[symbol] && openPositions[symbol].length > 0) {
          positionEffect = 'CLOSING';
          console.log(`[SCHWAB] Inferred as CLOSING (found open positions)`);
        } else {
          positionEffect = 'OPENING';
          console.log(`[SCHWAB] Inferred as OPENING (no open positions)`);
        }
      }

      if (positionEffect === 'OPENING') {
        // Add to open positions queue
        if (!openPositions[symbol]) {
          openPositions[symbol] = [];
        }
        openPositions[symbol].push({
          qty: tx.quantity,
          price: tx.price,
          time: tx.time,
          commission: tx.commission || 0,
          fees: tx.fees || 0,
          side: tx.side,
          instrumentType: tx.instrumentType,
          optionType: tx.optionType,
          strikePrice: tx.strikePrice,
          expirationDate: tx.expirationDate,
          underlyingSymbol: tx.underlyingSymbol,
          cusip: tx.cusip,
          orderId: tx.orderId,
          accountIdentifier: tx.accountIdentifier
        });
      } else if (positionEffect === 'CLOSING') {
        // Match against open positions using FIFO
        if (!openPositions[symbol] || openPositions[symbol].length === 0) {
          // No matching open - position was opened before sync window
          // Use Schwab's netAmount for P&L
          rawTrades.push({
            symbol,
            side: tx.side,
            quantity: tx.quantity,
            entryPrice: null,
            exitPrice: tx.price,
            entryTime: null,
            exitTime: tx.time,
            tradeDate: tx.time.split('T')[0],
            commission: tx.commission || 0,
            fees: tx.fees || 0,
            pnl: tx.netAmount || null,
            broker: 'schwab',
            instrumentType: tx.instrumentType,
            optionType: tx.optionType,
            strikePrice: tx.strikePrice,
            expirationDate: tx.expirationDate,
            underlyingSymbol: tx.underlyingSymbol,
            cusip: tx.cusip,
            accountIdentifier: tx.accountIdentifier,
            executionData: [{
              datetime: tx.time,
              price: tx.price,
              quantity: tx.quantity,
              side: tx.side,
              type: 'exit',
              orderId: tx.orderId
            }]
          });
          continue;
        }

        let remainingCloseQty = tx.quantity;

        while (remainingCloseQty > 0 && openPositions[symbol] && openPositions[symbol].length > 0) {
          const openPos = openPositions[symbol][0];
          const matchQty = Math.min(remainingCloseQty, openPos.qty);

          // Create matched trade
          const pnl = this.calculatePnL(openPos.price, tx.price, matchQty, openPos.side, openPos.instrumentType);

          rawTrades.push({
            symbol,
            side: openPos.side,
            quantity: matchQty,
            entryPrice: openPos.price,
            exitPrice: tx.price,
            entryTime: openPos.time,
            exitTime: tx.time,
            tradeDate: tx.time.split('T')[0], // Use exit date as trade date
            commission: (openPos.commission * matchQty / openPos.qty) + (tx.commission * matchQty / tx.quantity || 0),
            fees: (openPos.fees * matchQty / openPos.qty) + (tx.fees * matchQty / tx.quantity || 0),
            pnl,
            broker: 'schwab',
            instrumentType: openPos.instrumentType,
            optionType: openPos.optionType,
            strikePrice: openPos.strikePrice,
            expirationDate: openPos.expirationDate,
            underlyingSymbol: openPos.underlyingSymbol,
            cusip: openPos.cusip,
            accountIdentifier: openPos.accountIdentifier,
            executionData: [
              {
                datetime: openPos.time,
                price: openPos.price,
                quantity: matchQty,
                side: openPos.side,
                type: 'entry',
                orderId: openPos.orderId
              },
              {
                datetime: tx.time,
                price: tx.price,
                quantity: matchQty,
                side: tx.side,
                type: 'exit',
                orderId: tx.orderId
              }
            ]
          });

          remainingCloseQty -= matchQty;
          openPos.qty -= matchQty;

          if (openPos.qty <= 0) {
            openPositions[symbol].shift();
          }
        }
      }
    }

    // Add remaining open positions as open trades
    for (const [symbol, positions] of Object.entries(openPositions)) {
      for (const pos of positions) {
        if (pos.qty > 0) {
          console.log(`[SCHWAB] Remaining open position: ${symbol} qty=${pos.qty} side=${pos.side} time=${pos.time}`);
          rawTrades.push({
            symbol,
            side: pos.side,
            quantity: pos.qty,
            entryPrice: pos.price,
            exitPrice: null,
            entryTime: pos.time,
            exitTime: null,
            tradeDate: pos.time.split('T')[0],
            commission: pos.commission,
            fees: pos.fees,
            pnl: null,
            broker: 'schwab',
            instrumentType: pos.instrumentType,
            optionType: pos.optionType,
            strikePrice: pos.strikePrice,
            expirationDate: pos.expirationDate,
            underlyingSymbol: pos.underlyingSymbol,
            cusip: pos.cusip,
            accountIdentifier: pos.accountIdentifier,
            executionData: [{
              datetime: pos.time,
              price: pos.price,
              quantity: pos.qty,
              side: pos.side,
              type: 'entry',
              orderId: pos.orderId
            }]
          });
        }
      }
    }

    // Log raw trades before grouping
    console.log(`[SCHWAB] Raw matched trades: ${rawTrades.length}`);

    // Group trades by symbol and trade date (exit date for closed, entry date for open)
    const trades = this.groupTrades(rawTrades);

    // Log summary
    const closedTrades = trades.filter(t => t.exitPrice !== null).length;
    const openTrades = trades.filter(t => t.exitPrice === null).length;
    console.log(`[SCHWAB] After grouping: ${trades.length} trades (${closedTrades} closed, ${openTrades} open)`);

    return trades;
  }

  /**
   * Group multiple executions of the same symbol on the same day into single trades
   * Uses weighted average prices for entries and exits
   */
  groupTrades(rawTrades) {
    const groupedMap = new Map();

    for (const trade of rawTrades) {
      // Create group key: symbol + trade date + side + account
      const key = `${trade.symbol}|${trade.tradeDate}|${trade.side}|${trade.accountIdentifier || 'default'}`;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          symbol: trade.symbol,
          side: trade.side,
          tradeDate: trade.tradeDate,
          broker: trade.broker,
          instrumentType: trade.instrumentType,
          optionType: trade.optionType,
          strikePrice: trade.strikePrice,
          expirationDate: trade.expirationDate,
          underlyingSymbol: trade.underlyingSymbol,
          cusip: trade.cusip,
          accountIdentifier: trade.accountIdentifier,
          // Aggregation fields
          totalQuantity: 0,
          totalEntryValue: 0,
          totalExitValue: 0,
          totalCommission: 0,
          totalFees: 0,
          totalPnL: 0,
          hasEntry: false,
          hasExit: false,
          earliestEntryTime: null,
          latestExitTime: null,
          executionData: []
        });
      }

      const group = groupedMap.get(key);

      // Aggregate quantities and values
      group.totalQuantity += trade.quantity;
      group.totalCommission += trade.commission || 0;
      group.totalFees += trade.fees || 0;

      if (trade.entryPrice !== null) {
        group.totalEntryValue += trade.entryPrice * trade.quantity;
        group.hasEntry = true;
        if (!group.earliestEntryTime || new Date(trade.entryTime) < new Date(group.earliestEntryTime)) {
          group.earliestEntryTime = trade.entryTime;
        }
      }

      if (trade.exitPrice !== null) {
        group.totalExitValue += trade.exitPrice * trade.quantity;
        group.hasExit = true;
        if (!group.latestExitTime || new Date(trade.exitTime) > new Date(group.latestExitTime)) {
          group.latestExitTime = trade.exitTime;
        }
      }

      if (trade.pnl !== null) {
        group.totalPnL += trade.pnl;
      }

      // Merge execution data
      if (trade.executionData) {
        group.executionData.push(...trade.executionData);
      }
    }

    // Convert grouped data back to trade format
    const groupedTrades = [];
    for (const group of groupedMap.values()) {
      const entryPrice = group.hasEntry ? Math.round((group.totalEntryValue / group.totalQuantity) * 10000) / 10000 : null;
      const exitPrice = group.hasExit ? Math.round((group.totalExitValue / group.totalQuantity) * 10000) / 10000 : null;

      // Recalculate P&L if we have both entry and exit
      let pnl = group.totalPnL;
      if (group.hasEntry && group.hasExit && entryPrice && exitPrice) {
        pnl = this.calculatePnL(entryPrice, exitPrice, group.totalQuantity, group.side, group.instrumentType);
      }

      groupedTrades.push({
        symbol: group.symbol,
        side: group.side,
        quantity: group.totalQuantity,
        entryPrice,
        exitPrice,
        entryTime: group.earliestEntryTime,
        exitTime: group.latestExitTime,
        tradeDate: group.tradeDate,
        commission: Math.round(group.totalCommission * 100) / 100,
        fees: Math.round(group.totalFees * 100) / 100,
        pnl: pnl !== null ? Math.round(pnl * 100) / 100 : null,
        broker: group.broker,
        instrumentType: group.instrumentType,
        optionType: group.optionType,
        strikePrice: group.strikePrice,
        expirationDate: group.expirationDate,
        underlyingSymbol: group.underlyingSymbol,
        cusip: group.cusip,
        accountIdentifier: group.accountIdentifier,
        executionData: group.executionData
      });
    }

    return groupedTrades;
  }

  /**
   * Create a partial trade when we only have one side
   */
  createPartialTrade(tx, side) {
    if (side === 'close') {
      return {
        symbol: tx.symbol,
        side: tx.side,
        quantity: tx.quantity,
        entryPrice: null,
        exitPrice: tx.price,
        entryTime: null,
        exitTime: tx.time,
        tradeDate: tx.time.split('T')[0],
        commission: tx.commission || 0,
        fees: tx.fees || 0,
        pnl: tx.netAmount, // Use Schwab's reported P&L
        broker: 'schwab',
        instrumentType: tx.instrumentType,
        optionType: tx.optionType,
        strikePrice: tx.strikePrice,
        expirationDate: tx.expirationDate,
        underlyingSymbol: tx.underlyingSymbol,
        cusip: tx.cusip
      };
    }
    return null;
  }

  /**
   * Calculate P&L for a matched trade
   */
  calculatePnL(entryPrice, exitPrice, quantity, side, instrumentType) {
    if (!entryPrice || !exitPrice) return null;

    const multiplier = instrumentType === 'option' ? 100 : 1;
    const diff = exitPrice - entryPrice;
    const pnl = side === 'long' ? diff * quantity * multiplier : -diff * quantity * multiplier;

    return Math.round(pnl * 100) / 100;
  }

  /**
   * Parse a single Schwab transaction into structured data
   * @param {object} tx - Raw transaction from Schwab API
   * @returns {object|null} - Parsed transaction details or null if not valid
   */
  parseTransactionDetails(tx) {
    // Only process TRADE type transactions
    if (tx.type !== 'TRADE') {
      // Log non-TRADE transactions to help debug TOS issues
      if (tx.type && tx.transferItems?.[0]?.instrument?.symbol) {
        console.log(`[SCHWAB] Skipping non-TRADE transaction: type=${tx.type}, symbol=${tx.transferItems[0].instrument.symbol}`);
      }
      return null;
    }

    // Get the transfer items (contains instrument and trade details)
    const transferItems = tx.transferItems || [];
    if (transferItems.length === 0) {
      return null;
    }

    // Find the actual security transfer item (not fees/commissions)
    const item = transferItems.find(ti =>
      ti.instrument &&
      ti.instrument.assetType &&
      !ti.feeType
    );

    if (!item) {
      return null;
    }

    const instrument = item.instrument || {};
    const assetType = instrument.assetType?.toUpperCase();

    // Only accept real tradeable securities
    // Added FUTURE to support Think Or Swim futures trades
    const validAssetTypes = ['EQUITY', 'OPTION', 'MUTUAL_FUND', 'ETF', 'INDEX', 'FUTURE'];
    if (!validAssetTypes.includes(assetType)) {
      // Log what we're skipping to help debug TOS import issues
      console.log(`[SCHWAB] Skipping asset type: ${assetType} for symbol: ${instrument.symbol}`);
      // Skip currencies, cash equivalents, fees, etc.
      return null;
    }

    const symbol = instrument.symbol;
    if (!symbol) {
      return null;
    }

    // Skip currency symbols (but allow futures symbols like /ES, /NQ that TOS uses)
    if (symbol.startsWith('CURRENCY_') || symbol === 'USD' || symbol === 'CASH') {
      return null;
    }

    // Log TOS futures symbols for debugging (they typically start with /)
    if (symbol.startsWith('/')) {
      console.log(`[SCHWAB] Processing TOS futures symbol: ${symbol}`);
    }

    // Get price and quantity
    const price = parseFloat(item.price) || 0;
    const amount = parseFloat(item.amount) || 0;

    // Skip if no price or quantity (not a real trade)
    if (price === 0 || amount === 0) {
      return null;
    }

    // Determine side from positionEffect and amount
    let side;
    const positionEffect = item.positionEffect;

    // OPENING with positive amount = buy/long entry
    // OPENING with negative amount = short entry
    // CLOSING with positive amount = buy to cover (closing short)
    // CLOSING with negative amount = sell (closing long)
    if (positionEffect === 'OPENING') {
      side = amount > 0 ? 'long' : 'short';
    } else if (positionEffect === 'CLOSING') {
      side = amount > 0 ? 'long' : 'short';
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

    if (assetType === 'OPTION') {
      instrumentType = 'option';
      // Parse option details from instrument if available
      optionType = instrument.putCall?.toLowerCase();
      strikePrice = instrument.strikePrice;
      expirationDate = instrument.expirationDate;
      underlyingSymbol = instrument.underlyingSymbol;
    } else if (assetType === 'FUTURE') {
      instrumentType = 'future';
    }

    const quantity = Math.abs(amount);

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

    const time = tx.tradeDate || tx.time;

    // Net amount from transaction (includes P&L for closing trades)
    const netAmount = tx.netAmount;

    // Return transaction details for matching
    return {
      symbol,
      side,
      quantity,
      price,
      time,
      positionEffect, // OPENING or CLOSING
      commission,
      fees,
      netAmount,
      instrumentType,
      optionType,
      strikePrice,
      expirationDate,
      underlyingSymbol: instrumentType === 'option' ? underlyingSymbol : null,
      cusip: instrument.cusip,
      orderId: tx.orderId?.toString() || tx.activityId?.toString(),
      accountIdentifier: tx._accountIdentifier // Redacted account identifier (e.g., "****1234")
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

    // Get ALL accounts - sync everything the user has access to
    const accounts = await this.getAccountNumbers(accessToken);
    if (!accounts || accounts.length === 0) {
      throw new Error('No Schwab accounts found');
    }

    console.log(`[SCHWAB] Found ${accounts.length} accounts to sync`);

    // Fetch transactions from ALL accounts, tagging each with the account identifier
    let allTransactions = [];
    for (const account of accounts) {
      const redactedAccount = this.redactAccountNumber(account.accountNumber);
      console.log(`[SCHWAB] Fetching transactions for account ${redactedAccount}...`);
      try {
        const transactions = await this.getTransactions(
          accessToken,
          account.hashValue,
          startDate,
          endDate
        );
        // Tag each transaction with the redacted account identifier
        const taggedTransactions = transactions.map(tx => ({
          ...tx,
          _accountIdentifier: redactedAccount
        }));
        console.log(`[SCHWAB] Account ${redactedAccount}: ${transactions.length} transactions`);
        allTransactions = allTransactions.concat(taggedTransactions);
      } catch (error) {
        console.error(`[SCHWAB] Failed to fetch account ${redactedAccount}:`, error.message);
        // Continue with other accounts
      }
    }

    console.log(`[SCHWAB] Total transactions fetched: ${allTransactions.length}`);

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing', {
        tradesFetched: allTransactions.length
      });
    }

    // Parse transactions to trades
    const trades = this.parseTransactions(allTransactions);
    console.log(`[SCHWAB] Parsed ${trades.length} trades from ${allTransactions.length} transactions`);

    // Log trade breakdown for debugging TOS issues
    const tradeBreakdown = {
      stocks: trades.filter(t => t.instrumentType === 'stock').length,
      options: trades.filter(t => t.instrumentType === 'option').length,
      futures: trades.filter(t => t.instrumentType === 'future').length,
      tosSymbols: trades.filter(t => t.symbol?.startsWith('/')).length,
      openTrades: trades.filter(t => !t.exitPrice).length,
      closedTrades: trades.filter(t => t.exitPrice).length
    };
    console.log(`[SCHWAB] Trade breakdown:`, tradeBreakdown);

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    }

    // Import trades with connection ID for tracking
    const result = await this.importTrades(connection.userId, connection.id, trades);

    console.log(`[SCHWAB] Sync complete: ${result.imported} imported, ${result.duplicates} duplicates`);

    return result;
  }

  /**
   * Import parsed trades into the database
   * @param {string} userId - User ID
   * @param {string} connectionId - Broker connection ID for tracking synced trades
   * @param {Array} trades - Parsed trades
   */
  async importTrades(userId, connectionId, trades) {
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

        // Add broker connection ID to track synced trades
        tradeData.brokerConnectionId = connectionId;

        // Create trade
        await Trade.create(userId, tradeData, {
          skipAchievements: true,
          skipApiCalls: true
        });

        imported++;

        // Add the newly imported trade to existingTrades to prevent duplicates within same batch
        existingTrades.push({
          symbol: tradeData.symbol,
          side: tradeData.side,
          quantity: tradeData.quantity,
          entry_price: tradeData.entryPrice,
          exit_price: tradeData.exitPrice,
          entry_time: tradeData.entryTime,
          exit_time: tradeData.exitTime,
          trade_date: tradeData.tradeDate,
          pnl: tradeData.pnl,
          executions: tradeData.executionData
        });
      } catch (error) {
        console.error(`[SCHWAB] Failed to import trade:`, error.message);
        console.error(`[SCHWAB] Trade details:`, {
          symbol: tradeData.symbol,
          quantity: tradeData.quantity,
          entryPrice: tradeData.entryPrice,
          exitPrice: tradeData.exitPrice,
          tradeDate: tradeData.tradeDate
        });
        failed++;
      }
    }

    // Invalidate both database and in-memory analytics cache after importing trades
    if (imported > 0) {
      console.log(`[SCHWAB] Invalidating analytics cache for user ${userId}`);
      await AnalyticsCache.invalidateUserCache(userId);
      invalidateInMemoryCache(userId);
    }

    return { imported, skipped, failed, duplicates };
  }

  /**
   * Get existing trades for duplicate checking
   * Fetches ALL user trades (not just Schwab) to catch CSV imports too
   */
  async getExistingTrades(userId) {
    const query = `
      SELECT symbol, side, quantity, entry_price, exit_price, entry_time, exit_time,
             executions, trade_date, pnl
      FROM trades
      WHERE user_id = $1
      ORDER BY trade_date DESC, entry_time DESC
      LIMIT 5000
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Check if trade is a duplicate
   * Matches against both broker-synced and CSV-imported trades
   */
  isDuplicateTrade(newTrade, existingTrades) {
    // Guard against invalid input
    if (!newTrade || !existingTrades || !Array.isArray(existingTrades)) {
      return false;
    }

    const symbol = newTrade.symbol?.toUpperCase();
    if (!symbol) return false;

    const newTradeDate = newTrade.tradeDate;
    const newQty = parseFloat(newTrade.quantity) || 0;
    const newEntryPrice = parseFloat(newTrade.entryPrice) || 0;
    const newExitPrice = parseFloat(newTrade.exitPrice) || 0;
    const newPnL = parseFloat(newTrade.pnl) || 0;

    for (const existing of existingTrades) {
      if (existing.symbol?.toUpperCase() !== symbol) continue;

      // 1. Check execution data match (by order ID) - most reliable
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

        if (hasMatch) {
          console.log(`[SCHWAB] Duplicate found by order ID: ${symbol}`);
          return true;
        }
      }

      // 2. Match by date + quantity + prices (for CSV imports)
      // Handle trade_date as either string or Date object
      let existingDate;
      if (existing.trade_date instanceof Date) {
        existingDate = existing.trade_date.toISOString().split('T')[0];
      } else if (typeof existing.trade_date === 'string') {
        existingDate = existing.trade_date.split('T')[0];
      } else {
        existingDate = null;
      }

      if (existingDate === newTradeDate) {
        const existingQty = parseFloat(existing.quantity);
        const existingEntryPrice = parseFloat(existing.entry_price);
        const existingExitPrice = parseFloat(existing.exit_price);

        // Quantity must match exactly
        if (Math.abs(existingQty - newQty) < 0.001) {
          // Entry price within 1%
          const entryPriceMatch = !newEntryPrice || !existingEntryPrice ||
            Math.abs(existingEntryPrice - newEntryPrice) / existingEntryPrice < 0.01;

          // Exit price within 1% (if both have exit)
          const exitPriceMatch = !newExitPrice || !existingExitPrice ||
            Math.abs(existingExitPrice - newExitPrice) / existingExitPrice < 0.01;

          if (entryPriceMatch && exitPriceMatch) {
            console.log(`[SCHWAB] Duplicate found by date/qty/price: ${symbol} on ${newTradeDate}`);
            return true;
          }
        }
      }

      // 3. Match by P&L if available (strong indicator for closed trades)
      if (newPnL && existing.pnl) {
        // Handle trade_date as either string or Date object
        let existingDate;
        if (existing.trade_date instanceof Date) {
          existingDate = existing.trade_date.toISOString().split('T')[0];
        } else if (typeof existing.trade_date === 'string') {
          existingDate = existing.trade_date.split('T')[0];
        } else {
          existingDate = null;
        }
        const existingPnL = parseFloat(existing.pnl);

        // Same date, same symbol, same P&L (within $0.01)
        if (existingDate === newTradeDate && Math.abs(existingPnL - newPnL) < 0.02) {
          console.log(`[SCHWAB] Duplicate found by P&L: ${symbol} on ${newTradeDate} ($${newPnL})`);
          return true;
        }
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
