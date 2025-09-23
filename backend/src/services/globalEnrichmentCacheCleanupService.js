const globalEnrichmentCache = require('./globalEnrichmentCacheService');
const logger = require('../utils/logger');

class GlobalEnrichmentCacheCleanupService {
    constructor() {
        this.cleanupInterval = null;
        this.CLEANUP_INTERVAL_HOURS = 6; // Run cleanup every 6 hours
    }

    /**
     * Start the cleanup service
     */
    start() {
        if (this.cleanupInterval) {
            logger.logImport('[CLEAN] Global enrichment cache cleanup service already running');
            return;
        }

        // Run initial cleanup
        this.runCleanup();

        // Schedule periodic cleanup
        const intervalMs = this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, intervalMs);

        logger.logImport(`[CLEAN] Global enrichment cache cleanup service started (runs every ${this.CLEANUP_INTERVAL_HOURS} hours)`);
    }

    /**
     * Stop the cleanup service
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.logImport('[CLEAN] Global enrichment cache cleanup service stopped');
        }
    }

    /**
     * Run cleanup process
     */
    async runCleanup() {
        try {
            logger.logImport('[CLEAN] Running global enrichment cache cleanup...');
            
            const deletedCount = await globalEnrichmentCache.cleanupExpiredEntries();
            const stats = await globalEnrichmentCache.getCacheStats();
            
            if (stats) {
                logger.logImport(`[CLEAN] Cleanup completed: ${deletedCount} expired entries removed`);
                logger.logImport(`[STATS] Cache stats: ${stats.active_entries} active entries, ${stats.total_cache_hits} total hits, ${stats.unique_symbols} symbols`);
            } else {
                logger.logImport(`[CLEAN] Cleanup completed: ${deletedCount} expired entries removed`);
            }
        } catch (error) {
            logger.logError('Error during global enrichment cache cleanup:', error);
        }
    }

    /**
     * Get cleanup service status
     */
    getStatus() {
        return {
            running: this.cleanupInterval !== null,
            intervalHours: this.CLEANUP_INTERVAL_HOURS,
            nextCleanup: this.cleanupInterval ? 
                new Date(Date.now() + this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000) : null
        };
    }
}

module.exports = new GlobalEnrichmentCacheCleanupService();