const db = require('../config/database');

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default
    
    // Different TTLs for different data types
    this.cacheTTLs = {
      // Stock quotes - short TTL for real-time data
      'quote': 1 * 60 * 1000, // 1 minute
      
      // Company info - longer TTL as it changes rarely
      'company_profile': 24 * 60 * 60 * 1000, // 24 hours
      'company_news': 15 * 60 * 1000, // 15 minutes
      
      // Chart data - medium TTL
      'chart_intraday': 5 * 60 * 1000, // 5 minutes
      'chart_daily': 60 * 60 * 1000, // 1 hour
      
      // Earnings data - longer TTL as it's scheduled
      'earnings': 4 * 60 * 60 * 1000, // 4 hours
      
      // CUSIP resolution - very long TTL as symbols rarely change
      'cusip_resolution': 7 * 24 * 60 * 60 * 1000, // 7 days
      
      // Market news - medium TTL
      'market_news': 30 * 60 * 1000, // 30 minutes
    };
  }

  /**
   * Get cache key with prefix
   */
  getCacheKey(type, identifier) {
    return `${type}:${identifier}`;
  }

  /**
   * Get TTL for cache type
   */
  getTTL(type) {
    return this.cacheTTLs[type] || this.defaultTTL;
  }

  /**
   * Get from memory cache first, then database cache
   */
  async get(type, identifier) {
    const cacheKey = this.getCacheKey(type, identifier);
    
    // Check memory cache first
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached && this.isValid(memoryCached.timestamp, type)) {
      console.log(`Cache HIT (memory): ${cacheKey}`);
      return memoryCached.data;
    }

    // Check database cache
    try {
      const query = `
        SELECT data, created_at
        FROM api_cache
        WHERE cache_key = $1 AND expires_at > NOW()
      `;
      const result = await db.query(query, [cacheKey]);
      
      if (result.rows.length > 0) {
        const cached = result.rows[0];
        const data = cached.data;
        
        // Also cache in memory for faster access
        this.memoryCache.set(cacheKey, {
          data,
          timestamp: new Date(cached.created_at).getTime()
        });
        
        console.log(`Cache HIT (database): ${cacheKey}`);
        return data;
      }
    } catch (error) {
      console.warn(`Database cache read failed for ${cacheKey}:`, error.message);
    }

    console.log(`Cache MISS: ${cacheKey}`);
    return null;
  }

  /**
   * Set cache in both memory and database
   */
  async set(type, identifier, data) {
    const cacheKey = this.getCacheKey(type, identifier);
    const timestamp = Date.now();
    const ttl = this.getTTL(type);
    const expiresAt = new Date(timestamp + ttl);

    // Set in memory cache
    this.memoryCache.set(cacheKey, { data, timestamp });

    // Set in database cache for persistence
    try {
      const query = `
        INSERT INTO api_cache (cache_key, data, cache_type, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cache_key) 
        DO UPDATE SET 
          data = EXCLUDED.data,
          cache_type = EXCLUDED.cache_type,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
      `;
      await db.query(query, [cacheKey, JSON.stringify(data), type, expiresAt]);
      console.log(`Cache SET: ${cacheKey} (TTL: ${ttl / 1000}s)`);
    } catch (error) {
      console.warn(`Database cache write failed for ${cacheKey}:`, error.message);
    }
  }

  /**
   * Check if cached data is still valid
   */
  isValid(timestamp, type) {
    const ttl = this.getTTL(type);
    return Date.now() - timestamp < ttl;
  }

  /**
   * Invalidate cache for specific key or pattern
   */
  async invalidate(type, identifier = null) {
    if (identifier) {
      const cacheKey = this.getCacheKey(type, identifier);
      this.memoryCache.delete(cacheKey);
      
      try {
        await db.query('DELETE FROM api_cache WHERE cache_key = $1', [cacheKey]);
        console.log(`Cache INVALIDATED: ${cacheKey}`);
      } catch (error) {
        console.warn(`Cache invalidation failed for ${cacheKey}:`, error.message);
      }
    } else {
      // Invalidate all of this type
      const keysToDelete = [];
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(`${type}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.memoryCache.delete(key));

      try {
        await db.query('DELETE FROM api_cache WHERE cache_type = $1', [type]);
        console.log(`Cache INVALIDATED (all): ${type}`);
      } catch (error) {
        console.warn(`Bulk cache invalidation failed for ${type}:`, error.message);
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanup() {
    // Clean memory cache
    const now = Date.now();
    for (const [key, cached] of this.memoryCache.entries()) {
      const type = key.split(':')[0];
      if (!this.isValid(cached.timestamp, type)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean database cache
    try {
      const result = await db.query('DELETE FROM api_cache WHERE expires_at < NOW()');
      if (result.rowCount > 0) {
        console.log(`Cache cleanup: removed ${result.rowCount} expired entries`);
      }
    } catch (error) {
      console.warn('Cache cleanup failed:', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const memorySize = this.memoryCache.size;
    
    let dbSize = 0;
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM api_cache WHERE expires_at > NOW()');
      dbSize = parseInt(result.rows[0].count);
    } catch (error) {
      console.warn('Failed to get cache stats:', error.message);
    }

    return {
      memoryEntries: memorySize,
      databaseEntries: dbSize,
      cacheTTLs: this.cacheTTLs
    };
  }

  /**
   * Warm cache with commonly requested data
   */
  async warmCache(symbols = []) {
    console.log(`Warming cache for ${symbols.length} symbols...`);
    
    // This could be called during startup or periodically
    // to pre-populate cache with frequently accessed data
    for (const symbol of symbols) {
      try {
        // Only warm if not already cached
        const cached = await this.get('quote', symbol);
        if (!cached) {
          // Could trigger a background fetch here
          console.log(`Cache warming needed for quote:${symbol}`);
        }
      } catch (error) {
        console.warn(`Cache warming failed for ${symbol}:`, error.message);
      }
    }
  }
}

// Create database table for persistent cache if it doesn't exist
async function initializeCache() {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS api_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) UNIQUE NOT NULL,
        data JSONB NOT NULL,
        cache_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
      CREATE INDEX IF NOT EXISTS idx_api_cache_type ON api_cache(cache_type);
      CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);
    `;
    
    await db.query(createTableQuery);
    console.log('Cache system initialized successfully');
  } catch (error) {
    console.error('Cache initialization failed:', error.message);
    console.error('Cache will work in memory-only mode');
  }
}

// Initialize cache on module load
initializeCache();

// Periodic cleanup every hour
setInterval(() => {
  cacheManager.cleanup();
}, 60 * 60 * 1000);

const cacheManager = new CacheManager();
module.exports = cacheManager;