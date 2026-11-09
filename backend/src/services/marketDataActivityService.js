/**
 * Decides which users' symbols are worth polling in background market-data
 * jobs (news, price monitoring, split checks).
 *
 * Open trades are never closed for many abandoned imports, so polling every
 * open symbol forever spends most of the provider budget on accounts nobody
 * looks at. Background jobs restrict themselves to users active within the
 * window; when a user comes back, logging in (or any tracked request) puts
 * their symbols back in the set and on-demand fetches cover the gap.
 *
 * Window: MARKET_DATA_ACTIVE_USER_DAYS (0 disables the filter). The default is
 * 30 days on billed (SaaS) deployments and disabled on self-hosted installs,
 * where the user base is small and activity tracking may be turned off.
 */

const db = require('../config/database');
const TierService = require('./tierService');

const DEFAULT_ACTIVE_USER_DAYS = 30;
const CACHE_TTL_MS = 10 * 60 * 1000;
const LOG_PREFIX = '[MARKET-DATA-ACTIVITY]';

class MarketDataActivityService {
  static async getActiveUserWindowDays() {
    const raw = process.env.MARKET_DATA_ACTIVE_USER_DAYS;
    if (raw !== undefined && String(raw).trim() !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return (await TierService.isBillingEnabled()) ? DEFAULT_ACTIVE_USER_DAYS : 0;
  }

  /**
   * Set of active user ids (strings), or null when the filter is disabled or
   * cannot be evaluated. Callers treat null as "everyone is active" so a
   * failing lookup never silently stops market data.
   */
  static async getActiveUserIds() {
    const days = await this.getActiveUserWindowDays();
    if (days <= 0) return null;

    const now = Date.now();
    if (this._cache && this._cache.days === days && this._cache.expiresAt > now) {
      return this._cache.ids;
    }

    try {
      // last_login_at only moves on an explicit sign-in; users who stay signed
      // in via refresh tokens show up in user_activity_events instead.
      const result = await db.query(
        `SELECT u.id FROM users u
          WHERE u.last_login_at > NOW() - make_interval(days => $1::int)
         UNION
         SELECT DISTINCT e.user_id FROM user_activity_events e
          WHERE e.user_id IS NOT NULL
            AND e.created_at > NOW() - make_interval(days => $1::int)`,
        [days]
      );
      const ids = new Set(result.rows.map(row => String(row.id || row.user_id)));
      this._cache = { days, ids, expiresAt: now + CACHE_TTL_MS };
      return ids;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to load active users, not filtering:`, error.message);
      return null;
    }
  }

  /** Array form for SQL `user_id = ANY($n::uuid[])`; null means no filter. */
  static async getActiveUserIdArray() {
    const ids = await this.getActiveUserIds();
    return ids ? [...ids] : null;
  }

  static async filterActiveUserIds(userIds) {
    const active = await this.getActiveUserIds();
    const normalized = (userIds || []).filter(Boolean).map(String);
    if (!active) return normalized;
    return normalized.filter(id => active.has(id));
  }

  static resetCache() {
    this._cache = null;
  }
}

MarketDataActivityService._cache = null;

module.exports = MarketDataActivityService;
