// TTL memo for User.getSettings results.
//
// user_settings is read on nearly every authenticated request path (position
// grouping, breakeven tolerance, currency, analytics preferences), each read
// paying a SELECT plus AES decryption of the encrypted key fields. A single
// analytics page load performs 12-16 such reads, so results are cached
// briefly per userId. Pattern copied from services/tierCache.js: TTL map +
// in-flight promise dedup + periodic sweep.
//
// Any write to user_settings MUST call invalidate(userId). The short TTL
// (30s default) self-heals any missed invalidation.
//
// Cached values are shared across callers, so getOrLoad returns a shallow
// clone on every hit - callers may add/replace top-level keys without
// poisoning the cache. Do not mutate nested objects on the returned value.

const SWEEP_INTERVAL_MS = 60 * 1000;

const settingsCache = new Map();
const pendingLookups = new Map();

function getSettingsCacheTtlMs() {
  const parsed = parseInt(process.env.USER_SETTINGS_CACHE_TTL_MS || '30000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cloneSettings(settings) {
  return settings ? { ...settings } : settings;
}

async function getOrLoad(userId, loader) {
  const ttlMs = getSettingsCacheTtlMs();
  if (ttlMs <= 0) {
    return loader();
  }

  const key = String(userId);
  const now = Date.now();
  const cached = settingsCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cloneSettings(cached.settings);
  }

  if (cached) {
    settingsCache.delete(key);
  }

  if (pendingLookups.has(key)) {
    return pendingLookups.get(key).then(cloneSettings);
  }

  const lookup = Promise.resolve()
    .then(loader)
    .then((settings) => {
      // Skip caching if this entry was invalidated while the lookup was in flight
      if (pendingLookups.get(key) === lookup) {
        settingsCache.set(key, {
          settings,
          expiresAt: Date.now() + ttlMs
        });
      }
      return settings;
    })
    .finally(() => {
      if (pendingLookups.get(key) === lookup) {
        pendingLookups.delete(key);
      }
    });

  pendingLookups.set(key, lookup);
  return lookup.then(cloneSettings);
}

function invalidate(userId) {
  if (userId === undefined || userId === null) {
    return;
  }
  const key = String(userId);
  settingsCache.delete(key);
  pendingLookups.delete(key);
}

function clear() {
  settingsCache.clear();
  pendingLookups.clear();
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of settingsCache) {
    if (entry.expiresAt <= now) {
      settingsCache.delete(key);
    }
  }
}

const sweepTimer = setInterval(sweepExpired, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

module.exports = {
  getOrLoad,
  invalidate,
  clear
};
