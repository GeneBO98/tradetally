const axios = require('axios');
const cache = require('./cache');

class FinnhubClient {
  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.baseURL = 'https://finnhub.io/api/v1';
    
    // Rate limiting: Conservative limits for free tier (30 calls per minute)
    this.maxCallsPerMinute = 30;
    this.callTimestamps = [];
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove timestamps older than 1 minute
    this.callTimestamps = this.callTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    
    // If we've made max calls in the last minute, wait
    if (this.callTimestamps.length >= this.maxCallsPerMinute) {
      const oldestCall = this.callTimestamps[0];
      const waitTime = 60000 - (now - oldestCall) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this call
    this.callTimestamps.push(Date.now());
  }

  async makeRequest(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured');
    }

    // Apply rate limiting
    await this.waitForRateLimit();

    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params: {
          ...params,
          token: this.apiKey
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle 429 rate limit errors with exponential backoff
        if (error.response.status === 429) {
          console.log('Rate limit hit, waiting 60 seconds before retry...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          throw new Error(`Finnhub API rate limit exceeded: ${error.response.status} - ${error.response.data?.error || 'Rate limit reached'}`);
        }
        throw new Error(`Finnhub API error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
      }
      throw new Error(`Finnhub request failed: ${error.message}`);
    }
  }

  async getQuote(symbol) {
    const symbolUpper = symbol.toUpperCase();
    
    // Check cache first
    const cached = await cache.get('quote', symbolUpper);
    if (cached) {
      return cached;
    }

    try {
      const quote = await this.makeRequest('/quote', { symbol: symbolUpper });
      
      // Validate quote data
      if (!quote || quote.c === undefined || quote.c === 0) {
        throw new Error(`No quote data available for ${symbol}`);
      }

      // Cache the result
      await cache.set('quote', symbolUpper, quote);

      return quote;
    } catch (error) {
      console.warn(`Failed to get quote for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async getBatchQuotes(symbols) {
    const results = {};
    const uniqueSymbols = [...new Set(symbols.map(s => s.toUpperCase()))];
    
    console.log(`Getting quotes for ${uniqueSymbols.length} symbols:`, uniqueSymbols);
    
    // Filter out obvious CUSIPs or invalid symbols
    const validSymbols = uniqueSymbols.filter(symbol => {
      // Skip if it looks like a CUSIP (9 characters, alphanumeric)
      if (/^[0-9A-Z]{8}[0-9]$/.test(symbol)) {
        console.log(`Skipping CUSIP-like symbol: ${symbol}`);
        return false;
      }
      // Skip if it's too long or has numbers (likely not a valid ticker)
      if (symbol.length > 5 || /\d/.test(symbol)) {
        console.log(`Skipping invalid ticker: ${symbol}`);
        return false;
      }
      return true;
    });
    
    console.log(`Filtered to ${validSymbols.length} valid symbols:`, validSymbols);
    
    if (validSymbols.length === 0) {
      console.log('No valid symbols to quote');
      return results;
    }
    
    // Process symbols with automatic rate limiting
    // No need for manual batching since makeRequest handles rate limiting
    console.log(`Getting quotes for ${validSymbols.length} symbols`);
    
    for (const symbol of validSymbols) {
      try {
        const quote = await this.getQuote(symbol);
        console.log(`Got quote for ${symbol}:`, quote);
        results[symbol] = quote;
      } catch (error) {
        console.warn(`Failed to get quote for ${symbol}:`, error.message);
      }
    }

    console.log(`Final quote results:`, Object.keys(results));
    return results;
  }

  async getCompanyProfile(symbol) {
    const symbolUpper = symbol.toUpperCase();
    
    // Check cache first (24 hour TTL for company profiles)
    const cached = await cache.get('company_profile', symbolUpper);
    if (cached) {
      return cached;
    }

    try {
      const profile = await this.makeRequest('/stock/profile2', { symbol: symbolUpper });
      
      // Cache the result
      await cache.set('company_profile', symbolUpper, profile);
      
      return profile;
    } catch (error) {
      console.warn(`Failed to get company profile for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async getMarketNews(category = 'general', count = 10) {
    try {
      const news = await this.makeRequest('/news', { 
        category,
        minId: 0
      });
      return news.slice(0, count);
    } catch (error) {
      console.warn(`Failed to get market news: ${error.message}`);
      throw error;
    }
  }

  async getCompanyNews(symbol, fromDate = null, toDate = null) {
    const symbolUpper = symbol.toUpperCase();
    const to = toDate || new Date().toISOString().split('T')[0];
    const from = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Create cache key with date range
    const cacheKey = `${symbolUpper}_${from}_${to}`;
    
    // Check cache first (15 minute TTL for company news)
    const cached = await cache.get('company_news', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const news = await this.makeRequest('/company-news', { 
        symbol: symbolUpper,
        from,
        to
      });
      
      // Cache the result
      await cache.set('company_news', cacheKey, news);
      
      return news;
    } catch (error) {
      console.warn(`Failed to get company news for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async getEarningsCalendar(fromDate = null, toDate = null, symbol = null) {
    const from = fromDate || new Date().toISOString().split('T')[0];
    const to = toDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Create cache key with date range and optional symbol
    const cacheKey = symbol ? `${symbol.toUpperCase()}_${from}_${to}` : `all_${from}_${to}`;
    
    // Check cache first (4 hour TTL for earnings)
    const cached = await cache.get('earnings', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const params = { from, to };
      if (symbol) {
        params.symbol = symbol.toUpperCase();
      }
      
      const earnings = await this.makeRequest('/calendar/earnings', params);
      const result = earnings.earningsCalendar || [];
      
      // Cache the result
      await cache.set('earnings', cacheKey, result);
      
      return result;
    } catch (error) {
      console.warn(`Failed to get earnings calendar: ${error.message}`);
      throw error;
    }
  }

  async symbolSearch(query) {
    try {
      const results = await this.makeRequest('/search', { q: query });
      return results;
    } catch (error) {
      console.warn(`Failed to search for symbol ${query}: ${error.message}`);
      throw error;
    }
  }

  async lookupCusip(cusip) {
    if (!cusip || cusip.length !== 9) {
      throw new Error('Invalid CUSIP format');
    }

    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
    
    // Check cache first (7 day TTL for CUSIP resolution)
    const cached = await cache.get('cusip_resolution', cleanCusip);
    if (cached) {
      return cached;
    }

    try {
      // Search for the CUSIP
      const searchResults = await this.symbolSearch(cleanCusip);
      
      // Look for an exact CUSIP match in the results
      if (searchResults.result && searchResults.result.length > 0) {
        for (const result of searchResults.result) {
          // Check if this result has a matching CUSIP
          if (result.symbol && (
            result.cusip === cleanCusip || 
            result.isin === cleanCusip ||
            result.description?.includes(cleanCusip)
          )) {
            const ticker = result.symbol;
            
            // Cache the result
            await cache.set('cusip_resolution', cleanCusip, ticker);
            
            console.log(`Finnhub resolved CUSIP ${cleanCusip} to ticker ${ticker}`);
            return ticker;
          }
        }
        
        // If no exact match, try the first result if it looks valid
        const firstResult = searchResults.result[0];
        if (firstResult.symbol && /^[A-Z]{1,5}$/.test(firstResult.symbol)) {
          const ticker = firstResult.symbol;
          
          // Cache the result
          await cache.set('cusip_resolution', cleanCusip, ticker);
          
          console.log(`Finnhub resolved CUSIP ${cleanCusip} to ticker ${ticker} (best match)`);
          return ticker;
        }
      }
      
      throw new Error(`No symbol found for CUSIP ${cleanCusip}`);
      
    } catch (error) {
      console.warn(`Failed to lookup CUSIP ${cleanCusip}: ${error.message}`);
      throw error;
    }
  }

  async batchLookupCusips(cusips) {
    const results = {};
    const uniqueCusips = [...new Set(cusips.map(c => c.replace(/\s/g, '').toUpperCase()))];
    
    console.log(`Looking up ${uniqueCusips.length} CUSIPs with Finnhub`);
    
    // Process CUSIPs with automatic rate limiting
    // No need for manual batching since makeRequest handles rate limiting
    console.log(`Looking up ${uniqueCusips.length} CUSIPs with rate limiting`);
    
    for (const cusip of uniqueCusips) {
      try {
        const ticker = await this.lookupCusip(cusip);
        if (ticker) {
          results[cusip] = ticker;
        }
        
        // Add 3-second delay for CUSIP lookups to stay well under rate limits
        if (uniqueCusips.indexOf(cusip) < uniqueCusips.length - 1) {
          console.log(`Waiting 3 seconds before next CUSIP lookup...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.warn(`Failed to resolve CUSIP ${cusip}: ${error.message}`);
      }
    }

    console.log(`Resolved ${Object.keys(results).length} of ${uniqueCusips.length} CUSIPs`);
    return results;
  }

  async getCandles(symbol, resolution, from, to) {
    const symbolUpper = symbol.toUpperCase();
    
    // Create cache key with all parameters
    const cacheKey = `${symbolUpper}_${resolution}_${from}_${to}`;
    
    // Check cache first (1 hour TTL for candle data)
    const cached = await cache.get('candles', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const candles = await this.makeRequest('/stock/candle', {
        symbol: symbolUpper,
        resolution,
        from,
        to
      });
      
      // Validate candle data
      if (!candles || candles.s !== 'ok' || !candles.c || candles.c.length === 0) {
        throw new Error(`No candle data available for ${symbol} from ${from} to ${to}`);
      }

      // Cache the result
      await cache.set('candles', cacheKey, candles);

      return candles;
    } catch (error) {
      console.warn(`Failed to get candles for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Get cache stats
  async getCacheStats() {
    const now = Date.now();
    const cacheStats = await cache.getStats();
    
    return {
      ...cacheStats,
      rateLimitStats: {
        maxCallsPerMinute: this.maxCallsPerMinute,
        recentCalls: this.callTimestamps.length,
        lastMinuteCalls: this.callTimestamps.filter(t => t > now - 60000).length
      }
    };
  }

  async getStockSplits(symbol, from, to) {
    if (!this.apiKey) {
      console.log('Finnhub API key not configured, skipping stock splits check');
      return [];
    }

    const cacheKey = `stock_splits_${symbol}_${from}_${to}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Using cached stock splits for ${symbol}`);
      return cached;
    }

    try {
      const endpoint = '/stock/split';
      const params = {
        symbol,
        from,
        to
      };
      
      console.log(`Fetching stock splits for ${symbol} from ${from} to ${to}`);
      const response = await this.makeRequest(endpoint, params);
      
      // Cache for 24 hours since splits are historical data
      cache.set(cacheKey, response, 86400);
      
      return response || [];
    } catch (error) {
      console.error(`Error fetching stock splits for ${symbol}:`, error.message);
      return [];
    }
  }

  async getStockCandles(symbol, resolution = '1', from, to) {
    const symbolUpper = symbol.toUpperCase();
    
    // Create cache key with parameters
    const cacheKey = `${symbolUpper}_${resolution}_${from}_${to}`;
    
    // Check cache first (5 minute TTL for recent candle data)
    const cached = await cache.get('stock_candles', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const candles = await this.makeRequest('/stock/candle', {
        symbol: symbolUpper,
        resolution,
        from,
        to
      });
      
      // Validate candles data
      if (!candles || candles.s !== 'ok' || !candles.c || candles.c.length === 0) {
        throw new Error(`No candle data available for ${symbol}`);
      }

      // Convert to standard format
      const formattedCandles = [];
      for (let i = 0; i < candles.c.length; i++) {
        formattedCandles.push({
          time: candles.t[i],
          open: candles.o[i],
          high: candles.h[i],
          low: candles.l[i],
          close: candles.c[i],
          volume: candles.v[i]
        });
      }
      
      // Cache the result
      await cache.set('stock_candles', cacheKey, formattedCandles);
      
      return formattedCandles;
    } catch (error) {
      console.warn(`Failed to get stock candles for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Get appropriate candle data based on trade duration for Pro users
  async getTradeChartData(symbol, entryDate, exitDate = null) {
    // Log the dates we're working with to debug timezone issues
    console.log('getTradeChartData input dates:', {
      entryDate,
      exitDate,
      entryDateString: new Date(entryDate).toString(),
      exitDateString: exitDate ? new Date(exitDate).toString() : 'none'
    });
    
    const entryTime = new Date(entryDate);
    const exitTime = exitDate ? new Date(exitDate) : new Date();
    const tradeDuration = exitTime - entryTime;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Focus on the actual trade day only
    // Get the trade date in UTC to avoid timezone issues
    const entryDateUTC = new Date(entryTime.toISOString().split('T')[0] + 'T00:00:00.000Z');
    
    // Set chart window to show extended trading hours for the trade day
    // Pre-market: 4:00 AM ET to 9:30 AM ET
    // Regular hours: 9:30 AM ET to 4:00 PM ET  
    // After-hours: 4:00 PM ET to 8:00 PM ET
    
    // Convert ET times to UTC (ET is UTC-5 in winter, UTC-4 in summer)
    // For simplicity, assume EST (UTC-5) - this covers most trading
    
    // Start at 4:00 AM ET on trade day (9:00 AM UTC)
    const chartFromTime = new Date(entryDateUTC.getTime() + 9 * 60 * 60 * 1000);
    // End at 8:00 PM ET on trade day (1:00 AM UTC next day)  
    const chartToTime = new Date(entryDateUTC.getTime() + 25 * 60 * 60 * 1000);
    
    console.log('Focusing chart on single trading day:', {
      tradeDate: entryDateUTC.toISOString().split('T')[0],
      entryTime: entryTime.toISOString(),
      chartFrom: chartFromTime.toISOString(),
      chartTo: chartToTime.toISOString(),
      windowHours: ((chartToTime - chartFromTime) / (1000 * 60 * 60)).toFixed(1)
    });

    // Convert to Unix timestamps
    const fromTimestamp = Math.floor(chartFromTime.getTime() / 1000);
    const toTimestamp = Math.floor(chartToTime.getTime() / 1000);
    
    console.log('Chart window calculation:', {
      entryTime: entryTime.toISOString(),
      exitTime: exitTime.toISOString(),
      chartFromTime: chartFromTime.toISOString(),
      chartToTime: chartToTime.toISOString(),
      fromTimestamp,
      toTimestamp,
      tradeDuration: `${tradeDuration / 1000 / 60} minutes`
    });

    try {
      let resolution, intervalName;
      const chartDuration = chartToTime - chartFromTime;
      
      // For Pro users, prioritize high-resolution data for better trade analysis
      // Use 1-minute data aggressively for short to medium timeframes
      if (chartDuration <= 7 * oneDayMs) {
        resolution = '1';
        intervalName = '1min';
        console.log(`Fetching 1-minute Finnhub data for ${symbol} (${Math.ceil(chartDuration / oneDayMs)} day window - high precision)`);
      }
      // For windows up to 30 days, use 5-minute data
      else if (chartDuration <= 30 * oneDayMs) {
        resolution = '5';
        intervalName = '5min';
        console.log(`Fetching 5-minute Finnhub data for ${symbol} (${Math.ceil(chartDuration / oneDayMs)} day chart window)`);
      }
      // For very large chart windows, use 15-minute data
      else if (chartDuration <= 90 * oneDayMs) {
        resolution = '15';
        intervalName = '15min';
        console.log(`Fetching 15-minute Finnhub data for ${symbol} (${Math.ceil(chartDuration / oneDayMs)} day chart window)`);
      }
      // For extremely large windows, use daily data
      else {
        resolution = 'D';
        intervalName = 'daily';
        console.log(`Fetching daily Finnhub data for ${symbol} (${Math.ceil(chartDuration / oneDayMs)} day chart window)`);
      }
      
      const candles = await this.getStockCandles(symbol, resolution, fromTimestamp, toTimestamp);
      
      return {
        type: resolution === 'D' ? 'daily' : 'intraday',
        interval: intervalName,
        candles: candles,
        source: 'finnhub'
      };
    } catch (error) {
      console.error(`Error fetching Finnhub chart data for ${symbol}:`, error);
      throw error;
    }
  }
}

module.exports = new FinnhubClient();