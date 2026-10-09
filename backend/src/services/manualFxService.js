const db = require('../config/database');
const memoryCache = require('../utils/cache');
const currencyConverter = require('../utils/currencyConverter');

const CODE = /^[A-Z]{3}$/;
const RATE_CACHE_MS = 10_000;
let rateCache = null;

async function listRates() {
  const result = await db.query('SELECT quote_code, per_usd, updated_at FROM manual_fx_rates ORDER BY quote_code');
  return result.rows;
}

async function getRateMap() {
  if (rateCache && rateCache.expires_at > Date.now()) return rateCache.rates;
  const rows = await listRates();
  const rates = Object.fromEntries(rows.map(row => [row.quote_code, Number(row.per_usd)]));
  rateCache = { rates, expires_at: Date.now() + RATE_CACHE_MS };
  return rates;
}

// Drop the in-process memo without touching the database. Exported so a
// caller that knows the table changed (and every test) can start clean.
function clearRateCache() {
  rateCache = null;
}

async function invalidate() {
  clearRateCache();
  currencyConverter.clearRateCache();
  await db.query('DELETE FROM analytics_cache');
  // Every analytics response derived from the former rate is stale. The
  // shared cache contains other read-through data, so clear it too.
  memoryCache.flush();
}

async function saveRate(code, value) {
  const quote_code = String(code || '').trim().toUpperCase();
  const per_usd = Number(value);
  if (!CODE.test(quote_code) || quote_code === 'USD') {
    const error = new Error('Choose a three-letter currency other than USD');
    error.name = 'ValidationError';
    throw error;
  }
  if (!Number.isFinite(per_usd) || per_usd <= 0 || per_usd > 1_000_000_000) {
    const error = new Error('Rate must be a positive number no greater than 1,000,000,000');
    error.name = 'ValidationError';
    throw error;
  }
  const result = await db.query(`
    INSERT INTO manual_fx_rates (quote_code, per_usd) VALUES ($1, $2)
    ON CONFLICT (quote_code) DO UPDATE SET per_usd = EXCLUDED.per_usd, updated_at = NOW()
    RETURNING quote_code, per_usd, updated_at
  `, [quote_code, per_usd]);
  await invalidate();
  return result.rows[0];
}

async function deleteRate(code) {
  const quote_code = String(code || '').trim().toUpperCase();
  if (!CODE.test(quote_code) || quote_code === 'USD') {
    const error = new Error('Invalid currency code');
    error.name = 'ValidationError';
    throw error;
  }
  const result = await db.query('DELETE FROM manual_fx_rates WHERE quote_code = $1', [quote_code]);
  if (result.rowCount) await invalidate();
  return result.rowCount > 0;
}

module.exports = { listRates, getRateMap, saveRate, deleteRate, clearRateCache };
