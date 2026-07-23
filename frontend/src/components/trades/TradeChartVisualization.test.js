import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TradeChartVisualization from './TradeChartVisualization.vue'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/services/api', () => ({ default: { get: apiGet } }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { tier: 'pro', role: 'user', billingEnabled: false, timezone: 'America/New_York' },
  }),
}))
vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({ formatCurrency: (value) => `$${Number(value).toFixed(2)}` }),
}))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn(), showWarning: vi.fn() }),
}))
vi.mock('@/composables/useUserTimezone', async () => {
  const { ref } = await import('vue')
  return {
    useUserTimezone: () => ({
      userTimezone: ref('America/New_York'),
      timezoneLabel: ref('ET'),
    }),
  }
})

const baseChartData = {
  type: 'intraday',
  interval: '1min',
  source: 'fmp',
  candles: [{ time: 1_700_000_000, open: 100, high: 101, low: 99, close: 100.5 }],
  trade: { id: 'trade-1', symbol: 'DEVS', entryPrice: 100, exitPrice: 101, pnl: 25, pnlPercent: 1 },
}

describe('TradeChartVisualization resolutions', () => {
  beforeEach(() => {
    apiGet.mockReset()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('uses the user default resolution for a newly opened chart', async () => {
    localStorage.setItem('trade_chart_default_resolution', '5')
    apiGet.mockResolvedValue({
      data: { ...baseChartData, interval: '5min' },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-default-resolution' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      '/trades/trade-default-resolution/chart-data',
      { params: { resolution: '5' } }
    ))

    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('selectedResolution')).toBe('5')
  })

  it('falls back to one-minute candles for an invalid saved resolution', async () => {
    localStorage.setItem('trade_chart_default_resolution', '2')
    apiGet.mockResolvedValue({ data: baseChartData })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-invalid-resolution' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      '/trades/trade-invalid-resolution/chart-data',
      { params: { resolution: '1' } }
    ))
  })

  it('requests fresh candles when the selected resolution changes', async () => {
    apiGet.mockImplementation(async (_url, config) => {
      const resolution = config.params.resolution
      return {
        data: {
          ...baseChartData,
          interval: resolution === '15' ? '15min' : '1min',
        },
      }
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-1' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      '/trades/trade-1/chart-data',
      { params: { resolution: '1' } }
    ))

    wrapper.findComponent({ name: 'KLineTradeChart' }).vm.$emit('resolution-change', '15')
    await vi.waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(
      '/trades/trade-1/chart-data',
      { params: { resolution: '15' } }
    ))
    await vi.waitFor(() => expect(wrapper.text()).toContain('15 minute candles'))

    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('selectedResolution')).toBe('15')
  })

  it('disables intraday resolutions when the provider returns daily-only data', async () => {
    apiGet.mockResolvedValue({
      data: {
        ...baseChartData,
        type: 'daily',
        interval: 'daily',
        source: 'alphavantage',
        available_resolutions: ['D'],
      },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-2' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('selectedResolution')).toBe('D'))

    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('availableResolutions')).toEqual(['D'])
  })

  it('keeps provider intervals available after a daily fallback response', async () => {
    apiGet.mockResolvedValue({
      data: {
        ...baseChartData,
        type: 'daily',
        interval: 'daily',
        source: 'alphavantage',
        fallback: true,
        available_resolutions: ['1', '5', '15', '60', 'D'],
      },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-3' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('selectedResolution')).toBe('D'))

    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('availableResolutions')).toEqual([
      '1', '5', '15', '60', 'D',
    ])
  })

  it('restores an opened chart and its resolution after a page refresh', async () => {
    localStorage.setItem('trade_chart_default_resolution', '5')
    sessionStorage.setItem('trade_chart_loaded:trade-4', '15')
    apiGet.mockResolvedValue({
      data: {
        ...baseChartData,
        interval: '15min',
        available_resolutions: ['1', '5', '15', '60', 'D'],
      },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-4' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      '/trades/trade-4/chart-data',
      { params: { resolution: '15' } }
    ))
    await vi.waitFor(() => expect(wrapper.findComponent({ name: 'KLineTradeChart' }).exists()).toBe(true))
    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('selectedResolution')).toBe('15')
  })

  it('identifies cached Databento continuous-contract futures charts', async () => {
    apiGet.mockResolvedValue({
      data: {
        ...baseChartData,
        source: 'cache:databento',
        chart_symbol: 'MNQ.c.0',
        futures_continuous: true,
        available_resolutions: ['1', '5', '15', '60', 'D'],
        trade: {
          ...baseChartData.trade,
          symbol: 'MNQM6',
          instrumentType: 'future',
        },
      },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-future' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Databento'))

    expect(wrapper.text()).toContain('continuous front-month data (MNQ.c.0)')
    expect(wrapper.text()).toContain('Contract rollover can create differences')
    expect(wrapper.findComponent({ name: 'KLineTradeChart' }).props('availableResolutions')).toEqual([
      '1', '5', '15', '60', 'D',
    ])
  })

  it('labels the no-cost Yahoo futures fallback', async () => {
    apiGet.mockResolvedValue({
      data: {
        ...baseChartData,
        source: 'yahoo',
        chart_symbol: 'ES=F',
        futures_continuous: true,
        available_resolutions: ['5', '15', '60', 'D'],
      },
    })

    const wrapper = mount(TradeChartVisualization, {
      props: { tradeId: 'trade-yahoo' },
      global: {
        stubs: {
          KLineTradeChart: true,
          ProUpgradePrompt: true,
        },
      },
    })

    await wrapper.get('button.btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Yahoo Finance'))

    expect(wrapper.text()).toContain('continuous front-month data (ES=F)')
  })
})
