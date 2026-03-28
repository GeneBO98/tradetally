/**
 * News Service
 * Handles fetching and caching company news for the dashboard
 *
 * - Fetches company news from Finnhub for open position symbols
 * - Caches results in dashboard_news_cache table
 * - Serves cached news to dashboard for instant loading
 */

const db = require('../config/database');
const finnhub = require('../utils/finnhub');

const LOG_PREFIX = '[NEWS-SERVICE]';

// Cache staleness threshold (1 hour)
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;

// Delay between Finnhub API calls to respect rate limits (300ms)
const API_DELAY_MS = 300;

class NewsService {
  static isUnsupportedNewsSymbol(symbol) {
    const normalized = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    if (!normalized) return true;

    // Finnhub company news is reliable for equity-style symbols, not option/futures/qualified market pairs.
    return normalized.length > 20 ||
      /\s/.test(normalized) ||
      /[:_!/]/.test(normalized) ||
      /(USDT|USDC|BUSD)$/.test(normalized) ||
      finnhub.isCryptoSymbol(normalized);
  }

  /**
   * Get all distinct symbols with open trades or in watchlists across all users
   */
  static async getAllTrackedSymbols() {
    const query = `
      SELECT DISTINCT symbol FROM (
        SELECT symbol FROM trades
        WHERE exit_price IS NULL AND symbol IS NOT NULL AND symbol != ''
        UNION
        SELECT symbol FROM watchlist_items
        WHERE symbol IS NOT NULL AND symbol != ''
      ) combined
      ORDER BY symbol
    `;

    const result = await db.query(query);
    return result.rows.map(row => row.symbol);
  }

  /**
   * Get cached news for a list of symbols
   */
  static async getCachedNews(symbols) {
    if (!symbols || symbols.length === 0) return [];

    const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      SELECT symbol, news_items, fetched_at
      FROM dashboard_news_cache
      WHERE symbol IN (${placeholders})
    `;

    const result = await db.query(query, symbols);
    return result.rows;
  }

  /**
   * Fetch news from Finnhub for a single symbol and update cache
   */
  static async fetchAndCacheSymbol(symbol) {
    try {
      if (this.isUnsupportedNewsSymbol(symbol)) {
        await db.query(
          `INSERT INTO dashboard_news_cache (symbol, news_items, fetched_at)
           VALUES ($1, '[]'::jsonb, NOW())
           ON CONFLICT (symbol)
           DO UPDATE SET news_items = '[]'::jsonb, fetched_at = NOW()`,
          [symbol]
        );
        return [];
      }

      const news = await finnhub.getCompanyNews(symbol);

      // Filter to last 7 days and limit to 5 per symbol
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const filtered = news
        .filter(item => {
          const newsDate = new Date(item.datetime * 1000);
          return newsDate >= sevenDaysAgo;
        })
        .slice(0, 5)
        .map(item => ({ ...item, symbol }));

      // Upsert into cache
      await db.query(
        `INSERT INTO dashboard_news_cache (symbol, news_items, fetched_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (symbol)
         DO UPDATE SET news_items = $2, fetched_at = NOW()`,
        [symbol, JSON.stringify(filtered)]
      );

      return filtered;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch news for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch and cache news for multiple symbols with rate limiting
   */
  static async fetchAndCacheAll(symbols) {
    let fetched = 0;
    let skipped = 0;
    let errors = 0;

    for (const symbol of symbols) {
      // Check if already cached recently
      const cached = await db.query(
        `SELECT fetched_at FROM dashboard_news_cache
         WHERE symbol = $1 AND fetched_at > NOW() - INTERVAL '1 hour'`,
        [symbol]
      );

      if (cached.rows.length > 0) {
        skipped++;
        continue;
      }

      const result = await this.fetchAndCacheSymbol(symbol);
      if (result !== null) {
        fetched++;
      } else {
        errors++;
      }

      // Rate limit delay between API calls
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
    }

    return { fetched, skipped, errors, total: symbols.length };
  }

  /**
   * Get cached news formatted for the frontend (same shape as existing endpoint)
   * Falls back to live fetch if no cache exists
   */
  static async getNewsForSymbols(symbols) {
    if (!symbols || symbols.length === 0) return [];

    const cached = await this.getCachedNews(symbols);

    // Collect all news items from cache
    const allNews = [];
    const uncachedSymbols = [];

    const cachedSymbolSet = new Set(cached.map(r => r.symbol));

    for (const row of cached) {
      const items = Array.isArray(row.news_items) ? row.news_items : [];
      allNews.push(...items);
    }

    // Find symbols not in cache
    for (const symbol of symbols) {
      if (!cachedSymbolSet.has(symbol)) {
        uncachedSymbols.push(symbol);
      }
    }

    // Fallback: fetch uncached symbols live (fresh install scenario)
    if (uncachedSymbols.length > 0 && finnhub.isConfigured()) {
      console.log(`${LOG_PREFIX} Cache miss for ${uncachedSymbols.length} symbols, fetching live...`);
      for (const symbol of uncachedSymbols) {
        const items = await this.fetchAndCacheSymbol(symbol);
        if (items) {
          allNews.push(...items);
        }
        // Rate limit
        if (uncachedSymbols.indexOf(symbol) < uncachedSymbols.length - 1) {
          await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
        }
      }
    }

    // Sort all news by datetime descending
    allNews.sort((a, b) => b.datetime - a.datetime);

    return allNews;
  }

  /**
   * Force refresh news for specific symbols (manual refresh button)
   */
  static async refreshNewsForSymbols(symbols) {
    if (!symbols || symbols.length === 0) return [];

    const allNews = [];

    for (const symbol of symbols) {
      const items = await this.fetchAndCacheSymbol(symbol);
      if (items) {
        allNews.push(...items);
      }
      // Rate limit
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
    }

    allNews.sort((a, b) => b.datetime - a.datetime);
    return allNews;
  }
}

module.exports = NewsService;
