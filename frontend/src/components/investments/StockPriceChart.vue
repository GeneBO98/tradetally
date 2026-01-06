<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Price Chart</h3>

      <!-- Period Selector -->
      <div class="flex space-x-1">
        <button
          v-for="p in periods"
          :key="p.value"
          @click="selectPeriod(p.value)"
          :class="[
            'px-3 py-1 text-sm rounded-md transition-colors',
            selectedPeriod === p.value
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          ]"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <div class="p-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-80">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center h-80 text-center">
        <svg class="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-600 dark:text-gray-400 mb-2">{{ error }}</p>
        <button @click="loadChart" class="text-primary-600 hover:text-primary-800 text-sm">
          Try Again
        </button>
      </div>

      <!-- Chart Container -->
      <div v-else ref="chartContainer" class="w-full" style="height: 320px;"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as LightweightCharts from 'lightweight-charts'
import api from '@/services/api'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  }
})

const periods = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: '5Y', label: '5Y' }
]

const chartContainer = ref(null)
const loading = ref(false)
const error = ref(null)
const selectedPeriod = ref('1Y')
let chart = null
let candleSeries = null

async function loadChart() {
  if (!props.symbol) return

  loading.value = true
  error.value = null

  try {
    console.log('[CHART] Fetching chart for', props.symbol, 'period:', selectedPeriod.value);
    const response = await api.get(`/investments/chart/${props.symbol}`, {
      params: { period: selectedPeriod.value }
    })

    console.log('[CHART] Response:', response.data);
    const { candles } = response.data

    if (!candles || candles.length === 0) {
      error.value = 'No chart data available for this symbol'
      loading.value = false
      return
    }

    // Set loading to false first so the container becomes visible
    loading.value = false
    
    // Wait for Vue to render the DOM after loading changes
    await nextTick()
    
    // Wait a bit more to ensure container is rendered and has dimensions
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Double-check container is ready with retries
    let retries = 0
    while ((!chartContainer.value || chartContainer.value.clientWidth === 0) && retries < 10) {
      console.warn(`[CHART] Container not ready (attempt ${retries + 1}/10), waiting...`)
      await new Promise(resolve => setTimeout(resolve, 100))
      retries++
    }

    if (!chartContainer.value) {
      error.value = 'Chart container not available'
      return
    }

    createChart(candles)
  } catch (err) {
    console.error('Failed to load chart:', err)
    error.value = err.response?.data?.error || 'Failed to load chart data'
    loading.value = false
  }
}

function createChart(candles) {
  if (!chartContainer.value) {
    console.error('[CHART] Chart container not available')
    return
  }

  // Clean up existing chart
  if (chart) {
    try {
      if (chart._resizeHandler) {
        window.removeEventListener('resize', chart._resizeHandler)
      }
      chart.remove()
    } catch (err) {
      console.warn('[CHART] Error removing existing chart:', err)
    }
    chart = null
    candleSeries = null
  }

  // Ensure container has dimensions
  if (chartContainer.value.clientWidth === 0 || chartContainer.value.clientHeight === 0) {
    console.error('[CHART] Chart container has no dimensions')
    error.value = 'Chart container not ready'
    return
  }

  const isDark = document.documentElement.classList.contains('dark')

  try {
    chart = LightweightCharts.createChart(chartContainer.value, {
      width: chartContainer.value.clientWidth,
      height: 320,
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
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: isDark ? '#4b5563' : '#d1d5db',
      },
    })

    candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    // Process and validate candle data
    // LightweightCharts expects Unix timestamps in seconds
    const validCandles = candles
      .map(candle => {
        const time = Number(candle.time);
        return {
          time,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close)
        };
      })
      .filter(c => !isNaN(c.time) && c.time > 0 && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close))
      .sort((a, b) => a.time - b.time)

    console.log('[CHART] Valid candles:', validCandles.length, 'First:', validCandles[0], 'Last:', validCandles[validCandles.length - 1]);

    if (validCandles.length === 0) {
      error.value = 'No valid candle data to display'
      return
    }

    // Remove duplicates
    const uniqueCandles = []
    const seen = new Set()
    for (const candle of validCandles) {
      if (!seen.has(candle.time)) {
        seen.add(candle.time)
        uniqueCandles.push(candle)
      }
    }

    candleSeries.setData(uniqueCandles)
    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chart && chartContainer.value) {
        chart.applyOptions({ width: chartContainer.value.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)
    chart._resizeHandler = handleResize
  } catch (err) {
    console.error('[CHART] Error creating chart:', err)
    error.value = `Failed to create chart: ${err.message}`
  }
}

function selectPeriod(period) {
  selectedPeriod.value = period
  loadChart()
}

// Watch for theme changes
watch(() => document.documentElement.classList.contains('dark'), () => {
  if (chart && candleSeries) {
    loadChart()
  }
})

// Watch for symbol changes
watch(() => props.symbol, () => {
  loadChart()
})

onMounted(() => {
  loadChart()
})

onUnmounted(() => {
  if (chart) {
    try {
      if (chart._resizeHandler) {
        window.removeEventListener('resize', chart._resizeHandler)
      }
      chart.remove()
    } catch (err) {
      console.warn('Error cleaning up chart:', err)
    }
  }
})
</script>
