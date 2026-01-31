/**
 * Schwab Market Data Utility
 * Fetches real-time quotes and price history using existing Schwab OAuth credentials
 *
 * Uses the Schwab Market Data API: https://developer.schwab.com
 * Requires an active Schwab broker connection with valid OAuth tokens
 */

const axios = require('axios');
const db = require('../config/database');
const encryptionService = require('../services/brokerSync/encryptionService');
const cache = require('./cache');

const SCHWAB_MARKET_DATA_BASE = 'https://api.schwabapi.com/marketdata/v1';
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes before expiration

class SchwabMarketData {
  constructor() {
    this.rateLimitRemaining = 120; // Schwab rate limit: 120 requests/minute
    this.rateLimitReset = null;
  }

  /**
   * Get an active Schwab connection with valid tokens
   * Tries to find any user with an active Schwab connection
   * @returns {Promise<object|null>} Connection with decrypted tokens or null
   */
  async getActiveConnection() {
    try {
      // Find any active Schwab connection
      const query = `
        SELECT id, user_id, schwab_access_token, schwab_refresh_token, schwab_token_expires_at
        FROM broker_connections
        WHERE broker_type = 'schwab'
          AND connection_status = 'active'
          AND schwab_access_token IS NOT NULL
        ORDER BY last_sync_at DESC NULLS LAST
        LIMIT 1
      `;

      const result = await db.query(query);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Decrypt tokens
      const connection = {
        id: row.id,
        userId: row.user_id,
        schwabAccessToken: row.schwab_access_token ? encryptionService.decrypt(row.schwab_access_token) : null,
        schwabRefreshToken: row.schwab_refresh_token ? encryptionService.decrypt(row.schwab_refresh_token) : null,
        schwabTokenExpiresAt: row.schwab_token_expires_at
      };

      return connection;
    } catch (error) {
      console.error('[SCHWAB-MARKET] Error getting active connection:', error.message);
      return null;
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   * @param {object} connection - Connection with tokens
   * @returns {Promise<{accessToken: string|null, needsReauth: boolean}>}
   */
  async ensureValidToken(connection) {
    if (!connection.schwabTokenExpiresAt) {
      return await this.refreshToken(connection);
    }

    const expiresAt = new Date(connection.schwabTokenExpiresAt);
    const now = new Date();

    if (isNaN(expiresAt.getTime())) {
      return await this.refreshToken(connection);
    }

    // Token expired or about to expire
    if (expiresAt.getTime() - now.getTime() < TOKEN_REFRESH_BUFFER) {
      return await this.refreshToken(connection);
    }

    return { accessToken: connection.schwabAccessToken, needsReauth: false };
  }

  /**
   * Refresh the access token
   * @param {object} connection - Connection with refresh token
   * @returns {Promise<{accessToken: string|null, needsReauth: boolean}>}
   */
  async refreshToken(connection) {
    try {
      console.log('[SCHWAB-MARKET] Refreshing access token...');

      const response = await axios.post(
        'https://api.schwabapi.com/v1/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connection.schwabRefreshToken
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

      // Update tokens in database
      const encryptedAccess = encryptionService.encrypt(access_token);
      const encryptedRefresh = encryptionService.encrypt(refresh_token);

      await db.query(`
        UPDATE broker_connections
        SET schwab_access_token = $2,
            schwab_refresh_token = $3,
            schwab_token_expires_at = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [connection.id, encryptedAccess, encryptedRefresh, expiresAt]);

      console.log('[SCHWAB-MARKET] Token refreshed successfully');
      return { accessToken: access_token, needsReauth: false };
    } catch (error) {
      console.error('[SCHWAB-MARKET] Token refresh failed:', error.message);

      // Mark connection as expired
      await db.query(`
        UPDATE broker_connections
        SET connection_status = 'expired',
            last_error_message = 'Refresh token expired - please re-authenticate'
        WHERE id = $1
      `, [connection.id]);

      return { accessToken: null, needsReauth: true };
    }
  }

  /**
   * Get a quote for a single symbol
   * @param {string} symbol - Stock/ETF symbol
   * @returns {Promise<object|null>} Quote data or null
   */
  async getQuote(symbol) {
    const cacheKey = `schwab_quote:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const connection = await this.getActiveConnection();
    if (!connection) {
      console.log('[SCHWAB-MARKET] No active Schwab connection available');
      return null;
    }

    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth || !accessToken) {
      console.log('[SCHWAB-MARKET] Authentication required');
      return null;
    }

    try {
      const response = await axios.get(
        `${SCHWAB_MARKET_DATA_BASE}/quotes`,
        {
          params: {
            symbols: symbol.toUpperCase(),
            fields: 'quote'
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      // Extract rate limit info from headers
      if (response.headers['x-ratelimit-remaining']) {
        this.rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining']);
      }

      const data = response.data;
      const symbolData = data[symbol.toUpperCase()];

      if (!symbolData || !symbolData.quote) {
        console.log(`[SCHWAB-MARKET] No quote data for ${symbol}`);
        return null;
      }

      const quote = symbolData.quote;

      // Map Schwab quote format to our standard format (matching Finnhub)
      const result = {
        c: quote.lastPrice,           // Current price
        d: quote.netChange,           // Day change
        dp: quote.netPercentChangeInDouble, // Day percent change
        h: quote.highPrice,           // Day high
        l: quote.lowPrice,            // Day low (LOD)
        o: quote.openPrice,           // Open price
        pc: quote.closePrice,         // Previous close
        t: Date.now() / 1000,         // Timestamp
        // Additional Schwab-specific fields
        bid: quote.bidPrice,
        ask: quote.askPrice,
        volume: quote.totalVolume,
        source: 'schwab'
      };

      // Cache for 30 seconds (real-time data shouldn't be cached too long)
      cache.set(cacheKey, result, 30);

      return result;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('[SCHWAB-MARKET] Rate limited, waiting...');
      } else if (error.response?.status === 401) {
        console.warn('[SCHWAB-MARKET] Token expired during request');
      } else {
        console.error(`[SCHWAB-MARKET] Error fetching quote for ${symbol}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Get quotes for multiple symbols
   * @param {string[]} symbols - Array of symbols
   * @returns {Promise<object>} Map of symbol -> quote data
   */
  async getQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    const connection = await this.getActiveConnection();
    if (!connection) {
      return {};
    }

    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth || !accessToken) {
      return {};
    }

    try {
      const symbolList = symbols.map(s => s.toUpperCase()).join(',');

      const response = await axios.get(
        `${SCHWAB_MARKET_DATA_BASE}/quotes`,
        {
          params: {
            symbols: symbolList,
            fields: 'quote'
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const data = response.data;
      const results = {};

      for (const symbol of symbols) {
        const upperSymbol = symbol.toUpperCase();
        const symbolData = data[upperSymbol];

        if (symbolData?.quote) {
          const quote = symbolData.quote;
          results[symbol] = {
            c: quote.lastPrice,
            d: quote.netChange,
            dp: quote.netPercentChangeInDouble,
            h: quote.highPrice,
            l: quote.lowPrice,
            o: quote.openPrice,
            pc: quote.closePrice,
            t: Date.now() / 1000,
            source: 'schwab'
          };
        }
      }

      return results;
    } catch (error) {
      console.error('[SCHWAB-MARKET] Error fetching batch quotes:', error.message);
      return {};
    }
  }

  /**
   * Get intraday candles for a symbol (for LoD calculation)
   * @param {string} symbol - Stock/ETF symbol
   * @param {string} resolution - Resolution: '1' (1-min), '5' (5-min), '15', '30', 'D' (daily)
   * @param {number} fromTimestamp - Start timestamp (Unix seconds)
   * @param {number} toTimestamp - End timestamp (Unix seconds)
   * @returns {Promise<object[]|null>} Array of OHLCV candles or null
   */
  async getCandles(symbol, resolution, fromTimestamp, toTimestamp) {
    const connection = await this.getActiveConnection();
    if (!connection) {
      return null;
    }

    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth || !accessToken) {
      return null;
    }

    try {
      // Map Finnhub-style resolution to Schwab parameters
      let frequencyType, frequency, periodType;

      switch (resolution) {
        case '1':
          frequencyType = 'minute';
          frequency = 1;
          periodType = 'day';
          break;
        case '5':
          frequencyType = 'minute';
          frequency = 5;
          periodType = 'day';
          break;
        case '15':
          frequencyType = 'minute';
          frequency = 15;
          periodType = 'day';
          break;
        case '30':
          frequencyType = 'minute';
          frequency = 30;
          periodType = 'day';
          break;
        case 'D':
        default:
          frequencyType = 'daily';
          frequency = 1;
          periodType = 'year';
          break;
      }

      // Schwab expects milliseconds for start/end dates
      const startDate = fromTimestamp * 1000;
      const endDate = toTimestamp * 1000;

      const response = await axios.get(
        `${SCHWAB_MARKET_DATA_BASE}/pricehistory`,
        {
          params: {
            symbol: symbol.toUpperCase(),
            periodType: periodType,
            frequencyType: frequencyType,
            frequency: frequency,
            startDate: startDate,
            endDate: endDate,
            needExtendedHoursData: false
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const candles = response.data.candles || [];

      if (candles.length === 0) {
        return null;
      }

      // Map to Finnhub-compatible format
      const result = candles.map(c => ({
        time: Math.floor(c.datetime / 1000), // Convert ms to seconds
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));

      console.log(`[SCHWAB-MARKET] Got ${result.length} candles for ${symbol} (${resolution} resolution)`);
      return result;
    } catch (error) {
      console.error(`[SCHWAB-MARKET] Error fetching candles for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get daily price history for a symbol
   * @param {string} symbol - Stock/ETF symbol
   * @param {number} days - Number of days of history (default 30)
   * @returns {Promise<object[]|null>} Array of OHLCV candles or null
   */
  async getPriceHistory(symbol, days = 30) {
    const cacheKey = `schwab_history:${symbol}:${days}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const connection = await this.getActiveConnection();
    if (!connection) {
      return null;
    }

    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth || !accessToken) {
      return null;
    }

    try {
      const endDate = Date.now();
      const startDate = endDate - (days * 24 * 60 * 60 * 1000);

      const response = await axios.get(
        `${SCHWAB_MARKET_DATA_BASE}/pricehistory`,
        {
          params: {
            symbol: symbol.toUpperCase(),
            periodType: 'day',
            period: days,
            frequencyType: 'daily',
            frequency: 1
          },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const candles = response.data.candles || [];

      // Map to standard format
      const result = candles.map(c => ({
        time: c.datetime / 1000, // Convert ms to seconds
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));

      // Cache for 5 minutes
      cache.set(cacheKey, result, 300);

      return result;
    } catch (error) {
      console.error(`[SCHWAB-MARKET] Error fetching price history for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Check if Schwab market data is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const connection = await this.getActiveConnection();
    if (!connection) {
      return false;
    }

    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    return !needsReauth && !!accessToken;
  }

  /**
   * Get current rate limit status
   * @returns {object}
   */
  getRateLimitStatus() {
    return {
      remaining: this.rateLimitRemaining,
      limit: 120,
      resetAt: this.rateLimitReset
    };
  }
}

module.exports = new SchwabMarketData();
