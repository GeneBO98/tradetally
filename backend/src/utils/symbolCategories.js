const db = require('../config/database');
const finnhub = require('./finnhub');
const cache = require('./cache');

class SymbolCategoryManager {
  constructor() {
    this.batchSize = 10; // Process symbols in batches
    this.updateInterval = 24 * 60 * 60 * 1000; // Update categories older than 24 hours
    this.inFlightLookups = new Map();
  }

  normalizeCategory(symbol, category = {}) {
    const symbolUpper = symbol.toUpperCase();

    return {
      symbol: symbolUpper,
      company_name: category.company_name ?? category.name ?? null,
      finnhub_industry: category.finnhub_industry ?? category.finnhubIndustry ?? null,
      country: category.country ?? null,
      currency: category.currency ?? null,
      exchange: category.exchange ?? null,
      ipo_date: category.ipo_date ?? category.ipo ?? null,
      market_cap: category.market_cap ?? (category.marketCapitalization ? parseFloat(category.marketCapitalization) : null),
      phone: category.phone ?? null,
      share_outstanding: category.share_outstanding ?? (category.shareOutstanding ? parseFloat(category.shareOutstanding) : null),
      ticker: category.ticker ?? symbolUpper,
      weburl: category.weburl ?? null,
      logo: category.logo ?? null,
      updated_at: category.updated_at ?? null
    };
  }

  hasStoredMetadata(category) {
    return Boolean(
      category && (
        category.company_name ||
        category.logo ||
        category.finnhub_industry ||
        category.exchange ||
        category.weburl
      )
    );
  }

  isFresh(category) {
    if (!category?.updated_at) {
      return false;
    }

    const updatedAt = new Date(category.updated_at);
    const ageInDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageInDays < 30;
  }

  shouldReuseStoredCategory(category) {
    return this.isFresh(category) && this.hasStoredMetadata(category);
  }

  invalidateSymbolCaches(symbolUpper) {
    for (const key of Object.keys(cache.data || {})) {
      if (key.startsWith('symbol_search:') || key.startsWith('symbol_metadata:')) {
        cache.del(key);
      }
    }

    cache.del('company_profile', symbolUpper);
  }

  /**
   * Get category for a single symbol from permanent storage or fetch if needed
   */
  async getSymbolCategory(symbol) {
    const symbolUpper = symbol.toUpperCase();
    if (this.inFlightLookups.has(symbolUpper)) {
      return this.inFlightLookups.get(symbolUpper);
    }

    const lookupPromise = (async () => {
      let storedCategory = null;

      try {
      // First check permanent storage
        const query = `
        SELECT * FROM symbol_categories 
        WHERE symbol = $1
      `;
        const result = await db.query(query, [symbolUpper]);
      
        if (result.rows.length > 0) {
          storedCategory = this.normalizeCategory(symbolUpper, result.rows[0]);

          if (this.shouldReuseStoredCategory(storedCategory)) {
          console.log(`[SUCCESS] Found category for ${symbol} in permanent storage`);
            return storedCategory;
          }
        }
      
      // If not found or stale, fetch from API
        console.log(`[CHECK] Fetching category for ${symbol} from API...`);
        const profile = await finnhub.getCompanyProfile(symbolUpper);
      
        if (profile) {
        // Store in permanent storage even if no industry (to avoid repeated API calls)
          await this.saveSymbolCategory(symbolUpper, profile);
          const normalizedProfile = this.normalizeCategory(symbolUpper, profile);
        
          if (this.hasStoredMetadata(normalizedProfile)) {
            return normalizedProfile;
          }

          console.log(`[WARNING] No company metadata found for ${symbol}, but profile saved to avoid re-fetching`);
        }
      
        return this.hasStoredMetadata(storedCategory) ? storedCategory : null;
      } catch (error) {
        console.error(`Error getting category for ${symbol}:`, error.message);
        return this.hasStoredMetadata(storedCategory) ? storedCategory : null;
      }
    })().finally(() => {
      this.inFlightLookups.delete(symbolUpper);
    });

    this.inFlightLookups.set(symbolUpper, lookupPromise);
    return lookupPromise;
  }

  /**
   * Save symbol category to permanent storage
   */
  async saveSymbolCategory(symbol, profile) {
    const symbolUpper = symbol.toUpperCase();
    
    try {
      const query = `
        INSERT INTO symbol_categories (
          symbol, company_name, finnhub_industry, country, currency, exchange,
          ipo_date, market_cap, phone, share_outstanding, ticker, weburl, logo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (symbol) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          finnhub_industry = EXCLUDED.finnhub_industry,
          country = EXCLUDED.country,
          currency = EXCLUDED.currency,
          exchange = EXCLUDED.exchange,
          ipo_date = EXCLUDED.ipo_date,
          market_cap = EXCLUDED.market_cap,
          phone = EXCLUDED.phone,
          share_outstanding = EXCLUDED.share_outstanding,
          ticker = EXCLUDED.ticker,
          weburl = EXCLUDED.weburl,
          logo = EXCLUDED.logo,
          updated_at = NOW()
      `;
      
      const normalizedProfile = this.normalizeCategory(symbolUpper, profile);
      const params = [
        normalizedProfile.symbol,
        normalizedProfile.company_name,
        normalizedProfile.finnhub_industry,
        normalizedProfile.country,
        normalizedProfile.currency,
        normalizedProfile.exchange,
        normalizedProfile.ipo_date,
        normalizedProfile.market_cap,
        normalizedProfile.phone,
        normalizedProfile.share_outstanding,
        normalizedProfile.ticker,
        normalizedProfile.weburl,
        normalizedProfile.logo
      ];
      
      await db.query(query, params);
      this.invalidateSymbolCaches(symbolUpper);
      console.log(`[INFO] Saved category for ${symbol} to permanent storage`);
    } catch (error) {
      console.error(`Error saving category for ${symbol}:`, error.message);
    }
  }

  /**
   * Get categories for multiple symbols efficiently
   */
  async getSymbolCategories(symbols) {
    const uniqueSymbols = [...new Set(symbols.map(s => s.toUpperCase()))];
    const results = new Map();
    const storedCategories = new Map();
    
    // First, get all categories from permanent storage
    if (uniqueSymbols.length > 0) {
      try {
        const query = `
          SELECT * FROM symbol_categories 
          WHERE symbol = ANY($1::text[])
        `;
        const storedResult = await db.query(query, [uniqueSymbols]);
        
        for (const row of storedResult.rows) {
          const normalized = this.normalizeCategory(row.symbol, row);
          storedCategories.set(normalized.symbol, normalized);
          if (this.shouldReuseStoredCategory(normalized)) {
            results.set(normalized.symbol, normalized);
          }
        }
        
        console.log(`[STATS] Found ${storedCategories.size} categories in permanent storage`);
      } catch (error) {
        console.error('Error fetching stored categories:', error.message);
      }
    }
    
    // Find symbols that need to be fetched
    const symbolsToFetch = uniqueSymbols.filter(symbol => !results.has(symbol));
    
    if (symbolsToFetch.length > 0) {
      console.log(`[PROCESS] Need to fetch ${symbolsToFetch.length} categories from API`);
      
      // Process in batches to respect rate limits
      for (let i = 0; i < symbolsToFetch.length; i += this.batchSize) {
        const batch = symbolsToFetch.slice(i, i + this.batchSize);
        
        for (const symbol of batch) {
          try {
            const category = await this.getSymbolCategory(symbol);
            if (category) {
              results.set(symbol, this.normalizeCategory(symbol, category));
            } else if (storedCategories.has(symbol) && this.hasStoredMetadata(storedCategories.get(symbol))) {
              results.set(symbol, storedCategories.get(symbol));
            }
            
            // Add delay between API calls
            if (batch.indexOf(symbol) < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2100));
            }
          } catch (error) {
            console.warn(`Failed to get category for ${symbol}:`, error.message);
          }
        }
        
        // Longer delay between batches
        if (i + this.batchSize < symbolsToFetch.length) {
          console.log(`⏳ Waiting before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    return results;
  }

  /**
   * Background process to categorize new symbols from trades
   */
  async categorizeNewSymbols(userId = null) {
    try {
      console.log('[PROCESS] Starting background symbol categorization...');
      
      // Find symbols in trades that don't have categories
      let query = `
        SELECT DISTINCT t.symbol 
        FROM trades t
        LEFT JOIN symbol_categories sc ON UPPER(t.symbol) = UPPER(sc.symbol)
        WHERE (
          sc.symbol IS NULL
          OR sc.updated_at < NOW() - INTERVAL '30 days'
          OR (
            sc.company_name IS NULL
            AND sc.logo IS NULL
            AND sc.finnhub_industry IS NULL
            AND sc.exchange IS NULL
            AND sc.weburl IS NULL
          )
        )
      `;
      
      const params = [];
      if (userId) {
        query += ' AND t.user_id = $1';
        params.push(userId);
      }
      
      query += ' LIMIT 50'; // Process up to 50 symbols at a time
      
      const result = await db.query(query, params);
      const newSymbols = result.rows.map(row => row.symbol);
      
      if (newSymbols.length === 0) {
        console.log('[SUCCESS] All symbols are categorized');
        return { processed: 0, total: 0 };
      }
      
      console.log(`[STATS] Found ${newSymbols.length} uncategorized symbols`);
      
      // Process new symbols
      let processed = 0;
      for (const symbol of newSymbols) {
        try {
          await this.getSymbolCategory(symbol);
          processed++;
          
          // Rate limit between symbols
          if (newSymbols.indexOf(symbol) < newSymbols.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2100));
          }
        } catch (error) {
          console.warn(`Failed to categorize ${symbol}:`, error.message);
        }
      }
      
      console.log(`[SUCCESS] Categorized ${processed} of ${newSymbols.length} symbols`);
      return { processed, total: newSymbols.length };
      
    } catch (error) {
      console.error('Error in background categorization:', error.message);
      return { processed: 0, total: 0, error: error.message };
    }
  }

  /**
   * Get statistics about symbol categorization
   */
  async getStats() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(DISTINCT sc.symbol) as categorized_symbols,
          COUNT(DISTINCT sc.finnhub_industry) as unique_industries,
          COUNT(DISTINCT t.symbol) as total_symbols,
          COUNT(DISTINCT CASE WHEN sc.symbol IS NULL THEN t.symbol END) as uncategorized_symbols
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      `;
      
      const result = await db.query(statsQuery);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting category stats:', error.message);
      return null;
    }
  }
}

module.exports = new SymbolCategoryManager();
