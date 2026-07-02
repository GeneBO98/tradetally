<template>
  <div ref="chartContainer" class="w-full" :style="{ height: height + 'px' }"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as LightweightCharts from 'lightweight-charts'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

/**
 * Candlestick chart driven by the replay cursor. Bars up to the cursor are
 * shown; consecutive cursor advances use series.update() (cheap), while
 * scrubs rebuild with setData().
 *
 * Bar and fill times arrive as epoch seconds UTC. For intraday data every
 * timestamp fed to the chart is shifted by displayOffsetSeconds so the time
 * axis reads as exchange-local wall clock (lightweight-charts renders labels
 * in UTC), independent of the browser timezone.
 *
 * Optional indicators (VWAP, EMA 9/20, volume) are computed once per data
 * load and revealed bar-by-bar in lockstep with the candles.
 */

const props = defineProps({
  candles: {
    type: Array,
    required: true
  },
  fills: {
    type: Array,
    default: () => []
  },
  executedFills: {
    type: Array,
    default: () => []
  },
  cursor: {
    type: Number,
    required: true
  },
  trade: {
    type: Object,
    default: null
  },
  displayOffsetSeconds: {
    type: Number,
    default: 0
  },
  resolution: {
    type: String,
    default: '1min'
  },
  indicators: {
    type: Object,
    default: () => ({ vwap: false, ema9: false, ema20: false, volume: false })
  },
  height: {
    type: Number,
    default: 480
  }
})

const INDICATOR_STYLES = {
  vwap: { color: '#8b5cf6', title: 'VWAP' },
  ema9: { color: '#0ea5e9', title: 'EMA 9' },
  ema20: { color: '#ec4899', title: 'EMA 20' }
}

const { currencySymbol } = useCurrencyFormatter()

const chartContainer = ref(null)
let chart = null
let candleSeries = null
let indicatorSeries = {} // key -> lightweight-charts series
let indicatorData = null // key -> array aligned with props.candles
let renderedCursor = -1
let renderedFillCount = -1
let resizeHandler = null

const isIntraday = () => props.resolution !== 'daily'
const offset = () => (isIntraday() ? props.displayOffsetSeconds : 0)

function shiftBar(bar) {
  return {
    time: bar.time + offset(),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close)
  }
}

function formatPrice(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : ''
}

function computeIndicatorData() {
  const vwap = []
  const ema9 = []
  const ema20 = []
  const volume = []
  const k9 = 2 / 10
  const k20 = 2 / 21
  let cumPv = 0
  let cumVol = 0
  let ema9Value = null
  let ema20Value = null

  for (const bar of props.candles) {
    const close = Number(bar.close)
    const typical = (Number(bar.high) + Number(bar.low) + close) / 3
    const vol = Number(bar.volume) || 0
    cumPv += typical * vol
    cumVol += vol
    vwap.push(cumVol > 0 ? cumPv / cumVol : close)
    ema9Value = ema9Value === null ? close : close * k9 + ema9Value * (1 - k9)
    ema20Value = ema20Value === null ? close : close * k20 + ema20Value * (1 - k20)
    ema9.push(ema9Value)
    ema20.push(ema20Value)
    volume.push({
      value: vol,
      color: close >= Number(bar.open) ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'
    })
  }
  return { vwap, ema9, ema20, volume }
}

function linePoint(key, index) {
  return { time: props.candles[index].time + offset(), value: indicatorData[key][index] }
}

function volumePoint(index) {
  const point = indicatorData.volume[index]
  return { time: props.candles[index].time + offset(), value: point.value, color: point.color }
}

function createChart() {
  if (!chartContainer.value) return
  destroyChart()
  if (props.candles.length === 0) return

  const isDark = document.documentElement.classList.contains('dark')

  chart = LightweightCharts.createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: props.height,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: isDark ? '#e5e7eb' : '#111827'
    },
    grid: {
      vertLines: { color: isDark ? '#374151' : '#e5e7eb' },
      horzLines: { color: isDark ? '#374151' : '#e5e7eb' }
    },
    timeScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      timeVisible: isIntraday(),
      secondsVisible: false,
      rightOffset: 8
    },
    rightPriceScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db'
    }
  })

  candleSeries = chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderUpColor: '#10b981',
    borderDownColor: '#ef4444',
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444'
  })

  // Only draw stop/target lines when they sit near the data — a level far
  // outside the bar range (mismatched fill/data spaces) would squash the
  // price scale and mislead
  const lows = props.candles.map((bar) => Number(bar.low))
  const highs = props.candles.map((bar) => Number(bar.high))
  const dataMin = Math.min(...lows)
  const dataMax = Math.max(...highs)
  const nearData = (price) => price >= dataMin * 0.7 && price <= dataMax * 1.3

  if (props.trade && props.trade.stop_loss != null && nearData(Number(props.trade.stop_loss))) {
    candleSeries.createPriceLine({
      price: Number(props.trade.stop_loss),
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Stop'
    })
  }
  if (props.trade && props.trade.take_profit != null && nearData(Number(props.trade.take_profit))) {
    candleSeries.createPriceLine({
      price: Number(props.trade.take_profit),
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Target'
    })
  }

  indicatorData = computeIndicatorData()
  indicatorSeries = {}
  for (const key of ['vwap', 'ema9', 'ema20']) {
    if (props.indicators[key]) {
      indicatorSeries[key] = chart.addLineSeries({
        color: INDICATOR_STYLES[key].color,
        lineWidth: 1,
        title: INDICATOR_STYLES[key].title,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      })
    }
  }
  if (props.indicators.volume) {
    indicatorSeries.volume = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    })
  }

  renderedCursor = -1
  renderedFillCount = -1
  render(true)

  resizeHandler = () => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth })
    }
  }
  window.addEventListener('resize', resizeHandler)
}

function destroyChart() {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (chart) {
    try {
      chart.remove()
    } catch {
      // already disposed
    }
    chart = null
    candleSeries = null
    indicatorSeries = {}
    indicatorData = null
  }
}

function buildMarkers(visibleBars) {
  if (visibleBars.length === 0) return []
  return props.executedFills.map((fill) => {
    const fillTime = fill.time + offset()
    // Anchor each marker to the closest already-visible bar
    const anchor = visibleBars.reduce((closest, bar) =>
      Math.abs(bar.time - fillTime) < Math.abs(closest.time - fillTime) ? bar : closest
    )
    return {
      time: anchor.time,
      position: fill.action === 'buy' ? 'belowBar' : 'aboveBar',
      color: fill.action === 'buy' ? '#10b981' : '#ef4444',
      shape: fill.action === 'buy' ? 'arrowUp' : 'arrowDown',
      text: `${fill.action === 'buy' ? 'BUY' : 'SELL'} ${fill.quantity} @ ${currencySymbol.value}${formatPrice(fill.price)}`,
      size: 2
    }
  })
}

function setAllData(cursor) {
  const visible = props.candles.slice(0, cursor + 1).map(shiftBar)
  candleSeries.setData(visible)
  for (const key of ['vwap', 'ema9', 'ema20']) {
    if (indicatorSeries[key]) {
      indicatorSeries[key].setData(
        props.candles.slice(0, cursor + 1).map((_, i) => linePoint(key, i))
      )
    }
  }
  if (indicatorSeries.volume) {
    indicatorSeries.volume.setData(
      props.candles.slice(0, cursor + 1).map((_, i) => volumePoint(i))
    )
  }
  return visible
}

function render(force = false) {
  if (!candleSeries || props.candles.length === 0) return
  const cursor = Math.max(0, Math.min(props.cursor, props.candles.length - 1))

  if (force || cursor < renderedCursor || renderedCursor === -1) {
    setAllData(cursor)
    if (force) {
      chart.timeScale().fitContent()
    }
  } else if (cursor > renderedCursor) {
    for (let i = renderedCursor + 1; i <= cursor; i++) {
      candleSeries.update(shiftBar(props.candles[i]))
      for (const key of ['vwap', 'ema9', 'ema20']) {
        if (indicatorSeries[key]) indicatorSeries[key].update(linePoint(key, i))
      }
      if (indicatorSeries.volume) indicatorSeries.volume.update(volumePoint(i))
    }
    chart.timeScale().scrollToRealTime()
  }
  renderedCursor = cursor

  if (force || props.executedFills.length !== renderedFillCount) {
    const visible = props.candles.slice(0, cursor + 1).map(shiftBar)
    candleSeries.setMarkers(buildMarkers(visible))
    renderedFillCount = props.executedFills.length
  }
}

watch(() => props.cursor, () => render())
watch(() => props.executedFills.length, () => render())
watch(() => props.candles, () => createChart())
watch(() => ({ ...props.indicators }), () => createChart(), { deep: true })

// Recreate on theme change so grid/text colors follow
watch(
  () => document.documentElement.classList.contains('dark'),
  () => createChart()
)

onMounted(createChart)
onUnmounted(destroyChart)
</script>
