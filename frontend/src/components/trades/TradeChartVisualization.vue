<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trade Visualization</h3>
        <div v-if="chartData" class="flex items-center space-x-2">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ chartData.interval === 'daily' ? 'Daily' : chartData.interval }} chart
          </span>
          <div v-if="chartData.usage" class="text-xs text-gray-500 dark:text-gray-400">
            ({{ chartData.usage.dailyCallsRemaining }}/25 API calls remaining today)
          </div>
        </div>
      </div>

      <!-- Show Chart Button -->
      <div v-if="!showChart && !loading" class="text-center py-8">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          View Trade Chart
        </h4>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          See your entry and exit points on a candlestick chart with market context
        </p>
        <button 
          @click="loadChart" 
          class="btn-primary"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Load Chart
        </button>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Uses 1 API call (25 free per day)
        </p>
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="error" class="text-center py-16">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p class="text-red-600 dark:text-red-400 mb-2 font-medium">{{ error }}</p>
        <p v-if="error.includes('limit')" class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The free tier allows 25 API calls per day. Try again tomorrow or consider upgrading for unlimited access.
        </p>
        <p v-else-if="error.includes('not configured')" class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Chart service requires API configuration. Contact your administrator to enable chart visualization.
        </p>
        <p v-else class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Unable to load chart data. Check the console for more details.
        </p>
        <button 
          @click="loadChart" 
          class="btn-secondary text-sm"
          :disabled="error.includes('limit') || error.includes('not configured')"
        >
          Try Again
        </button>
      </div>

      <div v-else-if="!isConfigured" class="text-center py-16">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p class="text-gray-600 dark:text-gray-400 mb-2">Chart visualization not configured</p>
        <p class="text-sm text-gray-500 dark:text-gray-500">
          Contact your administrator to enable trade charts.
        </p>
      </div>

      <div v-else-if="showChart" class="relative">
        <div ref="chartContainer" class="w-full h-96"></div>
        
        <div v-if="chartData && chartData.trade" class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt class="text-gray-500 dark:text-gray-400">Entry</dt>
            <dd class="font-medium text-gray-900 dark:text-white">
              ${{ formatNumber(chartData.trade.entryPrice) }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500 dark:text-gray-400">Exit</dt>
            <dd class="font-medium text-gray-900 dark:text-white">
              ${{ formatNumber(chartData.trade.exitPrice) }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500 dark:text-gray-400">P&L</dt>
            <dd class="font-medium" :class="chartData.trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ chartData.trade.pnl >= 0 ? '+' : '' }}${{ formatNumber(Math.abs(chartData.trade.pnl)) }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-500 dark:text-gray-400">Return</dt>
            <dd class="font-medium" :class="chartData.trade.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ chartData.trade.pnlPercent >= 0 ? '+' : '' }}{{ formatNumber(chartData.trade.pnlPercent) }}%
            </dd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as LightweightCharts from 'lightweight-charts'
import api from '@/services/api'

const props = defineProps({
  tradeId: {
    type: [String, Number],
    required: true
  }
})

const chartContainer = ref(null)
const loading = ref(false)
const error = ref(null)
const isConfigured = ref(true)
const chartData = ref(null)
const showChart = ref(false)
let chart = null
let candleSeries = null

const formatNumber = (num) => {
  return parseFloat(num).toFixed(2)
}

const createTradeChart = () => {
  if (!chartContainer.value || !chartData.value) {
    console.error('Missing chart container or data:', { 
      container: !!chartContainer.value, 
      data: !!chartData.value 
    })
    return
  }

  // Clean up existing chart
  if (chart) {
    chart.remove()
  }

  // Get current theme
  const isDark = document.documentElement.classList.contains('dark')

  try {
    console.log('Creating chart with LightweightCharts:', LightweightCharts)
    console.log('createChart function:', typeof LightweightCharts.createChart)
    // Create chart with theme-appropriate colors
    chart = LightweightCharts.createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 384, // 96 * 4 (h-96)
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: isDark ? '#e5e7eb' : '#111827',
    },
    grid: {
      vertLines: { color: isDark ? '#374151' : '#e5e7eb' },
      horzLines: { color: isDark ? '#374151' : '#e5e7eb' },
    },
    timeScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db',
    },
    rightPriceScale: {
      borderColor: isDark ? '#4b5563' : '#d1d5db',
    },
  })

  console.log('Chart created successfully:', chart)
  console.log('Chart methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(chart)))
  console.log('All chart methods:', Object.getOwnPropertyNames(chart))

  // Check available methods that might create series
  const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(chart))
    .filter(method => method.includes('Series') || method.includes('series'))
  console.log('Available series methods:', availableMethods)

  // Check data first before creating series
  console.log('Chart data candles:', chartData.value.candles)
  console.log('First candle sample:', chartData.value.candles[0])
  console.log('Candles length:', chartData.value.candles.length)
  
  if (!chartData.value.candles || chartData.value.candles.length === 0) {
    const symbol = chartData.value.symbol || 'Unknown'
    const usage = chartData.value.usage
    let errorMsg = `No chart data available for ${symbol}.`
    
    if (usage && usage.dailyCallsRemaining !== undefined) {
      errorMsg += ` API calls remaining: ${usage.dailyCallsRemaining}/25.`
    }
    
    errorMsg += '\n\nThis may be due to:'
    errorMsg += '\n• Symbol not found or delisted'
    errorMsg += '\n• No trading activity in the selected time period'  
    errorMsg += '\n• Alpha Vantage API limitations'
    errorMsg += '\n• Daily API limit reached (25 calls per day)'
    errorMsg += '\n\n💡 Try testing with common symbols like:'
    errorMsg += '\n   AAPL, MSFT, GOOGL, TSLA, SPY'
    
    throw new Error(errorMsg)
  }

  // Create candlestick series using the correct v5 API
  console.log('Creating candlestick series...')
  try {
    // Use the correct v5 API syntax with CandlestickSeries
    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
  } catch (error) {
    console.error('Failed to create candlestick series:', error.message)
    throw new Error(`Failed to create candlestick series: ${error.message}`)
  }
  console.log('Candlestick series created successfully')
  
  // Validate data format
  const firstCandle = chartData.value.candles[0]
  const requiredFields = ['time', 'open', 'high', 'low', 'close']
  const missingFields = requiredFields.filter(field => !(field in firstCandle))
  
  if (missingFields.length > 0) {
    console.error('Missing required fields in candle data:', missingFields)
    console.error('Available fields:', Object.keys(firstCandle))
    throw new Error(`Invalid candle data format. Missing: ${missingFields.join(', ')}`)
  }
  
  // Make sure all numeric values are valid and properly formatted
  const validatedCandles = chartData.value.candles.map((candle, index) => {
    const validated = {
      time: Number(candle.time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    }
    
    // Check for invalid data
    if (isNaN(validated.time) || isNaN(validated.open) || isNaN(validated.high) || 
        isNaN(validated.low) || isNaN(validated.close)) {
      console.warn(`Invalid candle at index ${index}:`, candle)
      return null
    }
    
    // Check for logical consistency (high >= low, etc.)
    if (validated.high < validated.low || 
        validated.open < 0 || validated.close < 0) {
      console.warn(`Logically invalid candle at index ${index}:`, validated)
      return null
    }
    
    return validated
  }).filter(candle => candle !== null)
  
  console.log('Validated candles:', validatedCandles.length, 'of', chartData.value.candles.length)
  console.log('Sample validated candle:', validatedCandles[0])
  
  if (validatedCandles.length === 0) {
    throw new Error('No valid candle data after validation')
  }
  
  // Sort by time to ensure chronological order
  validatedCandles.sort((a, b) => a.time - b.time)
  
  console.log('Setting data on candlestick series...')
  candleSeries.setData(validatedCandles)
  console.log('Data set successfully')

  // Add entry and exit markers
  const markers = []
  const trade = chartData.value.trade
  
  console.log('Trade data for markers:', trade)
  console.log('Entry time:', trade.entryTime, 'Exit time:', trade.exitTime)

  // Entry marker - bigger and more prominent
  if (trade.entryTime && trade.entryPrice) {
    markers.push({
      time: Number(trade.entryTime),
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: `📈 ENTRY: $${formatNumber(trade.entryPrice)} (${trade.side.toUpperCase()})`,
      size: 1.5, // Make marker larger
    })
  }

  // Exit marker - bigger and more prominent
  if (trade.exitTime && trade.exitPrice) {
    const pnlText = trade.pnl >= 0 ? `+$${formatNumber(trade.pnl)}` : `-$${formatNumber(Math.abs(trade.pnl))}`
    markers.push({
      time: Number(trade.exitTime),
      position: 'aboveBar',
      color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
      shape: 'arrowDown',
      text: `📉 EXIT: $${formatNumber(trade.exitPrice)} (${pnlText})`,
      size: 1.5, // Make marker larger
    })
  }
  
  console.log('Markers to set:', markers)
  
  if (markers.length > 0) {
    candleSeries.setMarkers(markers)
  }

  // Add prominent price lines for entry and exit
  const entryPriceLine = candleSeries.createPriceLine({
    price: trade.entryPrice,
    color: '#10b981',
    lineWidth: 3, // Thicker line
    lineStyle: 2, // Dashed
    axisLabelVisible: true,
    title: `Entry: $${formatNumber(trade.entryPrice)}`,
  })

  const exitPriceLine = candleSeries.createPriceLine({
    price: trade.exitPrice,
    color: trade.pnl >= 0 ? '#10b981' : '#ef4444', // Color based on profit/loss
    lineWidth: 3, // Thicker line
    lineStyle: 2, // Dashed
    axisLabelVisible: true,
    title: `Exit: $${formatNumber(trade.exitPrice)}`,
  })

  // Add a profit/loss zone if trade was profitable
  if (trade.pnl !== 0) {
    const zonePriceLine = candleSeries.createPriceLine({
      price: (trade.entryPrice + trade.exitPrice) / 2, // Middle price
      color: trade.pnl >= 0 ? '#10b981' : '#ef4444',
      lineWidth: 1,
      lineStyle: 3, // Dotted
      axisLabelVisible: false,
      title: trade.pnl >= 0 ? `Profit Zone` : `Loss Zone`,
    })
  }

  // Fit content
  chart.timeScale().fitContent()

  // Handle resize
  const handleResize = () => {
    if (chart && chartContainer.value) {
      chart.applyOptions({ width: chartContainer.value.clientWidth })
    }
  }

  window.addEventListener('resize', handleResize)

  // Store resize handler for cleanup
  chart._resizeHandler = handleResize
  
  console.log('Chart creation completed successfully')
  
  } catch (error) {
    console.error('Error creating chart:', error)
    error.value = `Chart creation failed: ${error.message}`
  }
}

const fetchChartData = async () => {
  loading.value = true
  error.value = null

  try {
    console.log(`Fetching chart data for trade ${props.tradeId}`)
    const response = await api.get(`/trades/${props.tradeId}/chart-data`)
    console.log('Chart data response:', response.data)
    chartData.value = response.data
    
    // Create chart after data is loaded
    setTimeout(() => {
      createTradeChart()
    }, 100)
  } catch (err) {
    console.error('Failed to fetch chart data:', err)
    console.error('Error response:', err.response?.data)
    console.error('Error status:', err.response?.status)
    
    if (err.response?.status === 503) {
      isConfigured.value = false
      error.value = err.response.data.error || 'Chart service not configured'
    } else if (err.response?.status === 429) {
      error.value = err.response.data.error || 'API rate limit exceeded'
    } else if (err.response?.status === 400) {
      error.value = err.response.data.error || 'Invalid request'
    } else {
      error.value = err.response?.data?.error || 'Failed to load chart data'
    }
  } finally {
    loading.value = false
  }
}

const loadChart = () => {
  showChart.value = true
  fetchChartData()
}

// Watch for theme changes
watch(() => document.documentElement.classList.contains('dark'), () => {
  if (chartData.value) {
    createTradeChart()
  }
})

// Don't auto-load chart data on mount anymore

onUnmounted(() => {
  if (chart) {
    if (chart._resizeHandler) {
      window.removeEventListener('resize', chart._resizeHandler)
    }
    chart.remove()
  }
})
</script>