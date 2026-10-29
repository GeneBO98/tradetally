/**
 * Earnings Service
 * Handles fetching and caching earnings calendar data for the dashboard
 *
 * - Fetches earnings calendar from Finnhub for a 2-week window
 * - Caches full calendar in dashboard_earnings_cache table
 * - Serves cached data to dashboard for instant loading
 */

const db = require('../config/database');
const finnhub = require('../utils/finnhub');

const LOG_PREFIX = '[EARNINGS-SERVICE]';

class EarningsService {
  /**
   * Get the current 2-week date range used for earnings lookups
   */
  static getDateRange() {
    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { from, to };
  }

  /**
   * Get cached earnings for the current 2-week window
   */
  static async getCachedEarnings() {
    const { from, to } = this.getDateRange();

    const result = await db.query(
      `SELECT earnings_data, fetched_at
       FROM dashboard_earnings_cache
       WHERE date_from = $1 AND date_to = $2`,
      [from, to]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Enumerate YYYY-MM-DD strings from `from` to `to` inclusive (UTC).
   */
  static enumerateDays(from, to) {
    const days = [];
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 24 * 60 * 60 * 1000) {
      days.push(new Date(t).toISOString().split('T')[0]);
    }
    return days;
  }

  /**
   * Fetch the full calendar for a date window.
   *
   * Finnhub caps a single calendar response (observed at 1,500 rows, latest
   * dates first), so one request for a two-week window silently drops the
   * nearest days during earnings season. Against Finnhub we fetch one day at
   * a time and merge. Other providers (FMP) have no such cap and tighter
   * daily quotas, so they keep the single request.
   */
  static async fetchWindow(from, to) {
    if (!finnhub.isFinnhub) {
      return (await finnhub.getEarningsCalendar(from, to)) || [];
    }

    const merged = new Map();
    for (const day of this.enumerateDays(from, to)) {
      const rows = (await finnhub.getEarningsCalendar(day, day)) || [];
      for (const row of rows) {
        const key = `${String(row.symbol || '').toUpperCase()}|${row.date}`;
        if (!merged.has(key)) merged.set(key, row);
      }
    }

    return [...merged.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.symbol || '').localeCompare(String(b.symbol || ''))
    );
  }

  /**
   * Fetch earnings from the market data provider and update cache
   */
  static async fetchAndCache() {
    const { from, to } = this.getDateRange();

    try {
      const allEarnings = await this.fetchWindow(from, to);

      // Upsert into cache
      await db.query(
        `INSERT INTO dashboard_earnings_cache (date_from, date_to, earnings_data, fetched_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (date_from, date_to)
         DO UPDATE SET earnings_data = $3, fetched_at = NOW()`,
        [from, to, JSON.stringify(allEarnings)]
      );

      console.log(`${LOG_PREFIX} Cached ${allEarnings.length} earnings entries for ${from} to ${to}`);
      return allEarnings;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch earnings calendar:`, error.message);
      return null;
    }
  }

  /**
   * Get earnings for specific symbols, using cache with live fallback
   */
  static async getEarningsForSymbols(symbolList) {
    const symbolSet = new Set(symbolList.map(s => s.toUpperCase()));

    // Try cache first
    const cached = await this.getCachedEarnings();

    let allEarnings;
    if (cached) {
      allEarnings = Array.isArray(cached.earnings_data) ? cached.earnings_data : [];
    } else {
      // Fallback: fetch live and populate cache (fresh install scenario)
      if (!finnhub.isConfigured()) return [];

      console.log(`${LOG_PREFIX} Cache miss, fetching live...`);
      const fetched = await this.fetchAndCache();
      allEarnings = fetched || [];
    }

    // Filter to user's symbols
    const relevant = allEarnings.filter(earning =>
      earning.symbol && symbolSet.has(earning.symbol.toUpperCase())
    );

    // Sort by date
    relevant.sort((a, b) => new Date(a.date) - new Date(b.date));

    return relevant;
  }

  /**
   * Force refresh earnings (manual refresh)
   */
  static async refreshEarnings(symbolList) {
    if (!finnhub.isConfigured()) return [];

    const fetched = await this.fetchAndCache();
    if (!fetched) return [];

    const symbolSet = new Set(symbolList.map(s => s.toUpperCase()));
    const relevant = fetched.filter(earning =>
      earning.symbol && symbolSet.has(earning.symbol.toUpperCase())
    );

    relevant.sort((a, b) => new Date(a.date) - new Date(b.date));
    return relevant;
  }

  /**
   * Clean up old cache entries (older than 3 days)
   */
  static async cleanupOldEntries() {
    const result = await db.query(
      `DELETE FROM dashboard_earnings_cache WHERE fetched_at < NOW() - INTERVAL '3 days'`
    );
    if (result.rowCount > 0) {
      console.log(`${LOG_PREFIX} Cleaned up ${result.rowCount} stale cache entries`);
    }
  }
}

module.exports = EarningsService;
