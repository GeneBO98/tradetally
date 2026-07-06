// TTL memo for TierService.getUserTier results.
//
// The tier lookup is a 3-table JOIN (users + tier_overrides + subscriptions)
// that runs on nearly every market-data request, so results are cached
// briefly per (userId, hostHeader). Pattern copied from findActiveUserForAuth
// in middleware/auth.js: TTL map + in-flight promise dedup + opportunistic
// pruning on read, plus a periodic sweep.
//
// Any write that changes a user's effective tier (users.tier, tier_overrides,
// subscriptions) MUST call invalidate(userId). The short TTL (60s default)
// self-heals any missed invalidation.
//
// This lives in its own module (instead of tierService.js) so write sites can
// invalidate without a circular require (tierService requires models/User).

const SWEEP_INTERVAL_MS = 60 * 1000;

const tierCache = new Map();
const pendingTierLookups = new Map();

function getTierCacheTtlMs() {
  const parsed = parseInt(process.env.TIER_CACHE_TTL_MS || '60000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildKey(userId, hostHeader) {
  return `${userId}|${hostHeader || ''}`;
}

async function getOrLoad(userId, hostHeader, loader) {
  const ttlMs = getTierCacheTtlMs();
  if (ttlMs <= 0) {
    return loader();
  }

  const key = buildKey(userId, hostHeader);
  const now = Date.now();
  const cached = tierCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.tier;
  }

  if (cached) {
    tierCache.delete(key);
  }

  if (pendingTierLookups.has(key)) {
    return pendingTierLookups.get(key);
  }

  const lookup = Promise.resolve()
    .then(loader)
    .then((tier) => {
      // Skip caching if this entry was invalidated while the lookup was in flight
      if (pendingTierLookups.get(key) === lookup) {
        tierCache.set(key, {
          tier,
          expiresAt: Date.now() + ttlMs
        });
      }
      return tier;
    })
    .finally(() => {
      if (pendingTierLookups.get(key) === lookup) {
        pendingTierLookups.delete(key);
      }
    });

  pendingTierLookups.set(key, lookup);
  return lookup;
}

// Drop all memoized entries for a user (any hostHeader variant)
function invalidate(userId) {
  if (userId === undefined || userId === null) {
    return;
  }
  const prefix = `${userId}|`;
  for (const key of tierCache.keys()) {
    if (key.startsWith(prefix)) {
      tierCache.delete(key);
    }
  }
  for (const key of pendingTierLookups.keys()) {
    if (key.startsWith(prefix)) {
      pendingTierLookups.delete(key);
    }
  }
}

function clear() {
  tierCache.clear();
  pendingTierLookups.clear();
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of tierCache) {
    if (entry.expiresAt <= now) {
      tierCache.delete(key);
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
