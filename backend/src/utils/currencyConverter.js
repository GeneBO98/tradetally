const finnhub = require('./finnhub');

// Simple in-memory cache for Frankfurter rates (24 hour TTL)
const frankfurterCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
    // Frankfurter API: https://api.frankfurter.dev/v1/{date}?base=EUR&symbols=USD
    const url = `https://api.frankfurter.dev/v1/${dateParam}?base=${baseUpper}&symbols=${targetUpper}`;
    console.log(`[CURRENCY] Fetching Frankfurter rate: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Response format: { amount: 1, base: "EUR", date: "2024-01-15", rates: { USD: 1.0876 } }
    if (!data || !data.rates || !data.rates[targetUpper]) {
      throw new Error(`No rate available for ${baseUpper}/${targetUpper} on ${dateParam}`);
    }

    const rate = parseFloat(data.rates[targetUpper]);

    // Cache the result
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

  // Fallback to Frankfurter (free, no API key required)
  return getForexRateFromFrankfurter(baseUpper, targetUpper, date);
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

    // Store original values in currency-specific fields
    const convertedTrade = {
      ...trade,
      originalCurrency: currency.toUpperCase(),
      exchangeRate: exchangeRate,

      // Store original values before conversion
      originalEntryPriceCurrency: trade.entryPrice || null,
      originalExitPriceCurrency: trade.exitPrice || null,
      originalPnlCurrency: trade.pnl || null,
      originalCommissionCurrency: trade.commission || null,
      originalFeesCurrency: trade.fees || null,

      // Convert to USD
      entryPrice: trade.entryPrice ? trade.entryPrice * exchangeRate : null,
      exitPrice: trade.exitPrice ? trade.exitPrice * exchangeRate : null,
      pnl: trade.pnl ? trade.pnl * exchangeRate : null,
      commission: trade.commission ? trade.commission * exchangeRate : null,
      fees: trade.fees ? trade.fees * exchangeRate : null
    };

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
  getForexRateFromFrankfurter
};
