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

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Alpha Vantage API error: ${error.response.status} - ${error.response.statusText}`);
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
        throw new Error(`No intraday data available for ${symbol}`);
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
        throw new Error(`No daily data available for ${symbol}`);
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
      
      // Check if trade is too old for intraday data (Alpha Vantage free tier limitation)
      const now = new Date();
      const tradeAge = now - entryTime;
      const thirtyDaysMs = 30 * oneDayMs;
      const isOldTrade = tradeAge > thirtyDaysMs;
      
      if (isOldTrade) {
        console.log(`Trade is ${Math.ceil(tradeAge / oneDayMs)} days old - using daily data for better historical coverage`);
      }
      
      // For same-day trades or no exit date, use intraday data (if recent enough)
      if ((!exitDate || tradeDuration <= oneDayMs) && !isOldTrade) {
        console.log(`Fetching intraday 5min data for ${symbol} (same-day or open trade)`);
        rawCandles = await this.getIntradayData(symbol, '5min');
        dataType = 'intraday';
        interval = '5min';
      }
      // For trades up to 7 days, use 15-minute data (if recent enough)
      else if (tradeDuration <= 7 * oneDayMs && !isOldTrade) {
        console.log(`Fetching 15-minute data for ${symbol} (${Math.ceil(tradeDuration / oneDayMs)} day trade)`);
        rawCandles = await this.getIntradayData(symbol, '15min');
        dataType = 'intraday';
        interval = '15min';
      }
      // For older trades or longer trades, use daily data
      else {
        const reason = isOldTrade ? 'old trade - intraday data not available' : 'multi-day trade';
        console.log(`Fetching daily data for ${symbol} (${reason})`);
        rawCandles = await this.getDailyData(symbol, 'full');
        dataType = 'daily';
        interval = 'daily';
      }

      // Filter candles to focus on the trade period (like Finnhub does)
      let filteredCandles;
      
      if (dataType === 'intraday') {
        // For intraday data, filter to the specific trading day window
        filteredCandles = rawCandles.filter(candle => {
          return candle.time >= fromTimestamp && candle.time <= toTimestamp;
        });
        
        console.log(`Filtered intraday candles: ${filteredCandles.length} of ${rawCandles.length} candles within trade day window`);
      } else {
        // For daily data, include a reasonable window around the trade dates
        const tradeDays = Math.max(7, Math.ceil(tradeDuration / oneDayMs) + 5); // At least 7 days, or trade duration + buffer
        const windowStart = Math.floor((entryTime.getTime() - 5 * oneDayMs) / 1000); // 5 days before entry
        const windowEnd = Math.floor((exitTime.getTime() + 5 * oneDayMs) / 1000); // 5 days after exit
        
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
}

module.exports = new AlphaVantageClient();