import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

const { api_get, router_replace } = vi.hoisted(() => ({
  api_get: vi.fn(),
  router_replace: vi.fn()
}))

vi.mock('@/services/api', () => ({
  default: {
    get: api_get
  }
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: router_replace
  }),
  useRoute: () => ({
    query: { year: '2026' }
  })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    onboardingStep: 0
  })
}))

vi.mock('@/composables/useGlobalAccountFilter', () => ({
  useGlobalAccountFilter: () => ({
    selectedAccount: ref(null)
  })
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    currencySymbol: ref('$'),
    formatCurrency: (value, options = {}) => {
      const digits = options.maximumFractionDigits ?? 2
      return `$${Number(value).toFixed(digits)}`
    }
  })
}))

import CalendarView from '@/views/CalendarView.vue'

describe('CalendarView P&L type toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('calendar_expanded_month', '2026-07-15T12:00:00.000Z')
    localStorage.setItem('calendar_expanded_year', '2026')
    api_get.mockReset()
    router_replace.mockReset()
    api_get.mockImplementation((url) => {
      if (url === '/analytics/calendar') {
        return Promise.resolve({
          data: {
            calendar: [{
              trade_date: '2026-07-01',
              trades: 1,
              daily_pnl: -1,
              daily_gross_pnl: 5,
              daily_r_value: 0,
              daily_risk_amount: 0,
              risk_trade_count: 0
            }]
          }
        })
      }
      if (url === '/analytics/calendar/day') {
        return Promise.resolve({
          data: {
            contributions: [{
              trade_id: 'trade-1',
              symbol: 'AAPL',
              side: 'long',
              pnl: -1,
              gross_pnl: 5,
              r_value: null,
              risk_amount: null,
              exit_count: 1,
              is_partial: false
            }]
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('switches the calendar totals and day color between net and gross P&L', async () => {
    const wrapper = mount(CalendarView, {
      global: {
        stubs: {
          OnboardingCard: true
        }
      }
    })
    await flushPromises()

    const toggle = wrapper.get('[data-testid="calendar-pnl-toggle"]')
    const pnl_card = wrapper.get('[data-testid="calendar-pnl-card"]')
    const trading_day = wrapper.findAll('div.cursor-pointer').find((cell) => cell.text().includes('$-1'))

    expect(toggle.text()).toContain('Net P&L')
    expect(pnl_card.element.tagName).toBe('BUTTON')
    expect(wrapper.text()).toContain('$-1.00')
    expect(trading_day.attributes('style')).toContain('239, 68, 68')

    await pnl_card.trigger('click')

    expect(toggle.text()).toContain('Gross P&L')
    expect(wrapper.text()).toContain('$5.00')
    expect(trading_day.text()).toContain('$5')
    expect(trading_day.attributes('style')).toContain('34, 197, 94')
    expect(localStorage.getItem('calendar_pnl_type')).toBe('gross')
  })

  it('uses the selected P&L type in the day-detail modal', async () => {
    const wrapper = mount(CalendarView, {
      global: {
        stubs: {
          OnboardingCard: true
        }
      }
    })
    await flushPromises()

    await wrapper.get('[data-testid="calendar-pnl-toggle"]').trigger('click')
    const trading_day = wrapper.findAll('div.cursor-pointer').find((cell) => cell.text().includes('$5'))
    await trading_day.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Trades for July 1, 2026')
    expect(wrapper.text()).toContain('Total Gross P&L for day:')
    expect(wrapper.text()).toContain('$5.00')
  })
})
