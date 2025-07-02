const axios = require('axios');
const cache = require('./cache');

class FinnhubClient {
  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.baseURL = 'https://finnhub.io/api/v1';
    
    // Rate limiting: 60 calls per minute
    this.maxCallsPerMinute = 60;
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
    
    // If we've made 60 calls in the last minute, wait
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
        throw new Error(`Finnhub API error: ${error.response.status} - ${error.response.data.error || 'Unknown error'}`);
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
      } catch (error) {
        console.warn(`Failed to resolve CUSIP ${cusip}: ${error.message}`);
      }
    }

    console.log(`Resolved ${Object.keys(results).length} of ${uniqueCusips.length} CUSIPs`);
    return results;
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
}

module.exports = new FinnhubClient();