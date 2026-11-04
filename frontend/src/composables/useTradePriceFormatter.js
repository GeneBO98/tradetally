import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const LEGACY_FIELDS = {
  entry_price: 'entryPrice', exit_price: 'exitPrice',
  stop_loss: 'stopLoss', take_profit: 'takeProfit',
  strike_price: 'strikePrice', current_price: 'currentPrice'
}

const FOREX_SYMBOL = /^[A-Z]{3}[/_-]?[A-Z]{3}$/

/**
 * Decimal places a price is displayed with. Forex quotes keep their full
 * precision (pips); everything else rounds to cents, or four places for
 * sub-dollar prices, so averaged fills don't render as $123.714286.
 */
export function tradePriceFractionDigits(trade, value) {
  const type = (trade?.instrument_type ?? trade?.instrumentType ?? '').toString().toLowerCase()
  const symbol = (trade?.symbol ?? '').toString().toUpperCase()
  if (type === 'forex' || type === 'fx' || type === 'crypto' || FOREX_SYMBOL.test(symbol)) return 6
  const abs = Math.abs(Number(value))
  return Number.isFinite(abs) && abs > 0 && abs < 1 ? 4 : 2
}

export function useTradePriceFormatter() {
  const { formatCurrency, currencyCode } = useCurrencyFormatter()

  function formatTradePrice(trade, field, options = {}) {
    const source = trade?.native_prices || trade || {}
    const value = source[field] ?? source[LEGACY_FIELDS[field]]
    const currency = trade?.price_currency || trade?.effective_currency || trade?.currency || currencyCode?.value || 'USD'
    return formatCurrency(value, {
      maximumFractionDigits: tradePriceFractionDigits(trade, value),
      ...options,
      currency
    })
  }

  return { formatTradePrice, tradePriceFractionDigits }
}
