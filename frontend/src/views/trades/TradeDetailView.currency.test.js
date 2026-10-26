import { shallowMount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import TradeDetailView from './TradeDetailView.vue'
import contracts from '../../../../tests/fixtures/trading-calculation-contracts.json'

const { fetchTrade } = vi.hoisted(() => ({ fetchTrade: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'trade-418' }, query: {} }),
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('@/stores/trades', () => ({ useTradesStore: () => ({ fetchTrade, tradesCurrency: 'EUR' }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { settings: { display_currency: 'EUR' }, tier: 'pro' }, isAuthenticated: false })
}))
vi.mock('@/composables/useSymbolMetadata', () => ({
  useSymbolMetadata: () => ({ metadataBySymbol: {}, normalizeSymbol: value => value })
}))
vi.mock('@/services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }))

describe('trade detail quote prices (issue 418)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
  })

  async function mountTrade(executions, native_executions) {
    const fixture = contracts.trade_price_currency_cases[0]
    const trade = {
      ...fixture.trade,
      id: 'trade-418', user_id: 'owner', side: 'long',
      entry_price: 2160, exit_price: 2168, pnl: 15.2, commission: 0.8,
      stop_loss: 2152, take_profit: 2176,
      effective_currency: 'EUR', price_currency: 'USD',
      entry_time: '2026-09-01T12:00:00Z', exit_time: '2026-09-01T13:00:00Z',
      trade_date: '2026-09-01', tags: [],
      executions,
      native_prices: {
        entry_price: 2700, exit_price: 2710, stop_loss: 2690, take_profit: 2720,
        executions: native_executions || fixture.trade.executions
      }
    }
    fetchTrade.mockResolvedValue(trade)
    const wrapper = shallowMount(TradeDetailView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('$2,700.00')
    expect(wrapper.text()).toContain('$2,710.00')
    expect(wrapper.text()).toContain('$2,690.00')
    expect(wrapper.text()).toContain('$2,720.00')
    expect(wrapper.text()).toContain('€15.20')
    const currency_label = wrapper.findAll('dt').find(label => label.text() === 'Currency')
    expect(currency_label.element.nextElementSibling.textContent.trim()).toBe('USD')
    return wrapper
  }

  it('formats grouped executions in USD and their net P&L and fees in EUR', async () => {
    const wrapper = await mountTrade([{ entry_price: 2160, exit_price: 2168, quantity: 2, realized_pnl: 15.2, commission: 0.8 }])
    const execution = wrapper.vm.processedExecutions[0]
    expect(wrapper.vm.formatTradePrice(execution, 'entry_price')).toBe('$2,700.00')
    expect(wrapper.vm.formatTradePrice(execution, 'exit_price')).toBe('$2,710.00')
    expect(execution.netPnl).toBe(15.2)
    expect(execution.commission).toBe(0.8)
    wrapper.unmount()
  })

  it('uses stored gross P&L for OANDA grouped executions with account-currency conversion', async () => {
    const fixture = contracts.pnl_engine_cases.find(({ id }) => id === 'oanda_reported_currency_pnl')
    const wrapper = await mountTrade([{
      ...fixture.input.executions[0],
      realized_pnl: fixture.expected.realized_pnl[0],
      gross_realized_pnl: fixture.expected.gross_realized_pnl[0]
    }])
    const execution = wrapper.vm.processedExecutions[0]
    expect(execution.grossPnl).toBeCloseTo(6.5, 8)
    expect(execution.netPnl).toBeCloseTo(5.63, 8)
    wrapper.unmount()
  })

  it('uses trade-level native prices when the execution table synthesizes a row', async () => {
    const wrapper = await mountTrade([])
    const execution = wrapper.vm.processedExecutions[0]
    expect(wrapper.vm.formatTradePrice(execution, 'entry_price')).toBe('$2,700.00')
    expect(wrapper.vm.formatTradePrice(execution, 'exit_price')).toBe('$2,710.00')
    expect(execution.netPnl).toBeCloseTo(15.2)
    wrapper.unmount()
  })

  it('formats individual fills in their original currency without changing realized P&L', async () => {
    const wrapper = await mountTrade([
      { action: 'buy', price: 2160, quantity: 2, commission: 0.4 },
      { action: 'sell', price: 2168, quantity: 2, commission: 0.4, realized_pnl: 15.2 }
    ], [{ price: 2700 }, { price: 2710 }])
    const [entry, exit] = wrapper.vm.processedExecutions
    expect(wrapper.vm.formatTradePrice(entry, 'entry_price')).toBe('$2,700.00')
    expect(wrapper.vm.formatTradePrice(exit, 'exit_price')).toBe('$2,710.00')
    expect(exit.netPnl).toBe(15.2)
    wrapper.unmount()
  })
})
