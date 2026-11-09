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
const NewsNotificationService = require('./newsNotificationService');
const TierService = require('./tierService');
const MarketDataActivityService = require('./marketDataActivityService');
const { isNewsPeakWindow } = require('../utils/usMarketSchedule');

const LOG_PREFIX = '[NEWS-SERVICE]';

const HOUR_MS = 60 * 60 * 1000;

// Cache staleness threshold for user-driven refreshes (1 hour)
const CACHE_MAX_AGE_MS = HOUR_MS;

// Scheduled refresh cadence. Hourly on weekdays 06:00-20:00 ET; overnight and
// weekend headlines rarely matter to a dashboard nobody has open, so the
// scheduler only revisits symbols every few hours then. Symbols whose
// headlines did not change for QUIET_STREAK_THRESHOLD consecutive scheduled
// fetches back off further until something new appears.
const PEAK_REFRESH_MAX_AGE_MS = HOUR_MS;
const OFF_PEAK_REFRESH_MAX_AGE_MS = 4 * HOUR_MS;
const QUIET_REFRESH_MAX_AGE_MS = 6 * HOUR_MS;
const QUIET_STREAK_THRESHOLD = 3;
// The scheduler ticks hourly; without slack a symbol fetched a few seconds
// into one tick would look fresh at the matching tick N hours later and slip
// a full extra hour.
const SCHEDULE_SLACK_MS = 5 * 60 * 1000;

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
   * Get all distinct symbols with open trades or in watchlists, limited to
   * users who are currently Pro (news is a Pro feature) and recently active
   * (see MarketDataActivityService). On self-hosted installs (billing
   * disabled) every user counts as Pro and the activity filter is off.
   */
  static async getAllTrackedSymbols() {
    const query = `
      SELECT DISTINCT symbol, user_id FROM (
        SELECT symbol, user_id FROM trades
        WHERE exit_price IS NULL AND symbol IS NOT NULL AND symbol != ''
        UNION
        SELECT wi.symbol, w.user_id
        FROM watchlist_items wi
        JOIN watchlists w ON w.id = wi.watchlist_id
        WHERE wi.symbol IS NOT NULL AND wi.symbol != ''
      ) combined
      WHERE user_id IS NOT NULL
    `;

    const result = await db.query(query);
    const proUserIds = await TierService.filterProUserIds(result.rows.map(row => row.user_id));
    const eligibleUserIds = new Set(await MarketDataActivityService.filterActiveUserIds(proUserIds));
    const symbols = new Set();
    for (const row of result.rows) {
      if (eligibleUserIds.has(String(row.user_id))) {
        symbols.add(row.symbol);
      }
    }
    return [...symbols].sort();
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

    // Silent news refresh pushes are Pro-only.
    return TierService.filterProUserIds(result.rows.map(row => row.user_id));
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

      try {
        await NewsNotificationService.publishForSymbol(symbol, filtered);
      } catch (error) {
        // News remains available if notification storage is temporarily down.
        // Delivery receipts let the next fetch safely retry these articles.
        console.error(`${LOG_PREFIX} Failed to publish news notifications for ${symbol}:`, error.message);
      }

      return filtered;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch news for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch and cache news for multiple symbols with rate limiting
   */
  static async fetchAndCacheAll(symbols, options = {}) {
    let fetched = 0;
    let skipped = 0;
    let errors = 0;
    const changedSymbols = [];
    const failedSymbols = [];

    const normalized = normalizeSymbols(symbols);

    for (let index = 0; index < normalized.length; index++) {
      const symbol = normalized[index];
      const outcome = await this.refreshSymbolIfStale(symbol, options);
      if (outcome.status === 'fetched') {
        fetched++;
        if (outcome.changed) changedSymbols.push(symbol);
      } else if (outcome.status === 'skipped' || outcome.status === 'coalesced') {
        skipped++;
      } else {
        errors++;
        failedSymbols.push(symbol);
      }

      // Rate limit delay between API calls (cache hits made no provider call)
      const calledProvider = outcome.status === 'fetched' || outcome.status === 'error';
      if (calledProvider && index < normalized.length - 1) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
      }
    }

    return { fetched, skipped, errors, total: normalized.length, changedSymbols, failedSymbols };
  }

  /**
   * Maximum cache age the scheduler tolerates for a symbol right now.
   */
  static getScheduledMaxAgeMs(unchangedStreak = 0, now = new Date()) {
    const base = isNewsPeakWindow(now) ? PEAK_REFRESH_MAX_AGE_MS : OFF_PEAK_REFRESH_MAX_AGE_MS;
    if ((parseInt(unchangedStreak, 10) || 0) >= QUIET_STREAK_THRESHOLD) {
      return Math.max(base, QUIET_REFRESH_MAX_AGE_MS);
    }
    return base;
  }

  /**
   * Split tracked symbols into those due for a scheduled refresh and those
   * still fresh enough for the current time of day and headline activity.
   * One query covers every symbol instead of a freshness probe per symbol.
   */
  static async planScheduledRefresh(symbols, now = new Date()) {
    const normalized = normalizeSymbols(symbols);
    if (normalized.length === 0) return { due: [], notDue: [] };

    const result = await db.query(
      `SELECT UPPER(symbol) AS symbol, fetched_at, COALESCE(unchanged_streak, 0) AS unchanged_streak
         FROM dashboard_news_cache
        WHERE UPPER(symbol) = ANY($1::text[])`,
      [normalized]
    );
    const cacheBySymbol = new Map(result.rows.map(row => [row.symbol, row]));

    const due = [];
    const notDue = [];
    for (const symbol of normalized) {
      const row = cacheBySymbol.get(symbol);
      const fetchedAt = row?.fetched_at ? new Date(row.fetched_at).getTime() : NaN;
      if (!Number.isFinite(fetchedAt)) {
        due.push(symbol);
        continue;
      }
      const maxAgeMs = this.getScheduledMaxAgeMs(row.unchanged_streak, now);
      if (now.getTime() - fetchedAt >= maxAgeMs - SCHEDULE_SLACK_MS) {
        due.push(symbol);
      } else {
        notDue.push(symbol);
      }
    }
    return { due, notDue };
  }

  /**
   * Scheduler entry point: refresh only the symbols that are due, and track
   * how many consecutive fetches returned unchanged headlines.
   */
  static async fetchAndCacheScheduled(symbols, now = new Date()) {
    const { due, notDue } = await this.planScheduledRefresh(symbols, now);
    const summary = await this.fetchAndCacheAll(due, { maxAgeMs: 0, recordStreak: true });
    return {
      ...summary,
      skipped: summary.skipped + notDue.length,
      total: summary.total + notDue.length,
      notDue: notDue.length
    };
  }

  static async recordUnchangedStreak(symbol, changed) {
    try {
      await db.query(
        `UPDATE dashboard_news_cache
            SET unchanged_streak = CASE WHEN $2::boolean THEN 0 ELSE COALESCE(unchanged_streak, 0) + 1 END
          WHERE UPPER(symbol) = $1`,
        [symbol, Boolean(changed)]
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to record headline streak for ${symbol}:`, error.message);
    }
  }

  static async refreshSymbolIfStale(symbol, { maxAgeMs = CACHE_MAX_AGE_MS, recordStreak = false } = {}) {
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
        if (maxAgeMs > 0) {
          const cached = await db.query(
            `SELECT fetched_at, news_items FROM dashboard_news_cache
             WHERE UPPER(symbol) = $1
               AND fetched_at > NOW() - ($2::bigint * INTERVAL '1 millisecond')`,
            [normalized, maxAgeMs]
          );
          if (cached.rows.length > 0) return { status: 'skipped', changed: false };
        }

        const previous = await db.query(
          'SELECT news_items FROM dashboard_news_cache WHERE UPPER(symbol) = $1 ORDER BY fetched_at DESC LIMIT 1',
          [normalized]
        );
        const previousItems = previous.rows[0]?.news_items || [];
        const result = await this.fetchAndCacheSymbol(normalized);
        if (result === null) return { status: 'error', changed: false };
        const changed = this.newsChanged(previousItems, result);
        if (recordStreak) await this.recordUnchangedStreak(normalized, changed);
        return { status: 'fetched', changed };
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
    const staleSymbols = [];

    for (const row of cached) {
      const items = Array.isArray(row.news_items) ? row.news_items : [];
      allNews.push(...items);
      const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : NaN;
      if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_MAX_AGE_MS) {
        staleSymbols.push(row.symbol);
      }
    }

    // The scheduler skips inactive accounts and slows down off-hours, so a
    // viewer can land on old headlines. Serve them now and refresh behind the
    // response; the next load picks up the new items.
    if (staleSymbols.length > 0 && finnhub.isConfigured()) {
      this.requestBackgroundRefresh(staleSymbols, { reason: 'viewer_stale_cache' });
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
