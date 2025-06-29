const axios = require('axios');

class FinnhubClient {
  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.baseURL = 'https://finnhub.io/api/v1';
    this.cache = new Map();
    this.cacheExpiry = 60 * 1000; // 1 minute cache
    
    // Rate limiting: 30 calls per second
    this.maxCallsPerSecond = 30;
    this.callTimestamps = [];
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Remove timestamps older than 1 second
    this.callTimestamps = this.callTimestamps.filter(timestamp => timestamp > oneSecondAgo);
    
    // If we've made 30 calls in the last second, wait
    if (this.callTimestamps.length >= this.maxCallsPerSecond) {
      const oldestCall = this.callTimestamps[0];
      const waitTime = 1000 - (now - oldestCall) + 50; // Add 50ms buffer
      
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

  getCacheKey(symbol) {
    return `quote_${symbol.toUpperCase()}`;
  }

  isCacheValid(timestamp) {
    return Date.now() - timestamp < this.cacheExpiry;
  }

  async getQuote(symbol) {
    const cacheKey = this.getCacheKey(symbol);
    const cached = this.cache.get(cacheKey);

    // Return cached data if valid
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const quote = await this.makeRequest('/quote', { symbol: symbol.toUpperCase() });
      
      // Validate quote data
      if (!quote || quote.c === undefined || quote.c === 0) {
        throw new Error(`No quote data available for ${symbol}`);
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data: quote,
        timestamp: Date.now()
      });

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
    try {
      const profile = await this.makeRequest('/stock/profile2', { symbol: symbol.toUpperCase() });
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
    
    // Check cache first
    const cacheKey = `cusip_${cleanCusip}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
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
            this.cache.set(cacheKey, {
              data: ticker,
              timestamp: Date.now()
            });
            
            console.log(`Finnhub resolved CUSIP ${cleanCusip} to ticker ${ticker}`);
            return ticker;
          }
        }
        
        // If no exact match, try the first result if it looks valid
        const firstResult = searchResults.result[0];
        if (firstResult.symbol && /^[A-Z]{1,5}$/.test(firstResult.symbol)) {
          const ticker = firstResult.symbol;
          
          // Cache the result
          this.cache.set(cacheKey, {
            data: ticker,
            timestamp: Date.now()
          });
          
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

  // Clear cache (useful for testing or manual refresh)
  clearCache() {
    this.cache.clear();
  }

  // Get cache stats
  getCacheStats() {
    const now = Date.now();
    const validEntries = Array.from(this.cache.values())
      .filter(entry => this.isCacheValid(entry.timestamp));
    
    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      expiredEntries: this.cache.size - validEntries.length,
      cacheExpiry: this.cacheExpiry,
      rateLimitStats: {
        maxCallsPerSecond: this.maxCallsPerSecond,
        recentCalls: this.callTimestamps.length,
        lastMinuteCalls: this.callTimestamps.filter(t => t > now - 60000).length
      }
    };
  }
}

module.exports = new FinnhubClient();