const db = require('../config/database');

/**
 * Persistent cross-user cache for Finnhub candle responses, backed by the
 * finnhub_candle_cache table (migration 188). Sample-data signups and any
 * other repeat callers that hit the same (symbol, resolution, from, to)
 * range read from this cache instead of re-calling the Finnhub API.
 *
 * Historical bars don't change once a trading day closes, so cached entries
 * live indefinitely. We avoid caching responses that include "today" so a
 * partially-formed bar doesn't get pinned.
 */

async function get(symbol, resolution, fromTs, toTs) {
  const result = await db.query(
    `SELECT payload
       FROM finnhub_candle_cache
       WHERE symbol = $1 AND resolution = $2 AND from_ts = $3 AND to_ts = $4`,
    [symbol.toUpperCase(), resolution, Math.floor(fromTs), Math.floor(toTs)]
  );
  return result.rows[0]?.payload || null;
}

async function set(symbol, resolution, fromTs, toTs, payload) {
  // Skip caching if the requested window includes today — the latest bar
  // can still update during/after market hours.
  const nowSec = Math.floor(Date.now() / 1000);
  if (toTs >= nowSec - 3600) return;

  try {
    await db.query(
      `INSERT INTO finnhub_candle_cache (symbol, resolution, from_ts, to_ts, payload, fetched_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (symbol, resolution, from_ts, to_ts)
         DO UPDATE SET payload = EXCLUDED.payload, fetched_at = CURRENT_TIMESTAMP`,
      [symbol.toUpperCase(), resolution, Math.floor(fromTs), Math.floor(toTs), JSON.stringify(payload)]
    );
  } catch (err) {
    // Don't break callers if the cache write fails (e.g., migration not
    // applied yet on this instance).
    console.warn(`[CANDLE-STORE] Failed to persist cache for ${symbol}:`, err.message);
  }
}

/**
 * Generic persistent cache for any Finnhub endpoint that returns
 * effectively-immutable historical data. Backed by finnhub_response_cache
 * (migration 189).
 *
 *   endpoint - short namespace (e.g. 'company_profile', 'company_news')
 *   key      - stable string built from the endpoint's parameters
 *   payload  - the full response to cache
 *   ttlMs    - optional. Pass null for "live forever" (use only when the
 *              response can never change retroactively).
 */
async function getResponse(endpoint, key) {
  const result = await db.query(
    `SELECT payload, expires_at
       FROM finnhub_response_cache
       WHERE endpoint = $1 AND cache_key = $2`,
    [endpoint, key]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    // Lazily evict expired rows.
    db.query(
      `DELETE FROM finnhub_response_cache WHERE endpoint = $1 AND cache_key = $2`,
      [endpoint, key]
    ).catch(() => {});
    return null;
  }
  return row.payload;
}

async function setResponse(endpoint, key, payload, ttlMs = null) {
  const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
  try {
    await db.query(
      `INSERT INTO finnhub_response_cache (endpoint, cache_key, payload, fetched_at, expires_at)
         VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP, $4)
         ON CONFLICT (endpoint, cache_key)
         DO UPDATE SET payload = EXCLUDED.payload,
                       fetched_at = CURRENT_TIMESTAMP,
                       expires_at = EXCLUDED.expires_at`,
      [endpoint, key, JSON.stringify(payload), expiresAt]
    );
  } catch (err) {
    console.warn(`[FINNHUB-CACHE] Failed to persist ${endpoint}:${key}:`, err.message);
  }
}

module.exports = { get, set, getResponse, setResponse };
