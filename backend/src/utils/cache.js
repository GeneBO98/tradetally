const cache = {
  data: {},
  
  // Support both namespace-based and direct key access
  get(namespaceOrKey, keyOrUndefined) {
    const actualKey = keyOrUndefined !== undefined ? `${namespaceOrKey}:${keyOrUndefined}` : namespaceOrKey;
    const cachedItem = this.data[actualKey];
    if (cachedItem && Date.now() < cachedItem.expiry) {
      return cachedItem.value;
    }
    this.del(actualKey);
    return null;
  },
  
  // Support both namespace-based and direct key access
  set(namespaceOrKey, keyOrValue, valueOrTtl, ttlOrUndefined) {
    let actualKey, actualValue, actualTtl;
    
    if (ttlOrUndefined !== undefined) {
      // 4 parameters: namespace, key, value, ttl
      actualKey = `${namespaceOrKey}:${keyOrValue}`;
      actualValue = valueOrTtl;
      actualTtl = ttlOrUndefined;
    } else if (typeof valueOrTtl === 'number') {
      // 3 parameters: key, value, ttl
      actualKey = namespaceOrKey;
      actualValue = keyOrValue;
      actualTtl = valueOrTtl;
    } else {
      // 2 parameters: key, value (use default TTL)
      actualKey = namespaceOrKey;
      actualValue = keyOrValue;
      actualTtl = 60000; // Default TTL: 1 minute
    }
    
    this.data[actualKey] = {
      value: actualValue,
      expiry: Date.now() + actualTtl,
    };
  },
  // Get cached value even if expired (for stale-while-revalidate pattern)
  getStale(namespaceOrKey, keyOrUndefined) {
    const actualKey = keyOrUndefined !== undefined ? `${namespaceOrKey}:${keyOrUndefined}` : namespaceOrKey;
    const cachedItem = this.data[actualKey];
    if (!cachedItem) return { value: null, stale: false };
    const isStale = Date.now() >= cachedItem.expiry;
    return { value: cachedItem.value, stale: isStale };
  },
  del(namespaceOrKey, keyOrUndefined) {
    const actualKey = keyOrUndefined !== undefined ? `${namespaceOrKey}:${keyOrUndefined}` : namespaceOrKey;
    delete this.data[actualKey];
  },
  invalidate(namespaceOrKey, keyOrUndefined) {
    this.del(namespaceOrKey, keyOrUndefined);
  },
  flush() {
    this.data = {};
  },
  async getStats() {
    return {
      memoryEntries: Object.keys(this.data).length,
      databaseEntries: 0, // This is a simple in-memory cache, no database
      totalSize: Object.keys(this.data).reduce((size, key) => {
        return size + JSON.stringify(this.data[key]).length;
      }, 0)
    };
  },
};

module.exports = cache;
