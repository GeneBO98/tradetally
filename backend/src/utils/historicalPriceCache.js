const db = require('../config/database');

/**
 * Persistent historical price cache backed by the historical_prices table.
 * Stores OHLCV daily candles so they only need to be fetched from external APIs once.
 */

/**
 * Get cached candles for a symbol within a date range.
 * @param {string} symbol
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} Array of {time, open, high, low, close, volume}
 */
async function getRange(symbol, startDate, endDate) {
  const result = await db.query(
    `SELECT price_date, open, high, low, close, volume
     FROM historical_prices
     WHERE symbol = $1 AND price_date BETWEEN $2 AND $3
     ORDER BY price_date ASC`,
    [symbol.toUpperCase(), startDate, endDate]
  );

  return result.rows.map(row => ({
    time: Math.floor(new Date(row.price_date).getTime() / 1000),
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseInt(row.volume) || 0
  }));
}

/**
 * Check if we have sufficient coverage for a date range.
 * "Sufficient" means we have at least 50% of calendar days covered,
 * accounting for weekends and holidays.
 * @param {string} symbol
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function hasRange(symbol, startDate, endDate) {
  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM historical_prices
     WHERE symbol = $1 AND price_date BETWEEN $2 AND $3`,
    [symbol.toUpperCase(), startDate, endDate]
  );

  const count = parseInt(result.rows[0].count);
  if (count === 0) return false;

  // Calculate calendar days in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const calendarDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  // Expect roughly 5/7 of calendar days to be trading days, then require 50% of that
  const expectedTradingDays = Math.max(1, Math.floor(calendarDays * 5 / 7));
  const threshold = Math.max(1, Math.floor(expectedTradingDays * 0.5));

  return count >= threshold;
}

/**
 * Bulk insert candles (immutable historical data).
 * Uses ON CONFLICT DO NOTHING since historical prices don't change.
 * @param {string} symbol
 * @param {Array} candles - Array of {time, open, high, low, close, volume}
 * @param {string} dataSource - e.g. 'alphavantage', 'finnhub'
 */
async function insertCandles(symbol, candles, dataSource) {
  if (!candles || candles.length === 0) return;

  const symbolUpper = symbol.toUpperCase();

  // Build bulk INSERT with VALUES list
  const values = [];
  const placeholders = [];
  let paramIndex = 1;

  for (const candle of candles) {
    // Convert unix timestamp to date string
    const date = new Date(candle.time * 1000);
    const dateStr = date.toISOString().split('T')[0];

    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
    );
    values.push(
      symbolUpper,
      dateStr,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume || 0,
      dataSource
    );
    paramIndex += 8;
  }

  const query = `
    INSERT INTO historical_prices (symbol, price_date, open, high, low, close, volume, data_source)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (symbol, price_date) DO NOTHING
  `;

  await db.query(query, values);
  console.log(`[PRICE-CACHE] Inserted ${candles.length} candles for ${symbolUpper} from ${dataSource}`);
}

/**
 * Upsert today's price data (live price that keeps updating throughout the day).
 * Uses ON CONFLICT DO UPDATE since today's data changes during market hours.
 * @param {string} symbol
 * @param {Object} priceData - {open, high, low, close} (any subset)
 * @param {string} dataSource - e.g. 'finnhub', 'price_monitor'
 */
async function upsertToday(symbol, priceData, dataSource) {
  const symbolUpper = symbol.toUpperCase();
  const today = new Date().toISOString().split('T')[0];

  const open = priceData.open ?? priceData.o ?? null;
  const high = priceData.high ?? priceData.h ?? null;
  const low = priceData.low ?? priceData.l ?? null;
  const close = priceData.close ?? priceData.c ?? null;
  const volume = priceData.volume ?? priceData.v ?? null;

  await db.query(
    `INSERT INTO historical_prices (symbol, price_date, open, high, low, close, volume, data_source, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (symbol, price_date) DO UPDATE SET
       open = COALESCE($3, historical_prices.open),
       high = COALESCE($4, historical_prices.high),
       low = COALESCE($5, historical_prices.low),
       close = COALESCE($6, historical_prices.close),
       volume = COALESCE($7, historical_prices.volume),
       data_source = $8,
       updated_at = CURRENT_TIMESTAMP`,
    [symbolUpper, today, open, high, low, close, volume, dataSource]
  );
}

module.exports = {
  getRange,
  hasRange,
  insertCandles,
  upsertToday
};
