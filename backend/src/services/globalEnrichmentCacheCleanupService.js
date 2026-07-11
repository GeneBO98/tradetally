const IntervalScheduler = require('./schedulers/IntervalScheduler');
const globalEnrichmentCache = require('./globalEnrichmentCacheService');
const logger = require('../utils/logger');

const CLEANUP_INTERVAL_HOURS = 6; // Run cleanup every 6 hours

class GlobalEnrichmentCacheCleanupService extends IntervalScheduler {
    constructor() {
        super({
            intervalMs: CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000,
            guardRestart: true,
            useRunningGuard: false,
            stopLogAlways: false,
            log: (message) => logger.logImport(message),
            messages: {
                alreadyStarted: '[CLEAN] Global enrichment cache cleanup service already running',
                started: `[CLEAN] Global enrichment cache cleanup service started (runs every ${CLEANUP_INTERVAL_HOURS} hours)`,
                stopped: '[CLEAN] Global enrichment cache cleanup service stopped'
            }
        });
        this.CLEANUP_INTERVAL_HOURS = CLEANUP_INTERVAL_HOURS;
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

    async execute() {
        return this.runCleanup();
    }

    /**
     * Get cleanup service status
     */
    getStatus() {
        return {
            running: this.interval !== null,
            intervalHours: this.CLEANUP_INTERVAL_HOURS,
            nextCleanup: this.interval ?
                new Date(Date.now() + this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000) : null
        };
    }
}

module.exports = new GlobalEnrichmentCacheCleanupService();
