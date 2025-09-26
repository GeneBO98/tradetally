const db = require('../config/database');
const logger = require('../utils/logger');

class GlobalEnrichmentCacheService {
    constructor() {
        this.CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours
    }

    /**
     * Get cached enrichment data for a symbol and date
     * @param {string} symbol - Stock ticker symbol
     * @param {string} tradeDate - Trade date (YYYY-MM-DD format)
     * @returns {Object|null} Cached enrichment data or null if not found
     */
    async getCachedEnrichment(symbol, tradeDate) {
        try {
            const query = `
                SELECT * FROM global_enrichment_cache
                WHERE symbol = $1 AND trade_date = $2
                AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            `;
            
            const result = await db.query(query, [symbol.toUpperCase(), tradeDate]);
            
            if (result.rows.length > 0) {
                // Update access tracking
                await this.updateAccessTracking(result.rows[0].id);
                
                logger.logImport(`Cache HIT: ${symbol} on ${tradeDate} (accessed ${result.rows[0].access_count + 1} times)`);
                return result.rows[0];
            }
            
            logger.logImport(`Cache MISS: ${symbol} on ${tradeDate}`);
            return null;
        } catch (error) {
            logger.logError('Error getting cached enrichment:', error);
            return null;
        }
    }

    /**
     * Store enrichment data in global cache
     * @param {string} symbol - Stock ticker symbol
     * @param {string} tradeDate - Trade date (YYYY-MM-DD format)
     * @param {Object} enrichmentData - Enrichment data to cache
     * @returns {string|null} Cache entry ID or null if failed
     */
    async cacheEnrichmentData(symbol, tradeDate, enrichmentData) {
        try {
            const {
                news_sentiment,
                news_count = 0,
                news_summary,
                major_news_events = [],
                market_cap,
                volume,
                avg_volume,
                volatility,
                sector,
                industry,
                data_sources = [],
                confidence_score = 100
            } = enrichmentData;

            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + this.CACHE_EXPIRY_HOURS);

            const query = `
                INSERT INTO global_enrichment_cache (
                    symbol, trade_date, news_sentiment, news_count, news_summary,
                    major_news_events, market_cap, volume, avg_volume, volatility,
                    sector, industry, data_sources, confidence_score, expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (symbol, trade_date) 
                DO UPDATE SET
                    news_sentiment = COALESCE($3, global_enrichment_cache.news_sentiment),
                    news_count = GREATEST($4, global_enrichment_cache.news_count),
                    news_summary = COALESCE($5, global_enrichment_cache.news_summary),
                    major_news_events = CASE 
                        WHEN $6::jsonb != '[]'::jsonb THEN $6::jsonb
                        ELSE global_enrichment_cache.major_news_events
                    END,
                    market_cap = COALESCE($7, global_enrichment_cache.market_cap),
                    volume = COALESCE($8, global_enrichment_cache.volume),
                    avg_volume = COALESCE($9, global_enrichment_cache.avg_volume),
                    volatility = COALESCE($10, global_enrichment_cache.volatility),
                    sector = COALESCE($11, global_enrichment_cache.sector),
                    industry = COALESCE($12, global_enrichment_cache.industry),
                    data_sources = $13::jsonb || global_enrichment_cache.data_sources,
                    confidence_score = GREATEST($14, global_enrichment_cache.confidence_score),
                    expires_at = $15,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `;

            const values = [
                symbol.toUpperCase(),
                tradeDate,
                news_sentiment,
                news_count,
                news_summary,
                JSON.stringify(major_news_events),
                market_cap,
                volume,
                avg_volume,
                volatility,
                sector,
                industry,
                JSON.stringify(data_sources),
                confidence_score,
                expiresAt
            ];

            const result = await db.query(query, values);
            const cacheId = result.rows[0].id;
            
            logger.logImport(`Cached enrichment: ${symbol} on ${tradeDate} (ID: ${cacheId.substring(0, 8)}...)`);
            return cacheId;
        } catch (error) {
            logger.logError('Error caching enrichment data:', error);
            return null;
        }
    }

    /**
     * Update access tracking for cache entry
     * @param {string} cacheId - Cache entry ID
     */
    async updateAccessTracking(cacheId) {
        try {
            await db.query(`
                UPDATE global_enrichment_cache
                SET access_count = access_count + 1,
                    last_accessed_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [cacheId]);
        } catch (error) {
            logger.logError('Error updating access tracking:', error);
        }
    }

    /**
     * Clean up expired cache entries
     * @returns {number} Number of entries deleted
     */
    async cleanupExpiredEntries() {
        try {
            const result = await db.query('SELECT cleanup_expired_global_enrichment_cache()');
            const deletedCount = result.rows[0].cleanup_expired_global_enrichment_cache;
            
            if (deletedCount > 0) {
                logger.logImport(`[CLEAN] Cleaned up ${deletedCount} expired enrichment cache entries`);
            }
            
            return deletedCount;
        } catch (error) {
            logger.logError('Error cleaning up expired cache entries:', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    async getCacheStats() {
        try {
            const query = `
                SELECT
                    COUNT(*) as total_entries,
                    COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL) as active_entries,
                    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_entries,
                    ROUND(AVG(access_count), 2) as avg_access_count,
                    MAX(access_count) as max_access_count,
                    COUNT(DISTINCT symbol) as unique_symbols,
                    MIN(created_at) as oldest_entry,
                    MAX(created_at) as newest_entry,
                    SUM(access_count) as total_cache_hits
                FROM global_enrichment_cache
            `;
            
            const result = await db.query(query);
            return result.rows[0];
        } catch (error) {
            logger.logError('Error getting cache stats:', error);
            return null;
        }
    }

    /**
     * Get enrichment data with fallback to API
     * This is the main method that services should use
     * @param {string} symbol - Stock ticker symbol
     * @param {string} tradeDate - Trade date (YYYY-MM-DD format)
     * @param {Function} apiEnrichmentFunction - Function to call if cache miss
     * @returns {Object} Enrichment data
     */
    async getEnrichmentWithFallback(symbol, tradeDate, apiEnrichmentFunction) {
        // Try cache first
        const cachedData = await this.getCachedEnrichment(symbol, tradeDate);
        if (cachedData) {
            return {
                cached: true,
                data: cachedData,
                source: 'global_cache'
            };
        }

        // Cache miss - call API
        try {
            logger.logImport(`API call required: ${symbol} on ${tradeDate}`);
            const apiData = await apiEnrichmentFunction(symbol, tradeDate);
            
            // Cache the API result for future use
            if (apiData && Object.keys(apiData).length > 0) {
                await this.cacheEnrichmentData(symbol, tradeDate, {
                    ...apiData,
                    data_sources: apiData.data_sources || ['api_enrichment']
                });
            }
            
            return {
                cached: false,
                data: apiData,
                source: 'api_call'
            };
        } catch (error) {
            logger.logError(`Error in API enrichment fallback for ${symbol}:`, error);
            return {
                cached: false,
                data: null,
                source: 'error',
                error: error.message
            };
        }
    }
}

module.exports = new GlobalEnrichmentCacheService();