const db = require('../config/database');

const RESOLUTION_TO_SECONDS = {
  '1': 60,
  '5': 5 * 60,
  '15': 15 * 60,
  '30': 30 * 60,
  '60': 60 * 60,
  '240': 4 * 60 * 60,
  D: 24 * 60 * 60
};

const RETENTION_DAYS = {
  '1': 14,
  '5': 30,
  '15': 60,
  '30': 90,
  '60': 180,
  '240': 365,
  D: 730
};

const RECENT_USE_GRACE_DAYS = 30;
const CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

let lastCleanupAt = 0;
let cleanupInFlight = null;

function normalizeResolution(resolution) {
  return String(resolution || '').toUpperCase();
}

function getBucketSeconds(resolution) {
  return RESOLUTION_TO_SECONDS[normalizeResolution(resolution)] || RESOLUTION_TO_SECONDS['5'];
}

function toTimestampDate(timestampSeconds) {
  return new Date(Number(timestampSeconds) * 1000);
}

function normalizeRangeBounds(from, to, resolution) {
  const bucketSeconds = getBucketSeconds(resolution);
  const normalizedFrom = Math.floor(Number(from) / bucketSeconds) * bucketSeconds;
  const normalizedTo = Math.ceil(Number(to) / bucketSeconds) * bucketSeconds;

  return {
    from: normalizedFrom,
    to: normalizedTo
  };
}

function buildExpectedBuckets(from, to, resolution) {
  const bucketSeconds = getBucketSeconds(resolution);
  const expectedBuckets = new Set();

  for (let ts = Number(from); ts <= Number(to); ts += bucketSeconds) {
    expectedBuckets.add(Math.floor(ts / bucketSeconds) * bucketSeconds);
  }

  return expectedBuckets;
}

async function touchRange(symbol, resolution, from, to) {
  await db.query(
    `UPDATE intraday_candle_cache
     SET last_accessed_at = CURRENT_TIMESTAMP
     WHERE symbol = $1
       AND resolution = $2
       AND candle_time BETWEEN $3 AND $4`,
    [
      symbol.toUpperCase(),
      normalizeResolution(resolution),
      toTimestampDate(from),
      toTimestampDate(to)
    ]
  );
}

async function getRange(symbol, resolution, from, to) {
  const result = await db.query(
    `SELECT candle_time, open, high, low, close, volume
     FROM intraday_candle_cache
     WHERE symbol = $1
       AND resolution = $2
       AND candle_time BETWEEN $3 AND $4
     ORDER BY candle_time ASC`,
    [
      symbol.toUpperCase(),
      normalizeResolution(resolution),
      toTimestampDate(from),
      toTimestampDate(to)
    ]
  );

  if (result.rows.length > 0) {
    await touchRange(symbol, resolution, from, to);
  }

  return result.rows.map(row => ({
    time: Math.floor(new Date(row.candle_time).getTime() / 1000),
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume) || 0
  }));
}

function hasContinuousCoverage(candles, from, to, resolution) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return false;
  }

  const expectedBuckets = buildExpectedBuckets(from, to, resolution);
  const bucketSeconds = getBucketSeconds(resolution);

  for (const candle of candles) {
    expectedBuckets.delete(Math.floor(Number(candle.time) / bucketSeconds) * bucketSeconds);
  }

  return expectedBuckets.size === 0;
}

async function getCoveredRange(symbol, resolution, from, to) {
  const candles = await getRange(symbol, resolution, from, to);
  if (!hasContinuousCoverage(candles, from, to, resolution)) {
    return null;
  }

  return candles;
}

async function insertCandles(symbol, resolution, candles, dataSource = 'unknown') {
  if (!Array.isArray(candles) || candles.length === 0) {
    return;
  }

  const values = [];
  const placeholders = [];
  let paramIndex = 1;

  for (const candle of candles) {
    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`
    );
    values.push(
      symbol.toUpperCase(),
      normalizeResolution(resolution),
      new Date(Number(candle.time) * 1000),
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume || 0,
      dataSource
    );
    paramIndex += 9;
  }

  await db.query(
    `INSERT INTO intraday_candle_cache (
       symbol, resolution, candle_time, open, high, low, close, volume, data_source
     )
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (symbol, resolution, candle_time) DO UPDATE SET
       open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume = EXCLUDED.volume,
       data_source = EXCLUDED.data_source,
       updated_at = CURRENT_TIMESTAMP,
       last_accessed_at = CURRENT_TIMESTAMP`,
    values
  );
}

async function cleanupExpiredCandles(force = false) {
  const now = Date.now();

  if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  if (cleanupInFlight) {
    return cleanupInFlight;
  }

  cleanupInFlight = (async () => {
    try {
      for (const [resolution, retentionDays] of Object.entries(RETENTION_DAYS)) {
        const result = await db.query(
          `DELETE FROM intraday_candle_cache
           WHERE resolution = $1
             AND candle_time < NOW() - ($2 || ' days')::interval
             AND last_accessed_at < NOW() - ($3 || ' days')::interval`,
          [normalizeResolution(resolution), String(retentionDays), String(RECENT_USE_GRACE_DAYS)]
        );

        if (result.rowCount > 0) {
          console.log(`[INTRADAY-CACHE] Cleaned up ${result.rowCount} ${resolution} candle rows`);
        }
      }

      lastCleanupAt = Date.now();
    } finally {
      cleanupInFlight = null;
    }
  })();

  return cleanupInFlight;
}

module.exports = {
  getRange,
  getCoveredRange,
  insertCandles,
  cleanupExpiredCandles,
  getBucketSeconds,
  normalizeRangeBounds
};
