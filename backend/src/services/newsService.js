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

function normalizeSymbols(symbols) {
  return [...new Set((symbols || [])
    .map(symbol => String(symbol).trim().toUpperCase())
    .filter(Boolean))];
}

class NewsService {
  static newsChanged(previousItems, nextItems) {
    const previous = Array.isArray(previousItems) ? previousItems : [];
    const next = Array.isArray(nextItems) ? nextItems : [];

    if (previous.length !== next.length) return true;

    return previous.some((item, index) => {
      const candidate = next[index] || {};
      return item.id !== candidate.id ||
        item.datetime !== candidate.datetime ||
        item.headline !== candidate.headline;
    });
  }

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
   * Find users whose open positions or watchlists contain any supplied symbol.
   * The scheduler uses this to send one silent refresh per affected account,
   * rather than one push per headline or symbol.
   */
  static async getUserIdsTrackingSymbols(symbols) {
    const normalized = [...new Set((symbols || [])
      .map(symbol => String(symbol).trim().toUpperCase())
      .filter(Boolean))];
    if (normalized.length === 0) return [];

    const result = await db.query(
      `SELECT DISTINCT user_id FROM (
         SELECT t.user_id
         FROM trades t
         WHERE t.exit_price IS NULL
           AND UPPER(t.symbol) = ANY($1::text[])
         UNION
         SELECT w.user_id
         FROM watchlists w
         JOIN watchlist_items wi ON wi.watchlist_id = w.id
         WHERE UPPER(wi.symbol) = ANY($1::text[])
       ) tracked_users
       WHERE user_id IS NOT NULL`,
      [normalized]
    );

    return result.rows.map(row => row.user_id);
  }

  /**
   * Get cached news for a list of symbols
   */
  static async getCachedNews(symbols) {
    const normalized = normalizeSymbols(symbols);
    if (normalized.length === 0) return [];

    const placeholders = normalized.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      SELECT UPPER(symbol) AS symbol, news_items, fetched_at
      FROM dashboard_news_cache
      WHERE UPPER(symbol) IN (${placeholders})
    `;

    const result = await db.query(query, normalized);
    return result.rows;
  }

  /**
   * Fetch news from Finnhub for a single symbol and update cache
   */
  static async fetchAndCacheSymbol(symbol) {
    try {
      symbol = String(symbol || '').trim().toUpperCase();
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
    const changedSymbols = [];
    const failedSymbols = [];

    const normalized = normalizeSymbols(symbols);

    for (const symbol of normalized) {
      const outcome = await this.refreshSymbolIfStale(symbol);
      if (outcome.status === 'fetched') {
        fetched++;
        if (outcome.changed) changedSymbols.push(symbol);
      } else if (outcome.status === 'skipped' || outcome.status === 'coalesced') {
        skipped++;
      } else {
        errors++;
        failedSymbols.push(symbol);
      }

      // Rate limit delay between API calls
      if (normalized.indexOf(symbol) < normalized.length - 1) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
    }

    return { fetched, skipped, errors, total: normalized.length, changedSymbols, failedSymbols };
  }

  static async refreshSymbolIfStale(symbol) {
    const normalized = String(symbol || '').trim().toUpperCase();
    const existing = this._inFlightRefreshes.get(normalized);
    if (existing) {
      const outcome = await existing;
      return outcome.status === 'error'
        ? outcome
        : { status: 'coalesced', changed: false };
    }

    const refresh = (async () => {
      try {
        const cached = await db.query(
          `SELECT fetched_at, news_items FROM dashboard_news_cache
           WHERE UPPER(symbol) = $1
             AND fetched_at > NOW() - ($2::bigint * INTERVAL '1 millisecond')`,
          [normalized, CACHE_MAX_AGE_MS]
        );
        if (cached.rows.length > 0) return { status: 'skipped', changed: false };

        const previous = await db.query(
          'SELECT news_items FROM dashboard_news_cache WHERE UPPER(symbol) = $1 ORDER BY fetched_at DESC LIMIT 1',
          [normalized]
        );
        const previousItems = previous.rows[0]?.news_items || [];
        const result = await this.fetchAndCacheSymbol(normalized);
        if (result === null) return { status: 'error', changed: false };
        return {
          status: 'fetched',
          changed: this.newsChanged(previousItems, result)
        };
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed background refresh for ${normalized}:`, error.message);
        return { status: 'error', changed: false, error: error.message };
      }
    })();

    this._inFlightRefreshes.set(normalized, refresh);
    try {
      return await refresh;
    } finally {
      this._inFlightRefreshes.delete(normalized);
    }
  }

  /**
   * Queue stale widget symbols for a best-effort refresh after the current
   * HTTP response can complete. Requests are deduplicated in-process and the
   * drain uses fetchAndCacheAll's existing provider pacing.
   */
  static requestBackgroundRefresh(symbols, { reason = 'unspecified' } = {}) {
    const supported = normalizeSymbols(symbols)
      .filter(symbol => !this.isUnsupportedNewsSymbol(symbol));
    let enqueued = 0;
    let deduplicated = 0;
    for (const symbol of supported) {
      if (this._pendingBackgroundSymbols.has(symbol) || this._inFlightRefreshes.has(symbol)) {
        deduplicated++;
        continue;
      }
      this._pendingBackgroundSymbols.add(symbol);
      enqueued++;
    }

    if (enqueued > 0) {
      console.log(`${LOG_PREFIX} Queued ${enqueued} stale symbol(s) for ${reason}`);
      this._scheduleBackgroundDrain();
    }
    return { enqueued, deduplicated };
  }

  static _scheduleBackgroundDrain() {
    if (this._backgroundDrainPromise) return;
    this._backgroundDrainPromise = new Promise(resolve => setImmediate(resolve))
      .then(async () => {
        const symbols = [...this._pendingBackgroundSymbols];
        this._pendingBackgroundSymbols.clear();
        if (symbols.length === 0) return null;
        const summary = await this.fetchAndCacheAll(symbols);
        if (summary.errors > 0) {
          console.error(`${LOG_PREFIX} On-demand refresh completed with ${summary.errors} error(s)`);
        }
        return summary;
      })
      .catch(error => {
        console.error(`${LOG_PREFIX} On-demand refresh failed:`, error.message);
        return null;
      })
      .finally(() => {
        this._backgroundDrainPromise = null;
        if (this._pendingBackgroundSymbols.size > 0) this._scheduleBackgroundDrain();
      });
  }

  static async waitForBackgroundRefreshes() {
    while (this._backgroundDrainPromise) {
      await this._backgroundDrainPromise;
    }
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

NewsService._inFlightRefreshes = new Map();
NewsService._pendingBackgroundSymbols = new Set();
NewsService._backgroundDrainPromise = null;

module.exports = NewsService;
