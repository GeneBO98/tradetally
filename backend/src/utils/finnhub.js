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
          console.log('Rate limit hit, waiting 5 seconds before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000));
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
        
        // If no exact match found, don't use "best match" - this causes incorrect mappings
        console.log(`Finnhub search returned ${searchResults.result.length} results but no exact CUSIP match for ${cleanCusip}`);
      }
      
      // Check if AI CUSIP resolution is enabled
      const aiCusipEnabled = process.env.ENABLE_AI_CUSIP_RESOLUTION === 'true';
      
      // If AI is enabled, try it first since it's faster than comprehensive lookup
      if (aiCusipEnabled) {
        console.log(`[INFO] AI CUSIP resolution enabled - trying AI lookup for ${cleanCusip}`);
        
        try {
          const aiResult = await this.lookupCusipWithAI(cleanCusip, userId);
          if (aiResult) {
            // Cache the AI result
            await cache.set('cusip_resolution', cleanCusip, aiResult);
            console.log(`[AI] AI resolved CUSIP ${cleanCusip} to ticker ${aiResult}`);
            return aiResult;
          } else {
            console.log(`[AI] AI could not resolve CUSIP ${cleanCusip}`);
          }
        } catch (aiError) {
          console.warn(`[ERROR] AI lookup failed for CUSIP ${cleanCusip}: ${aiError.message}`);
        }
      }
      
      // Fallback to comprehensive lookup if AI didn't work
      console.log(`Finnhub could not resolve CUSIP ${cleanCusip} - trying comprehensive lookup service`);
      
      try {
        const cusipLookupService = require('./cusipLookupService');
        const result = await cusipLookupService.lookupCusip(cleanCusip);
        
        if (result) {
          // Cache the result
          await cache.set('cusip_resolution', cleanCusip, result);
          console.log(`[SUCCESS] Comprehensive lookup resolved CUSIP ${cleanCusip} to ticker ${result}`);
          return result;
        } else {
          console.log(`[ERROR] Comprehensive lookup could not resolve CUSIP ${cleanCusip}`);
        }
      } catch (lookupError) {
        console.warn(`[ERROR] Comprehensive lookup failed for CUSIP ${cleanCusip}: ${lookupError.message}`);
      }
      
      // Neither Finnhub nor comprehensive lookup found the CUSIP - cache the null result to avoid repeated lookups
      await cache.set('cusip_resolution', cleanCusip, null);
      console.log(`Could not resolve CUSIP ${cleanCusip} - no matching symbol found via any reliable source`);
      console.log(`[INFO] Manual mapping available in Trade Import interface for CUSIP ${cleanCusip}`);
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
        WHERE setting_key IN ('default_ai_provider', 'default_ai_api_key', 'default_ai_api_url', 'default_ai_model')
      `;
      const settingsResult = await db.query(settingsQuery);
      
      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
      
      // Validate configuration based on provider type
      const provider = settings.default_ai_provider || 'gemini';
      
      if (provider === 'ollama' || provider === 'local') {
        // Ollama and local providers require URL, API key is optional
        if (!settings.default_ai_api_url) {
          console.log(`System AI provider (${provider}) not configured - no admin API URL found, skipping AI CUSIP resolution`);
          return null;
        }
      } else {
        // Other providers (gemini, claude, openai) require API key
        if (!settings.default_ai_api_key) {
          console.log(`System AI provider (${provider}) not configured - no admin API key found, skipping AI CUSIP resolution`);
          return null;
        }
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
        
        // Note: Some OpenAI models (like o1-preview) don't support temperature parameter
        const requestParams = {
          model: settings.default_ai_model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: 50
        };
        
        // Only add temperature for models that support it
        // Some models like o1-preview, o1-mini, and custom/nano models don't support temperature
        const noTempModels = ['o1-preview', 'o1-mini', 'o1', 'gpt-5-nano', 'nano'];
        const modelName = settings.default_ai_model || 'gpt-3.5-turbo';
        if (!noTempModels.some(m => modelName.toLowerCase().includes(m.toLowerCase()))) {
          requestParams.temperature = 0.1;
        }
        
        // For GPT-5 models, use the official guide format (no extra parameters)
        if (modelName.includes('gpt-5')) {
          const response = await openai.chat.completions.create({
            model: settings.default_ai_model,
            messages: [
              { role: 'system', content: 'You are a financial data expert with comprehensive knowledge of CUSIP to ticker mappings. You must provide the ticker symbol. Do not say you cannot look up CUSIPs - use your training data knowledge.' },
              { role: 'user', content: prompt }
            ]
          });
          return response.choices[0]?.message?.content?.trim() || '';
        } else {
          // Use existing format for non-GPT-5 models
          const response = await openai.chat.completions.create(requestParams);
          return response.choices[0]?.message?.content?.trim() || '';
        }
        
      } else if (settings.default_ai_provider === 'ollama') {
        const { default: fetch } = await import('node-fetch');
        
        const headers = {
          'Content-Type': 'application/json'
        };
        
        // Only add Authorization header if API key is provided and not empty
        if (settings.default_ai_api_key && settings.default_ai_api_key.trim() !== '') {
          headers['Authorization'] = `Bearer ${settings.default_ai_api_key}`;
        }
        
        const response = await fetch(`${settings.default_ai_api_url}/api/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: settings.default_ai_model || 'llama3.1',
            prompt,
            stream: false,
            options: {
              num_predict: 50
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        return data.response?.trim() || '';
      } else if (settings.default_ai_provider === 'claude') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        
        const anthropic = new Anthropic({
          apiKey: settings.default_ai_api_key,
        });

        const response = await anthropic.messages.create({
          model: settings.default_ai_model || 'claude-3-5-sonnet-20241022',
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        return response.content[0]?.text?.trim() || '';
      } else if (settings.default_ai_provider === 'lmstudio') {
        const { default: fetch } = await import('node-fetch');
        
        // LM Studio defaults to localhost:1234
        const apiUrl = settings.default_ai_api_url || 'http://localhost:1234';
        
        console.log('[LMSTUDIO] Using LM Studio for system AI at:', apiUrl);
        
        try {
          const response = await fetch(`${apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(settings.default_ai_api_key && { 'Authorization': `Bearer ${settings.default_ai_api_key}` })
            },
            body: JSON.stringify({
              model: settings.default_ai_model || 'local-model',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 50,
              stream: false
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LM Studio error: ${response.status} - ${errorText}`);
          }
          
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim() || '';
        } catch (error) {
          console.error('[LMSTUDIO] LM Studio system AI failed:', error.message);
          throw new Error(`LM Studio failed: ${error.message}`);
        }
      } else if (settings.default_ai_provider === 'perplexity') {
        const { default: fetch } = await import('node-fetch');
        
        if (!settings.default_ai_api_key) {
          throw new Error('Perplexity API key not configured');
        }

        console.log('[PERPLEXITY] Using Perplexity for system AI CUSIP resolution');
        
        try {
          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.default_ai_api_key}`
            },
            body: JSON.stringify({
              model: settings.default_ai_model || 'sonar',
              messages: [
                {
                  role: 'user',
                  content: prompt
                }
              ],
              max_tokens: 100
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
          }
          
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim() || '';
        } catch (error) {
          console.error('[PERPLEXITY] System AI failed:', error.message);
          throw new Error(`Perplexity system AI failed: ${error.message}`);
        }
      } else if (settings.default_ai_provider === 'local') {
        const { default: fetch } = await import('node-fetch');
        
        const headers = {
          'Content-Type': 'application/json'
        };
        
        if (settings.default_ai_api_key && settings.default_ai_api_key.trim() !== '') {
          headers['Authorization'] = `Bearer ${settings.default_ai_api_key}`;
        }
        
        const response = await fetch(settings.default_ai_api_url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt,
            model: settings.default_ai_model,
            max_tokens: 50
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Local API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        
        // Try to extract response from common response formats
        if (data.response) return data.response.trim();
        if (data.text) return data.text.trim();
        if (data.content) return data.content.trim();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content.trim();
        }
        
        return JSON.stringify(data);
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
        const prompt = `I need the stock ticker symbol for CUSIP: ${cusip}

CUSIP ${cusip} is a unique identifier for a specific security. Please provide the corresponding stock ticker symbol.

IMPORTANT INSTRUCTIONS:
- If you know or can reasonably determine the ticker symbol, provide it
- Only respond "NOT_FOUND" if you're completely unable to identify the security
- Focus on US-listed stocks and ETFs
- Be helpful - many CUSIPs can be resolved with financial knowledge

Examples:
- For CUSIP 037833100 → "AAPL" (Apple Inc.)
- For CUSIP 594918104 → "MSFT" (Microsoft)
- If truly unknown → "NOT_FOUND"

Response (ticker symbol only):`;

        const response = await this.generateSystemAIResponse(prompt);
        
        console.log(`[AI DEBUG] Raw AI response for CUSIP ${cusip}:`, JSON.stringify(response));
        console.log(`[AI DEBUG] Response type:`, typeof response);
        console.log(`[AI DEBUG] Response length:`, response ? response.length : 'null/undefined');
        
        if (!response || response.trim() === 'NOT_FOUND' || response.trim().length === 0) {
          console.log(`[AI FALLBACK] First AI attempt failed for CUSIP ${cusip}, trying alternative approach...`);
          
          // Try a more direct approach
          const fallbackPrompt = `What is the stock ticker symbol for CUSIP ${cusip}? 
          
Please provide just the ticker symbol (like "AAPL" for Apple). If you don't know, respond "UNKNOWN".`;
          
          try {
            const fallbackResponse = await this.generateSystemAIResponse(fallbackPrompt);
            console.log(`[AI FALLBACK] Fallback AI response:`, JSON.stringify(fallbackResponse));
            
            if (fallbackResponse && fallbackResponse.trim() !== 'UNKNOWN' && fallbackResponse.trim().length > 0) {
              const fallbackTicker = this.extractTickerFromAIResponse(fallbackResponse.trim());
              if (fallbackTicker && /^[A-Z0-9\-\.]{1,10}$/.test(fallbackTicker.toUpperCase())) {
                console.log(`[AI FALLBACK] Fallback AI resolved CUSIP ${cusip} to ${fallbackTicker.toUpperCase()}`);
                return fallbackTicker.toUpperCase();
              }
            }
          } catch (fallbackError) {
            console.log(`[AI FALLBACK] Fallback AI also failed for CUSIP ${cusip}:`, fallbackError.message);
          }
          
          console.log(`System AI returned no result for CUSIP ${cusip}`);
          return null;
        }
        
        // Clean up the response - extract just the ticker symbol
        let ticker = this.extractTickerFromAIResponse(response.trim());
        
        if (!ticker) {
          console.warn(`AI could not extract valid ticker from response for CUSIP ${cusip}: ${response.trim()}`);
          return null;
        }
        
        ticker = ticker.toUpperCase();
        
        // Validate ticker format (1-10 characters, letters, numbers, dash, dot)
        if (!/^[A-Z0-9\-\.]{1,10}$/.test(ticker)) {
          console.warn(`AI returned invalid ticker format for CUSIP ${cusip}: ${ticker} (from: ${response.trim()})`);
          return null;
        }
        
        // Additional validation: warn if AI returns common "guess" symbols
        const commonGuesses = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'BAC', 'WMT'];
        if (commonGuesses.includes(ticker)) {
          console.warn(`[WARNING] AI returned common stock symbol ${ticker} for CUSIP ${cusip} - verify accuracy`);
        }
        
        return ticker;
      }
      
    } catch (error) {
      console.error(`AI CUSIP lookup failed for ${cusip}:`, error.message);
      
      // Return null for configuration errors instead of throwing
      if (error.message.includes('System AI provider not configured') || 
          error.message.includes('API key not configured') ||
          error.message.includes('not properly configured')) {
        return null;
      }
      
      throw error;
    }
  }

  async batchLookupCusips(cusips, userId = null, onResolveCallback = null) {
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
          
          // Call callback immediately when CUSIP is resolved
          if (onResolveCallback) {
            try {
              await onResolveCallback(cusip, ticker, userId);
            } catch (callbackError) {
              console.error(`[CALLBACK] Failed to process resolved CUSIP ${cusip} → ${ticker}:`, callbackError.message);
            }
          }
        }
        
        // Add small delay for CUSIP lookups to respect rate limits
        if (uniqueCusips.indexOf(cusip) < uniqueCusips.length - 1) {
          console.log(`Waiting 200ms before next CUSIP lookup...`);
          await new Promise(resolve => setTimeout(resolve, 200));
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

  /**
   * Extract ticker symbol from AI response text
   * Handles various response formats from different AI providers
   */
  extractTickerFromAIResponse(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    const text = response.trim().toUpperCase();
    
    // Pattern 1: Direct response (just the ticker symbol)
    if (/^[A-Z]{1,10}$/.test(text)) {
      console.log(`[TICKER EXTRACT] Direct ticker response: ${text}`);
      return text;
    }
    
    // Pattern 2: Look for standalone ticker symbols (2-10 uppercase letters)
    const standaloneMatch = text.match(/\b([A-Z]{2,10})\b/);
    if (standaloneMatch) {
      const ticker = standaloneMatch[1];
      // Avoid common words that aren't tickers
      const commonWords = ['THE', 'FOR', 'AND', 'WITH', 'NYSE', 'NASDAQ', 'STOCK', 'SYMBOL', 'TICKER', 'CUSIP', 'INC', 'CORP', 'LLC', 'LTD', 'NOT', 'FOUND'];
      if (!commonWords.includes(ticker)) {
        console.log(`[TICKER EXTRACT] Found standalone ticker: ${ticker}`);
        return ticker;
      }
    }
    
    // Pattern 3: Look for markdown bold text like **AKYA**
    const markdownMatch = text.match(/\*\*([A-Z]{1,10})\*\*/);
    if (markdownMatch) {
      console.log(`[TICKER EXTRACT] Found ticker in markdown: ${markdownMatch[1]}`);
      return markdownMatch[1];
    }
    
    // Pattern 4: Look for quotes like "TICKER" or 'TICKER'
    const quotedMatch = text.match(/['""]([A-Z]{1,10})['""]/);
    if (quotedMatch) {
      console.log(`[TICKER EXTRACT] Found quoted ticker: ${quotedMatch[1]}`);
      return quotedMatch[1];
    }
    
    console.log(`[TICKER EXTRACT] Could not extract ticker from: ${text}`);
    return null;
  }
}

module.exports = new FinnhubClient();