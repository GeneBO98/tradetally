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
          :disabled="drawingToolDisabled(tool)"
          :title="drawingToolTitle(tool)"
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
        <span v-else-if="activeTool === 'pnl'" class="font-medium text-primary-600 dark:text-primary-400">
          P&L starts at the recorded entry price. Click a target price to measure the trade return.
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowTrendingUpIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingOutIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  MinusIcon,
  PaintBrushIcon,
  PencilIcon,
  PresentationChartLineIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { dispose, init, registerOverlay } from 'klinecharts'
import {
  calculateChartPnlMeasurement,
  formatSignedChartCurrency,
  formatSignedChartPercent,
} from '@/utils/chartPnlMeasurement'

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
  currencyCode: {
    type: String,
    default: 'USD',
  },
})

const emit = defineEmits(['resolution-change'])

const USER_DRAWING_GROUP = 'trade-user-drawings'
const EXECUTION_GROUP = 'trade-executions'
const EXECUTION_OVERLAY = 'tradeExecutionMarker'
const EXIT_OVERLAY = 'tradeActualExitLine'
const POSITION_GROUP = 'trade-planned-position'
const POSITION_OVERLAY = 'tradePositionOverlay'
const PNL_OVERLAY = 'tradePnlMeasurement'
const resolutionOptions = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: 'D', label: '1D' },
]

let executionOverlayRegistered = false
let exitOverlayRegistered = false
let positionOverlayRegistered = false
let pnlOverlayRegistered = false

function registerPnlOverlay() {
  if (pnlOverlayRegistered) return

  registerOverlay({
    name: PNL_OVERLAY,
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    performEventMoveForDrawing: function ({ performPointIndex, performPoint, points }) {
      if (performPointIndex !== 0) return
      const raw_entry_price = this.extendData?.entry_price
      if (raw_entry_price === null || raw_entry_price === undefined || raw_entry_price === '') return
      const entry_price = Number(raw_entry_price)
      if (!Number.isFinite(entry_price)) return
      performPoint.value = entry_price
      points[0].value = entry_price
    },
    performEventPressedMove: function ({ performPointIndex, performPoint, points }) {
      if (performPointIndex !== 0) return
      const raw_entry_price = this.extendData?.entry_price
      if (raw_entry_price === null || raw_entry_price === undefined || raw_entry_price === '') return
      const entry_price = Number(raw_entry_price)
      if (!Number.isFinite(entry_price)) return
      performPoint.value = entry_price
      points[0].value = entry_price
    },
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      if (coordinates.length < 2 || overlay.points.length < 2) return []

      const start = coordinates[0]
      const end = coordinates[1]
      const data = overlay.extendData || {}
      const measurement = calculateChartPnlMeasurement({
        entry_price: data.entry_price ?? overlay.points[0]?.value,
        exit_price: overlay.points[1]?.value,
        quantity: data.quantity,
        side: data.side,
        instrument_type: data.instrument_type,
        contract_size: data.contract_size,
        point_value: data.point_value,
      })
      if (!measurement) return []

      const is_profit = measurement.dollar_pnl > 0
      const is_loss = measurement.dollar_pnl < 0
      const color = is_profit ? '#059669' : (is_loss ? '#dc2626' : '#6b7280')
      const fill_color = is_profit
        ? 'rgba(5, 150, 105, 0.12)'
        : (is_loss ? 'rgba(220, 38, 38, 0.12)' : 'rgba(107, 114, 128, 0.12)')
      const left = Math.min(start.x, end.x)
      const top = Math.min(start.y, end.y)
      const width = Math.max(1, Math.abs(end.x - start.x))
      const height = Math.max(1, Math.abs(end.y - start.y))
      const label_x = Math.max(72, Math.min(bounding.width - 72, (start.x + end.x) / 2))
      const label_y = Math.max(14, Math.min(bounding.height - 14, (start.y + end.y) / 2))
      const percent_label = formatSignedChartPercent(measurement.pnl_percent) || 'N/A'
      const currency_label = data.show_dollar_pnl === false
        ? null
        : formatSignedChartCurrency(measurement.dollar_pnl, data.currency_code)
      const label = currency_label
        ? `${currency_label} (${percent_label} trade return)`
        : `${percent_label} underlying move`

      return [
        {
          key: 'pnl-range',
          type: 'rect',
          attrs: { x: left, y: top, width, height },
          styles: {
            style: 'stroke_fill',
            color: fill_color,
            borderColor: color,
            borderSize: 1,
            borderStyle: 'solid',
            borderRadius: 2,
          },
          ignoreEvent: ['onPressedMoveStart', 'onPressedMoving', 'onPressedMoveEnd'],
        },
        {
          key: 'pnl-label',
          type: 'text',
          attrs: {
            x: label_x,
            y: label_y,
            text: label,
            align: 'center',
            baseline: 'middle',
          },
          styles: {
            style: 'fill',
            color: '#ffffff',
            size: 11,
            weight: 600,
            backgroundColor: color,
            borderRadius: 4,
            paddingLeft: 6,
            paddingTop: 3,
            paddingRight: 6,
            paddingBottom: 3,
          },
          ignoreEvent: true,
        },
      ]
    },
  })

  pnlOverlayRegistered = true
}

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

function registerExitOverlay() {
  if (exitOverlayRegistered) return

  registerOverlay({
    name: EXIT_OVERLAY,
    totalStep: 3,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []

      const color = overlay.extendData?.color || '#6b7280'
      return [{
        type: 'line',
        attrs: { coordinates: [coordinates[0], coordinates[1]] },
        styles: { style: 'solid', size: 2, color },
        ignoreEvent: true,
      }]
    },
  })

  exitOverlayRegistered = true
}

registerExecutionOverlay()
registerExitOverlay()
registerPnlOverlay()

function registerPositionOverlay() {
  if (positionOverlayRegistered) return

  registerOverlay({
    name: POSITION_OVERLAY,
    totalStep: 5,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay, yAxis, bounding }) => {
      if (coordinates.length < 2 || !yAxis) return []

      const data = overlay.extendData || {}
      const entryPrice = Number(data.entry_price)
      const stopLoss = Number(data.stop_loss)
      const takeProfit = Number(data.take_profit)
      if (![entryPrice, stopLoss, takeProfit].every(Number.isFinite)) return []

      const left = Math.max(0, Math.min(coordinates[0].x, coordinates[1].x))
      const right = Math.min(bounding.width, Math.max(coordinates[0].x, coordinates[1].x))
      const width = Math.max(1, right - left)
      const entryY = yAxis.convertToPixel(entryPrice)
      const stopY = yAxis.convertToPixel(stopLoss)
      const targetY = yAxis.convertToPixel(takeProfit)
      const profitTop = Math.min(entryY, targetY)
      const riskTop = Math.min(entryY, stopY)
      return [
        {
          type: 'rect',
          attrs: { x: left, y: profitTop, width, height: Math.max(1, Math.abs(targetY - entryY)) },
          styles: {
            style: 'stroke_fill',
            color: 'rgba(5, 150, 105, 0.14)',
            borderColor: '#059669',
            borderSize: 1,
            borderStyle: 'solid',
          },
          ignoreEvent: true,
        },
        {
          type: 'rect',
          attrs: { x: left, y: riskTop, width, height: Math.max(1, Math.abs(stopY - entryY)) },
          styles: {
            style: 'stroke_fill',
            color: 'rgba(220, 38, 38, 0.12)',
            borderColor: '#dc2626',
            borderSize: 1,
            borderStyle: 'solid',
          },
          ignoreEvent: true,
        },
        {
          type: 'line',
          attrs: { coordinates: [{ x: left, y: entryY }, { x: right, y: entryY }] },
          styles: { style: 'dashed', size: 1, color: '#6b7280', dashedValue: [4, 3] },
          ignoreEvent: true,
        },
      ]
    },
  })

  positionOverlayRegistered = true
}

registerPositionOverlay()

function requestResolution(resolution) {
  if (props.resolutionLoading || !props.availableResolutions.includes(resolution)) return
  if (resolution !== props.selectedResolution) emit('resolution-change', resolution)
}

const chartContainer = ref(null)
const activeTool = ref(null)
const maEnabled = ref(false)
const volumeEnabled = ref(false)
const hasPriceMismatch = ref(false)
const isUnderlyingOptionChart = computed(() => {
  const trade = props.chartData?.trade || {}
  return String(trade.instrument_type ?? trade.instrumentType).toLowerCase() === 'option'
})

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
    id: 'pnl',
    label: 'P&L',
    description: 'Measure percentage return and estimated gross P&L from this trade\'s recorded entry price and size',
    overlay: PNL_OVERLAY,
    icon: CurrencyDollarIcon,
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

function drawingToolDisabled(tool) {
  return tool.id === 'pnl' && isUnderlyingOptionChart.value
}

function drawingToolTitle(tool) {
  if (drawingToolDisabled(tool)) {
    return 'P&L measurement is unavailable because this chart shows the option underlying, not its premium'
  }
  return tool.description
}

function pnlMeasurementExtendData() {
  const trade = props.chartData?.trade || {}
  const instrument_type = String(trade.instrument_type ?? trade.instrumentType ?? 'stock').toLowerCase()
  const entry_price = Number(trade.entry_price ?? trade.entryPrice)

  return {
    quantity: Math.abs(Number(trade.quantity)) || 1,
    side: String(trade.side || 'long').toLowerCase(),
    instrument_type,
    contract_size: Number(trade.contract_size ?? trade.contractSize) || 100,
    point_value: Number(trade.point_value ?? trade.pointValue) || 1,
    entry_price: Number.isFinite(entry_price) ? entry_price : null,
    currency_code: props.currencyCode,
    show_dollar_pnl: instrument_type !== 'option',
  }
}

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
      const extend_data = drawing.name === PNL_OVERLAY
        ? { ...(drawing.extendData || {}), ...pnlMeasurementExtendData() }
        : drawing.extendData
      const raw_entry_price = extend_data?.entry_price
      const entry_price = Number(raw_entry_price)
      const has_entry_price = raw_entry_price !== null && raw_entry_price !== undefined &&
        raw_entry_price !== '' && Number.isFinite(entry_price)
      const points = drawing.name === PNL_OVERLAY && has_entry_price
        ? drawing.points.map((point, index) => (
          index === 0 ? { ...point, value: entry_price } : point
        ))
        : drawing.points

      chart.createOverlay({
        name: drawing.name,
        groupId: USER_DRAWING_GROUP,
        points,
        styles: drawing.styles,
        extendData: extend_data,
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

function plannedPosition() {
  const trade = props.chartData?.trade || {}
  const instrumentType = String(trade.instrumentType ?? trade.instrument_type).toLowerCase()
  if (instrumentType === 'option') return null

  const side = String(trade.side || '').toLowerCase()
  const entryPrice = Number(trade.entryPrice ?? trade.entry_price)
  const stopLoss = Number(trade.stop_loss ?? trade.stopLoss)
  const takeProfit = Number(trade.take_profit ?? trade.takeProfit)
  if (!['long', 'short'].includes(side) || ![entryPrice, stopLoss, takeProfit].every(Number.isFinite)) {
    return null
  }

  const validDirection = side === 'long'
    ? stopLoss < entryPrice && takeProfit > entryPrice
    : stopLoss > entryPrice && takeProfit < entryPrice
  if (!validDirection) return null

  const risk = Math.abs(entryPrice - stopLoss)
  const reward = Math.abs(takeProfit - entryPrice)
  if (risk <= 0 || reward <= 0) return null

  return {
    side,
    entry_price: entryPrice,
    stop_loss: stopLoss,
    take_profit: takeProfit,
    risk_reward: reward / risk,
    price_precision: pricePrecision(),
  }
}

function addPositionOverlay() {
  if (!chart) return
  chart.removeOverlay({ groupId: POSITION_GROUP })

  const position = plannedPosition()
  if (!position || normalizedBars.length < 2) return null

  const trade = props.chartData?.trade || {}
  const entryTimestamp = parseExecutionTimestamp(trade.entryTime ?? trade.entryDate)
  const exitTimestamp = parseExecutionTimestamp(trade.exitTime ?? trade.exitDate)
  const entryBar = entryTimestamp === null ? null : closestBar(entryTimestamp)
  if (!entryBar) return null

  let endBar = exitTimestamp === null ? normalizedBars.at(-1) : closestBar(exitTimestamp)
  const entryIndex = normalizedBars.findIndex((bar) => bar.timestamp === entryBar.timestamp)
  const endIndex = normalizedBars.findIndex((bar) => bar.timestamp === endBar?.timestamp)
  if (endIndex <= entryIndex) {
    endBar = normalizedBars[Math.min(entryIndex + 1, normalizedBars.length - 1)]
  }
  if (!endBar || endBar.timestamp === entryBar.timestamp) return null

  chart.createOverlay({
    name: POSITION_OVERLAY,
    groupId: POSITION_GROUP,
    lock: true,
    points: [
      { timestamp: entryBar.timestamp, value: position.entry_price },
      { timestamp: endBar.timestamp, value: position.entry_price },
      { timestamp: endBar.timestamp, value: position.take_profit },
      { timestamp: endBar.timestamp, value: position.stop_loss },
    ],
    extendData: position,
  })

  return position
}

function addActualExitLine(position) {
  if (!chart || !position) return
  chart.removeOverlay({ groupId: EXECUTION_GROUP })
  hasPriceMismatch.value = false

  const trade = props.chartData?.trade || {}
  const entryTimestamp = parseExecutionTimestamp(trade.entryTime ?? trade.entryDate)
  const exitTimestamp = parseExecutionTimestamp(trade.exitTime ?? trade.exitDate)
  const exitPrice = Number(trade.exitPrice ?? trade.exit_price)
  if (entryTimestamp === null || exitTimestamp === null || !Number.isFinite(exitPrice)) return

  const entryBar = closestBar(entryTimestamp)
  const exitBar = closestBar(exitTimestamp)
  if (!entryBar || !exitBar) return

  const exitIndex = normalizedBars.findIndex((bar) => bar.timestamp === exitBar.timestamp)
  let startBar = entryBar
  if (startBar.timestamp === exitBar.timestamp) {
    startBar = normalizedBars[Math.max(0, exitIndex - 1)]
  }
  if (!startBar || startBar.timestamp === exitBar.timestamp) return

  const candleTolerance = Math.max(
    Math.abs(exitPrice) * 0.001,
    Math.abs(exitBar.high - exitBar.low) * 0.1
  )
  hasPriceMismatch.value = exitPrice < exitBar.low - candleTolerance || exitPrice > exitBar.high + candleTolerance

  const pnl = Number(trade.pnl)
  const profitable = Number.isFinite(pnl)
    ? pnl > 0
    : (position.side === 'long' ? exitPrice > position.entry_price : exitPrice < position.entry_price)
  const losing = Number.isFinite(pnl)
    ? pnl < 0
    : (position.side === 'long' ? exitPrice < position.entry_price : exitPrice > position.entry_price)
  const color = profitable ? '#059669' : (losing ? '#dc2626' : '#6b7280')

  chart.createOverlay({
    name: EXIT_OVERLAY,
    groupId: EXECUTION_GROUP,
    lock: true,
    points: [
      { timestamp: startBar.timestamp, value: exitPrice },
      { timestamp: exitBar.timestamp, value: exitPrice },
    ],
    extendData: { color },
  })
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
  if (!chart || drawingToolDisabled(tool)) return
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
    extendData: tool.id === 'pnl' ? pnlMeasurementExtendData() : undefined,
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
  const events = executionEvents()
  const event_index = (event) => {
    const bar = closestBar(event.timestamp)
    return bar ? normalizedBars.findIndex(({ timestamp }) => timestamp === bar.timestamp) : -1
  }
  const entry_indices = events
    .filter(({ kind }) => kind === 'entry')
    .map(event_index)
    .filter((index) => index >= 0)
  const exit_indices = events
    .filter(({ kind }) => kind === 'exit')
    .map(event_index)
    .filter((index) => index >= 0)
  const entry_index = entry_indices.length > 0 ? Math.min(...entry_indices) : 0
  const exit_index = exit_indices.length > 0 ? Math.max(...exit_indices) : entry_index
  const range_start = Math.min(entry_index, exit_index)
  const range_end = Math.max(entry_index, exit_index)
  const trade_bar_count = range_end - range_start + 1
  const padding_bar_count = Math.max(10, Math.ceil(trade_bar_count * 0.15))
  const visible_bar_count = Math.max(55, trade_bar_count + (padding_bar_count * 2))
  const focus_index = Math.floor((range_start + range_end) / 2)
  const focusBar = normalizedBars[focus_index] || normalizedBars[entry_index] || normalizedBars[0]
  const availableWidth = Math.max(320, chartContainer.value?.clientWidth || 800) - 90
  const barSpace = Math.max(1, Math.min(20, availableWidth / visible_bar_count))

  chart.setBarSpace(barSpace)
  chart.scrollToTimestamp(focusBar.timestamp)
  chart.scrollByDistance(-((availableWidth - barSpace) / 2))
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

  const position = addPositionOverlay()
  if (position) addActualExitLine(position)
  else addExecutionMarkers()
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
  @apply inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-offset-gray-800;
}

.chart-tool-button-active {
  @apply bg-primary-100 text-primary-800 shadow-sm dark:bg-primary-900/40 dark:text-primary-200;
}
</style>
