/**
 * Price Fallback Manager
 *
 * Tracks which Finnhub API endpoints are blocked (403) and routes to fallback
 * providers (Schwab) automatically. Periodically retries blocked endpoints
 * to detect if access has been restored.
 */

const schwabMarketData = require('./schwabMarketData');
const logger = require('./logger');

class PriceFallbackManager {
  constructor() {
    // Track blocked endpoints: Map<endpoint, { blockedAt, lastRetry }>
    this.blockedEndpoints = new Map();

    // How often to retry a blocked endpoint (1 hour)
    this.retryIntervalMs = 60 * 60 * 1000;

    // Track if we've logged the fallback message for each endpoint
    this.loggedFallbacks = new Set();
  }

  /**
   * Mark an endpoint as blocked due to 403
   * @param {string} endpoint - The endpoint name (e.g., 'quote', 'candles')
   */
  markBlocked(endpoint) {
    const now = Date.now();
    this.blockedEndpoints.set(endpoint, {
      blockedAt: now,
      lastRetry: now
    });

    if (!this.loggedFallbacks.has(endpoint)) {
      logger.info(`[FALLBACK] Finnhub '${endpoint}' endpoint blocked (403). Will use Schwab fallback.`);
      this.loggedFallbacks.add(endpoint);
    }
  }

  /**
   * Mark an endpoint as unblocked (successful response)
   * @param {string} endpoint - The endpoint name
   */
  markUnblocked(endpoint) {
    if (this.blockedEndpoints.has(endpoint)) {
      logger.info(`[FALLBACK] Finnhub '${endpoint}' endpoint is now accessible.`);
      this.blockedEndpoints.delete(endpoint);
      this.loggedFallbacks.delete(endpoint);
    }
  }

  /**
   * Check if an endpoint is blocked
   * @param {string} endpoint - The endpoint name
   * @returns {boolean}
   */
  isBlocked(endpoint) {
    return this.blockedEndpoints.has(endpoint);
  }

  /**
   * Check if we should retry a blocked endpoint
   * @param {string} endpoint - The endpoint name
   * @returns {boolean}
   */
  shouldRetryBlocked(endpoint) {
    const blockInfo = this.blockedEndpoints.get(endpoint);
    if (!blockInfo) return true; // Not blocked, always try

    const now = Date.now();
    const timeSinceLastRetry = now - blockInfo.lastRetry;

    if (timeSinceLastRetry >= this.retryIntervalMs) {
      // Update last retry time
      blockInfo.lastRetry = now;
      this.blockedEndpoints.set(endpoint, blockInfo);
      logger.debug(`[FALLBACK] Retrying Finnhub '${endpoint}' endpoint after ${Math.round(timeSinceLastRetry / 60000)} minutes`);
      return true;
    }

    return false;
  }

  /**
   * Check if an error is a 403 (forbidden/no access)
   * @param {Error} error - The error object
   * @returns {boolean}
   */
  is403Error(error) {
    if (!error) return false;

    const errorMsg = error.message || '';
    const statusCode = error.response?.status || error.statusCode;

    return statusCode === 403 ||
           errorMsg.includes('403') ||
           errorMsg.toLowerCase().includes('forbidden') ||
           errorMsg.toLowerCase().includes('access denied');
  }

  /**
   * Get a quote with automatic fallback
   * @param {string} symbol - Stock symbol
   * @param {Function} finnhubFn - Finnhub quote function
   * @returns {Promise<{data: object|null, source: string}>}
   */
  async getQuoteWithFallback(symbol, finnhubFn) {
    const endpoint = 'quote';

    // If endpoint is blocked and we shouldn't retry yet, go straight to Schwab
    if (this.isBlocked(endpoint) && !this.shouldRetryBlocked(endpoint)) {
      const schwabData = await this.trySchawb(symbol, endpoint);
      if (schwabData) {
        return { data: schwabData, source: 'schwab' };
      }
      return { data: null, source: 'none' };
    }

    // Try Finnhub
    try {
      const data = await finnhubFn(symbol);
      if (data && data.c) {
        // Success - mark as unblocked if it was blocked
        this.markUnblocked(endpoint);
        return { data, source: 'finnhub' };
      }
      throw new Error('Invalid price data from Finnhub');
    } catch (finnhubError) {
      // Check if it's a 403 error
      if (this.is403Error(finnhubError)) {
        this.markBlocked(endpoint);

        // Try Schwab fallback
        const schwabData = await this.trySchawb(symbol, endpoint);
        if (schwabData) {
          return { data: schwabData, source: 'schwab' };
        }
      }

      // Return the error for the caller to handle
      return { data: null, source: 'none', error: finnhubError };
    }
  }

  /**
   * Try to get data from Schwab
   * @param {string} symbol - Stock symbol
   * @param {string} endpoint - Endpoint type for logging
   * @returns {Promise<object|null>}
   */
  async trySchawb(symbol, endpoint) {
    try {
      const data = await schwabMarketData.getQuote(symbol);
      if (data && data.c) {
        return data;
      }
      return null;
    } catch (error) {
      logger.debug(`[FALLBACK] Schwab fallback failed for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get candles with automatic fallback
   * @param {string} symbol - Stock symbol
   * @param {string} resolution - Resolution ('1', '5', '15', '30', 'D')
   * @param {number} from - Start timestamp (Unix seconds)
   * @param {number} to - End timestamp (Unix seconds)
   * @param {Function} finnhubFn - Finnhub candles function
   * @returns {Promise<{data: object[]|null, source: string}>}
   */
  async getCandlesWithFallback(symbol, resolution, from, to, finnhubFn) {
    const endpoint = 'candles';

    // If endpoint is blocked and we shouldn't retry yet, go straight to Schwab
    if (this.isBlocked(endpoint) && !this.shouldRetryBlocked(endpoint)) {
      const schwabData = await this.trySchwabCandles(symbol, resolution, from, to);
      if (schwabData && schwabData.length > 0) {
        return { data: schwabData, source: 'schwab' };
      }
      return { data: null, source: 'none' };
    }

    // Try Finnhub
    try {
      const data = await finnhubFn(symbol, resolution, from, to);
      if (data && data.length > 0) {
        // Success - mark as unblocked if it was blocked
        this.markUnblocked(endpoint);
        return { data, source: 'finnhub' };
      }
      throw new Error('No candle data from Finnhub');
    } catch (finnhubError) {
      // Check if it's a 403 error
      if (this.is403Error(finnhubError)) {
        this.markBlocked(endpoint);

        // Try Schwab fallback
        const schwabData = await this.trySchwabCandles(symbol, resolution, from, to);
        if (schwabData && schwabData.length > 0) {
          return { data: schwabData, source: 'schwab' };
        }
      }

      // Return the error for the caller to handle
      return { data: null, source: 'none', error: finnhubError };
    }
  }

  /**
   * Try to get candle data from Schwab
   * @param {string} symbol - Stock symbol
   * @param {string} resolution - Resolution
   * @param {number} from - Start timestamp
   * @param {number} to - End timestamp
   * @returns {Promise<object[]|null>}
   */
  async trySchwabCandles(symbol, resolution, from, to) {
    try {
      const data = await schwabMarketData.getCandles(symbol, resolution, from, to);
      if (data && data.length > 0) {
        return data;
      }
      return null;
    } catch (error) {
      logger.debug(`[FALLBACK] Schwab candles fallback failed for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get status of all tracked endpoints
   * @returns {object}
   */
  getStatus() {
    const status = {};
    for (const [endpoint, info] of this.blockedEndpoints) {
      status[endpoint] = {
        blocked: true,
        blockedAt: new Date(info.blockedAt).toISOString(),
        lastRetry: new Date(info.lastRetry).toISOString(),
        nextRetryIn: Math.max(0, Math.round((info.lastRetry + this.retryIntervalMs - Date.now()) / 60000)) + ' minutes'
      };
    }
    return status;
  }

  /**
   * Clear all blocked endpoints (for testing/reset)
   */
  clearBlocked() {
    this.blockedEndpoints.clear();
    this.loggedFallbacks.clear();
    logger.info('[FALLBACK] Cleared all blocked endpoint tracking');
  }
}

// Export singleton instance
module.exports = new PriceFallbackManager();
