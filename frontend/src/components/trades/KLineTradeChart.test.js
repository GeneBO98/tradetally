import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KLineTradeChart from './KLineTradeChart.vue'

const chartMock = {
  setSymbol: vi.fn(),
  setPeriod: vi.fn(),
  setDataLoader: vi.fn(),
  createIndicator: vi.fn(),
  removeIndicator: vi.fn(),
  createOverlay: vi.fn(),
  removeOverlay: vi.fn(),
  getOverlays: vi.fn(),
  setStyles: vi.fn(),
  setBarSpace: vi.fn(),
  setOffsetRightDistance: vi.fn(),
  scrollToRealTime: vi.fn(),
  scrollToTimestamp: vi.fn(),
  resize: vi.fn(),
}

vi.mock('klinecharts', () => ({
  init: vi.fn(() => chartMock),
  dispose: vi.fn(),
  registerOverlay: vi.fn(),
}))

class ResizeObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()
}

const chartData = {
  interval: 'daily',
  source: 'alphavantage',
  candles: [
    { time: 1_700_000_000, open: 100, high: 105, low: 99, close: 104, volume: 1000 },
    { time: 1_700_086_400, open: 104, high: 108, low: 103, close: 107, volume: 1200 },
  ],
  trade: {
    id: 'trade-1',
    symbol: 'WDC',
    side: 'long',
    entryTime: '2023-11-14T22:13:20.000Z',
    exitTime: '2023-11-15T22:13:20.000Z',
    entryPrice: 101,
    exitPrice: 107,
    executions: null,
  },
}

describe('KLineTradeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chartMock.createIndicator.mockImplementation((value) => (
      typeof value === 'string' ? `${value}-id` : `${value.name}-id`
    ))
    chartMock.createOverlay.mockImplementation((value) => `${value.name}-id`)
    chartMock.getOverlays.mockReturnValue([])
    global.ResizeObserver = ResizeObserverMock
    global.requestAnimationFrame = (callback) => {
      callback()
      return 1
    }
    localStorage.clear()
  })

  it('loads API candles into KLineChart and adds trade context', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: { chartData, timezone: 'Europe/Rome' },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    const loader = chartMock.setDataLoader.mock.calls[0][0]
    const callback = vi.fn()
    loader.getBars({ type: 'init', callback })

    expect(callback).toHaveBeenCalledWith([
      expect.objectContaining({ timestamp: 1_700_000_000_000, close: 104, turnover: 104_000 }),
      expect.objectContaining({ timestamp: 1_700_086_400_000, close: 107, turnover: 128_400 }),
    ], false)
    expect(chartMock.setSymbol).toHaveBeenCalledWith({
      ticker: 'WDC',
      pricePrecision: 2,
      volumePrecision: 0,
    })
    expect(chartMock.createIndicator).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MA', paneId: 'candle_pane', calcParams: [20, 50] }),
      true
    )
    expect(chartMock.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'tradeExecutionMarker', groupId: 'trade-executions', lock: true })
    )
    const tradeMarkers = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter((overlay) => overlay.groupId === 'trade-executions')
    expect(tradeMarkers[0]).toMatchObject({
      points: [{ timestamp: 1_700_000_000_000, value: 99 }],
      extendData: expect.objectContaining({
        label: 'ENTRY @ 101.00',
        price: 101,
        price_mismatch: false,
      }),
    })
    expect(chartMock.scrollToTimestamp).toHaveBeenCalledWith(1_700_000_000_000, 200)

    wrapper.unmount()
  })

  it('starts editable support and resistance drawing mode', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: { chartData },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    await wrapper.get('button[title="Draw an editable support or resistance level"]').trigger('click')

    expect(chartMock.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'horizontalStraightLine',
        groupId: 'trade-user-drawings',
        mode: 'weak_magnet',
      })
    )
    expect(wrapper.text()).toContain('Drawing mode active')

    wrapper.unmount()
  })

  it('integrates resolution controls into the chart footer', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData,
        selectedResolution: '5',
        availableResolutions: ['1', '5', '15'],
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    expect(wrapper.get('button[data-resolution="5"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[data-resolution="60"]').attributes()).toHaveProperty('disabled')

    await wrapper.get('button[data-resolution="15"]').trigger('click')
    expect(wrapper.emitted('resolution-change')).toEqual([['15']])

    wrapper.unmount()
  })

  it('stacks multiple executions mapped to the same candle into separate lanes', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: {
            ...chartData.trade,
            executions: [
              { action: 'sell', quantity: 25, execution_time: '2023-11-15T21:58:00.000Z' },
              { action: 'sell', quantity: 50, execution_time: '2023-11-15T22:02:00.000Z' },
              { action: 'sell', quantity: 25, execution_time: '2023-11-15T22:10:00.000Z' },
            ],
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    const executionMarkers = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter((overlay) => overlay.groupId === 'trade-executions')

    expect(executionMarkers).toHaveLength(3)
    expect(executionMarkers.map((overlay) => overlay.extendData.stack_index)).toEqual([0, 1, 2])
    expect(executionMarkers.map((overlay) => overlay.extendData.label)).toEqual([
      'SELL 25',
      'SELL 50',
      'SELL 25',
    ])

    wrapper.unmount()
  })

  it('pins an inconsistent fill to its timestamp candle and shows a warning', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: {
            ...chartData.trade,
            entryPrice: 39.11,
            exitPrice: 39.86,
            entryTime: '2023-11-14T22:13:20.000Z',
            exitTime: null,
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    const entryMarker = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find((overlay) => overlay.groupId === 'trade-executions')

    expect(entryMarker).toMatchObject({
      points: [{ timestamp: 1_700_000_000_000, value: 99 }],
      extendData: expect.objectContaining({ price: 39.11, price_mismatch: true }),
    })
    expect(wrapper.text()).toContain('Recorded fill is outside the provider candle range')

    wrapper.unmount()
  })
})
