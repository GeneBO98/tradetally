import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KLineTradeChart from './KLineTradeChart.vue'

const { registeredOverlays } = vi.hoisted(() => ({ registeredOverlays: new Map() }))

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
  scrollByDistance: vi.fn(),
  resize: vi.fn(),
}

vi.mock('klinecharts', () => ({
  init: vi.fn(() => chartMock),
  dispose: vi.fn(),
  registerOverlay: vi.fn((template) => registeredOverlays.set(template.name, template)),
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
    quantity: 25,
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
    expect(chartMock.scrollToTimestamp).toHaveBeenCalledWith(1_700_000_000_000)
    expect(chartMock.scrollByDistance).toHaveBeenCalledWith(expect.any(Number))
    expect(chartMock.scrollByDistance.mock.calls[0][0]).toBeLessThan(0)

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

  it('starts a P&L measurement with the trade size, side, and display currency', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: { chartData, currencyCode: 'CAD' },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    await wrapper.get('button[title*="recorded entry price"]').trigger('click')

    expect(chartMock.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tradePnlMeasurement',
        groupId: 'trade-user-drawings',
        mode: 'weak_magnet',
        extendData: {
          quantity: 25,
          side: 'long',
          instrument_type: 'stock',
          contract_size: 100,
          point_value: 1,
          entry_price: 101,
          currency_code: 'CAD',
          show_dollar_pnl: true,
        },
      })
    )
    expect(wrapper.text()).toContain('P&L starts at the recorded entry price')

    wrapper.unmount()
  })

  it('renders the measured dollar and percentage P&L in the custom overlay', () => {
    const pnlTemplate = registeredOverlays.get('tradePnlMeasurement')
    const figures = pnlTemplate.createPointFigures({
      coordinates: [{ x: 100, y: 200 }, { x: 300, y: 100 }],
      overlay: {
        points: [{ value: 100 }, { value: 105 }],
        extendData: {
          quantity: 25,
          side: 'long',
          instrument_type: 'stock',
          currency_code: 'USD',
        },
      },
      bounding: { width: 800, height: 480 },
    })

    expect(figures).toEqual([
      expect.objectContaining({
        type: 'rect',
        attrs: { x: 100, y: 100, width: 200, height: 100 },
        styles: expect.objectContaining({ borderColor: '#059669' }),
      }),
      expect.objectContaining({
        type: 'text',
        attrs: expect.objectContaining({ text: '+$125.00 (+5.00% trade return)' }),
        styles: expect.objectContaining({ backgroundColor: '#059669' }),
      }),
    ])
  })

  it('pins the first P&L anchor to the recorded trade entry price', () => {
    const pnlTemplate = registeredOverlays.get('tradePnlMeasurement')
    const points = [{ value: 99 }, { value: 105 }]
    const performPoint = points[0]

    pnlTemplate.performEventMoveForDrawing.call(
      { extendData: { entry_price: 101 } },
      { performPointIndex: 0, performPoint, points }
    )

    expect(points[0].value).toBe(101)
  })

  it('updates a saved P&L drawing to the trade entry price when restoring it', async () => {
    localStorage.setItem('trade_chart_drawings:trade-1', JSON.stringify([{
      name: 'tradePnlMeasurement',
      points: [
        { timestamp: 1_700_000_000_000, value: 99 },
        { timestamp: 1_700_086_400_000, value: 105 },
      ],
      extendData: { quantity: 10, side: 'long', instrument_type: 'stock' },
    }]))

    const wrapper = mount(KLineTradeChart, { props: { chartData } })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    const restoredDrawing = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find((overlay) => overlay.groupId === 'trade-user-drawings')

    expect(restoredDrawing).toMatchObject({
      name: 'tradePnlMeasurement',
      points: [
        expect.objectContaining({ value: 101 }),
        expect.objectContaining({ value: 105 }),
      ],
      extendData: expect.objectContaining({ entry_price: 101, quantity: 25 }),
    })

    wrapper.unmount()
  })

  it('disables P&L measurement when an option chart shows underlying prices', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: { ...chartData.trade, instrumentType: 'option' },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    const pnlButton = wrapper.get('button[title*="option underlying"]')

    expect(pnlButton.attributes()).toHaveProperty('disabled')

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

  it('uses continuous-contract metadata for futures chart formatting', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          chart_symbol: 'ZN.c.0',
          tick_size: 0.015625,
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setSymbol).toHaveBeenCalledOnce())

    expect(chartMock.setSymbol).toHaveBeenCalledWith({
      ticker: 'ZN.c.0',
      pricePrecision: 6,
      volumePrecision: 0,
    })

    wrapper.unmount()
  })

  it('frames the complete entry-to-exit window when initially focusing the chart', async () => {
    const start_timestamp = 1_700_000_000_000
    const candles = Array.from({ length: 100 }, (_, index) => ({
      time: (start_timestamp + (index * 60_000)) / 1000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: 1000,
    }))
    const entry_timestamp = start_timestamp + (10 * 60_000)
    const exit_timestamp = start_timestamp + (80 * 60_000)
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          candles,
          trade: {
            ...chartData.trade,
            entryTime: new Date(entry_timestamp).toISOString(),
            exitTime: new Date(exit_timestamp).toISOString(),
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    const expected_focus_timestamp = start_timestamp + (45 * 60_000)
    const expected_visible_bar_count = 71 + (11 * 2)
    expect(chartMock.scrollToTimestamp).toHaveBeenCalledWith(expected_focus_timestamp)
    expect(chartMock.setBarSpace).toHaveBeenLastCalledWith(710 / expected_visible_bar_count)

    wrapper.unmount()
  })

  it('adds a planned long-position overlay while keeping the actual exit marker separate', async () => {
    const wrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: {
            ...chartData.trade,
            side: 'long',
            stop_loss: 98,
            take_profit: 107,
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())

    const positionOverlay = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find((overlay) => overlay.groupId === 'trade-planned-position')
    const exitMarker = chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find((overlay) => overlay.groupId === 'trade-executions' && overlay.extendData.kind === 'exit')

    expect(positionOverlay).toMatchObject({
      name: 'tradePositionOverlay',
      lock: true,
      extendData: {
        side: 'long',
        entry_price: 101,
        stop_loss: 98,
        take_profit: 107,
        risk_reward: 2,
      },
    })
    expect(positionOverlay.points).toEqual([
      { timestamp: 1_700_000_000_000, value: 101 },
      { timestamp: 1_700_086_400_000, value: 101 },
      { timestamp: 1_700_086_400_000, value: 107 },
      { timestamp: 1_700_086_400_000, value: 98 },
    ])
    expect(exitMarker).toBeTruthy()

    wrapper.unmount()
  })

  it('orients a valid short-position plan and omits incomplete plans', async () => {
    const shortWrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: {
            ...chartData.trade,
            side: 'short',
            stop_loss: 105,
            take_profit: 97,
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    expect(chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .find((overlay) => overlay.groupId === 'trade-planned-position')
      .extendData).toMatchObject({ side: 'short', risk_reward: 4 / 4 })
    shortWrapper.unmount()

    vi.clearAllMocks()
    chartMock.createIndicator.mockImplementation((value) => (
      typeof value === 'string' ? `${value}-id` : `${value.name}-id`
    ))
    chartMock.createOverlay.mockImplementation((value) => `${value.name}-id`)
    chartMock.getOverlays.mockReturnValue([])

    const incompleteWrapper = mount(KLineTradeChart, {
      props: {
        chartData: {
          ...chartData,
          trade: {
            ...chartData.trade,
            side: 'long',
            stop_loss: null,
            take_profit: 107,
          },
        },
      },
    })

    await vi.waitFor(() => expect(chartMock.setDataLoader).toHaveBeenCalledOnce())
    expect(chartMock.createOverlay.mock.calls
      .map(([overlay]) => overlay)
      .some((overlay) => overlay.groupId === 'trade-planned-position')).toBe(false)
    incompleteWrapper.unmount()
  })

  it('renders distinct profit, risk, and entry figures for the planned position', () => {
    const template = registeredOverlays.get('tradePositionOverlay')
    const figures = template.createPointFigures({
      coordinates: [{ x: 40, y: 96 }, { x: 240, y: 96 }],
      overlay: {
        extendData: {
          side: 'long',
          entry_price: 101,
          stop_loss: 98,
          take_profit: 107,
          risk_reward: 2,
          price_precision: 2,
        },
      },
      yAxis: { convertToPixel: (value) => 500 - value * 4 },
      bounding: { width: 800, height: 480 },
    })

    expect(figures.filter((figure) => figure.type === 'rect')).toHaveLength(2)
    expect(figures.filter((figure) => figure.type === 'text').map((figure) => figure.attrs.text)).toEqual([
      'LONG · TP 107.00 · 2.00R',
      'ENTRY 101.00',
      'SL 98.00 · 1R',
    ])
    expect(figures.find((figure) => figure.type === 'line')).toMatchObject({
      attrs: { coordinates: [{ x: 40, y: 96 }, { x: 240, y: 96 }] },
    })
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
