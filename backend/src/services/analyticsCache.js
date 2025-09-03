const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class AnalyticsCache {
  
  /**
   * Get cached analytics data
   * @param {string} userId - User ID
   * @param {string} cacheKey - Cache key identifier
   * @returns {Object|null} Cached data or null if not found/expired
   */
  static async get(userId, cacheKey) {
    try {
      const query = `
        SELECT data, expires_at
        FROM analytics_cache
        WHERE user_id = $1 AND cache_key = $2 AND expires_at > CURRENT_TIMESTAMP
      `;
      
      const result = await db.query(query, [userId, cacheKey]);
      
      if (result.rows.length > 0) {
        logger.logDebug(`Cache hit for ${cacheKey} (user: ${userId})`);
        return result.rows[0].data;
      }
      
      logger.logDebug(`Cache miss for ${cacheKey} (user: ${userId})`);
      return null;
    } catch (error) {
      logger.logError(`Error getting cached data for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Set cached analytics data
   * @param {string} userId - User ID
   * @param {string} cacheKey - Cache key identifier
   * @param {Object} data - Data to cache
   * @param {number} ttlMinutes - Time to live in minutes (default: 60)
   */
  static async set(userId, cacheKey, data, ttlMinutes = 60) {
    try {
      const expiresAt = new Date(Date.now() + (ttlMinutes * 60 * 1000));
      
      const query = `
        INSERT INTO analytics_cache (id, user_id, cache_key, data, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, cache_key) 
        DO UPDATE SET 
          data = $4,
          expires_at = $5,
          created_at = CURRENT_TIMESTAMP
      `;
      
      await db.query(query, [uuidv4(), userId, cacheKey, JSON.stringify(data), expiresAt]);
      logger.logDebug(`Cached ${cacheKey} for user ${userId} (expires: ${expiresAt.toISOString()})`);
    } catch (error) {
      logger.logError(`Error caching data for ${cacheKey}:`, error);
    }
  }

  /**
   * Delete cached data
   * @param {string} userId - User ID
   * @param {string} cacheKey - Cache key identifier (optional, deletes all user data if not provided)
   */
  static async delete(userId, cacheKey = null) {
    try {
      let query, params;
      
      if (cacheKey) {
        query = 'DELETE FROM analytics_cache WHERE user_id = $1 AND cache_key = $2';
        params = [userId, cacheKey];
      } else {
        query = 'DELETE FROM analytics_cache WHERE user_id = $1';
        params = [userId];
      }
      
      const result = await db.query(query, params);
      logger.logDebug(`Deleted ${result.rowCount} cache entries for user ${userId}${cacheKey ? ` (key: ${cacheKey})` : ''}`);
    } catch (error) {
      logger.logError(`Error deleting cached data:`, error);
    }
  }

  /**
   * Clean up expired cache entries
   */
  static async cleanupExpired() {
    try {
      const query = 'DELETE FROM analytics_cache WHERE expires_at <= CURRENT_TIMESTAMP';
      const result = await db.query(query);
      logger.logInfo(`Cleaned up ${result.rowCount} expired cache entries`);
      return result.rowCount;
    } catch (error) {
      logger.logError('Error cleaning up expired cache entries:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @param {string} userId - User ID (optional)
   */
  static async getStats(userId = null) {
    try {
      let query, params = [];
      
      if (userId) {
        query = `
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_entries,
            COUNT(CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 END) as expired_entries,
            MIN(created_at) as oldest_entry,
            MAX(created_at) as newest_entry
          FROM analytics_cache
          WHERE user_id = $1
        `;
        params = [userId];
      } else {
        query = `
          SELECT 
            COUNT(*) as total_entries,
            COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as active_entries,
            COUNT(CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 END) as expired_entries,
            COUNT(DISTINCT user_id) as unique_users,
            MIN(created_at) as oldest_entry,
            MAX(created_at) as newest_entry
          FROM analytics_cache
        `;
      }
      
      const result = await db.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.logError('Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Generate cache key for behavioral analytics
   */
  static generateKey(analysisType, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((obj, key) => {
        obj[key] = params[key];
        return obj;
      }, {});
    
    const paramString = Object.keys(sortedParams).length > 0 
      ? '_' + Object.entries(sortedParams).map(([k, v]) => `${k}:${v}`).join('_')
      : '';
    
    return `${analysisType}${paramString}`;
  }

  /**
   * Invalidate cache when user data changes (call after trade import, deletion, etc.)
   */
  static async invalidateUserCache(userId, specificTypes = null) {
    try {
      if (specificTypes && Array.isArray(specificTypes)) {
        // Delete specific analysis types
        for (const type of specificTypes) {
          const query = `
            DELETE FROM analytics_cache 
            WHERE user_id = $1 AND cache_key LIKE $2
          `;
          await db.query(query, [userId, `${type}%`]);
        }
        logger.logDebug(`Invalidated cache for user ${userId} (types: ${specificTypes.join(', ')})`);
      } else {
        // Delete all user cache
        await this.delete(userId);
        logger.logDebug(`Invalidated all cache for user ${userId}`);
      }
    } catch (error) {
      logger.logError(`Error invalidating cache for user ${userId}:`, error);
    }
  }

  /**
   * Check if analysis needs refresh based on last trade timestamp
   */
  static async shouldRefreshAnalysis(userId, analysisType, lastTradeTime) {
    try {
      const cacheKey = this.generateKey(analysisType);
      const query = `
        SELECT created_at, expires_at
        FROM analytics_cache
        WHERE user_id = $1 AND cache_key = $2
      `;
      
      const result = await db.query(query, [userId, cacheKey]);
      
      if (result.rows.length === 0) {
        return true; // No cache exists
      }
      
      const cacheCreated = new Date(result.rows[0].created_at);
      const cacheExpires = new Date(result.rows[0].expires_at);
      const lastTrade = new Date(lastTradeTime);
      
      // Refresh if cache expired or if there are newer trades than cache
      return Date.now() > cacheExpires.getTime() || lastTrade > cacheCreated;
    } catch (error) {
      logger.logError(`Error checking cache refresh for ${analysisType}:`, error);
      return true; // Default to refresh on error
    }
  }
}

module.exports = AnalyticsCache;