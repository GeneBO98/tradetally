import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useCurrencyFormatter } from './useCurrencyFormatter'
import { useTradePriceFormatter } from './useTradePriceFormatter'
import { withNativeTradePrices } from '@/utils/nativeTradePrices'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'

describe('native trade price formatting (issue 418)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it.each(contracts.trade_price_currency_cases)('$id', (fixture) => {
    useAuthStore().user = { settings: { display_currency: fixture.display_currency } }
    const { formatTradePrice } = useTradePriceFormatter()
    const { formatCurrency } = useCurrencyFormatter()
    const expected = fixture.expected
    const trade = {
      ...fixture.trade,
      entry_price: expected.entry_price, exit_price: expected.exit_price,
      pnl: expected.pnl, effective_currency: expected.effective_currency,
      price_currency: expected.price_currency,
      native_prices: { entry_price: expected.native_entry_price, exit_price: expected.native_exit_price }
    }
    const before = JSON.stringify(trade)
    for (const field of ['entry_price', 'exit_price']) {
      expect(formatTradePrice(trade, field)).toBe(formatCurrency(expected[`native_${field}`], {
        currency: expected.price_currency, maximumFractionDigits: 6
      }))
    }
    const chart_trade = withNativeTradePrices(trade)
    expect(chart_trade.entry_price).toBe(expected.native_entry_price)
    expect(chart_trade.pnl).toBe(expected.pnl)
    expect(chart_trade.effective_currency).toBe(expected.price_currency)
    expect(JSON.stringify(trade)).toBe(before)
  })

  it('preserves forex precision and a zero exit', () => {
    const { formatTradePrice } = useTradePriceFormatter()
    const trade = { price_currency: 'USD', native_prices: { entry_price: 1.123457, exit_price: 0 } }
    expect(formatTradePrice(trade, 'entry_price')).toBe('$1.123457')
    expect(formatTradePrice(trade, 'exit_price')).toBe('$0.00')
  })

  it('supports legacy fields and reporting-currency fallback without snapshots', () => {
    const { formatTradePrice } = useTradePriceFormatter()
    expect(formatTradePrice({ effective_currency: 'EUR', entryPrice: 123 }, 'entry_price')).toBe('€123.00')
    expect(formatTradePrice({}, 'exit_price')).toBe('-')
  })

  it('projects native chart prices and nested executions without changing fees or P&L', () => {
    const trade = {
      entryPrice: 80, pnl: 8, price_currency: 'USD', effective_currency: 'EUR',
      executions: [{ entryPrice: 80, exitPrice: 88, commission: 0.8, quantity: 2 }],
      native_prices: { entry_price: 100, executions: [{ entry_price: 100, exit_price: 110 }] }
    }
    const chart = withNativeTradePrices(trade)
    expect(chart.entryPrice).toBe(100)
    expect(chart.executions[0]).toMatchObject({ entryPrice: 100, exitPrice: 110, commission: 0.8, quantity: 2 })
    expect(chart.pnl).toBe(8)
    expect(trade.executions[0].entryPrice).toBe(80)
  })
})
