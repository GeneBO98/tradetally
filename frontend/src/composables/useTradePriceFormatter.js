import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const LEGACY_FIELDS = {
  entry_price: 'entryPrice', exit_price: 'exitPrice',
  stop_loss: 'stopLoss', take_profit: 'takeProfit',
  strike_price: 'strikePrice', current_price: 'currentPrice'
}

export function useTradePriceFormatter() {
  const { formatCurrency, currencyCode } = useCurrencyFormatter()

  function formatTradePrice(trade, field, options = {}) {
    const source = trade?.native_prices || trade || {}
    const value = source[field] ?? source[LEGACY_FIELDS[field]]
    const currency = trade?.price_currency || trade?.effective_currency || trade?.currency || currencyCode?.value || 'USD'
    return formatCurrency(value, {
      maximumFractionDigits: 6,
      ...options,
      currency
    })
  }

  return { formatTradePrice }
}
