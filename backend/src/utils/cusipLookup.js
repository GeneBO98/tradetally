const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

class CusipLookup {
  constructor() {
    this.cacheFile = path.join(__dirname, '../data/cusip_cache.json');
    this.cache = this.loadCache();
    
    // Known CUSIP mappings (fallback for common ones)
    this.knownMappings = {
      '31447N204': 'FMTO',
      '44148G204': 'HOTH',
      // Add more as needed
    };
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Error loading CUSIP cache:', error.message);
    }
    return {};
  }

  saveCache() {
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Error saving CUSIP cache:', error.message);
    }
  }

  async lookupTicker(cusip) {
    if (!cusip || cusip.length !== 9) {
      return null;
    }

    // Clean CUSIP (remove spaces, convert to uppercase)
    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();

    // Check cache first
    if (this.cache[cleanCusip]) {
      console.log(`CUSIP ${cleanCusip} found in cache: ${this.cache[cleanCusip]}`);
      return this.cache[cleanCusip];
    }

    // Check known mappings
    if (this.knownMappings[cleanCusip]) {
      console.log(`CUSIP ${cleanCusip} found in known mappings: ${this.knownMappings[cleanCusip]}`);
      this.cache[cleanCusip] = this.knownMappings[cleanCusip];
      this.saveCache();
      return this.knownMappings[cleanCusip];
    }

    // Try multiple API sources
    const ticker = await this.tryMultipleSources(cleanCusip);
    
    if (ticker) {
      console.log(`CUSIP ${cleanCusip} resolved to ticker: ${ticker}`);
      this.cache[cleanCusip] = ticker;
      this.saveCache();
      return ticker;
    }

    console.warn(`Could not resolve CUSIP: ${cleanCusip}`);
    return null;
  }

  async tryMultipleSources(cusip) {
    // Try different API sources in order of preference
    const sources = [
      () => this.lookupWithOpenFIGI(cusip),
      () => this.lookupWithGemini(cusip),
      () => this.lookupWithSecAPI(cusip),
      () => this.lookupWithAlphaVantage(cusip)
    ];

    for (const source of sources) {
      try {
        const result = await source();
        if (result) {
          return result;
        }
      } catch (error) {
        console.warn('CUSIP lookup source failed:', error.message);
        continue;
      }
    }

    return null;
  }

  async lookupWithOpenFIGI(cusip) {
    try {
      // OpenFIGI API - free tier available, API key optional but recommended
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add API key if available
      if (process.env.OPENFIGI_API_KEY) {
        headers['X-OPENFIGI-APIKEY'] = process.env.OPENFIGI_API_KEY;
      }
      
      const response = await axios.post('https://api.openfigi.com/v3/mapping', [{
        idType: 'ID_CUSIP',
        idValue: cusip
      }], {
        headers,
        timeout: 10000
      });

      if (response.data && response.data[0] && response.data[0].data && response.data[0].data.length > 0) {
        const data = response.data[0].data[0];
        if (data && data.ticker) {
          console.log(`OpenFIGI resolved CUSIP ${cusip} to ticker ${data.ticker}`);
          return data.ticker;
        }
      }
      
      // Log if no data found
      if (response.data && response.data[0] && response.data[0].error) {
        console.warn(`OpenFIGI error for CUSIP ${cusip}: ${response.data[0].error}`);
      }
    } catch (error) {
      if (error.response && error.response.status === 429) {
        console.warn('OpenFIGI rate limit exceeded');
      } else {
        console.warn('OpenFIGI lookup failed:', error.message);
      }
    }
    return null;
  }

  async lookupWithGemini(cusip) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('Gemini API key not found in environment variables');
        return null;
      }

      console.log(`Gemini: Looking up CUSIP ${cusip}`);
      
      const prompt = `What is the current stock ticker symbol for CUSIP ${cusip}? Please respond with only the ticker symbol (e.g., AAPL, MSFT, TSLA) with no additional text or explanation. If you cannot find a ticker symbol for this CUSIP, respond with "UNKNOWN".`;

      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content) {
        const text = response.data.candidates[0].content.parts[0].text.trim().toUpperCase();
        
        // Validate the response is a valid ticker symbol
        if (text !== 'UNKNOWN' && text.match(/^[A-Z]{1,5}$/) && text !== cusip) {
          console.log(`Gemini resolved CUSIP ${cusip} to ticker ${text}`);
          return text;
        }
      }
      
      console.warn(`Gemini: No valid symbol found for CUSIP ${cusip}`);
    } catch (error) {
      if (error.response && error.response.status === 429) {
        console.warn('Gemini API rate limit exceeded');
      } else {
        console.warn('Gemini lookup failed:', error.message);
      }
    }
    return null;
  }

  async lookupWithSecAPI(cusip) {
    try {
      // SEC EDGAR API - free, no API key required
      const response = await axios.get(`https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cusip}&action=getcompany&output=json`, {
        headers: {
          'User-Agent': 'TraderVue-Clone contact@example.com'
        },
        timeout: 5000
      });

      // This is a simplified example - SEC API structure may vary
      if (response.data && response.data.ticker) {
        return response.data.ticker;
      }
    } catch (error) {
      console.warn('SEC API lookup failed:', error.message);
    }
    return null;
  }

  async lookupWithAlphaVantage(cusip) {
    try {
      // Alpha Vantage API - requires API key (optional)
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (!apiKey) {
        return null;
      }

      const response = await axios.get(`https://www.alphavantage.co/query`, {
        params: {
          function: 'SYMBOL_SEARCH',
          keywords: cusip,
          apikey: apiKey
        },
        timeout: 5000
      });

      if (response.data && response.data.bestMatches && response.data.bestMatches.length > 0) {
        return response.data.bestMatches[0]['1. symbol'];
      }
    } catch (error) {
      console.warn('Alpha Vantage lookup failed:', error.message);
    }
    return null;
  }

  // Batch lookup for multiple CUSIPs using OpenFIGI batch API
  async lookupBatch(cusips) {
    const results = {};
    const uncachedCusips = [];
    
    // Check cache first
    for (const cusip of cusips) {
      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      if (this.cache[cleanCusip]) {
        results[cleanCusip] = this.cache[cleanCusip];
      } else {
        uncachedCusips.push(cleanCusip);
      }
    }
    
    // If all found in cache, return
    if (uncachedCusips.length === 0) {
      return results;
    }
    
    // Batch lookup uncached CUSIPs with OpenFIGI (max 100 per request)
    const batchSize = 100;
    for (let i = 0; i < uncachedCusips.length; i += batchSize) {
      const batch = uncachedCusips.slice(i, i + batchSize);
      
      try {
        const headers = {
          'Content-Type': 'application/json'
        };
        
        if (process.env.OPENFIGI_API_KEY) {
          headers['X-OPENFIGI-APIKEY'] = process.env.OPENFIGI_API_KEY;
        }
        
        const requests = batch.map(cusip => ({
          idType: 'ID_CUSIP',
          idValue: cusip
        }));
        
        const response = await axios.post('https://api.openfigi.com/v3/mapping', requests, {
          headers,
          timeout: 30000
        });
        
        // Process results
        response.data.forEach((result, index) => {
          const cusip = batch[index];
          if (result.data && result.data.length > 0 && result.data[0].ticker) {
            const ticker = result.data[0].ticker;
            results[cusip] = ticker;
            this.cache[cusip] = ticker;
            console.log(`Batch resolved CUSIP ${cusip} to ticker ${ticker}`);
          }
        });
        
        // Save cache after each batch
        this.saveCache();
        
        // Add delay between batches to avoid rate limiting
        if (i + batchSize < uncachedCusips.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('Batch CUSIP lookup failed:', error.message);
        // Fall back to individual lookups for this batch
        for (const cusip of batch) {
          const ticker = await this.lookupTicker(cusip);
          if (ticker) {
            results[cusip] = ticker;
          }
        }
      }
    }
    
    // Check for any remaining unresolved CUSIPs and try full lookup pipeline
    const unresolvedCusips = uncachedCusips.filter(cusip => !results[cusip]);
    if (unresolvedCusips.length > 0) {
      console.log(`${unresolvedCusips.length} CUSIPs not resolved by OpenFIGI, trying other sources including Gemini...`);
      
      for (const cusip of unresolvedCusips) {
        const ticker = await this.lookupTicker(cusip);
        if (ticker) {
          results[cusip] = ticker;
        }
        // Small delay to avoid rate limiting on Gemini API
        if (unresolvedCusips.indexOf(cusip) < unresolvedCusips.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    return results;
  }

  // Manual mapping function for adding known CUSIP/ticker pairs
  addMapping(cusip, ticker) {
    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
    const cleanTicker = ticker.toUpperCase();
    
    this.knownMappings[cleanCusip] = cleanTicker;
    this.cache[cleanCusip] = cleanTicker;
    this.saveCache();
    
    console.log(`Added CUSIP mapping: ${cleanCusip} -> ${cleanTicker}`);
  }

  // Remove a CUSIP mapping
  removeMapping(cusip) {
    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
    
    // Check if mapping exists
    if (!this.cache[cleanCusip]) {
      return false;
    }
    
    const deletedTicker = this.cache[cleanCusip];
    
    // Remove from both cache and known mappings
    delete this.cache[cleanCusip];
    delete this.knownMappings[cleanCusip];
    
    // Save updated cache
    this.saveCache();
    
    console.log(`Removed CUSIP mapping: ${cleanCusip} -> ${deletedTicker}`);
    return true;
  }

  // Function to identify if a symbol looks like a CUSIP
  static isCusip(symbol) {
    if (!symbol || typeof symbol !== 'string') return false;
    
    // CUSIP format: 9 characters, usually alphanumeric ending with a check digit
    const cleaned = symbol.replace(/\s/g, '');
    
    // Basic CUSIP validation
    return /^[0-9A-Z]{8}[0-9]$/.test(cleaned) && cleaned.length === 9;
  }
}

module.exports = new CusipLookup();