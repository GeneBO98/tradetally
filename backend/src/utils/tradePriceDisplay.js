const { tradeBaseCurrency } = require('./tradeFx');

const PRICE_FIELDS = {
  entry_price: 'entryPrice',
  exit_price: 'exitPrice',
  stop_loss: 'stopLoss',
  take_profit: 'takeProfit',
  strike_price: 'strikePrice',
  current_price: 'currentPrice',
  price: 'price'
};

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Preserve quote prices before the response's money fields are converted.
 * Calculations continue using the existing, consistently denominated fields;
 * native_prices is a display-only snapshot and must never be FX-scaled again.
 */
function attachNativeTradePrices(row) {
  const base = tradeBaseCurrency(row);
  const original = String(row.original_currency || row.originalCurrency || base).toUpperCase();
  let native_rate = 1;
  let price_currency = base;
  if (base !== original) {
    // Imported trades were rewritten to USD at their historical rate. Undo
    // that conversion, rather than using today's FX rate to recover prices.
    const exchange_rate = positiveNumber(row.exchange_rate ?? row.exchangeRate);
    const original_entry = positiveNumber(row.original_entry_price_currency ?? row.originalEntryPriceCurrency);
    const stored_entry = positiveNumber(row.entry_price ?? row.entryPrice);
    const recovered_rate = exchange_rate ? 1 / exchange_rate
      : (original_entry && stored_entry ? original_entry / stored_entry : null);
    if (recovered_rate) {
      native_rate = recovered_rate;
      price_currency = original;
    }
  }

  const snapshot = (source, price_rate = native_rate, execution = false) => {
    const prices = {};
    for (const [field, legacy] of Object.entries(PRICE_FIELDS)) {
      const value = source[field] ?? source[legacy];
      if (value === undefined) continue;
      // convertTradeToUSD rewrites aggregate stops/targets and execution
      // fill prices, but leaves strikes and per-execution stops/targets in
      // the original currency. Do not undo an FX conversion they never had.
      const field_rate = field === 'strike_price'
        || (execution && (field === 'stop_loss' || field === 'take_profit')) ? 1 : price_rate;
      prices[field] = value === null || value === '' ? value
        : (Number.isFinite(Number(value)) ? Number(value) * field_rate : value);
    }
    for (const [field, legacy] of [['executions', 'executions'], ['take_profit_targets', 'takeProfitTargets']]) {
      const children = source[field] ?? source[legacy];
      if (Array.isArray(children)) {
        // Target arrays are also preserved in native currency at import.
        prices[field] = children.map(child => child && typeof child === 'object'
          ? snapshot(child, field === 'take_profit_targets' ? 1 : native_rate, field === 'executions') : {});
      }
    }
    return prices;
  };

  row.native_prices = snapshot(row);
  row.price_currency = price_currency;
  if (base !== original && price_currency === original) {
    // These originals avoid rounding from the import's USD normalization.
    for (const field of ['entry_price', 'exit_price']) {
      const legacy = field === 'entry_price' ? 'originalEntryPriceCurrency' : 'originalExitPriceCurrency';
      const value = row[`original_${field}_currency`] ?? row[legacy];
      const stored = row[field] ?? row[field === 'entry_price' ? 'entryPrice' : 'exitPrice'];
      // An edit may have replaced a stored price since import. Only prefer
      // the original when it still agrees with the current stored value.
      if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
          && stored !== null && stored !== undefined
          && Math.abs(Number(value) / native_rate - Number(stored)) <= 0.000001) {
        row.native_prices[field] = Number(value);
      }
    }
  }
}

module.exports = { attachNativeTradePrices };
