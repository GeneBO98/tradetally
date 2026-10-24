const LEGACY_FIELDS = {
  entry_price: 'entryPrice', exit_price: 'exitPrice',
  stop_loss: 'stopLoss', take_profit: 'takeProfit',
  strike_price: 'strikePrice', current_price: 'currentPrice',
  take_profit_targets: 'takeProfitTargets'
}

// A chart needs quote prices for geometry and overlays. Build a separate
// display object so the store's prices and P&L calculations stay untouched.
export function withNativeTradePrices(trade) {
  if (!trade?.native_prices) return trade
  function project(source, prices) {
    const result = { ...source }
    for (const [field, value] of Object.entries(prices)) {
      const legacy = LEGACY_FIELDS[field]
      const original = source[field] ?? source[legacy]
      const native_value = Array.isArray(value)
        ? value.map((item, index) => project(original?.[index] || {}, item))
        : value
      result[field] = native_value
      if (legacy && legacy in source) result[legacy] = native_value
    }
    return result
  }
  return {
    ...project(trade, trade.native_prices),
    effective_currency: trade.price_currency || trade.effective_currency
  }
}
