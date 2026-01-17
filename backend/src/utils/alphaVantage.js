const axios = require('axios');
const cache = require('./cache');

class AlphaVantageClient {
  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.baseURL = 'https://www.alphavantage.co/query';
    
    // Rate limiting: 25 calls per day, 5 calls per minute
    this.callTimestamps = [];
    this.dailyCalls = [];
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    // Clean up old timestamps
    this.callTimestamps = this.callTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    this.dailyCalls = this.dailyCalls.filter(timestamp => timestamp > oneDayAgo);
    
    // Check daily limit (25 calls per day for free tier)
    if (this.dailyCalls.length >= 25) {
      throw new Error('Alpha Vantage daily API limit reached (25 calls). Try again tomorrow.');
    }
    
    // Check minute limit (5 calls per minute)
    if (this.callTimestamps.length >= 5) {
      const oldestCall = this.callTimestamps[0];
      const waitTime = 60000 - (now - oldestCall) + 1000; // Add 1s buffer
      
      if (waitTime > 0) {
        console.log(`Alpha Vantage rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this call
    this.callTimestamps.push(now);
    this.dailyCalls.push(now);
  }

  async makeRequest(params) {
    if (!this.apiKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    // Apply rate limiting
    await this.waitForRateLimit();

    try {
      const response = await axios.get(this.baseURL, {
        params: {
          ...params,
          apikey: this.apiKey,
          datatype: 'json'
        },
        timeout: 10000
      });

      // Check for API errors
      if (response.data['Error Message']) {
        throw new Error(`Alpha Vantage API error: ${response.data['Error Message']}`);
      }

      if (response.data['Note']) {
        throw new Error(`Alpha Vantage API limit: ${response.data['Note']}`);
      }

      // Check for Information messages (often indicates API key issues or invalid parameters)
      if (response.data['Information']) {
        throw new Error(`Alpha Vantage API info: ${response.data['Information']}`);
      }

      // Log response keys for debugging if empty or unexpected
      const responseKeys = Object.keys(response.data || {});
      if (responseKeys.length === 0) {
        console.error('Alpha Vantage returned empty response');
        throw new Error('Alpha Vantage returned empty response');
      }

      console.log(`Alpha Vantage response keys: ${responseKeys.join(', ')}`);

      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        if (status === 503) {
          throw new Error('Alpha Vantage service is temporarily unavailable (503). Please try again later.');
        } else if (status === 429) {
          throw new Error('Alpha Vantage rate limit exceeded. Please try again in a few minutes.');
        } else if (status >= 500) {
          throw new Error(`Alpha Vantage server error (${status}). Please try again later.`);
        }
        throw new Error(`Alpha Vantage API error: ${status} - ${error.response.statusText}`);
      }
      // Handle timeout errors
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('Alpha Vantage request timed out. The service may be experiencing high load or connectivity issues.');
      }
      throw error;
    }
  }

  async getIntradayData(symbol, interval = '5min') {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `${symbolUpper}_${interval}`;
    
    // Check cache first
    const cached = await cache.get('chart_intraday', cacheKey);
    if (cached) {
      console.log(`Returning cached intraday data for ${symbol}`);
      return cached;
    }

    try {
      const data = await this.makeRequest({
        function: 'TIME_SERIES_INTRADAY',
        symbol: symbol.toUpperCase(),
        interval: interval,
        outputsize: 'full' // Get full day's data
      });

      // Extract time series data
      const timeSeriesKey = `Time Series (${interval})`;
      const timeSeries = data[timeSeriesKey];

      if (!timeSeries) {
        // Log what was actually returned for debugging
        const availableKeys = Object.keys(data).join(', ');
        console.error(`Alpha Vantage response missing '${timeSeriesKey}' for ${symbol}. Available keys: ${availableKeys}`);
        throw new Error(`No intraday data available for ${symbol}. Response keys: ${availableKeys}`);
      }

      // Convert to array format for easier processing
      const candles = Object.entries(timeSeries).map(([time, values]) => ({
        time: new Date(time).getTime() / 1000, // Convert to Unix timestamp
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      })).reverse(); // Reverse to get chronological order

      // Cache the result
      await cache.set('chart_intraday', cacheKey, candles);

      return candles;
    } catch (error) {
      console.error(`Failed to get intraday data for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async getDailyData(symbol, outputsize = 'compact') {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `${symbolUpper}_${outputsize}`;
    
    // Check cache first
    const cached = await cache.get('chart_daily', cacheKey);
    if (cached) {
      console.log(`Returning cached daily data for ${symbol}`);
      return cached;
    }

    try {
      const data = await this.makeRequest({
        function: 'TIME_SERIES_DAILY',
        symbol: symbol.toUpperCase(),
        outputsize: outputsize // 'compact' = last 100 days, 'full' = 20+ years
      });

      // Extract time series data
      const timeSeries = data['Time Series (Daily)'];

      if (!timeSeries) {
        // Log what was actually returned for debugging
        const availableKeys = Object.keys(data).join(', ');
        console.error(`Alpha Vantage response missing 'Time Series (Daily)' for ${symbol}. Available keys: ${availableKeys}`);
        throw new Error(`No daily data available for ${symbol}. Response keys: ${availableKeys}`);
      }

      // Convert to array format
      const candles = Object.entries(timeSeries).map(([date, values]) => ({
        time: new Date(date).getTime() / 1000, // Convert to Unix timestamp
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      })).reverse(); // Reverse to get chronological order

      // Cache the result
      await cache.set('chart_daily', cacheKey, candles);

      return candles;
    } catch (error) {
      console.error(`Failed to get daily data for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Get appropriate data based on trade duration - with focused date range filtering
  async getTradeChartData(symbol, entryDate, exitDate = null) {
    const entryTime = new Date(entryDate);
    const exitTime = exitDate ? new Date(exitDate) : new Date();
    const tradeDuration = exitTime - entryTime;
    const oneDayMs = 24 * 60 * 60 * 1000;

    console.log(`Alpha Vantage chart request - Symbol: ${symbol}, Entry: ${entryTime.toISOString()}, Exit: ${exitTime.toISOString()}, Duration: ${Math.ceil(tradeDuration / oneDayMs)} days, Has exit date: ${!!exitDate}`);

    // Calculate focused chart window like Finnhub does
    const entryDateUTC = new Date(entryTime.toISOString().split('T')[0] + 'T00:00:00.000Z');
    
    // For same-day trades, focus on the specific trading day
    // Extended trading hours: 4:00 AM ET to 8:00 PM ET (9:00 AM UTC to 1:00 AM UTC next day)
    const chartFromTime = new Date(entryDateUTC.getTime() + 9 * 60 * 60 * 1000); // 4:00 AM ET
    const chartToTime = new Date(entryDateUTC.getTime() + 25 * 60 * 60 * 1000); // 8:00 PM ET
    
    // Convert to Unix timestamps for filtering
    const fromTimestamp = Math.floor(chartFromTime.getTime() / 1000);
    const toTimestamp = Math.floor(chartToTime.getTime() / 1000);
    
    console.log('Alpha Vantage focusing chart on trading day:', {
      tradeDate: entryDateUTC.toISOString().split('T')[0],
      entryTime: entryTime.toISOString(),
      chartFrom: chartFromTime.toISOString(),
      chartTo: chartToTime.toISOString(),
      windowHours: ((chartToTime - chartFromTime) / (1000 * 60 * 60)).toFixed(1)
    });

    try {
      let rawCandles, dataType, interval;
      let filteredCandles;

      const now = new Date();
      const tradeAge = now - entryTime;
      const tradeAgeDays = Math.ceil(tradeAge / oneDayMs);

      // Alpha Vantage free tier keeps intraday data for ~1-2 months
      // Only try intraday for trades within 90 days to avoid wasting API calls
      const maxIntradayAgeDays = 90;
      const canTryIntraday = tradeAgeDays <= maxIntradayAgeDays;

      // For same-day trades or short trades, try intraday data first (if recent enough)
      if ((!exitDate || tradeDuration <= oneDayMs) && canTryIntraday) {
        console.log(`Attempting intraday 5min data for ${symbol} (same-day trade, ${tradeAgeDays} days old)`);

        try {
          rawCandles = await this.getIntradayData(symbol, '5min');

          // Filter to the specific trading day window
          filteredCandles = rawCandles.filter(candle => {
            return candle.time >= fromTimestamp && candle.time <= toTimestamp;
          });

          console.log(`Filtered intraday candles: ${filteredCandles.length} of ${rawCandles.length} candles within trade day window`);

          // If we got intraday data for the trade date, use it
          if (filteredCandles.length > 0) {
            dataType = 'intraday';
            interval = '5min';
          } else {
            // Intraday data doesn't cover the trade date - fall back to daily
            console.log(`No intraday data for trade date, falling back to daily data`);
            rawCandles = null; // Clear to trigger daily fetch below
          }
        } catch (intradayError) {
          console.warn(`Intraday data failed for ${symbol}: ${intradayError.message}, falling back to daily`);
          rawCandles = null; // Clear to trigger daily fetch below
        }
      }
      // For trades up to 7 days, use 15-minute data (if recent enough)
      else if (tradeDuration <= 7 * oneDayMs && canTryIntraday) {
        console.log(`Attempting 15-minute data for ${symbol} (${Math.ceil(tradeDuration / oneDayMs)} day trade, ${tradeAgeDays} days old)`);

        try {
          rawCandles = await this.getIntradayData(symbol, '15min');

          // For multi-day trades, filter to include the full trade period
          const windowStart = Math.floor((entryTime.getTime() - oneDayMs) / 1000); // 1 day before entry
          const windowEnd = Math.floor((exitTime.getTime() + oneDayMs) / 1000); // 1 day after exit

          filteredCandles = rawCandles.filter(candle => {
            return candle.time >= windowStart && candle.time <= windowEnd;
          });

          console.log(`Filtered 15min candles: ${filteredCandles.length} of ${rawCandles.length} candles within trade window`);

          if (filteredCandles.length > 0) {
            dataType = 'intraday';
            interval = '15min';
          } else {
            console.log(`No 15min data for trade dates, falling back to daily data`);
            rawCandles = null;
          }
        } catch (intradayError) {
          console.warn(`15-minute data failed for ${symbol}: ${intradayError.message}, falling back to daily`);
          rawCandles = null;
        }
      }

      // Fall back to daily data if intraday wasn't available or didn't cover the trade dates
      if (!rawCandles || !filteredCandles || filteredCandles.length === 0) {
        const reason = !canTryIntraday
          ? `trade too old for intraday (${tradeAgeDays} days > ${maxIntradayAgeDays} day limit)`
          : 'intraday data not available for trade dates';
        console.log(`Fetching daily data for ${symbol} (${reason})`);
        // Use 'compact' (last 100 days) - 'full' requires premium subscription
        rawCandles = await this.getDailyData(symbol, 'compact');
        dataType = 'daily';
        interval = 'daily';

        // For daily data, include a reasonable window around the trade dates
        const tradeDays = Math.max(14, Math.ceil(tradeDuration / oneDayMs) + 10); // At least 14 days, or trade duration + buffer
        const windowStart = Math.floor((entryTime.getTime() - 7 * oneDayMs) / 1000); // 7 days before entry
        const windowEnd = Math.floor((exitTime.getTime() + 7 * oneDayMs) / 1000); // 7 days after exit

        filteredCandles = rawCandles.filter(candle => {
          return candle.time >= windowStart && candle.time <= windowEnd;
        });

        console.log(`Filtered daily candles: ${filteredCandles.length} of ${rawCandles.length} candles within ${tradeDays}-day trade window`);
      }

      // Ensure we have some data to show
      if (filteredCandles.length === 0) {
        console.warn(`No candles found in focused range for ${symbol}, returning recent data instead`);
        // Fall back to recent data if no candles in range
        filteredCandles = rawCandles.slice(-50); // Last 50 candles
      }

      return {
        type: dataType,
        interval: interval,
        candles: filteredCandles,
        source: 'alphavantage'
      };
    } catch (error) {
      console.error(`Error fetching Alpha Vantage chart data for ${symbol}:`, error);
      throw error;
    }
  }

  // Get API usage stats
  async getUsageStats() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Get cache stats from the cache manager
    const cacheStats = await cache.getStats();

    return {
      dailyCallsUsed: this.dailyCalls.filter(t => t > oneDayAgo).length,
      dailyCallsRemaining: 25 - this.dailyCalls.filter(t => t > oneDayAgo).length,
      cacheSize: cacheStats.memoryEntries + cacheStats.databaseEntries,
      isConfigured: this.isConfigured()
    };
  }

  /**
   * Get dividend history for a stock
   * Uses the DIVIDENDS function from Alpha Vantage
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of dividend objects with ex_dividend_date, amount, etc.
   */
  async getDividends(symbol) {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `dividends_${symbolUpper}`;

    // Check cache first (24 hour TTL)
    const cached = await cache.get('av_dividends', cacheKey);
    if (cached) {
      console.log(`[AV-DIVIDENDS] Using cached dividend data for ${symbolUpper}`);
      return cached;
    }

    try {
      console.log(`[AV-DIVIDENDS] Fetching dividend history for ${symbolUpper}`);

      const data = await this.makeRequest({
        function: 'DIVIDENDS',
        symbol: symbolUpper
      });

      // Alpha Vantage returns: { data: [{ ex_dividend_date, declaration_date, record_date, payment_date, amount }] }
      const dividendData = data.data || [];

      // Normalize to common format matching Finnhub structure
      const dividends = dividendData.map(d => ({
        symbol: symbolUpper,
        date: d.ex_dividend_date, // ex-dividend date
        amount: parseFloat(d.amount) || 0,
        payDate: d.payment_date,
        recordDate: d.record_date,
        declarationDate: d.declaration_date,
        currency: 'USD' // Alpha Vantage doesn't return currency, assume USD
      }));

      if (dividends.length > 0) {
        console.log(`[AV-DIVIDENDS] Found ${dividends.length} dividends for ${symbolUpper}`);
        await cache.set('av_dividends', cacheKey, dividends);
      } else {
        console.log(`[AV-DIVIDENDS] No dividends found for ${symbolUpper}`);
        // Cache empty result for 24 hours
        await cache.set('av_dividends', cacheKey, []);
      }

      return dividends;
    } catch (error) {
      console.warn(`[AV-DIVIDENDS] Failed to get dividends for ${symbol}: ${error.message}`);
      // Return empty array instead of throwing to allow fallback logic
      return [];
    }
  }
}

module.exports = new AlphaVantageClient();