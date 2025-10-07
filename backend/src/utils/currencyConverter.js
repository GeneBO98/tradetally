const finnhub = require('./finnhub');

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
    // Get the exchange rate for the trade date
    const exchangeRate = await finnhub.getForexRate(fromCurrency, 'USD', date);

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
    // Get exchange rate for the trade date
    const exchangeRate = await finnhub.getForexRate(currency, 'USD', date);

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
  userHasProAccess
};
