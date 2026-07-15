<template>
  <div class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
    <div class="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-2 dark:border-gray-700 dark:bg-gray-800/80">
      <div class="flex items-center gap-1" role="toolbar" aria-label="Chart drawing tools">
        <button
          v-for="tool in drawingTools"
          :key="tool.id"
          type="button"
          class="chart-tool-button"
          :class="activeTool === tool.id ? 'chart-tool-button-active' : ''"
          :aria-pressed="activeTool === tool.id"
          :title="tool.description"
          @click="startDrawing(tool)"
        >
          <component :is="tool.icon" class="h-4 w-4" />
          <span>{{ tool.label }}</span>
        </button>
      </div>

      <div class="mx-1 h-6 w-px flex-none bg-gray-300 dark:bg-gray-600"></div>

      <button
        type="button"
        class="chart-tool-button"
        :class="maEnabled ? 'chart-tool-button-active' : ''"
        :aria-pressed="maEnabled"
        title="Toggle 20 and 50 period moving averages"
        @click="toggleMovingAverages"
      >
        <PresentationChartLineIcon class="h-4 w-4" />
        <span>MA</span>
      </button>
      <button
        type="button"
        class="chart-tool-button"
        :class="volumeEnabled ? 'chart-tool-button-active' : ''"
        :aria-pressed="volumeEnabled"
        title="Toggle volume pane"
        @click="toggleVolume"
      >
        <ChartBarIcon class="h-4 w-4" />
        <span>Volume</span>
      </button>

      <div class="mx-1 h-6 w-px flex-none bg-gray-300 dark:bg-gray-600"></div>

      <button type="button" class="chart-tool-button" title="Remove the most recent drawing" @click="undoDrawing">
        <ArrowUturnLeftIcon class="h-4 w-4" />
        <span>Undo</span>
      </button>
      <button type="button" class="chart-tool-button" title="Remove all drawings from this trade" @click="clearDrawings">
        <TrashIcon class="h-4 w-4" />
        <span>Clear</span>
      </button>
      <button type="button" class="chart-tool-button" title="Fit the available chart history" @click="resetView">
        <ArrowsPointingOutIcon class="h-4 w-4" />
        <span>Fit</span>
      </button>
    </div>

    <div ref="chartContainer" class="h-[480px] w-full bg-white dark:bg-gray-900"></div>

    <div class="flex flex-wrap items-center gap-3 border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
      <div class="min-w-0 flex-1">
        <span v-if="hasPriceMismatch" class="font-medium text-amber-700 dark:text-amber-300">
          Recorded fill is outside the provider candle range. Marker is pinned to execution time.
        </span>
        <span v-else-if="activeTool" class="font-medium text-primary-600 dark:text-primary-400">
          Drawing mode active. Press Esc to cancel.
        </span>
        <span v-else>Drag drawing handles to edit. Right-click a drawing to remove it.</span>
      </div>

      <div class="flex items-center gap-2" aria-label="Chart candle resolution">
        <span class="font-medium text-gray-500 dark:text-gray-400">Candles</span>
        <div
          class="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800"
          role="group"
        >
          <button
            v-for="option in resolutionOptions"
            :key="option.value"
            type="button"
            :data-resolution="option.value"
            class="rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
            :class="selectedResolution === option.value
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'"
            :disabled="resolutionLoading || !availableResolutions.includes(option.value)"
            :aria-pressed="selectedResolution === option.value"
            :title="availableResolutions.includes(option.value) ? `${option.label} candles` : 'This data source does not provide this resolution'"
            @click="requestResolution(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingOutIcon,
  ChartBarIcon,
  MinusIcon,
  PaintBrushIcon,
  PencilIcon,
  PresentationChartLineIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { dispose, init, registerOverlay } from 'klinecharts'

const props = defineProps({
  chartData: {
    type: Object,
    required: true,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  selectedResolution: {
    type: String,
    default: '1',
  },
  availableResolutions: {
    type: Array,
    default: () => ['1', '5', '15', '60', 'D'],
  },
  resolutionLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['resolution-change'])

const USER_DRAWING_GROUP = 'trade-user-drawings'
const EXECUTION_GROUP = 'trade-executions'
const EXECUTION_OVERLAY = 'tradeExecutionMarker'
const resolutionOptions = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: 'D', label: '1D' },
]

let executionOverlayRegistered = false

function registerExecutionOverlay() {
  if (executionOverlayRegistered) return

  registerOverlay({
    name: EXECUTION_OVERLAY,
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      const point = coordinates[0]
      if (!point) return []

      const data = overlay.extendData || {}
      const isEntry = data.kind === 'entry'
      const color = data.price_mismatch ? '#d97706' : (isEntry ? '#059669' : '#dc2626')
      const stackIndex = Math.max(0, Number(data.stack_index) || 0)
      const direction = isEntry ? 1 : -1
      const laneOffset = stackIndex * 24
      const tipY = point.y + (isEntry ? 3 : -3)
      const baseY = point.y + (isEntry ? 12 : -12)
      const stemY = point.y + direction * (23 + laneOffset)
      const textY = point.y + direction * (28 + laneOffset)

      return [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: point.x, y: tipY },
              { x: point.x - 5, y: baseY },
              { x: point.x + 5, y: baseY },
            ],
          },
          styles: { style: 'fill', color },
          ignoreEvent: true,
        },
        {
          type: 'line',
          attrs: { coordinates: [{ x: point.x, y: baseY }, { x: point.x, y: stemY }] },
          styles: { style: 'solid', size: 2, color },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: point.x,
            y: textY,
            text: data.label || (isEntry ? 'ENTRY' : 'EXIT'),
            align: 'center',
            baseline: isEntry ? 'top' : 'bottom',
          },
          styles: {
            style: 'fill',
            color: '#ffffff',
            size: 10,
            weight: 600,
            backgroundColor: color,
            borderRadius: 3,
            paddingLeft: 4,
            paddingTop: 2,
            paddingRight: 4,
            paddingBottom: 2,
          },
          ignoreEvent: true,
        },
      ]
    },
  })

  executionOverlayRegistered = true
}

registerExecutionOverlay()

function requestResolution(resolution) {
  if (props.resolutionLoading || !props.availableResolutions.includes(resolution)) return
  if (resolution !== props.selectedResolution) emit('resolution-change', resolution)
}

const chartContainer = ref(null)
const activeTool = ref(null)
const maEnabled = ref(true)
const volumeEnabled = ref(false)
const hasPriceMismatch = ref(false)

let chart = null
let resizeObserver = null
let themeObserver = null
let drawingHistory = []
let movingAverageIndicatorId = null
let volumeIndicatorId = null
let normalizedBars = []

const drawingTools = [
  {
    id: 'trend',
    label: 'Trend',
    description: 'Draw an editable trend line',
    overlay: 'straightLine',
    icon: ArrowTrendingUpIcon,
  },
  {
    id: 'level',
    label: 'Level',
    description: 'Draw an editable support or resistance level',
    overlay: 'horizontalStraightLine',
    icon: MinusIcon,
  },
  {
    id: 'price',
    label: 'Price',
    description: 'Draw a horizontal line with a price label',
    overlay: 'priceLine',
    icon: SignalIcon,
  },
  {
    id: 'fib',
    label: 'Fib',
    description: 'Draw Fibonacci retracement levels',
    overlay: 'fibonacciLine',
    icon: PresentationChartLineIcon,
  },
  {
    id: 'segment',
    label: 'Segment',
    description: 'Draw a finite line segment',
    overlay: 'segment',
    icon: PencilIcon,
  },
  {
    id: 'brush',
    label: 'Brush',
    description: 'Draw a freehand annotation',
    overlay: 'brush',
    icon: PaintBrushIcon,
  },
]

function getPrimaryColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim() || '#F0812A'
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark')
}

function chartStyles() {
  const dark = isDarkMode()
  const primary = getPrimaryColor()

  return {
    grid: {
      horizontal: { color: dark ? '#273244' : '#e5e7eb' },
      vertical: { color: dark ? '#273244' : '#e5e7eb' },
    },
    candle: {
      bar: {
        upColor: '#059669',
        downColor: '#dc2626',
        noChangeColor: '#6b7280',
        upBorderColor: '#059669',
        downBorderColor: '#dc2626',
        noChangeBorderColor: '#6b7280',
        upWickColor: '#059669',
        downWickColor: '#dc2626',
        noChangeWickColor: '#6b7280',
      },
      priceMark: {
        high: { color: dark ? '#9ca3af' : '#4b5563' },
        low: { color: dark ? '#9ca3af' : '#4b5563' },
      },
      tooltip: {
        rect: {
          color: dark ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: dark ? '#374151' : '#d1d5db',
        },
        title: { color: dark ? '#d1d5db' : '#374151' },
        legend: { color: dark ? '#d1d5db' : '#374151' },
      },
    },
    xAxis: {
      axisLine: { color: dark ? '#4b5563' : '#d1d5db' },
      tickLine: { color: dark ? '#4b5563' : '#d1d5db' },
      tickText: { color: dark ? '#9ca3af' : '#4b5563' },
    },
    yAxis: {
      axisLine: { color: dark ? '#4b5563' : '#d1d5db' },
      tickLine: { color: dark ? '#4b5563' : '#d1d5db' },
      tickText: { color: dark ? '#9ca3af' : '#4b5563' },
    },
    separator: { color: dark ? '#374151' : '#d1d5db' },
    crosshair: {
      horizontal: {
        line: { color: dark ? '#9ca3af' : '#6b7280' },
        text: { borderColor: primary, backgroundColor: primary },
      },
      vertical: {
        line: { color: dark ? '#9ca3af' : '#6b7280' },
        text: { borderColor: primary, backgroundColor: primary },
      },
    },
    overlay: {
      point: {
        color: primary,
        borderColor: dark ? '#111827' : '#ffffff',
        activeColor: primary,
        activeBorderColor: dark ? '#ffffff' : '#111827',
      },
      line: { color: primary, size: 2 },
      text: { color: primary },
    },
  }
}

function normalizeTimestamp(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return number < 1_000_000_000_000 ? number * 1000 : number
}

function normalizeChartData(candles) {
  const byTimestamp = new Map()

  for (const candle of candles || []) {
    const timestamp = normalizeTimestamp(candle.time ?? candle.timestamp)
    const open = Number(candle.open)
    const high = Number(candle.high)
    const low = Number(candle.low)
    const close = Number(candle.close)
    const volume = Number(candle.volume) || 0

    if (timestamp === null || ![open, high, low, close].every(Number.isFinite)) continue

    byTimestamp.set(timestamp, {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover: volume * close,
    })
  }

  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp)
}

function intervalToPeriod(interval) {
  const value = String(interval || 'daily').toLowerCase()
  if (value === 'daily' || value === 'd' || value === '1d') return { span: 1, type: 'day' }

  const match = value.match(/^(\d+)(min|m|hour|h)$/)
  if (!match) return { span: 1, type: 'day' }

  return {
    span: Number(match[1]),
    type: match[2] === 'hour' || match[2] === 'h' ? 'hour' : 'minute',
  }
}

function pricePrecision() {
  const tickSize = Number(props.chartData?.tick_size)
  if (Number.isFinite(tickSize) && tickSize > 0) {
    const normalized = tickSize.toFixed(8).replace(/0+$/, '')
    const decimalIndex = normalized.indexOf('.')
    return decimalIndex === -1 ? 0 : normalized.length - decimalIndex - 1
  }

  const prices = [props.chartData?.trade?.entryPrice, props.chartData?.trade?.exitPrice]
    .map(Number)
    .filter(Number.isFinite)

  if (prices.length === 0) return 2
  if (prices.some((price) => Math.abs(price) < 1)) return 4
  return 2
}

function drawingStorageKey() {
  const tradeId = props.chartData?.trade?.id
  return tradeId ? `trade_chart_drawings:${tradeId}` : null
}

function persistDrawings() {
  if (!chart) return
  const key = drawingStorageKey()
  if (!key) return

  const drawings = chart.getOverlays({ groupId: USER_DRAWING_GROUP }).map((overlay) => ({
    name: overlay.name,
    points: overlay.points.map((point) => ({ timestamp: point.timestamp, value: point.value })),
    styles: overlay.styles,
    extendData: overlay.extendData,
  }))

  try {
    localStorage.setItem(key, JSON.stringify(drawings))
  } catch (error) {
    console.warn('[CHART] Unable to persist chart drawings:', error.message)
  }
}

function drawingCallbacks() {
  return {
    onDrawEnd: () => {
      activeTool.value = null
      persistDrawings()
    },
    onPressedMoveEnd: persistDrawings,
    onRemoved: () => queueMicrotask(persistDrawings),
  }
}

function restoreDrawings() {
  if (!chart) return
  const key = drawingStorageKey()
  if (!key) return

  try {
    const drawings = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(drawings)) return

    for (const drawing of drawings) {
      if (!drawing?.name || !Array.isArray(drawing.points)) continue
      chart.createOverlay({
        name: drawing.name,
        groupId: USER_DRAWING_GROUP,
        points: drawing.points,
        styles: drawing.styles,
        extendData: drawing.extendData,
        mode: 'weak_magnet',
        modeSensitivity: 8,
        ...drawingCallbacks(),
      })
    }
  } catch (error) {
    console.warn('[CHART] Unable to restore chart drawings:', error.message)
  }
}

function parseExecutionTimestamp(value) {
  if (!value) return null
  const stringValue = String(value).trim()
  const naiveIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/
  const normalized = naiveIso.test(stringValue) ? `${stringValue.replace(' ', 'T')}Z` : stringValue
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : null
}

function isEntryAction(action, side) {
  const normalizedAction = String(action || '').toLowerCase()
  const normalizedSide = String(side || '').toLowerCase()
  if (['entry', 'open'].includes(normalizedAction)) return true
  if (['exit', 'close'].includes(normalizedAction)) return false
  return normalizedSide === 'short'
    ? ['sell', 'short'].includes(normalizedAction)
    : ['buy', 'long'].includes(normalizedAction)
}

function executionEvents() {
  const trade = props.chartData?.trade || {}
  const events = []
  const executions = Array.isArray(trade.executions) ? trade.executions : []
  const isOption = String(trade.instrumentType ?? trade.instrument_type).toLowerCase() === 'option'

  for (const execution of executions) {
    const action = execution.action ?? execution.type
    const timestamp = parseExecutionTimestamp(
      execution.datetime ?? execution.execution_time ?? execution.time
    )
    if (!action || timestamp === null) continue

    const kind = isEntryAction(action, trade.side) ? 'entry' : 'exit'
    const quantity = execution.quantity ? ` ${execution.quantity}` : ''
    const price = Number(
      execution.price ?? (kind === 'entry'
        ? (execution.entry_price ?? execution.entryPrice)
        : (execution.exit_price ?? execution.exitPrice))
    )
    const priceLabel = !isOption && Number.isFinite(price) ? ` @ ${price.toFixed(pricePrecision())}` : ''
    const label = (kind === 'entry'
      ? (String(trade.side).toLowerCase() === 'short' ? `SHORT${quantity}` : `BUY${quantity}`)
      : (String(trade.side).toLowerCase() === 'short' ? `COVER${quantity}` : `SELL${quantity}`)) + priceLabel

    events.push({ kind, timestamp, label, price: Number.isFinite(price) ? price : null })
  }

  if (events.length > 0) return events

  const entryTimestamp = parseExecutionTimestamp(trade.entryTime ?? trade.entryDate)
  const exitTimestamp = parseExecutionTimestamp(trade.exitTime ?? trade.exitDate)
  const entryPrice = Number(trade.entryPrice ?? trade.entry_price)
  const exitPrice = Number(trade.exitPrice ?? trade.exit_price)
  const entryPriceLabel = !isOption && Number.isFinite(entryPrice) ? ` @ ${entryPrice.toFixed(pricePrecision())}` : ''
  const exitPriceLabel = !isOption && Number.isFinite(exitPrice) ? ` @ ${exitPrice.toFixed(pricePrecision())}` : ''
  if (entryTimestamp !== null) {
    events.push({
      kind: 'entry',
      timestamp: entryTimestamp,
      label: `ENTRY${entryPriceLabel}`,
      price: Number.isFinite(entryPrice) ? entryPrice : null,
    })
  }
  if (exitTimestamp !== null) {
    events.push({
      kind: 'exit',
      timestamp: exitTimestamp,
      label: `EXIT${exitPriceLabel}`,
      price: Number.isFinite(exitPrice) ? exitPrice : null,
    })
  }
  return events
}

function closestBar(timestamp) {
  if (normalizedBars.length === 0) return null
  return normalizedBars.reduce((closest, bar) => (
    Math.abs(bar.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp) ? bar : closest
  ))
}

function addExecutionMarkers() {
  if (!chart) return
  chart.removeOverlay({ groupId: EXECUTION_GROUP })
  hasPriceMismatch.value = false
  const laneCounts = new Map()

  for (const event of executionEvents()) {
    const bar = closestBar(event.timestamp)
    if (!bar) continue
    const laneKey = `${event.kind}:${bar.timestamp}`
    const stackIndex = laneCounts.get(laneKey) || 0
    laneCounts.set(laneKey, stackIndex + 1)
    const instrumentType = String(
      props.chartData?.trade?.instrumentType ?? props.chartData?.trade?.instrument_type
    ).toLowerCase()
    const compareFillToCandle = instrumentType !== 'option' && Number.isFinite(event.price)
    const candleTolerance = Math.max(
      Math.abs(Number(event.price) || 0) * 0.001,
      Math.abs(bar.high - bar.low) * 0.1
    )
    const priceMismatch = compareFillToCandle && (
      event.price < bar.low - candleTolerance || event.price > bar.high + candleTolerance
    )
    if (priceMismatch) hasPriceMismatch.value = true

    chart.createOverlay({
      name: EXECUTION_OVERLAY,
      groupId: EXECUTION_GROUP,
      lock: true,
      points: [{
        timestamp: bar.timestamp,
        value: event.kind === 'entry' ? bar.low : bar.high,
      }],
      extendData: {
        ...event,
        stack_index: stackIndex,
        price_mismatch: priceMismatch,
      },
    })
  }
}

function startDrawing(tool) {
  if (!chart) return
  activeTool.value = tool.id
  const id = chart.createOverlay({
    name: tool.overlay,
    groupId: USER_DRAWING_GROUP,
    mode: 'weak_magnet',
    modeSensitivity: 8,
    styles: {
      line: { color: getPrimaryColor(), size: 2 },
      text: { color: getPrimaryColor() },
    },
    ...drawingCallbacks(),
  })

  if (typeof id === 'string') drawingHistory.push(id)
}

function undoDrawing() {
  if (!chart) return
  let id = drawingHistory.pop()

  if (!id) {
    const drawings = chart.getOverlays({ groupId: USER_DRAWING_GROUP })
    id = drawings.at(-1)?.id
  }

  if (id) chart.removeOverlay({ id })
  activeTool.value = null
  persistDrawings()
}

function clearDrawings() {
  if (!chart) return
  chart.removeOverlay({ groupId: USER_DRAWING_GROUP })
  drawingHistory = []
  activeTool.value = null
  persistDrawings()
}

function addMovingAverages() {
  if (!chart || movingAverageIndicatorId) return
  movingAverageIndicatorId = chart.createIndicator({
    name: 'MA',
    paneId: 'candle_pane',
    calcParams: [20, 50],
  }, true)
}

function toggleMovingAverages() {
  if (!chart) return
  if (maEnabled.value) {
    chart.removeIndicator({ name: 'MA', paneId: 'candle_pane' })
    movingAverageIndicatorId = null
    maEnabled.value = false
  } else {
    maEnabled.value = true
    addMovingAverages()
  }
}

function toggleVolume() {
  if (!chart) return
  if (volumeEnabled.value) {
    if (volumeIndicatorId) chart.removeIndicator({ id: volumeIndicatorId })
    volumeIndicatorId = null
    volumeEnabled.value = false
  } else {
    volumeIndicatorId = chart.createIndicator('VOL')
    volumeEnabled.value = Boolean(volumeIndicatorId)
  }
}

function resetView() {
  if (!chart || normalizedBars.length === 0) return
  const availableWidth = Math.max(320, chartContainer.value?.clientWidth || 800) - 90
  const barSpace = Math.max(4, Math.min(12, availableWidth / normalizedBars.length))
  chart.setBarSpace(barSpace)
  chart.setOffsetRightDistance(24)
  chart.scrollToRealTime(200)
}

function focusTradeView() {
  if (!chart || normalizedBars.length === 0) return
  const entryEvent = executionEvents().find((event) => event.kind === 'entry')
  const focusBar = entryEvent ? closestBar(entryEvent.timestamp) : normalizedBars[0]
  const availableWidth = Math.max(320, chartContainer.value?.clientWidth || 800) - 90
  const barSpace = Math.max(8, Math.min(20, availableWidth / 55))

  chart.setBarSpace(barSpace)
  chart.setOffsetRightDistance(availableWidth / 2)
  chart.scrollToTimestamp(focusBar.timestamp, 200)
}

function applyTheme() {
  chart?.setStyles(chartStyles())
}

async function createChart() {
  await nextTick()
  if (!chartContainer.value) return

  resizeObserver?.disconnect()
  resizeObserver = null
  if (chart) dispose(chartContainer.value)
  movingAverageIndicatorId = null
  volumeIndicatorId = null
  drawingHistory = []
  chart = init(chartContainer.value, {
    locale: 'en-US',
    timezone: props.chartData?.interval === 'daily' ? 'UTC' : (props.timezone || 'UTC'),
    styles: chartStyles(),
    layout: {
      basicParams: {
        yAxisPosition: 'right',
        paneMinHeight: 80,
      },
    },
  })

  if (!chart) return

  normalizedBars = normalizeChartData(props.chartData?.candles)
  const ticker = props.chartData?.chart_symbol || props.chartData?.trade?.symbol || props.chartData?.symbol || 'Trade'

  chart.setSymbol({ ticker, pricePrecision: pricePrecision(), volumePrecision: 0 })
  chart.setPeriod(intervalToPeriod(props.chartData?.interval))
  chart.setDataLoader({
    getBars: ({ type, callback }) => {
      callback(type === 'init' ? normalizedBars : [], false)
    },
  })

  if (maEnabled.value) addMovingAverages()
  if (volumeEnabled.value) volumeIndicatorId = chart.createIndicator('VOL')

  addExecutionMarkers()
  restoreDrawings()
  requestAnimationFrame(focusTradeView)

  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartContainer.value)
}

watch(
  () => props.chartData,
  () => createChart(),
  { deep: false }
)

onMounted(() => {
  createChart()
  themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  if (chartContainer.value) dispose(chartContainer.value)
  chart = null
})
</script>

<style scoped>
.chart-tool-button {
  @apply inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-offset-gray-800;
}

.chart-tool-button-active {
  @apply bg-primary-100 text-primary-800 shadow-sm dark:bg-primary-900/40 dark:text-primary-200;
}
</style>
