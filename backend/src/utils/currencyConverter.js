const finnhub = require('./finnhub');

// Simple in-memory cache for Frankfurter rates (24 hour TTL)
const frankfurterCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Attribution the UI must show while a provider's keyless data is on screen.
// AllRatesToday's terms (https://allratestoday.com/terms/#attribution) require
// a visible, followable link; Frankfurter asks for nothing.
const RATE_SOURCE_ATTRIBUTION = {
  allratestoday: { name: 'AllRatesToday', url: 'https://allratestoday.com/' }
};

/**
 * Upper bound on one provider round trip (request + body read). A stalled
 * primary must fail fast enough to reach the fallback provider, and a stalled
 * fallback must fail fast enough to reach the last stored map.
 */
function providerTimeoutMs() {
  const configured = Number(process.env.FX_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10000;
}

/**
 * GET a JSON document with an abort timeout that covers both the request and
 * the response-body read. Resolves to { response, data }; `data` is null when
 * the body is not JSON. Rejects with a descriptive error on timeout.
 */
async function fetchJsonWithTimeout(url, label) {
  const controller = new AbortController();
  const timeoutMs = providerTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
    }
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

async function getDb() {
  return require('../config/database');
}

async function manualUsdRates() {
  try {
    return await require('../services/manualFxService').getRateMap();
  } catch (error) {
    // An older database may still be migrating. Provider rates remain usable.
    console.warn(`[CURRENCY] Manual rates unavailable: ${error.message}`);
    return {};
  }
}

function clearRateCache() {
  frankfurterCache.clear();
  servedRateSource.clear();
}

function manualCrossRate(rates, from, to) {
  const fromRate = from === 'USD' ? 1 : Number(rates[from]);
  const toRate = to === 'USD' ? 1 : Number(rates[to]);
  return fromRate > 0 && toRate > 0 ? toRate / fromRate : null;
}

// A lookup is "current" when the caller asked for today's rate rather than a
// specific past date. Administrator overrides only speak for the present, so
// this is the line between overriding a rate and merely falling back to one.
function isLatestLookup(date) {
  return !date || date === 'latest';
}

/**
 * Administrator overrides rebased onto `base`, or null when none are
 * configured (or the base itself has no override to rebase through).
 */
async function usableManualRateMap(base) {
  const overrides = await manualUsdRates();
  if (Object.keys(overrides).length === 0) return null;
  const rebased = Object.fromEntries(
    Object.entries({ USD: 1, ...overrides })
      .map(([quote, rate]) => [quote, rate / (base === 'USD' ? 1 : overrides[base])])
  );
  const usable = Object.values(rebased).every(rate => Number.isFinite(rate) && rate > 0);
  return usable ? { [base]: 1, ...rebased } : null;
}

/**
 * Load a persisted daily rate map (quote currency -> units per 1 base unit)
 * from fx_daily_rates. Returns null on miss or DB error.
 * @param {string} base - Base currency code
 * @param {string} rateDate - Calendar date YYYY-MM-DD (or 'latest' for today)
 */
async function loadRateMapFromDb(base, rateDate) {
  try {
    const db = await getDb();
    const date = (!rateDate || rateDate === 'latest') ? todayUTC() : rateDate;
    const result = await db.query(
      'SELECT rates, source FROM fx_daily_rates WHERE base_code = $1 AND rate_date = $2',
      [base.toUpperCase(), date]
    );
    if (result.rows.length === 0) return null;
    rememberRateSource(base, date, result.rows[0].source);
    return result.rows[0].rates;
  } catch (error) {
    console.warn(`[CURRENCY] fx_daily_rates lookup failed for ${base}@${rateDate || 'latest'}: ${error.message}`);
    return null;
  }
}

/**
 * Load the most recent stored map for a base currency, whatever its date.
 * trade_amount_usd() in SQL resolves rates this way (ORDER BY rate_date DESC),
 * so the JS side needs the same fallback or the two disagree the moment a
 * day's snapshot is missing.
 */
async function loadLatestRateMapFromDb(base) {
  try {
    const db = await getDb();
    const result = await db.query(
      `SELECT rates, rate_date, source FROM fx_daily_rates
        WHERE base_code = $1
        ORDER BY rate_date DESC
        LIMIT 1`,
      [base.toUpperCase()]
    );
    if (result.rows.length === 0) return null;
    return { rates: result.rows[0].rates, rateDate: result.rows[0].rate_date, source: result.rows[0].source || null };
  } catch (error) {
    console.warn(`[CURRENCY] fx_daily_rates latest lookup failed for ${base}: ${error.message}`);
    return null;
  }
}

// Provider behind the map currently served for each base's *current*
// lookups, so the display layer can attribute converted figures. Updated on
// every path that hands out a current map: fresh fetch, today's stored row,
// or the last stored row reused while providers are down.
const servedRateSource = new Map();

function rememberRateSource(base, rateDate, source) {
  servedRateSource.set(base.toUpperCase(), {
    source: source || null,
    rateDate: rateDate instanceof Date ? rateDate.toISOString().split('T')[0] : rateDate || null
  });
}

/**
 * Which provider's data is behind the current rate map for `base`, and the
 * attribution the UI must show for it (null when none is required).
 * Resolves the map first so the answer reflects what is actually being
 * served, including a reused last-stored map.
 * @returns {Promise<{source: string|null, rateDate: string|null, attribution: {name: string, url: string}|null}>}
 */
async function getCurrentRateSource(base = 'USD') {
  const baseUpper = String(base || 'USD').toUpperCase();
  try {
    await getRateMap(baseUpper);
  } catch (error) {
    console.warn(`[CURRENCY] Rate source lookup for ${baseUpper} has no map: ${error.message}`);
  }
  const served = servedRateSource.get(baseUpper) || { source: null, rateDate: null };
  return { ...served, attribution: RATE_SOURCE_ATTRIBUTION[served.source] || null };
}

/**
 * Persist a full daily rate map. Best-effort - never throws.
 */
async function saveRateMapToDb(base, rateDate, sourceDate, rates, source = 'frankfurter') {
  try {
    const db = await getDb();
    await db.query(
      `INSERT INTO fx_daily_rates (base_code, rate_date, source_date, rates, source)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (base_code, rate_date) DO UPDATE SET
         source_date = EXCLUDED.source_date,
         rates = EXCLUDED.rates,
         source = EXCLUDED.source,
         fetched_at = CURRENT_TIMESTAMP`,
      [base.toUpperCase(), rateDate, sourceDate || null, JSON.stringify(rates), source]
    );
  } catch (error) {
    console.warn(`[CURRENCY] fx_daily_rates persist failed for ${base}@${rateDate}: ${error.message}`);
  }
}

/**
 * Fetch a complete rate map for one base currency from Frankfurter (falling
 * back to AllRatesToday for a current lookup) and persist it in fx_daily_rates. The whole map for a day is fetched with a
 * single API call; later lookups (all pairs, all users) come from the DB.
 * @param {string} base - Base currency (e.g., 'USD')
 * @param {string} date - Date in YYYY-MM-DD format or 'latest' (optional)
 */
async function fetchAndPersistRateMap(base, date = null) {
  const baseUpper = base.toUpperCase();
  const dateParam = date || 'latest';
  const rateDate = date && date !== 'latest' ? date : todayUTC();

  const existing = await loadRateMapFromDb(baseUpper, rateDate);
  if (existing) {
    frankfurterCache.set(`map_${baseUpper}_${rateDate}`, { rates: existing, timestamp: Date.now() });
    return existing;
  }

  let data;
  let source = 'frankfurter';
  try {
    data = await fetchFrankfurterRateMap(baseUpper, dateParam);
  } catch (error) {
    // AllRatesToday publishes the same ECB table keyless, but only the
    // current one without a key, so a dated lookup stays Frankfurter-only.
    if (dateParam !== 'latest') throw error;
    console.warn(`[CURRENCY] Frankfurter failed, falling back to AllRatesToday: ${error.message}`);
    data = await fetchAllRatesTodayRateMap(baseUpper);
    source = 'allratestoday';
  }

  const rates = { [baseUpper]: 1.0, ...data.rates };
  await saveRateMapToDb(baseUpper, rateDate, data.date || null, rates, source);
  frankfurterCache.set(`map_${baseUpper}_${rateDate}`, { rates, source, timestamp: Date.now() });
  if (dateParam === 'latest') rememberRateSource(baseUpper, rateDate, source);
  console.log(`[CURRENCY] Stored ${Object.keys(rates).length} ${baseUpper} rates for ${rateDate} (source ${data.date || dateParam}, ${source})`);
  return rates;
}

/**
 * Frankfurter rate map for one base (ECB data, free, no API key).
 * @returns {Promise<{date: string|null, rates: object}>}
 */
async function fetchFrankfurterRateMap(baseUpper, dateParam) {
  const url = `https://api.frankfurter.dev/v1/${dateParam}?base=${baseUpper}`;
  console.log(`[CURRENCY] Fetching Frankfurter rate map: ${url}`);

  const { response, data } = await fetchJsonWithTimeout(url, 'Frankfurter API');
  if (!response.ok) {
    throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
  }

  if (!data || !data.rates || Object.keys(data.rates).length === 0) {
    throw new Error(`No rates available for base ${baseUpper} on ${dateParam}`);
  }
  return { date: data.date || null, rates: data.rates };
}

/**
 * AllRatesToday rate map for one base (same ECB table, free, no API key;
 * latest only). Used when Frankfurter is unreachable.
 * https://allratestoday.com/docs/
 * @returns {Promise<{date: string|null, rates: object}>}
 */
async function fetchAllRatesTodayRateMap(baseUpper) {
  const url = `https://allratestoday.com/api/open/latest/${baseUpper}`;
  console.log(`[CURRENCY] Fetching AllRatesToday rate map: ${url}`);

  const { response, data } = await fetchJsonWithTimeout(url, 'AllRatesToday API');
  if (!response.ok) {
    throw new Error(`AllRatesToday API error: ${response.status} ${response.statusText}`);
  }

  if (!data || data.error || !data.rates || Object.keys(data.rates).length === 0) {
    throw new Error(`No rates available for base ${baseUpper} on latest${data && data.error ? ` (${data.error})` : ''}`);
  }
  return { date: data.date || null, rates: data.rates };
}

/**
 * Get the daily rate map for a base currency (in-memory -> DB -> API).
 * @param {string} base
 * @param {string} date - YYYY-MM-DD or null for latest
 */
async function getRateMap(base, date = null) {
  const baseUpper = base.toUpperCase();
  const isLatest = isLatestLookup(date);
  const rateDate = isLatest ? todayUTC() : date;
  const cacheKey = `map_${baseUpper}_${rateDate}`;

  // An override states what a currency is worth NOW, so it replaces provider
  // numbers only for a current-date lookup. A dated lookup (an import
  // converting a trade from last year) must keep that day's published rate;
  // there the override is a last-resort fallback only - see getForexRate.
  const usableManualMap = isLatest ? await usableManualRateMap(baseUpper) : null;

  const cached = frankfurterCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    if (isLatest && cached.source !== undefined) rememberRateSource(baseUpper, rateDate, cached.source);
    return { ...cached.rates, ...usableManualMap };
  }

  const dbRates = await loadRateMapFromDb(baseUpper, rateDate);
  if (dbRates) {
    const served = servedRateSource.get(baseUpper);
    frankfurterCache.set(cacheKey, { rates: dbRates, source: served ? served.source : undefined, timestamp: Date.now() });
    return { ...dbRates, ...usableManualMap };
  }

  // On an offline self-hosted server, a configured override should work
  // immediately without waiting for an unreachable external endpoint.
  if (usableManualMap) return usableManualMap;

  try {
    const providerRates = await fetchAndPersistRateMap(baseUpper, date);
    return { ...providerRates, ...usableManualMap };
  } catch (error) {
    // No snapshot for this exact day and no reachable provider. For a current
    // lookup the last stored map is the honest answer - and the one SQL is
    // already using - so use it rather than switching normalization off
    // mid-payload.
    if (isLatest) {
      const latest = await loadLatestRateMapFromDb(baseUpper);
      if (latest) {
        console.warn(`[CURRENCY] Serving last stored ${baseUpper} rates from ${latest.rateDate}; ${rateDate} unavailable: ${error.message}`);
        // The reused map keeps its provider's attribution requirement.
        rememberRateSource(baseUpper, latest.rateDate, latest.source);
        return latest.rates;
      }
    }
    throw error;
  }
}

/**
 * Cross rate from a single daily USD-based map (one API call serves every
 * currency pair). Falls back to pairwise lookup when either leg is missing.
 * @param {string} from - Source currency (e.g., 'EUR')
 * @param {string} to - Target currency (e.g., 'USD')
 * @returns {Promise<number>} Exchange rate (units of `to` per 1 `from`)
 */
async function getDailyCrossRate(from, to) {
  const fromUpper = String(from || 'USD').toUpperCase();
  const toUpper = String(to || 'USD').toUpperCase();
  if (fromUpper === toUpper) return 1.0;

  try {
    const rates = await getRateMap('USD');
    const perUSDFrom = rates[fromUpper];
    const perUSDTo = rates[toUpper];
    if (perUSDFrom > 0 && perUSDTo > 0) {
      return perUSDTo / perUSDFrom;
    }
  } catch (error) {
    console.warn(`[CURRENCY] USD cross map failed for ${fromUpper}/${toUpper}: ${error.message}`);
  }

  return getForexRate(fromUpper, toUpper);
}

/**
 * Every USD-normalized aggregate that summed a native-currency trade was
 * computed at the previous day's rate, so a fresh snapshot makes the cached
 * ones stale. Installs whose trades are all USD are unaffected by the rate
 * and keep their caches.
 */
async function invalidateRateDerivedAggregates(rateDate) {
  try {
    const db = await getDb();
    const affected = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM trades
        WHERE original_currency IS NOT NULL
          AND UPPER(original_currency) <> 'USD'
          AND original_entry_price_currency IS NULL
        LIMIT 1
      ) AS has_native_rows
    `);
    if (!affected.rows[0]?.has_native_rows) return false;

    await db.query('DELETE FROM analytics_cache');
    require('./cache').flush();
    console.log(`[CURRENCY] Cleared cached aggregates for the new ${rateDate} FX snapshot`);
    return true;
  } catch (error) {
    console.warn(`[CURRENCY] Could not clear cached aggregates after the FX refresh: ${error.message}`);
    return false;
  }
}

/**
 * Warm the daily rate store (called at server boot so display conversions
 * never block on the FX API). Historical rates are fetched-and-cached
 * lazily per date and persisted the same way.
 *
 * This deliberately goes to the provider rather than through getRateMap:
 * warming the store is the point, and a configured administrator override
 * would otherwise satisfy the call without a row ever being persisted.
 * @returns {Promise<{currencies: number, rateDate: string, refreshed: boolean}>}
 */
async function refreshCurrentRates() {
  const rateDate = todayUTC();
  const existing = await loadRateMapFromDb('USD', rateDate);
  if (existing) {
    return { currencies: Object.keys(existing).length, rateDate, refreshed: false };
  }

  const rates = await fetchAndPersistRateMap('USD');
  await invalidateRateDerivedAggregates(rateDate);
  return { currencies: Object.keys(rates).length, rateDate, refreshed: true };
}

/**
 * Get forex rate from Frankfurter API (free, no API key required)
 * Uses ECB (European Central Bank) data
 * @param {string} base - Base currency (e.g., 'EUR')
 * @param {string} target - Target currency (default: 'USD')
 * @param {string} date - Date in YYYY-MM-DD format (optional)
 * @returns {Promise<number>} Exchange rate
 */
async function getForexRateFromFrankfurter(base, target = 'USD', date = null) {
  const baseUpper = base.toUpperCase();
  const targetUpper = target.toUpperCase();

  // If same currency, return 1.0
  if (baseUpper === targetUpper) {
    return 1.0;
  }

  // Format date - use 'latest' for current rates
  const dateParam = date || 'latest';
  const cacheKey = `${baseUpper}_${targetUpper}_${dateParam}`;

  // Check cache
  const cached = frankfurterCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`[CURRENCY] Using cached Frankfurter rate for ${baseUpper}/${targetUpper} on ${dateParam}: ${cached.rate}`);
    return cached.rate;
  }

  try {
    // One call fetches + persists the whole map for the day (DB-backed)
    let rates = await getRateMap(baseUpper, date);
    let rate = parseFloat(rates[targetUpper]);
    if (!Number.isFinite(rate) || rate <= 0) {
      // A manual-only map can be partial. Fetch provider rates for a pair
      // the administrator has not entered, then re-apply the override for a
      // current lookup (a dated one keeps the provider's historical rate).
      const providerRates = await fetchAndPersistRateMap(baseUpper, date);
      const manualPair = isLatestLookup(date)
        ? manualCrossRate(await manualUsdRates(), baseUpper, targetUpper)
        : null;
      rates = providerRates;
      rate = manualPair || parseFloat(rates[targetUpper]);
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`No rate available for ${baseUpper}/${targetUpper} on ${dateParam}`);
    }

    frankfurterCache.set(cacheKey, { rate, timestamp: Date.now() });
    console.log(`[CURRENCY] Frankfurter rate for ${baseUpper}/${targetUpper} on ${dateParam}: ${rate}`);
    return rate;
  } catch (error) {
    console.error(`[CURRENCY] Frankfurter API failed for ${baseUpper}/${targetUpper}: ${error.message}`);
    throw error;
  }
}

/**
 * Get forex rate with fallback - tries Finnhub first, then Frankfurter
 * @param {string} base - Base currency (e.g., 'EUR')
 * @param {string} target - Target currency (default: 'USD')
 * @param {string} date - Date in YYYY-MM-DD format (optional)
 * @returns {Promise<number>} Exchange rate
 */
async function getForexRate(base, target = 'USD', date = null) {
  const baseUpper = base.toUpperCase();
  const targetUpper = target.toUpperCase();

  // If same currency, return 1.0
  if (baseUpper === targetUpper) {
    return 1.0;
  }

  // An override replaces the provider only for a current rate. Applying it to
  // a dated lookup would rewrite history: importing a 2019 trade would bake
  // today's administrator rate into that trade's stored USD amounts forever.
  const manual = await manualUsdRates();
  if (isLatestLookup(date)) {
    const override = manualCrossRate(manual, baseUpper, targetUpper);
    if (override) return override;
  }

  // Try Finnhub first if API key is configured
  if (finnhub.apiKey) {
    try {
      const rate = await finnhub.getForexRate(baseUpper, targetUpper, date);
      return rate;
    } catch (error) {
      console.warn(`[CURRENCY] Finnhub failed, falling back to Frankfurter: ${error.message}`);
    }
  } else {
    console.log('[CURRENCY] No Finnhub API key configured, using Frankfurter');
  }

  try {
    // Fallback to Frankfurter (free, no API key required)
    return await getForexRateFromFrankfurter(baseUpper, targetUpper, date);
  } catch (error) {
    // Dated lookup on a server that cannot reach a provider: an override is
    // the only rate this install has, and it beats failing the import.
    const fallback = manualCrossRate(manual, baseUpper, targetUpper);
    if (fallback) {
      console.warn(`[CURRENCY] No provider rate for ${baseUpper}/${targetUpper} on ${date}; using the manual override`);
      return fallback;
    }
    throw error;
  }
}

/**
 * Convert monetary value from one currency to USD
 * @param {number} amount - Amount in original currency
 * @param {string} fromCurrency - Source currency code (e.g., 'EUR', 'GBP')
 * @param {string} date - Trade date in YYYY-MM-DD format
 * @returns {Promise<{amountUSD: number, exchangeRate: number}>}
 */
async function convertToUSD(amount, fromCurrency, date) {
  // If already USD, no conversion needed
  if (!fromCurrency || fromCurrency.toUpperCase() === 'USD') {
    return {
      amountUSD: amount,
      exchangeRate: 1.0
    };
  }

  try {
    // Get the exchange rate for the trade date (with Frankfurter fallback)
    const exchangeRate = await getForexRate(fromCurrency, 'USD', date);

    // Convert to USD
    const amountUSD = amount * exchangeRate;

    console.log(`[CURRENCY] Converted ${amount} ${fromCurrency} to ${amountUSD} USD (rate: ${exchangeRate}) on ${date}`);

    return {
      amountUSD,
      exchangeRate
    };
  } catch (error) {
    console.error(`[CURRENCY] Failed to convert ${fromCurrency} to USD for date ${date}:`, error.message);
    throw new Error(`Currency conversion failed: ${error.message}`);
  }
}

/**
 * Convert trade prices and monetary values to USD
 * @param {object} trade - Trade object with prices and monetary values
 * @param {string} currency - Original currency code
 * @param {string} date - Trade date in YYYY-MM-DD format
 * @returns {Promise<object>} Trade object with USD values and original currency values preserved
 */
async function convertTradeToUSD(trade, currency, date) {
  // If no currency specified or already USD, return as-is
  if (!currency || currency.toUpperCase() === 'USD') {
    return {
      ...trade,
      originalCurrency: 'USD',
      exchangeRate: 1.0
    };
  }

  try {
    // Get exchange rate for the trade date (with Frankfurter fallback)
    const exchangeRate = await getForexRate(currency, 'USD', date);

    const scale = value => {
      if (value === null || value === undefined || value === '') return value;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric * exchangeRate : value;
    };
    const scaleFields = (value, fields) => {
      if (!value || typeof value !== 'object') return value;
      const converted = { ...value };
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(converted, field)) {
          converted[field] = scale(converted[field]);
        }
      }
      return converted;
    };
    const convertExecutions = executions => Array.isArray(executions)
      ? executions.map(execution => scaleFields(execution, [
        'price', 'entryPrice', 'entry_price', 'exitPrice', 'exit_price',
        'pnl', 'p_l', 'profit_loss', 'realized_pnl', 'gross_realized_pnl',
        'commission', 'fees'
      ]))
      : executions;

    // Store original values in currency-specific fields. Execution prices and
    // costs must move with the aggregate fields because Trade.create rebuilds
    // P&L from executions before persistence.
    const convertedTrade = {
      ...trade,
      originalCurrency: currency.toUpperCase(),
      exchangeRate: exchangeRate,

      // Store original values before conversion
      originalEntryPriceCurrency: trade.entryPrice ?? null,
      originalExitPriceCurrency: trade.exitPrice ?? null,
      originalPnlCurrency: trade.pnl ?? null,
      originalCommissionCurrency: trade.commission ?? null,
      originalFeesCurrency: trade.fees ?? null,

      // Convert to USD
      entryPrice: scale(trade.entryPrice),
      exitPrice: scale(trade.exitPrice),
      pnl: scale(trade.pnl),
      commission: scale(trade.commission),
      entryCommission: scale(trade.entryCommission),
      exitCommission: scale(trade.exitCommission),
      fees: scale(trade.fees),
      mae: scale(trade.mae),
      mfe: scale(trade.mfe),
      stopLoss: scale(trade.stopLoss),
      takeProfit: scale(trade.takeProfit)
    };

    if (Array.isArray(trade.executions)) {
      convertedTrade.executions = convertExecutions(trade.executions);
    }
    if (Array.isArray(trade.executionData)) {
      convertedTrade.executionData = convertExecutions(trade.executionData);
    }

    console.log(`[CURRENCY] Converted trade to USD:`, {
      currency: currency.toUpperCase(),
      exchangeRate,
      originalEntry: trade.entryPrice,
      convertedEntry: convertedTrade.entryPrice,
      originalPnl: trade.pnl,
      convertedPnl: convertedTrade.pnl
    });

    return convertedTrade;
  } catch (error) {
    console.error(`[CURRENCY] Failed to convert trade from ${currency} to USD:`, error.message);
    throw new Error(`Currency conversion failed: ${error.message}`);
  }
}

/**
 * Check if user has pro tier access for currency conversion
 * @param {number} userId - User ID
 * @returns {Promise<boolean>}
 */
async function userHasProAccess(userId) {
  const db = require('../config/database');

  try {
    const result = await db.query(
      'SELECT tier FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const tier = result.rows[0].tier;
    return tier === 'pro' || tier === 'enterprise';
  } catch (error) {
    console.error(`Failed to check user tier for user ${userId}:`, error.message);
    return false;
  }
}

module.exports = {
  convertToUSD,
  convertTradeToUSD,
  userHasProAccess,
  getForexRate,
  getForexRateFromFrankfurter,
  getRateMap,
  getCurrentRateSource,
  getDailyCrossRate,
  refreshCurrentRates,
  clearRateCache
};
