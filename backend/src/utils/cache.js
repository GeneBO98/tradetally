// Simple in-memory cache shared by the market-data clients and controllers.
//
// Two addressing forms are supported:
//   - Namespaced: get(namespace, key) / set(namespace, key, value[, ttlMs])
//     Stored under "namespace:key". When ttlMs is omitted the TTL comes from
//     NAMESPACE_TTLS below.
//   - Direct key: get(key) / set(key, value, ttlMs) / set(key, value)
//
// Disambiguation rule for 3-argument set(): a numeric third argument means
// (key, value, ttlMs); anything else means (namespace, key, value). Callers
// caching a bare number under a namespace must pass an explicit ttlMs.
// All TTLs are in MILLISECONDS.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT_TTL = MINUTE;

// Per-namespace TTLs. These used to live only in comments next to each call
// site ("24 hour TTL for company profiles") while every namespaced set()
// silently failed to store anything — keep this map as the single source of
// truth for how long each data type stays fresh.
const NAMESPACE_TTLS = {
  quote: MINUTE,
  crypto_quote: MINUTE,
  company_profile: DAY,
  crypto_profile: DAY,
  company_news: 15 * MINUTE,
  earnings: 4 * HOUR,
  cusip_resolution: 7 * DAY,
  candles: HOUR,
  stock_candles: 5 * MINUTE,
  ticks: DAY,
  ticks_around_time: DAY,
  technical_indicator: HOUR,
  pattern_recognition: 4 * HOUR,
  support_resistance: 4 * HOUR,
  basic_financials: DAY,
  financial_statements: DAY,
  financials_reported: DAY,
  dividends: DAY,
  av_dividends: DAY,
  forex_rates: DAY,
  stock_splits: DAY,
  analyst_estimates: DAY,
  chart_intraday: 15 * MINUTE,
  chart_daily: HOUR
};

const SWEEP_INTERVAL_MS = MINUTE;

// Hard cap on stored entries. Without it the store can grow without bound
// between sweeps under symbol churn (day-long TTLs across thousands of
// symbols). When the cap is hit, expired entries are evicted first, then the
// entries closest to expiry.
const MAX_ENTRIES = 5000;

const cache = {
  data: {},

  // Timestamp of the last capacity-eviction warning (rate-limited to avoid
  // log spam when the store sits at the cap under sustained churn)
  _lastEvictionWarnAt: 0,

  get(namespaceOrKey, keyOrUndefined) {
    const actualKey = keyOrUndefined !== undefined ? `${namespaceOrKey}:${keyOrUndefined}` : namespaceOrKey;
    const cachedItem = this.data[actualKey];
    if (cachedItem && Date.now() < cachedItem.expiry) {
      return cachedItem.value;
    }
    delete this.data[actualKey];
    return null;
  },

  set(...args) {
    let actualKey, actualValue, actualTtl;

    if (args.length >= 4) {
      // (namespace, key, value, ttlMs)
      actualKey = `${args[0]}:${args[1]}`;
      actualValue = args[2];
      actualTtl = args[3];
    } else if (args.length === 3 && typeof args[2] === 'number') {
      // (key, value, ttlMs)
      actualKey = args[0];
      actualValue = args[1];
      actualTtl = args[2];
    } else if (args.length === 3) {
      // (namespace, key, value) — TTL from the namespace map
      actualKey = `${args[0]}:${args[1]}`;
      actualValue = args[2];
      actualTtl = NAMESPACE_TTLS[args[0]] || DEFAULT_TTL;
    } else {
      // (key, value)
      actualKey = args[0];
      actualValue = args[1];
      actualTtl = DEFAULT_TTL;
    }

    // Enforce the entry cap before inserting a NEW key (overwrites are free)
    if (this.data[actualKey] === undefined && Object.keys(this.data).length >= MAX_ENTRIES) {
      this.evictForCapacity();
    }

    this.data[actualKey] = {
      value: actualValue,
      expiry: Date.now() + actualTtl,
    };
  },

  // Make room for one new entry: sweep expired entries first, then evict the
  // entries with the soonest expiry until the store is below MAX_ENTRIES.
  evictForCapacity() {
    this.sweepExpired();

    const keys = Object.keys(this.data);
    const overflow = keys.length - MAX_ENTRIES + 1;
    if (overflow <= 0) {
      return;
    }

    keys.sort((a, b) => this.data[a].expiry - this.data[b].expiry);
    for (let i = 0; i < overflow; i++) {
      delete this.data[keys[i]];
    }

    const now = Date.now();
    if (now - this._lastEvictionWarnAt >= MINUTE) {
      this._lastEvictionWarnAt = now;
      console.warn(`[CACHE] Entry cap of ${MAX_ENTRIES} reached, evicting soonest-expiry entries`);
    }
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

  // Expired entries are otherwise only removed when re-read; with day-long
  // TTLs across thousands of symbols the store would grow without bound.
  sweepExpired() {
    const now = Date.now();
    for (const key of Object.keys(this.data)) {
      if (now >= this.data[key].expiry) {
        delete this.data[key];
      }
    }
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

const sweepTimer = setInterval(() => cache.sweepExpired(), SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

module.exports = cache;
