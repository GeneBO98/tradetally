const AnalyticsCache = require('./analyticsCache');
const logger = require('../utils/logger');

class CacheCleanupService {
  
  /**
   * Clean up expired cache entries
   */
  static async cleanupExpiredEntries() {
    try {
      logger.info('Starting cache cleanup job...');
      const deletedCount = await AnalyticsCache.cleanupExpired();
      logger.info(`Cache cleanup completed: ${deletedCount} expired entries removed`);
      return deletedCount;
    } catch (error) {
      logger.logError('Cache cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  static async getCacheStats() {
    try {
      const stats = await AnalyticsCache.getStats();
      return stats;
    } catch (error) {
      logger.logError('Failed to get cache stats:', error);
      return null;
    }
  }

  /**
   * Start periodic cache cleanup (every 6 hours)
   */
  static startPeriodicCleanup() {
    const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    
    logger.info('Starting periodic cache cleanup service (every 6 hours)');
    
    // Run initial cleanup
    this.cleanupExpiredEntries();
    
    // Schedule recurring cleanup
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, CLEANUP_INTERVAL);
  }
}

module.exports = CacheCleanupService;