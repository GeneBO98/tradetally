/**
 * CUSIP Resolution Cache
 * Caches CUSIP to ticker mappings to avoid repeated database lookups
 * This significantly improves performance for symbol filtering
 */

const cache = require('./cache');

class CusipCache {
  /**
   * Get cached CUSIP mapping
   * @param {string} cusip - The CUSIP to lookup
   * @param {number} userId - The user ID for user-specific mappings
   * @returns {string|null} - The ticker symbol or null if not cached
   */
  static getCachedTicker(cusip, userId) {
    // Try user-specific cache first
    const userKey = `cusip:${userId}:${cusip}`;
    let ticker = cache.get(userKey);
    if (ticker) return ticker;

    // Try global cache
    const globalKey = `cusip:global:${cusip}`;
    return cache.get(globalKey);
  }

  /**
   * Get cached ticker to CUSIP mapping
   * @param {string} ticker - The ticker to lookup
   * @param {number} userId - The user ID for user-specific mappings
   * @returns {string|null} - The CUSIP or null if not cached
   */
  static getCachedCusip(ticker, userId) {
    // Try user-specific cache first
    const userKey = `ticker:${userId}:${ticker}`;
    let cusip = cache.get(userKey);
    if (cusip) return cusip;

    // Try global cache
    const globalKey = `ticker:global:${ticker}`;
    return cache.get(globalKey);
  }

  /**
   * Cache a CUSIP to ticker mapping
   * @param {string} cusip - The CUSIP
   * @param {string} ticker - The ticker symbol
   * @param {number|null} userId - The user ID for user-specific mappings
   */
  static cacheCusipMapping(cusip, ticker, userId = null) {
    // Cache for 24 hours as CUSIP mappings rarely change
    const ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (userId) {
      // User-specific mapping
      cache.set(`cusip:${userId}:${cusip}`, ticker, ttl);
      cache.set(`ticker:${userId}:${ticker}`, cusip, ttl);
    } else {
      // Global mapping
      cache.set(`cusip:global:${cusip}`, ticker, ttl);
      cache.set(`ticker:global:${ticker}`, cusip, ttl);
    }
  }

  /**
   * Cache multiple CUSIP mappings at once
   * @param {Array} mappings - Array of {cusip, ticker, user_id} objects
   */
  static cacheBulkMappings(mappings) {
    const ttl = 24 * 60 * 60 * 1000; // 24 hours

    mappings.forEach(mapping => {
      if (mapping.user_id) {
        cache.set(`cusip:${mapping.user_id}:${mapping.cusip}`, mapping.ticker, ttl);
        cache.set(`ticker:${mapping.user_id}:${mapping.ticker}`, mapping.cusip, ttl);
      } else {
        cache.set(`cusip:global:${mapping.cusip}`, mapping.ticker, ttl);
        cache.set(`ticker:global:${mapping.ticker}`, mapping.cusip, ttl);
      }
    });

    console.log(`[CUSIP CACHE] Cached ${mappings.length} CUSIP mappings`);
  }

  /**
   * Clear CUSIP cache for a specific user
   * @param {number} userId - The user ID
   */
  static clearUserCache(userId) {
    const cacheKeys = Object.keys(cache.data).filter(key =>
      key.startsWith(`cusip:${userId}:`) || key.startsWith(`ticker:${userId}:`)
    );

    cacheKeys.forEach(key => cache.del(key));
    console.log(`[CUSIP CACHE] Cleared ${cacheKeys.length} cached mappings for user ${userId}`);
  }

  /**
   * Pre-warm the CUSIP cache for a user by loading their mappings
   * @param {object} db - Database connection
   * @param {number} userId - The user ID
   */
  static async warmCache(db, userId) {
    try {
      const result = await db.query(`
        SELECT cusip, ticker, user_id
        FROM cusip_mappings
        WHERE user_id = $1 OR user_id IS NULL
        ORDER BY user_id DESC NULLS LAST
      `, [userId]);

      if (result.rows.length > 0) {
        this.cacheBulkMappings(result.rows);
        console.log(`[CUSIP CACHE] Pre-warmed cache with ${result.rows.length} mappings for user ${userId}`);
      }

      return result.rows.length;
    } catch (error) {
      console.error('[CUSIP CACHE] Error warming cache:', error);
      return 0;
    }
  }
}

module.exports = CusipCache;