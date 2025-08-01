const cache = {
  data: {},
  get(key) {
    const cachedItem = this.data[key];
    if (cachedItem && Date.now() < cachedItem.expiry) {
      return cachedItem.value;
    }
    this.del(key);
    return null;
  },
  set(key, value, ttl = 60000) { // Default TTL: 1 minute
    this.data[key] = {
      value,
      expiry: Date.now() + ttl,
    };
  },
  del(key) {
    delete this.data[key];
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