<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trade Visualization</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Price chart with entry, exit, stop loss, and take profit levels
      </p>
    </div>

    <div class="p-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-16">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p class="text-sm text-gray-500 dark:text-gray-400">Loading chart data...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-16">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p class="text-red-600 dark:text-red-400 mb-4">{{ error }}</p>
        <button @click="loadChart" class="btn-secondary text-sm">
          Try Again
        </button>
      </div>

      <!-- Initial State / No Data -->
      <div v-else-if="!showChart && !loading && !error" class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 mb-4">Chart will load automatically</p>
        <button @click="loadChart" class="btn-secondary text-sm">
          Load Chart Manually
        </button>
      </div>

      <!-- Chart Container -->
      <div v-else-if="showChart">
        <!-- Price Level Warnings -->
        <div v-if="priceWarnings.length > 0" class="mb-4 space-y-2">
          <div
            v-for="(warning, index) in priceWarnings"
            :key="index"
            :class="[
              'px-4 py-3 rounded-lg text-sm flex items-start gap-2',
              warning.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
            ]"
          >
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{{ warning.message }}</span>
          </div>
        </div>

        <div ref="chartContainer" class="w-full h-96"></div>

        <!-- Legend -->
        <div class="mt-4 flex flex-wrap gap-4 text-sm">
          <div class="flex items-center">
            <svg class="w-4 h-4 mr-1 text-emerald-600 dark:text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-8 8h5v8h6v-8h5z"/>
            </svg>
            <span class="text-gray-600 dark:text-gray-400">Entry: ${{ formatPrice(trade.entry_price) }}</span>
          </div>
          <div class="flex items-center">
            <svg class="w-4 h-4 mr-1 text-red-600 dark:text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 20l8-8h-5V4H9v8H4z"/>
            </svg>
            <span class="text-gray-600 dark:text-gray-400">Exit: ${{ formatPrice(trade.exit_price) }}</span>
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full bg-red-600 dark:bg-red-500 mr-2"></span>
            <span class="text-gray-600 dark:text-gray-400">Stop Loss: ${{ formatPrice(trade.stop_loss) }}</span>
          </div>
          <div v-if="trade.take_profit" class="flex items-center">
            <span class="w-3 h-3 rounded-full bg-primary-600 dark:bg-primary-500 mr-2"></span>
            <span class="text-gray-600 dark:text-gray-400">Take Profit: ${{ formatPrice(trade.take_profit) }}</span>
            <!-- Achievability indicator -->
            <span
              v-if="takeProfitAchievable !== null"
              :class="[
                'ml-2 px-2 py-0.5 text-xs font-medium rounded-full',
                takeProfitAchievable
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              ]"
            >
              {{ takeProfitAchievable ? 'Achievable' : 'Not Reached' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as LightweightCharts from 'lightweight-charts'
import api from '@/services/api'

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  autoLoad: {
    type: Boolean,
    default: true
  }
})

const chartContainer = ref(null)
const showChart = ref(false)
const loading = ref(false)
const error = ref(null)
const chartData = ref(null)
const priceWarnings = ref([])  // Warnings about unreachable TP/SL
const takeProfitAchievable = ref(null)  // null = no TP set, true = achievable, false = not achievable
let chart = null
let candleSeries = null

async function loadChart() {
  if (loading.value) return

  loading.value = true
  error.value = null

  try {
    console.log('[CHART] Loading chart data for trade:', props.trade.id)
    const response = await api.get(`/trades/${props.trade.id}/chart-data`)
    console.log('[CHART] Chart data received:', response.data)
    chartData.value = response.data

    // IMPORTANT: Set loading to false BEFORE showChart to true
    // The template uses v-if="loading" which hides the chart container
    // If loading is still true when we call createChart(), chartContainer.value will be null
    loading.value = false
    showChart.value = true

    await nextTick()
    createChart()
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to load chart data'
    error.value = errorMsg
    console.error('[CHART] Error loading chart:', err)
    loading.value = false
  }
}

// Auto-load chart when component mounts
onMounted(() => {
  if (props.autoLoad && props.trade?.id) {
    loadChart()
  }
})

// Validate if stop loss and take profit prices were achievable during the trade
function validatePriceLevels(candles, trade) {
  const warnings = []

  // Reset take profit achievable status
  takeProfitAchievable.value = null

  if (!candles || candles.length === 0) return warnings

  const entryPrice = parseFloat(trade.entry_price)
  const stopLoss = parseFloat(trade.stop_loss)
  const takeProfit = trade.take_profit ? parseFloat(trade.take_profit) : null
  const side = trade.side

  // Find the price range during the visible candle data
  let lowestPrice = Infinity
  let highestPrice = -Infinity

  for (const candle of candles) {
    if (candle.low < lowestPrice) lowestPrice = candle.low
    if (candle.high > highestPrice) highestPrice = candle.high
  }

  console.log('[CHART] Price range in candles:', { lowestPrice, highestPrice })
  console.log('[CHART] Trade levels:', { entryPrice, stopLoss, takeProfit, side })

  // Validate stop loss position
  if (side === 'long' && stopLoss >= entryPrice) {
    warnings.push({
      type: 'error',
      message: `Stop loss ($${formatPrice(stopLoss)}) should be below entry price ($${formatPrice(entryPrice)}) for a long trade`
    })
  } else if (side === 'short' && stopLoss <= entryPrice) {
    warnings.push({
      type: 'error',
      message: `Stop loss ($${formatPrice(stopLoss)}) should be above entry price ($${formatPrice(entryPrice)}) for a short trade`
    })
  }

  // Validate take profit position and achievability
  if (takeProfit) {
    // Check if TP is on wrong side of entry
    if (side === 'long' && takeProfit <= entryPrice) {
      warnings.push({
        type: 'error',
        message: `Take profit ($${formatPrice(takeProfit)}) should be above entry price ($${formatPrice(entryPrice)}) for a long trade`
      })
      takeProfitAchievable.value = false
    } else if (side === 'short' && takeProfit >= entryPrice) {
      warnings.push({
        type: 'error',
        message: `Take profit ($${formatPrice(takeProfit)}) should be below entry price ($${formatPrice(entryPrice)}) for a short trade`
      })
      takeProfitAchievable.value = false
    } else {
      // Check if take profit was ever reachable during this trading session
      if (side === 'long') {
        takeProfitAchievable.value = highestPrice >= takeProfit
        if (!takeProfitAchievable.value) {
          warnings.push({
            type: 'warning',
            message: `Take profit ($${formatPrice(takeProfit)}) was never reached - highest price was $${formatPrice(highestPrice)}`
          })
        }
      } else if (side === 'short') {
        takeProfitAchievable.value = lowestPrice <= takeProfit
        if (!takeProfitAchievable.value) {
          warnings.push({
            type: 'warning',
            message: `Take profit ($${formatPrice(takeProfit)}) was never reached - lowest price was $${formatPrice(lowestPrice)}`
          })
        }
      }
    }
  }

  return warnings
}

// Find the best matching candle for a given trade time
// Simple approach: parse the trade time to a timestamp and find the closest candle
function findMatchingCandle(dateStr, candles = []) {
  if (!dateStr || !candles.length) return null

  try {
    console.log('[CHART] Finding matching candle for:', dateStr)

    // Parse the trade time to get a Unix timestamp
    const tradeDate = new Date(dateStr)
    const tradeTimestamp = Math.floor(tradeDate.getTime() / 1000)

    console.log('[CHART] Trade timestamp:', tradeTimestamp, '=', tradeDate.toISOString())

    // Find the candle with the closest timestamp
    let bestCandle = candles[0]
    let bestDiff = Math.abs(candles[0].time - tradeTimestamp)

    for (const candle of candles) {
      const diff = Math.abs(candle.time - tradeTimestamp)
      if (diff < bestDiff) {
        bestDiff = diff
        bestCandle = candle
      }
    }

    const bestDate = new Date(bestCandle.time * 1000)
    console.log('[CHART] Matched candle at timestamp:', bestCandle.time, '=', bestDate.toISOString(), '| Diff:', Math.round(bestDiff / 60), 'min')

    return bestCandle
  } catch (err) {
    console.error('[CHART] Error finding matching candle:', err)
    return candles[0]  // Fallback to first candle
  }
}

function createChart() {
  if (!chartContainer.value || !chartData.value) return

  // Clean up existing chart
  if (chart) {
    chart.remove()
    chart = null
  }

  const isDark = document.documentElement.classList.contains('dark')

  // Create chart
  chart = LightweightCharts.createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 384,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: isDark ? '#e5e7eb' : '#111827',
    },
    grid: {
      vertLines: { color: isDark ? '#374151' : '#e5e7eb' },
      horzLines: { color: isDark ? '#374151' : '#e5e7eb' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal, // Free-range cursor instead of snapping to candles
      vertLine: {
        color: isDark ? '#6b7280' : '#9ca3af',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
      },
      horzLine: {
        color: isDark ? '#6b7280' : '#9ca3af',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: isDark ? '#374151' : '#f3f4f6',
      },
    },
    timeScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db',
    },
  })

  // Create candlestick series - using softer, more muted colors
  candleSeries = chart.addCandlestickSeries({
    upColor: '#059669',      // emerald-600
    downColor: '#dc2626',    // red-600
    borderUpColor: '#059669',
    borderDownColor: '#dc2626',
    wickUpColor: '#059669',
    wickDownColor: '#dc2626',
  })

  // Process candle data
  if (chartData.value.candles && chartData.value.candles.length > 0) {
    const validatedCandles = chartData.value.candles
      .map(candle => ({
        time: Number(candle.time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
      .filter(c => !isNaN(c.time) && !isNaN(c.open))
      .sort((a, b) => a.time - b.time)

    // Deduplicate by time
    const uniqueCandles = Array.from(
      new Map(validatedCandles.map(c => [c.time, c])).values()
    ).sort((a, b) => a.time - b.time)

    candleSeries.setData(uniqueCandles)

    // Add trade markers and price lines
    const tradeCandles = addTradeMarkers(uniqueCandles)
    addPriceLines()

    // Validate price levels against candle data
    priceWarnings.value = validatePriceLevels(uniqueCandles, props.trade)

    // Zoom to the relevant section around the trade
    if (tradeCandles.entry || tradeCandles.exit) {
      const entryIdx = tradeCandles.entry ? uniqueCandles.findIndex(c => c.time === tradeCandles.entry.time) : -1
      const exitIdx = tradeCandles.exit ? uniqueCandles.findIndex(c => c.time === tradeCandles.exit.time) : -1

      // Calculate padding: show ~15 candles before entry and ~15 after exit
      const padding = 15
      const startIdx = Math.max(0, (entryIdx >= 0 ? entryIdx : exitIdx) - padding)
      const endIdx = Math.min(uniqueCandles.length - 1, (exitIdx >= 0 ? exitIdx : entryIdx) + padding)

      if (startIdx < endIdx) {
        const fromTime = uniqueCandles[startIdx].time
        const toTime = uniqueCandles[endIdx].time

        try {
          chart.timeScale().setVisibleRange({ from: fromTime, to: toTime })
          console.log('[CHART] Zoomed to trade range:', { fromTime, toTime, startIdx, endIdx })
        } catch (err) {
          console.warn('[CHART] Could not set visible range, using fitContent:', err)
          chart.timeScale().fitContent()
        }
      } else {
        chart.timeScale().fitContent()
      }
    } else {
      // No trade candles found, fit all content
      chart.timeScale().fitContent()
    }
  }
}

function addTradeMarkers(candles) {
  if (!candles || candles.length === 0) return { entry: null, exit: null }

  // Use trade data from chart API response if available (has accurate timestamps)
  const chartTrade = chartData.value?.trade
  const trade = props.trade
  const markers = []

  // Get entry and exit times - prefer chart API data which has full timestamps
  const entryTime = chartTrade?.entryTime || chartTrade?.entry_time || trade.entry_time || trade.entryTime
  const exitTime = chartTrade?.exitTime || chartTrade?.exit_time || trade.exit_time || trade.exitTime

  // Calculate candle interval to understand data granularity
  let candleInterval = 'unknown'
  if (candles.length >= 2) {
    const intervalSeconds = candles[1].time - candles[0].time
    if (intervalSeconds <= 60) candleInterval = '1 minute'
    else if (intervalSeconds <= 300) candleInterval = '5 minutes'
    else if (intervalSeconds <= 900) candleInterval = '15 minutes'
    else if (intervalSeconds <= 3600) candleInterval = '1 hour'
    else if (intervalSeconds <= 86400) candleInterval = 'daily'
    else candleInterval = `${Math.round(intervalSeconds / 86400)} days`
  }

  // Log candle range for debugging
  const firstCandleDate = new Date(candles[0].time * 1000)
  const lastCandleDate = new Date(candles[candles.length-1].time * 1000)
  console.log('[CHART] ========== MARKER DEBUG ==========')
  console.log('[CHART] Candle data:', {
    count: candles.length,
    interval: candleInterval,
    firstCandle: `${firstCandleDate.getUTCHours()}:${String(firstCandleDate.getUTCMinutes()).padStart(2, '0')} (${firstCandleDate.toISOString()})`,
    lastCandle: `${lastCandleDate.getUTCHours()}:${String(lastCandleDate.getUTCMinutes()).padStart(2, '0')} (${lastCandleDate.toISOString()})`
  })
  console.log('[CHART] Trade times from API:', { entryTime, exitTime })

  // Find matching candles for entry and exit
  const entryCandle = findMatchingCandle(entryTime, candles)
  const exitCandle = findMatchingCandle(exitTime, candles)

  // Add entry marker
  if (entryCandle) {
    const entryPrice = parseFloat(chartTrade?.entryPrice || trade.entry_price)
    const isLong = (chartTrade?.side || trade.side) === 'long'

    markers.push({
      time: entryCandle.time,
      position: 'belowBar',
      color: '#059669',  // emerald-600
      shape: 'arrowUp',
      text: `${isLong ? 'BUY' : 'SELL'} @ $${formatPrice(entryPrice)}`,
      size: 2
    })
  }

  // Add exit marker
  if (exitCandle) {
    const exitPrice = parseFloat(chartTrade?.exitPrice || trade.exit_price)
    const pnl = parseFloat(chartTrade?.pnl || trade.pnl)
    const isProfit = pnl >= 0
    const isLong = (chartTrade?.side || trade.side) === 'long'
    const pnlText = isProfit ? `+$${formatPrice(pnl)}` : `-$${formatPrice(Math.abs(pnl))}`

    markers.push({
      time: exitCandle.time,
      position: 'aboveBar',
      color: '#dc2626',  // red-600
      shape: 'arrowDown',
      text: `${isLong ? 'SELL' : 'BUY'} @ $${formatPrice(exitPrice)} (${pnlText})`,
      size: 2
    })

    // Warn if entry and exit are on the same candle
    if (entryCandle && entryCandle.time === exitCandle.time) {
      console.warn('[CHART] WARNING: Entry and exit are on the SAME candle! This happens when candle interval is larger than trade duration.')
    }
  }

  // Add SL/TP markers at entry candle position (since they're set at entry time)
  if (entryCandle) {
    const stopLoss = parseFloat(trade.stop_loss)
    const takeProfit = trade.take_profit ? parseFloat(trade.take_profit) : null
    const isLong = (chartTrade?.side || trade.side) === 'long'

    // Stop Loss marker - show as a circle marker
    if (stopLoss) {
      markers.push({
        time: entryCandle.time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: '#b91c1c',  // red-700 - slightly darker for visibility
        shape: 'circle',
        text: `SL: $${formatPrice(stopLoss)}`,
        size: 1
      })
    }

    // Take Profit marker - show as a circle marker
    if (takeProfit) {
      markers.push({
        time: entryCandle.time,
        position: isLong ? 'aboveBar' : 'belowBar',
        color: '#4f46e5',  // indigo-600
        shape: 'circle',
        text: `TP: $${formatPrice(takeProfit)}`,
        size: 1
      })
    }
  }

  // Set markers on the chart
  if (markers.length > 0) {
    // Sort markers by time to ensure proper rendering
    markers.sort((a, b) => a.time - b.time)
    candleSeries.setMarkers(markers)
    console.log('[CHART] Set', markers.length, 'trade markers')
  }

  // Return entry and exit candles for zooming
  return { entry: entryCandle, exit: exitCandle }
}

function addPriceLines() {
  // Price lines kept as subtle reference lines for the price levels
  const stopLoss = parseFloat(props.trade.stop_loss)
  const takeProfit = props.trade.take_profit ? parseFloat(props.trade.take_profit) : null

  // Stop loss line (subtle red dotted)
  candleSeries.createPriceLine({
    price: stopLoss,
    color: 'rgba(185, 28, 28, 0.35)',  // red-700 with opacity
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: '',
  })

  // Take profit line (subtle indigo dotted) - only if set
  if (takeProfit) {
    candleSeries.createPriceLine({
      price: takeProfit,
      color: 'rgba(79, 70, 229, 0.35)',  // indigo-600 with opacity
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: '',
    })
  }
}

function formatPrice(value) {
  if (!value) return '-'
  return parseFloat(value).toFixed(2)
}

// Handle resize
function handleResize() {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth })
  }
}

// Watch for trade changes to reload chart
watch(() => props.trade.id, (newId) => {
  showChart.value = false
  chartData.value = null
  error.value = null
  priceWarnings.value = []
  takeProfitAchievable.value = null
  if (chart) {
    chart.remove()
    chart = null
  }
  // Auto-reload for new trade
  if (newId && props.autoLoad) {
    loadChart()
  }
})

// Setup resize listener
if (typeof window !== 'undefined') {
  window.addEventListener('resize', handleResize)
}

// Cleanup
onUnmounted(() => {
  if (chart) {
    chart.remove()
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
})
</script>
