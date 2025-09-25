const db = require('../config/database');
const logger = require('../utils/logger');

class EnrichmentCacheService {
  /**
   * Generate a cache key for a trade
   */
  generateCacheKey(symbol, entryDate, entryTime = null) {
    const date = entryDate instanceof Date ? entryDate : new Date(entryDate);
    const dateStr = date.toISOString().split('T')[0];
    
    if (entryTime) {
      const time = entryTime instanceof Date ? entryTime : new Date(`1970-01-01T${entryTime}`);
      const timeStr = time.toTimeString().substring(0, 5); // HH:MM
      return `${symbol.toLowerCase()}_${dateStr}_${timeStr}`;
    } else {
      return `${symbol.toLowerCase()}_${dateStr}`;
    }
  }

  /**
   * Store enrichment data in cache
   */
  async storeEnrichmentData(symbol, entryDate, enrichmentData, entryTime = null) {
    try {
      const cacheKey = this.generateCacheKey(symbol, entryDate, entryTime);
      
      // Set expiry time for time-sensitive data (7 days for strategy data, 1 day for market data)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (enrichmentData.strategy ? 7 : 1));
      
      const query = `
        INSERT INTO enrichment_cache (
          symbol, entry_date, entry_time, cache_key,
          strategy, strategy_confidence, classification_method, classification_signals,
          entry_price, market_cap, volume_24h, sector, industry,
          rsi_14, sma_20, sma_50, bollinger_upper, bollinger_lower,
          implied_volatility, beta,
          news_sentiment_score, news_count_24h, earnings_proximity_days,
          typical_mae_percent, typical_mfe_percent, mae_confidence,
          data_source, api_provider, expires_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20,
          $21, $22, $23,
          $24, $25, $26,
          $27, $28, $29
        )
        ON CONFLICT (cache_key) 
        DO UPDATE SET
          strategy = COALESCE(EXCLUDED.strategy, enrichment_cache.strategy),
          strategy_confidence = COALESCE(EXCLUDED.strategy_confidence, enrichment_cache.strategy_confidence),
          classification_method = COALESCE(EXCLUDED.classification_method, enrichment_cache.classification_method),
          classification_signals = COALESCE(EXCLUDED.classification_signals, enrichment_cache.classification_signals),
          entry_price = COALESCE(EXCLUDED.entry_price, enrichment_cache.entry_price),
          market_cap = COALESCE(EXCLUDED.market_cap, enrichment_cache.market_cap),
          volume_24h = COALESCE(EXCLUDED.volume_24h, enrichment_cache.volume_24h),
          sector = COALESCE(EXCLUDED.sector, enrichment_cache.sector),
          industry = COALESCE(EXCLUDED.industry, enrichment_cache.industry),
          rsi_14 = COALESCE(EXCLUDED.rsi_14, enrichment_cache.rsi_14),
          sma_20 = COALESCE(EXCLUDED.sma_20, enrichment_cache.sma_20),
          sma_50 = COALESCE(EXCLUDED.sma_50, enrichment_cache.sma_50),
          bollinger_upper = COALESCE(EXCLUDED.bollinger_upper, enrichment_cache.bollinger_upper),
          bollinger_lower = COALESCE(EXCLUDED.bollinger_lower, enrichment_cache.bollinger_lower),
          implied_volatility = COALESCE(EXCLUDED.implied_volatility, enrichment_cache.implied_volatility),
          beta = COALESCE(EXCLUDED.beta, enrichment_cache.beta),
          news_sentiment_score = COALESCE(EXCLUDED.news_sentiment_score, enrichment_cache.news_sentiment_score),
          news_count_24h = COALESCE(EXCLUDED.news_count_24h, enrichment_cache.news_count_24h),
          earnings_proximity_days = COALESCE(EXCLUDED.earnings_proximity_days, enrichment_cache.earnings_proximity_days),
          typical_mae_percent = COALESCE(EXCLUDED.typical_mae_percent, enrichment_cache.typical_mae_percent),
          typical_mfe_percent = COALESCE(EXCLUDED.typical_mfe_percent, enrichment_cache.typical_mfe_percent),
          mae_confidence = COALESCE(EXCLUDED.mae_confidence, enrichment_cache.mae_confidence),
          data_source = EXCLUDED.data_source,
          api_provider = COALESCE(EXCLUDED.api_provider, enrichment_cache.api_provider),
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP,
          last_accessed_at = CURRENT_TIMESTAMP,
          access_count = enrichment_cache.access_count + 1
        RETURNING id
      `;
      
      const values = [
        symbol.toUpperCase(),
        entryDate instanceof Date ? entryDate : new Date(entryDate),
        entryTime,
        cacheKey,
        enrichmentData.strategy || null,
        enrichmentData.strategy_confidence || null,
        enrichmentData.classification_method || null,
        enrichmentData.classification_signals ? JSON.stringify(enrichmentData.classification_signals) : null,
        enrichmentData.entry_price || null,
        enrichmentData.market_cap || null,
        enrichmentData.volume_24h || null,
        enrichmentData.sector || null,
        enrichmentData.industry || null,
        enrichmentData.rsi_14 || null,
        enrichmentData.sma_20 || null,
        enrichmentData.sma_50 || null,
        enrichmentData.bollinger_upper || null,
        enrichmentData.bollinger_lower || null,
        enrichmentData.implied_volatility || null,
        enrichmentData.beta || null,
        enrichmentData.news_sentiment_score || null,
        enrichmentData.news_count_24h || null,
        enrichmentData.earnings_proximity_days || null,
        enrichmentData.typical_mae_percent || null,
        enrichmentData.typical_mfe_percent || null,
        enrichmentData.mae_confidence || null,
        enrichmentData.data_source || 'background_job',
        enrichmentData.api_provider || 'finnhub',
        expiresAt
      ];
      
      const result = await db.query(query, values);
      logger.logImport(`Cached enrichment data for ${symbol} on ${entryDate} (cache key: ${cacheKey})`);
      
      return result.rows[0].id;
    } catch (error) {
      logger.logError(`Failed to store enrichment cache for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve enrichment data from cache
   */
  async getEnrichmentData(symbol, entryDate, entryTime = null, timeToleranceMinutes = 30) {
    try {
      let query;
      let values;
      
      if (entryTime) {
        // Look for exact match first, then within time tolerance
        query = `
          SELECT * FROM enrichment_cache
          WHERE symbol = $1 
            AND entry_date = $2
            AND (
              cache_key = $3
              OR (
                entry_time IS NOT NULL 
                AND ABS(EXTRACT(EPOCH FROM (entry_time - $4::time)) / 60) <= $5
              )
            )
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND is_valid = true
          ORDER BY 
            CASE WHEN cache_key = $3 THEN 0 ELSE 1 END,
            ABS(EXTRACT(EPOCH FROM (entry_time - $4::time)) / 60)
          LIMIT 1
        `;
        
        const cacheKey = this.generateCacheKey(symbol, entryDate, entryTime);
        let timeStr;
        if (entryTime instanceof Date) {
          timeStr = entryTime.toTimeString().substring(0, 8);
        } else if (typeof entryTime === 'string') {
          // Handle ISO string format
          if (entryTime.includes('T')) {
            timeStr = new Date(entryTime).toTimeString().substring(0, 8);
          } else {
            timeStr = entryTime.substring(0, 8);
          }
        } else {
          timeStr = entryTime;
        }
        
        values = [symbol.toUpperCase(), entryDate, cacheKey, timeStr, timeToleranceMinutes];
      } else {
        // Look for date-only match
        query = `
          SELECT * FROM enrichment_cache
          WHERE symbol = $1 
            AND entry_date = $2
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND is_valid = true
          ORDER BY created_at DESC
          LIMIT 1
        `;
        values = [symbol.toUpperCase(), entryDate];
      }
      
      const result = await db.query(query, values);
      
      if (result.rows.length > 0) {
        const cachedData = result.rows[0];
        
        // Update access tracking
        await db.query(`
          UPDATE enrichment_cache 
          SET last_accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1
          WHERE id = $1
        `, [cachedData.id]);
        
        // Parse JSON fields (only if they're strings - JSONB columns return objects directly)
        if (cachedData.classification_signals && typeof cachedData.classification_signals === 'string') {
          cachedData.classification_signals = JSON.parse(cachedData.classification_signals);
        }
        
        logger.logImport(`Retrieved cached enrichment data for ${symbol} on ${entryDate} (${cachedData.access_count + 1} total accesses)`);
        
        return cachedData;
      }
      
      return null;
    } catch (error) {
      logger.logError(`Failed to retrieve enrichment cache for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if enrichment data exists for a symbol/date combination
   */
  async hasEnrichmentData(symbol, entryDate, entryTime = null) {
    try {
      let query;
      let values;
      
      if (entryTime) {
        const cacheKey = this.generateCacheKey(symbol, entryDate, entryTime);
        query = `
          SELECT 1 FROM enrichment_cache
          WHERE cache_key = $1
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND is_valid = true
          LIMIT 1
        `;
        values = [cacheKey];
      } else {
        query = `
          SELECT 1 FROM enrichment_cache
          WHERE symbol = $1 
            AND entry_date = $2
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND is_valid = true
          LIMIT 1
        `;
        values = [symbol.toUpperCase(), entryDate];
      }
      
      const result = await db.query(query, values);
      return result.rows.length > 0;
    } catch (error) {
      logger.logError(`Failed to check enrichment cache for ${symbol}: ${error.message}`);
      return false;
    }
  }

  /**
   * Store trade-specific enrichment data from completed background jobs
   */
  async storeTradeEnrichmentData(trade, enrichmentType, enrichmentData) {
    const tradeData = {
      entry_price: trade.entry_price,
      data_source: 'trade_processing',
      api_provider: enrichmentData.api_provider || 'finnhub'
    };

    switch (enrichmentType) {
      case 'strategy_classification':
        tradeData.strategy = enrichmentData.strategy;
        tradeData.strategy_confidence = enrichmentData.confidence ? Math.round(enrichmentData.confidence * 100) : null;
        tradeData.classification_method = enrichmentData.method;
        tradeData.classification_signals = enrichmentData.signals;
        break;
        
      case 'market_data':
        tradeData.market_cap = enrichmentData.market_cap;
        tradeData.volume_24h = enrichmentData.volume_24h;
        tradeData.sector = enrichmentData.sector;
        tradeData.industry = enrichmentData.industry;
        break;
        
      case 'technical_indicators':
        tradeData.rsi_14 = enrichmentData.rsi_14;
        tradeData.sma_20 = enrichmentData.sma_20;
        tradeData.sma_50 = enrichmentData.sma_50;
        tradeData.bollinger_upper = enrichmentData.bollinger_upper;
        tradeData.bollinger_lower = enrichmentData.bollinger_lower;
        break;
        
      case 'mae_mfe_estimation':
        tradeData.typical_mae_percent = enrichmentData.typical_mae_percent;
        tradeData.typical_mfe_percent = enrichmentData.typical_mfe_percent;
        tradeData.mae_confidence = enrichmentData.confidence;
        break;
    }

    return this.storeEnrichmentData(
      trade.symbol,
      trade.entry_time || trade.created_at,
      tradeData,
      trade.entry_time ? new Date(trade.entry_time).toTimeString().substring(0, 8) : null
    );
  }

  /**
   * Apply cached enrichment data to a new trade
   */
  async applyEnrichmentDataToTrade(tradeId, symbol, entryDate, entryTime = null) {
    try {
      const cachedData = await this.getEnrichmentData(symbol, entryDate, entryTime);
      
      if (!cachedData) {
        return false;
      }

      // Apply the cached data to the trade (only update fields that exist in trades table)
      const updateQuery = `
        UPDATE trades SET
          strategy = COALESCE(strategy, $2),
          strategy_confidence = COALESCE(strategy_confidence, $3),
          classification_method = COALESCE(classification_method, $4),
          classification_metadata = COALESCE(classification_metadata, $5),
          mae = COALESCE(mae, $6),
          mfe = COALESCE(mfe, $7),
          enrichment_status = CASE 
            WHEN enrichment_status = 'pending' THEN 'completed'
            ELSE enrichment_status 
          END
        WHERE id = $1
        RETURNING *
      `;

      const metadata = {
        cached_enrichment: true,
        cache_source: cachedData.data_source,
        cache_accessed_at: new Date().toISOString(),
        original_cache_created: cachedData.created_at,
        sector: cachedData.sector, // Store sector/industry in metadata since they don't exist in trades table
        industry: cachedData.industry,
        rsi_14: cachedData.rsi_14,
        volume_24h: cachedData.volume_24h,
        news_sentiment_score: cachedData.news_sentiment_score,
        ...(cachedData.classification_signals && { signals: cachedData.classification_signals })
      };

      const values = [
        tradeId,
        cachedData.strategy,
        cachedData.strategy_confidence,
        cachedData.classification_method,
        JSON.stringify(metadata),
        cachedData.typical_mae_percent,
        cachedData.typical_mfe_percent
      ];

      const result = await db.query(updateQuery, values);
      
      if (result.rows.length > 0) {
        logger.logImport(`Applied cached enrichment data to trade ${tradeId} for ${symbol} (cache age: ${Math.round((new Date() - new Date(cachedData.created_at)) / (1000 * 60 * 60))} hours)`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.logError(`Failed to apply cached enrichment data to trade ${tradeId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredEntries() {
    try {
      const result = await db.query(`
        DELETE FROM enrichment_cache 
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `);
      
      if (result.rowCount > 0) {
        logger.logImport(`Cleaned up ${result.rowCount} expired enrichment cache entries`);
      }
      
      return result.rowCount;
    } catch (error) {
      logger.logError(`Failed to cleanup expired enrichment cache entries: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP OR expires_at IS NULL THEN 1 END) as active_entries,
          COUNT(CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 END) as expired_entries,
          COUNT(DISTINCT symbol) as unique_symbols,
          AVG(access_count) as avg_access_count,
          MAX(access_count) as max_access_count,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry
        FROM enrichment_cache
      `);
      
      return stats.rows[0];
    } catch (error) {
      logger.logError(`Failed to get enrichment cache stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Invalidate cache entries for a specific symbol (useful for major news events)
   */
  async invalidateSymbolCache(symbol, reason = 'manual_invalidation') {
    try {
      const result = await db.query(`
        UPDATE enrichment_cache 
        SET is_valid = false, 
            updated_at = CURRENT_TIMESTAMP,
            data_source = $2
        WHERE symbol = $1 AND is_valid = true
      `, [symbol.toUpperCase(), reason]);
      
      logger.logImport(`Invalidated ${result.rowCount} cache entries for ${symbol} (reason: ${reason})`);
      return result.rowCount;
    } catch (error) {
      logger.logError(`Failed to invalidate cache for ${symbol}: ${error.message}`);
      return 0;
    }
  }
}

module.exports = new EnrichmentCacheService();