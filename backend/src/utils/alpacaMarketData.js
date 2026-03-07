const axios = require('axios');
const cache = require('./cache');

class AlpacaMarketDataClient {
  constructor() {
    this.apiKeyId = process.env.ALPACA_API_KEY_ID;
    this.apiSecretKey = process.env.ALPACA_API_SECRET_KEY;
    this.baseURL = 'https://data.alpaca.markets/v1beta1';

    // Rate limiting: 200 calls/min for free tier
    this.maxCallsPerMinute = 200;
    this.callTimestamps = [];
  }

  isConfigured() {
    return !!(this.apiKeyId && this.apiSecretKey);
  }

  async waitForRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old timestamps
    this.callTimestamps = this.callTimestamps.filter(ts => ts > oneMinuteAgo);

    if (this.callTimestamps.length >= this.maxCallsPerMinute) {
      const oldestCall = this.callTimestamps[0];
      const waitTime = oldestCall + 60000 - now + 50;
      console.log(`[ALPACA] Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.callTimestamps = this.callTimestamps.filter(ts => ts > Date.now() - 60000);
    }

    this.callTimestamps.push(Date.now());
  }

  async makeRequest(endpoint, params = {}) {
    await this.waitForRateLimit();

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(`${this.baseURL}${endpoint}`, {
          params,
          headers: {
            'APCA-API-KEY-ID': this.apiKeyId,
            'APCA-API-SECRET-KEY': this.apiSecretKey
          },
          timeout: 10000
        });
        return response.data;
      } catch (error) {
        const status = error.response?.status;

        if (status === 429 || (status >= 500 && status < 600)) {
          if (attempt < maxRetries) {
            const delay = (attempt + 1) * 2000;
            console.log(`[ALPACA] Request failed (${status}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        console.error(`[ALPACA] Request failed: ${endpoint}`, error.message);
        throw error;
      }
    }
  }

  /**
   * Build OCC option symbol from position metadata.
   * Format: UNDERLYING + YYMMDD + C/P + strike*1000 padded to 8 digits
   * Example: AAPL241220C00300000
   */
  buildOccSymbol(underlying_symbol, expiration_date, option_type, strike_price) {
    if (!underlying_symbol || !expiration_date || !option_type || strike_price == null) {
      return null;
    }

    // Parse expiration date using UTC to avoid timezone off-by-one
    const expDate = new Date(expiration_date + 'T00:00:00Z');
    if (isNaN(expDate.getTime())) return null;

    const yy = String(expDate.getUTCFullYear()).slice(-2);
    const mm = String(expDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(expDate.getUTCDate()).padStart(2, '0');

    // C for call, P for put
    const typeChar = option_type.toLowerCase().startsWith('c') ? 'C' : 'P';

    // Strike price * 1000, padded to 8 digits
    const strikeInt = Math.round(parseFloat(strike_price) * 1000);
    const strikePadded = String(strikeInt).padStart(8, '0');

    // Underlying symbol padded to 6 chars with spaces (standard OCC), then trimmed for API
    const symbol = underlying_symbol.toUpperCase();

    return `${symbol}${yy}${mm}${dd}${typeChar}${strikePadded}`;
  }

  /**
   * Fetch option snapshots for a list of option positions.
   * Returns { positionSymbol: { price, bid, ask } }
   */
  async getOptionSnapshots(optionPositions) {
    if (!this.isConfigured() || !optionPositions || optionPositions.length === 0) {
      return {};
    }

    // Build OCC symbols and map them back to position symbols
    const occToPosition = {};
    const uncachedOcc = [];

    const results = {};

    for (const pos of optionPositions) {
      const occ = this.buildOccSymbol(
        pos.underlying_symbol,
        pos.expiration_date,
        pos.option_type,
        pos.strike_price
      );

      if (!occ) {
        console.log(`[ALPACA] Cannot build OCC symbol for ${pos.symbol} - missing metadata`);
        continue;
      }

      occToPosition[occ] = pos.symbol;

      // Check cache first (2 min TTL)
      const cached = cache.get(`alpaca_option:${occ}`);
      if (cached) {
        results[pos.symbol] = cached;
        console.log(`[ALPACA] Cache hit for ${occ} -> $${cached.price}`);
      } else {
        uncachedOcc.push(occ);
      }
    }

    if (uncachedOcc.length === 0) {
      return results;
    }

    console.log(`[ALPACA] Fetching ${uncachedOcc.length} option snapshots:`, uncachedOcc);

    try {
      // Batch fetch up to 100 symbols at a time
      for (let i = 0; i < uncachedOcc.length; i += 100) {
        const batch = uncachedOcc.slice(i, i + 100);
        const symbolsParam = batch.join(',');

        const data = await this.makeRequest('/options/snapshots', {
          symbols: symbolsParam,
          feed: 'indicative'
        });

        // Response: { snapshots: { "AAPL241220C00300000": { latestQuote: {bp, ap}, latestTrade: {p} }, ... } }
        const snapshots = data.snapshots || {};

        for (const occ of batch) {
          const snapshot = snapshots[occ];
          const posSymbol = occToPosition[occ];

          if (snapshot) {
            const bid = snapshot.latestQuote?.bp || snapshot.latestQuote?.bidPrice || 0;
            const ask = snapshot.latestQuote?.ap || snapshot.latestQuote?.askPrice || 0;
            const lastTrade = snapshot.latestTrade?.p || snapshot.latestTrade?.price || 0;

            // Mid-price if both bid and ask are available, otherwise fall back to last trade
            let price;
            if (bid > 0 && ask > 0) {
              price = (bid + ask) / 2;
            } else if (lastTrade > 0) {
              price = lastTrade;
            } else {
              console.log(`[ALPACA] No usable price data for ${occ}`);
              continue;
            }

            const result = { price, bid, ask };
            results[posSymbol] = result;

            // Cache for 2 minutes
            cache.set(`alpaca_option:${occ}`, result, 120000);
            console.log(`[ALPACA] ${occ} -> mid=$${price.toFixed(2)} (bid=$${bid} ask=$${ask})`);
          } else {
            console.log(`[ALPACA] No snapshot returned for ${occ}`);
          }
        }
      }
    } catch (error) {
      console.error('[ALPACA] Failed to fetch option snapshots:', error.message);
      // Return whatever we got from cache, don't throw
    }

    return results;
  }
}

// Export singleton instance
module.exports = new AlpacaMarketDataClient();
