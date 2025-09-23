const db = require('../config/database');
const finnhub = require('./finnhub');

class SymbolCategoryManager {
  constructor() {
    this.batchSize = 10; // Process symbols in batches
    this.updateInterval = 24 * 60 * 60 * 1000; // Update categories older than 24 hours
  }

  /**
   * Get category for a single symbol from permanent storage or fetch if needed
   */
  async getSymbolCategory(symbol) {
    const symbolUpper = symbol.toUpperCase();
    
    try {
      // First check permanent storage
      const query = `
        SELECT * FROM symbol_categories 
        WHERE symbol = $1
      `;
      const result = await db.query(query, [symbolUpper]);
      
      if (result.rows.length > 0) {
        const category = result.rows[0];
        
        // Check if data is stale (older than 30 days)
        const updatedAt = new Date(category.updated_at);
        const ageInDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        
        if (ageInDays < 30) {
          console.log(`[SUCCESS] Found category for ${symbol} in permanent storage`);
          return category;
        }
      }
      
      // If not found or stale, fetch from API
      console.log(`[CHECK] Fetching category for ${symbol} from API...`);
      const profile = await finnhub.getCompanyProfile(symbol);
      
      if (profile) {
        // Store in permanent storage even if no industry (to avoid repeated API calls)
        await this.saveSymbolCategory(symbol, profile);
        
        if (profile.finnhubIndustry) {
          return profile;
        } else {
          console.log(`[WARNING] No industry data found for ${symbol}, but profile saved to avoid re-fetching`);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting category for ${symbol}:`, error.message);
      return null;
    }
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
      
      const params = [
        symbolUpper,
        profile.name || null,
        profile.finnhubIndustry || null,
        profile.country || null,
        profile.currency || null,
        profile.exchange || null,
        profile.ipo || null,
        // Handle numeric values that might be strings or null
        profile.marketCapitalization ? parseFloat(profile.marketCapitalization) : null,
        profile.phone || null,
        profile.shareOutstanding ? parseFloat(profile.shareOutstanding) : null,
        profile.ticker || symbolUpper,
        profile.weburl || null,
        profile.logo || null
      ];
      
      await db.query(query, params);
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
    
    // First, get all categories from permanent storage
    if (uniqueSymbols.length > 0) {
      try {
        const query = `
          SELECT * FROM symbol_categories 
          WHERE symbol = ANY($1::text[])
        `;
        const storedResult = await db.query(query, [uniqueSymbols]);
        
        for (const row of storedResult.rows) {
          results.set(row.symbol, row);
        }
        
        console.log(`[STATS] Found ${results.size} categories in permanent storage`);
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
              results.set(symbol, category);
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
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        WHERE sc.symbol IS NULL
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