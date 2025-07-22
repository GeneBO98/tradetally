const axios = require('axios');
const cache = require('./cache');
const aiService = require('./aiService');

class FinnhubClient {
  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.baseURL = 'https://finnhub.io/api/v1';
    
    // Rate limiting configuration
    // If API key is configured, assume Basic plan (150/min, 30/sec)
    // If not configured, use conservative limits for self-hosted
    if (this.apiKey) {
      this.maxCallsPerMinute = 150;
      this.maxCallsPerSecond = 30;
    } else {
      this.maxCallsPerMinute = 10;  // Conservative for self-hosted
      this.maxCallsPerSecond = 2;   // Conservative for self-hosted
    }
    this.callTimestamps = [];
    this.secondTimestamps = [];
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;
    
    // Remove old timestamps
    this.callTimestamps = this.callTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    this.secondTimestamps = this.secondTimestamps.filter(timestamp => timestamp > oneSecondAgo);
    
    // Check per-second limit first (30 calls per second)
    if (this.secondTimestamps.length >= this.maxCallsPerSecond) {
      const oldestSecondCall = this.secondTimestamps[0];
      const waitTime = 1000 - (now - oldestSecondCall) + 50; // Add 50ms buffer
      
      if (waitTime > 0) {
        console.log(`Rate limit (per second) reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Check per-minute limit (150 calls per minute)
    if (this.callTimestamps.length >= this.maxCallsPerMinute) {
      const oldestCall = this.callTimestamps[0];
      const waitTime = 60000 - (now - oldestCall) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        console.log(`Rate limit (per minute) reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this call
    this.callTimestamps.push(now);
    this.secondTimestamps.push(now);
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

  // Search for symbol by CUSIP or name
  async searchSymbol(query) {
    if (!this.isConfigured()) {
      console.warn('Finnhub not configured, skipping symbol search');
      return null;
    }

    console.log(`Searching for symbol: ${query}`);
    
    try {
      const results = await this.makeRequest('/search', {
        q: query
      });
      
      if (results && results.result && results.result.length > 0) {
        // Return the first match
        const match = results.result[0];
        console.log(`Found symbol match: ${match.symbol} (${match.description})`);
        return {
          symbol: match.symbol,
          description: match.description,
          type: match.type,
          displaySymbol: match.displaySymbol
        };
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to search symbol ${query}: ${error.message}`);
      return null;
    }
  }

  // Map CUSIP to symbol with AI fallback
  async mapCusipToSymbol(cusip, userId = null) {
    try {
      // Use the full lookupCusip function which includes AI fallback
      const symbol = await this.lookupCusip(cusip, userId);
      if (symbol) {
        console.log(`Successfully mapped CUSIP ${cusip} to symbol ${symbol}`);
        return symbol;
      }
    } catch (error) {
      console.warn(`CUSIP lookup failed for ${cusip}: ${error.message}`);
    }
    
    console.warn(`No symbol found for CUSIP ${cusip}`);
    return null;
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
    const entryTime = new Date(entryDate);
    const exitTime = exitDate ? new Date(exitDate) : new Date();
    const tradeDuration = exitTime - entryTime;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Convert to Unix timestamps
    const fromTimestamp = Math.floor((entryTime.getTime() - oneDayMs) / 1000); // 1 day before entry
    const toTimestamp = Math.floor((exitTime.getTime() + oneDayMs) / 1000); // 1 day after exit

    try {
      let resolution, intervalName;
      
      // For same-day trades, use 1-minute data
      if (tradeDuration <= oneDayMs) {
        resolution = '1';
        intervalName = '1min';
        console.log(`Fetching 1-minute Finnhub data for ${symbol} (same-day trade)`);
      }
      // For trades up to 5 days, use 5-minute data
      else if (tradeDuration <= 5 * oneDayMs) {
        resolution = '5';
        intervalName = '5min';
        console.log(`Fetching 5-minute Finnhub data for ${symbol} (${Math.ceil(tradeDuration / oneDayMs)} day trade)`);
      }
      // For longer trades, use 15-minute data
      else if (tradeDuration <= 30 * oneDayMs) {
        resolution = '15';
        intervalName = '15min';
        console.log(`Fetching 15-minute Finnhub data for ${symbol} (multi-day trade)`);
      }
      // For very long trades, use daily data
      else {
        resolution = 'D';
        intervalName = 'daily';
        console.log(`Fetching daily Finnhub data for ${symbol} (long-term trade)`);
      }
      
      const candles = await this.getStockCandles(symbol, resolution, fromTimestamp, toTimestamp);
      
      return {
        type: resolution === 'D' ? 'daily' : 'intraday',
        interval: intervalName,
        data: candles,
        source: 'finnhub'
      };
    } catch (error) {
      console.error(`Error fetching Finnhub chart data for ${symbol}:`, error);
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

  async lookupCusip(cusip, userId = null) {
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
      
      // Finnhub didn't find the CUSIP, try AI fallback
      console.log(`Finnhub could not resolve CUSIP ${cleanCusip} - trying AI fallback`);
      
      try {
        const aiResult = await this.lookupCusipWithAI(cleanCusip, userId);
        if (aiResult) {
          // Cache the AI result
          await cache.set('cusip_resolution', cleanCusip, aiResult);
          console.log(`✅ AI resolved CUSIP ${cleanCusip} to ticker ${aiResult}`);
          return aiResult;
        } else {
          console.log(`❌ AI could not resolve CUSIP ${cleanCusip}`);
        }
      } catch (aiError) {
        if (aiError.message.includes('API key not valid') || aiError.message.includes('API_KEY_INVALID')) {
          console.warn(`⚠️  AI fallback unavailable for CUSIP ${cleanCusip}: Invalid API key configured for user ${userId || 'unknown'}`);
        } else {
          console.warn(`❌ AI fallback failed for CUSIP ${cleanCusip}: ${aiError.message}`);
        }
      }
      
      // Neither Finnhub nor AI found the CUSIP - cache the null result to avoid repeated lookups
      await cache.set('cusip_resolution', cleanCusip, null);
      console.log(`Could not resolve CUSIP ${cleanCusip} - no matching symbol found via Finnhub or AI`);
      return null;
      
    } catch (error) {
      // Only throw if it's an actual API error, not a "not found" case
      if (!error.message?.includes('No symbol found')) {
        console.warn(`Failed to lookup CUSIP ${cleanCusip}: ${error.message}`);
        throw error;
      }
      return null;
    }
  }

  async generateSystemAIResponse(prompt) {
    try {
      const db = require('../config/database');
      
      // Get admin AI settings from database
      const settingsQuery = `
        SELECT setting_key, setting_value 
        FROM admin_settings 
        WHERE setting_key IN ('default_ai_provider', 'default_ai_api_key', 'default_ai_model')
      `;
      const settingsResult = await db.query(settingsQuery);
      
      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
      
      if (!settings.default_ai_api_key) {
        throw new Error('System AI provider not configured - no admin API key found');
      }
      
      // Use the configured AI provider
      if (settings.default_ai_provider === 'gemini') {
        const gemini = require('./gemini');
        
        const response = await gemini.generateResponse(prompt, {
          apiKey: settings.default_ai_api_key,
          model: settings.default_ai_model || 'gemini-1.5-flash',
          temperature: 0.1, // Low temperature for factual responses
          maxTokens: 50     // Short response expected
        });
        
        return response;
      } else if (settings.default_ai_provider === 'openai') {
        const { OpenAI } = await import('openai');
        
        const openai = new OpenAI({ 
          apiKey: settings.default_ai_api_key,
          baseURL: settings.default_ai_api_url || undefined
        });
        
        const response = await openai.chat.completions.create({
          model: settings.default_ai_model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 50
        });
        
        return response.choices[0]?.message?.content?.trim() || '';
      } else {
        throw new Error(`Unsupported system AI provider: ${settings.default_ai_provider}`);
      }
      
    } catch (error) {
      console.error('System AI response failed:', error.message);
      throw new Error(`Failed to generate AI response: ${error.message}`);
    }
  }


  async lookupCusipWithAI(cusip, userId = null) {
    try {
      if (userId) {
        // Use the existing aiService which handles user-specific settings
        const aiService = require('./aiService');
        const ticker = await aiService.lookupCusip(userId, cusip);
        
        if (!ticker || ticker.trim() === 'NOT_FOUND' || ticker.trim().length === 0) {
          return null;
        }
        
        // Validate ticker format (1-10 characters, letters, numbers, dash, dot)
        if (!/^[A-Z0-9\-\.]{1,10}$/.test(ticker)) {
          console.warn(`AI returned invalid ticker format for CUSIP ${cusip}: ${ticker}`);
          return null;
        }
        
        return ticker;
      } else {
        // Fallback to system-level AI call with admin settings
        const prompt = `You are a financial data assistant. I need to find the stock ticker symbol for a specific CUSIP number.

CUSIP: ${cusip}

Please provide ONLY the stock ticker symbol (e.g., AAPL, MSFT, TSLA) for this CUSIP. 

If you cannot identify the ticker symbol for this CUSIP, respond with "NOT_FOUND".

Your response should contain ONLY the ticker symbol or "NOT_FOUND" - no additional text, explanations, or formatting.`;

        const response = await this.generateSystemAIResponse(prompt);
        
        if (!response || response.trim() === 'NOT_FOUND' || response.trim().length === 0) {
          return null;
        }
        
        // Clean up the response - extract just the ticker symbol
        let ticker = response.trim().toUpperCase();
        
        // Remove any extra text or formatting
        ticker = ticker.replace(/[^A-Z0-9\-\.]/g, '');
        
        // Validate ticker format (1-10 characters, letters, numbers, dash, dot)
        if (!/^[A-Z0-9\-\.]{1,10}$/.test(ticker)) {
          console.warn(`AI returned invalid ticker format for CUSIP ${cusip}: ${response.trim()}`);
          return null;
        }
        
        return ticker;
      }
      
    } catch (error) {
      console.error(`AI CUSIP lookup failed for ${cusip}:`, error.message);
      throw error;
    }
  }

  async batchLookupCusips(cusips, userId = null) {
    const results = {};
    const uniqueCusips = [...new Set(cusips.map(c => c.replace(/\s/g, '').toUpperCase()))];
    
    console.log(`Looking up ${uniqueCusips.length} CUSIPs with Finnhub for user ${userId || 'unknown'}`);
    
    // Process CUSIPs with automatic rate limiting
    // No need for manual batching since makeRequest handles rate limiting
    console.log(`Looking up ${uniqueCusips.length} CUSIPs with rate limiting`);
    
    for (const cusip of uniqueCusips) {
      try {
        const ticker = await this.lookupCusip(cusip, userId);
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

  async getCandles(symbol, resolution, from, to, userId = null) {
    let symbolUpper = symbol.toUpperCase();
    
    // Check if this looks like a CUSIP (8-9 characters, alphanumeric)
    if (symbolUpper.match(/^[A-Z0-9]{8,9}$/)) {
      console.log(`Detected potential CUSIP: ${symbolUpper}, attempting to map to symbol`);
      const mappedSymbol = await this.mapCusipToSymbol(symbolUpper, userId);
      if (mappedSymbol) {
        console.log(`Successfully mapped CUSIP ${symbolUpper} to symbol ${mappedSymbol}`);
        symbolUpper = mappedSymbol;
      } else {
        console.warn(`Could not map CUSIP ${symbolUpper} to a symbol`);
        throw new Error(`CUSIP ${symbolUpper} could not be mapped to a tradeable symbol`);
      }
    }
    
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
        throw new Error(`No candle data available for ${symbolUpper}. This may be due to: 1) Symbol not supported by Finnhub, 2) No trading data for the requested time period, or 3) API limitations.`);
      }

      // Cache the result
      await cache.set('candles', cacheKey, candles);

      return candles;
    } catch (error) {
      console.warn(`Failed to get candles for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async getTicks(symbol, date, limit = 1000, skip = 0) {
    const symbolUpper = symbol.toUpperCase();
    
    // Format date as YYYY-MM-DD
    const formattedDate = date instanceof Date ? date.toISOString().split('T')[0] : date;
    
    // Create cache key with all parameters
    const cacheKey = `${symbolUpper}_${formattedDate}_${limit}_${skip}`;
    
    // Check cache first (24 hour TTL for tick data since it's historical)
    const cached = await cache.get('ticks', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const ticks = await this.makeRequest('/stock/tick', {
        symbol: symbolUpper,
        date: formattedDate,
        limit,
        skip
      });
      
      // Validate tick data
      if (!ticks || !ticks.t || ticks.t.length === 0) {
        throw new Error(`No tick data available for ${symbol} on ${formattedDate}`);
      }

      // Cache the result
      await cache.set('ticks', cacheKey, ticks);

      return ticks;
    } catch (error) {
      console.warn(`Failed to get ticks for ${symbol} on ${formattedDate}: ${error.message}`);
      throw error;
    }
  }

  async getTicksAroundTime(symbol, datetime, windowMinutes = 30) {
    const symbolUpper = symbol.toUpperCase();
    const targetTime = new Date(datetime);
    const targetDate = targetTime.toISOString().split('T')[0];
    
    // Create cache key
    const cacheKey = `${symbolUpper}_${targetDate}_${targetTime.getTime()}_${windowMinutes}`;
    
    // Check cache first
    const cached = await cache.get('ticks_around_time', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get all ticks for the day
      const allTicks = await this.getTicks(symbol, targetDate, 10000, 0);
      
      if (!allTicks || !allTicks.t || allTicks.t.length === 0) {
        throw new Error(`No tick data available for ${symbol} on ${targetDate}`);
      }

      // Filter ticks within the time window
      const targetTimestamp = targetTime.getTime();
      const windowMs = windowMinutes * 60 * 1000;
      const startTime = targetTimestamp - windowMs;
      const endTime = targetTimestamp + windowMs;
      
      const filteredTicks = {
        t: [],
        p: [],
        v: [],
        c: [],
        x: []
      };
      
      for (let i = 0; i < allTicks.t.length; i++) {
        const tickTime = allTicks.t[i] * 1000; // Convert to milliseconds
        
        if (tickTime >= startTime && tickTime <= endTime) {
          filteredTicks.t.push(allTicks.t[i]);
          filteredTicks.p.push(allTicks.p[i]);
          filteredTicks.v.push(allTicks.v[i]);
          if (allTicks.c && allTicks.c[i]) filteredTicks.c.push(allTicks.c[i]);
          if (allTicks.x && allTicks.x[i]) filteredTicks.x.push(allTicks.x[i]);
        }
      }
      
      // Add metadata
      filteredTicks.count = filteredTicks.t.length;
      filteredTicks.symbol = symbolUpper;
      filteredTicks.date = targetDate;
      filteredTicks.targetTime = targetTimestamp;
      filteredTicks.windowMinutes = windowMinutes;
      
      // Cache the result
      await cache.set('ticks_around_time', cacheKey, filteredTicks);

      return filteredTicks;
    } catch (error) {
      console.warn(`Failed to get ticks around time for ${symbol} at ${datetime}: ${error.message}`);
      throw error;
    }
  }

  // Get technical indicators
  async getTechnicalIndicator(symbol, resolution, from, to, indicator, indicatorFields = {}) {
    const symbolUpper = symbol.toUpperCase();
    
    // Create cache key with all parameters
    const cacheKey = `${symbolUpper}_${resolution}_${from}_${to}_${indicator}_${JSON.stringify(indicatorFields)}`;
    
    // Check cache first (1 hour TTL for technical indicators)
    const cached = await cache.get('technical_indicator', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const params = {
        symbol: symbolUpper,
        resolution,
        from,
        to,
        indicator,
        ...indicatorFields
      };

      const result = await this.makeRequest('/indicator', params);
      
      // Cache the result
      await cache.set('technical_indicator', cacheKey, result);

      return result;
    } catch (error) {
      console.warn(`Failed to get technical indicator ${indicator} for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Get pattern recognition
  async getPatternRecognition(symbol, resolution) {
    const symbolUpper = symbol.toUpperCase();
    
    // Create cache key
    const cacheKey = `${symbolUpper}_${resolution}`;
    
    // Check cache first (4 hour TTL for patterns)
    const cached = await cache.get('pattern_recognition', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const patterns = await this.makeRequest('/scan/pattern', {
        symbol: symbolUpper,
        resolution
      });
      
      // Cache the result
      await cache.set('pattern_recognition', cacheKey, patterns);

      return patterns;
    } catch (error) {
      console.warn(`Failed to get pattern recognition for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Get support and resistance levels
  async getSupportResistance(symbol, resolution) {
    const symbolUpper = symbol.toUpperCase();
    
    // Create cache key
    const cacheKey = `${symbolUpper}_${resolution}`;
    
    // Check cache first (4 hour TTL for support/resistance)
    const cached = await cache.get('support_resistance', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const levels = await this.makeRequest('/scan/support-resistance', {
        symbol: symbolUpper,
        resolution
      });
      
      // Cache the result
      await cache.set('support_resistance', cacheKey, levels);

      return levels;
    } catch (error) {
      console.warn(`Failed to get support/resistance for ${symbol}: ${error.message}`);
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
}

module.exports = new FinnhubClient();