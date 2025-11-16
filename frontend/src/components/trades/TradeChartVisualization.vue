<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trade Visualization</h3>
        <div v-if="chartData" class="flex items-center space-x-2">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ chartData.interval === 'daily' ? 'Daily' : chartData.interval }} chart
          </span>
          <span v-if="chartData.trade && chartData.trade.instrumentType === 'option'" class="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            Options Trade
          </span>
          <span v-if="chartData.source" class="text-xs px-2 py-1 rounded-full"
                :class="getSourceBadgeClass(chartData.source)">
            {{ getSourceLabel(chartData.source) }}
          </span>
          <div v-if="chartData.usage && chartData.usage.alphaVantage && userTier !== 'pro'" class="text-xs text-gray-500 dark:text-gray-400">
            ({{ chartData.usage.alphaVantage.dailyCallsRemaining }}/25 API calls remaining today)
          </div>
          <div v-else-if="chartData.source === 'finnhub' && userTier === 'pro'" class="text-xs text-blue-500 dark:text-blue-400">
            (Unlimited high-precision data)
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
        <div v-if="userTier === 'pro'" class="text-xs text-blue-600 dark:text-blue-400 mb-4">
          [PRO] Pro Feature: Exclusive Finnhub data with 1-minute precision (no Alpha Vantage fallback)
        </div>
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
          <span v-if="userTier === 'pro'">Uses Finnhub Pro API exclusively (unlimited high-precision data)</span>
          <span v-else-if="userTier === 'free'">Uses Alpha Vantage API (1 call, 25 free per day)</span>
          <span v-else>Chart service configuration pending...</span>
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
          <span v-if="userTier === 'pro'">Finnhub Pro API rate limit reached. Please wait a moment before retrying.</span>
          <span v-else>Free tier allows 25 Alpha Vantage API calls per day. Try again tomorrow or upgrade to Pro for unlimited Finnhub access.</span>
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
        <!-- Options trade chart explanation -->
        <div v-if="chartData && chartData.trade && chartData.trade.instrumentType === 'option'" class="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div class="flex items-start space-x-2">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-blue-800 dark:text-blue-200">
              <strong>Options Trade Chart:</strong> This chart shows the <strong>underlying stock</strong> price movement. Arrows indicate execution <strong>timing</strong> (when you entered/exited), not option contract prices. See execution prices in the table below.
            </div>
          </div>
        </div>

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
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { createChart } from 'lightweight-charts'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  tradeId: {
    type: [String, Number],
    required: true
  }
})

const { showError, showWarning } = useNotification()
const authStore = useAuthStore()

const chartContainer = ref(null)
const loading = ref(false)
const error = ref(null)
const isConfigured = ref(true)
const chartData = ref(null)
const showChart = ref(false)
let chart = null
let candleSeries = null

// Computed properties
const userTier = computed(() => authStore.user?.tier?.tier_name || 'free')

// Helper methods for source display
const getSourceLabel = (source) => {
  switch (source) {
    case 'finnhub':
      return 'Finnhub Pro'
    case 'alphavantage':
      return 'Alpha Vantage'
    case 'alphavantage_fallback':
      return 'Alpha Vantage (Legacy)'
    default:
      return 'Unknown'
  }
}

const getSourceBadgeClass = (source) => {
  switch (source) {
    case 'finnhub':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'alphavantage':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'alphavantage_fallback':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

const formatNumber = (num) => {
  return parseFloat(num).toFixed(2)
}

// Parse datetime string to Unix timestamp (seconds) without timezone conversion
// Same logic as formatDateTime to ensure consistency
const parseDateTimeToTimestamp = (dateStr) => {
  if (!dateStr) return null

  try {
    const str = dateStr.toString()

    // If it's an ISO datetime string, parse components directly to avoid timezone issues
    // Matches formats like: 2025-11-15T14:30:00 or 2025-11-15T14:30:00.000Z
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/)
    if (isoMatch) {
      const [, year, month, day, hour, minute, second] = isoMatch.map(Number)
      // Create date in local timezone (ignoring any timezone info from the string)
      const dateObj = new Date(year, month - 1, day, hour, minute, second)
      return Math.floor(dateObj.getTime() / 1000)
    }

    // Fallback to standard parsing (will have timezone issues but better than nothing)
    const dateObj = new Date(dateStr)
    if (isNaN(dateObj.getTime())) return null
    return Math.floor(dateObj.getTime() / 1000)
  } catch (error) {
    console.error('Error parsing datetime to timestamp:', error, 'for date:', dateStr)
    return null
  }
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

  const trade = chartData.value.trade

  if (!chartData.value.candles || chartData.value.candles.length === 0) {
    const symbol = chartData.value.symbol || 'Unknown'
    showWarning('Chart Data Unavailable', `Chart information could not be resolved for ${symbol}. This is common for smaller stocks or ETFs. Try major symbols like AAPL, MSFT, or GOOGL.`)
    return
  }

  try {
    console.log('Creating focused single-day chart using our backend data...')

    // Check if chart container exists
    if (!chartContainer.value) {
      console.error('Chart container not found')
      error.value = 'Chart container not available'
      return
    }

    // Get current theme
    const isDark = document.documentElement.classList.contains('dark')

    // Create LightweightCharts chart that uses OUR data
    chart = createChart(chartContainer.value, {
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
      timeScale: {
        borderColor: isDark ? '#4b5563' : '#d1d5db',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: isDark ? '#4b5563' : '#d1d5db',
      },
    })

    console.log('[DEBUG] Chart created:', chart)
    console.log('[DEBUG] Chart methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(chart)))

    // Create candlestick series using LightweightCharts v5 API
    if (typeof chart.addCandlestickSeries !== 'function') {
      console.error('[ERROR] addCandlestickSeries method not found on chart object!')
      console.error('[ERROR] Available methods:', Object.keys(chart))
      throw new Error('Chart API mismatch - addCandlestickSeries not available')
    }

    candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    console.log('[DEBUG] ✓ Series created successfully!')
    console.log('[DEBUG] setMarkers available:', typeof candleSeries.setMarkers)

    // Process and validate our backend data
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
      
      return validated
    }).filter(candle => candle !== null)

    // Sort by time to ensure chronological order
    validatedCandles.sort((a, b) => a.time - b.time)
    
    // Debug: Check for duplicates before deduplication
    console.log('First 10 candles before deduplication:', validatedCandles.slice(0, 10).map((c, i) => ({
      index: i,
      time: c.time,
      iso: new Date(c.time * 1000).toISOString(),
      open: c.open,
      close: c.close
    })))
    
    const duplicateCheck = new Map()
    let duplicateCount = 0
    const problematicTime = 1744205760
    
    validatedCandles.forEach((candle, index) => {
      // Special logging for the problematic timestamp
      if (candle.time === problematicTime) {
        console.warn(`Found problematic timestamp ${problematicTime} at index ${index} during initial scan:`, candle)
      }
      
      if (duplicateCheck.has(candle.time)) {
        console.warn(`Duplicate timestamp found at index ${index}: ${candle.time} (${new Date(candle.time * 1000).toISOString()})`)
        console.warn('Previous occurrence:', duplicateCheck.get(candle.time))
        console.warn('Current candle:', candle)
        duplicateCount++
      } else {
        duplicateCheck.set(candle.time, { index, candle })
      }
    })
    
    console.log(`Found ${duplicateCount} duplicates in ${validatedCandles.length} candles`)
    
    // Remove duplicates by time (keep the last occurrence for each timestamp)
    const deduplicatedCandles = []
    const timeMap = new Map()
    
    // Build map with last occurrence of each timestamp
    validatedCandles.forEach((candle, index) => {
      timeMap.set(candle.time, candle)
    })
    
    // Convert back to array and sort
    const uniqueCandles = Array.from(timeMap.values())
    uniqueCandles.sort((a, b) => a.time - b.time)
    
    // Final validation - ensure no duplicates remain
    for (let i = 1; i < uniqueCandles.length; i++) {
      if (uniqueCandles[i].time === uniqueCandles[i-1].time) {
        console.error(`Still have duplicate at index ${i}: ${uniqueCandles[i].time}`)
      }
      if (uniqueCandles[i].time < uniqueCandles[i-1].time) {
        console.error(`Data not sorted at index ${i}: ${uniqueCandles[i].time} < ${uniqueCandles[i-1].time}`)
      }
    }
    
    console.log(`Using ${uniqueCandles.length} candles from our backend data (${validatedCandles.length - uniqueCandles.length} duplicates removed)`)
    
    // Debug: Show first 10 candles after deduplication
    console.log('First 10 candles after deduplication:', uniqueCandles.slice(0, 10).map((c, i) => ({
      index: i,
      time: c.time,
      iso: new Date(c.time * 1000).toISOString(),
      open: c.open,
      close: c.close
    })))
    console.log('Chart time range:', {
      from: new Date(uniqueCandles[0].time * 1000).toLocaleString(),
      to: new Date(uniqueCandles[uniqueCandles.length - 1].time * 1000).toLocaleString()
    })

    // Final check before setting data
    console.log('About to set data with', uniqueCandles.length, 'candles')
    console.log('First 5 candles being set:', uniqueCandles.slice(0, 5))
    
    // Look specifically for the problematic timestamp 1744205760
    const targetTime = 1744205760
    const problematicIndices = []
    uniqueCandles.forEach((candle, index) => {
      if (candle.time === targetTime) {
        problematicIndices.push(index)
        console.warn(`Found problematic timestamp ${targetTime} at index ${index}:`, candle)
      }
    })
    
    if (problematicIndices.length > 1) {
      console.error(`FOUND THE ISSUE: Timestamp ${targetTime} appears ${problematicIndices.length} times at indices:`, problematicIndices)
    }
    
    // Double-check for duplicates in the final data
    let foundDuplicates = false
    for (let i = 1; i < uniqueCandles.length; i++) {
      if (uniqueCandles[i].time === uniqueCandles[i-1].time) {
        console.error(`CRITICAL: Still have duplicate at index ${i}: ${uniqueCandles[i].time}`)
        console.error('Previous:', uniqueCandles[i-1])
        console.error('Current:', uniqueCandles[i])
        foundDuplicates = true
        
        // Remove the duplicate right here as a last resort
        console.warn('Removing duplicate at index', i)
        uniqueCandles.splice(i, 1)
        i-- // Adjust index after removal
      }
    }
    
    if (foundDuplicates) {
      console.log('After removing duplicates, array length is now:', uniqueCandles.length)
    }
    
    // Final validation - check the first few elements around where the error occurs
    console.log('Elements around index 1 (where error occurs):')
    for (let i = 0; i < Math.min(5, uniqueCandles.length); i++) {
      console.log(`Index ${i}:`, {
        time: uniqueCandles[i].time,
        iso: new Date(uniqueCandles[i].time * 1000).toISOString(),
        data: uniqueCandles[i]
      })
    }
    
    // Set the deduplicated candle data first, without any other series
    try {
      console.log('Setting candlestick data...')
      candleSeries.setData(uniqueCandles)
      console.log('[SUCCESS] Candlestick data set successfully')
    } catch (error) {
      console.error('Failed to set candlestick data:', error)
      throw error
    }

    // Get data time range first
    const dataStartTime = uniqueCandles[0].time
    const dataEndTime = uniqueCandles[uniqueCandles.length - 1].time

    // Calculate entry and exit timestamps using the correct fields from backend
    let entryTimestamp, exitTimestamp = null
    try {
      // Use entryTime field (which contains entry_time from database)
      const entryTime = trade.entryTime || trade.entryDate
      entryTimestamp = parseDateTimeToTimestamp(entryTime)

      // Use exitTime field (which contains exit_time from database)
      const exitTime = trade.exitTime
      if (exitTime) {
        exitTimestamp = parseDateTimeToTimestamp(exitTime)
      }

      // Debug timestamp calculation
      console.log('[TIME] FIXED TIMESTAMP CALCULATION:')
      console.log('Browser timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone)
      console.log('Using entryTime field:', trade.entryTime)
      console.log('Using exitTime field:', trade.exitTime)
      console.log('Fallback entryDate field:', trade.entryDate)

      console.log('[SUCCESS] Calculated entryTimestamp:', entryTimestamp, entryTimestamp ? new Date(entryTimestamp * 1000).toISOString() : 'none')
      console.log('[SUCCESS] Entry time in your timezone:', entryTimestamp ? new Date(entryTimestamp * 1000).toLocaleString() : 'none')
      console.log('[SUCCESS] Calculated exitTimestamp:', exitTimestamp, exitTimestamp ? new Date(exitTimestamp * 1000).toISOString() : 'none')
    } catch (dateError) {
      console.warn('Error parsing trade dates:', dateError.message)
      entryTimestamp = Math.floor(new Date().getTime() / 1000)
    }

    // Check if trade times are within data range
    const entryInRange = entryTimestamp >= dataStartTime && entryTimestamp <= dataEndTime
    const exitInRange = !exitTimestamp || (exitTimestamp >= dataStartTime && exitTimestamp <= dataEndTime)
    
    console.log('Adding precise trade markers at:', {
      entry: new Date(entryTimestamp * 1000).toLocaleString(),
      exit: exitTimestamp ? new Date(exitTimestamp * 1000).toLocaleString() : 'none',
      entryInRange,
      exitInRange,
      dataRange: {
        from: new Date(dataStartTime * 1000).toLocaleString(),
        to: new Date(dataEndTime * 1000).toLocaleString()
      }
    })
    
    // Debug: Log trade prices vs nearby candle data
    console.log('[CHECK] PRICE ANALYSIS - Trade vs Chart Data:')
    console.log('Trade Entry Price:', `$${formatNumber(trade.entryPrice)}`)
    if (trade.exitPrice) {
      console.log('Trade Exit Price:', `$${formatNumber(trade.exitPrice)}`)
    }
    
    if (!entryInRange) {
      console.warn('Entry time is outside available chart data range')
    }
    if (!exitInRange) {
      console.warn('Exit time is outside available chart data range')
    }

    // Only add markers after candlestick data is successfully set
    try {
      console.log('[TARGET] STARTING MARKER CREATION PROCESS...')
      console.log('Entry timestamp:', entryTimestamp, entryTimestamp ? new Date(entryTimestamp * 1000).toISOString() : 'none')
      console.log('Exit timestamp:', exitTimestamp, exitTimestamp ? new Date(exitTimestamp * 1000).toISOString() : 'none')

      const isOption = trade.instrumentType === 'option'

      // For options trades with executions, create markers for each execution
      if (isOption && trade.executions && trade.executions.length > 0) {
        console.log('[OPTIONS] Creating execution markers for options trade')
        const allMarkers = []

        // Track exit execution index to alternate positions and avoid overlap
        let exitCount = 0

        trade.executions.forEach((execution, index) => {
          const execTimestamp = parseDateTimeToTimestamp(execution.datetime)
          if (!execTimestamp) {
            console.warn(`[OPTIONS] Skipping execution ${index} - invalid datetime:`, execution.datetime)
            return
          }

          const execPrice = parseFloat(execution.price)
          const execAction = execution.action.toLowerCase()
          const execQty = execution.quantity

          // Find closest candle to this execution time
          const execCandle = uniqueCandles.reduce((closest, candle) => {
            const currentDiff = Math.abs(candle.time - execTimestamp)
            const closestDiff = Math.abs(closest.time - execTimestamp)
            return currentDiff < closestDiff ? candle : closest
          })

          // Determine if this is entry or exit
          const isEntry = (trade.side === 'long' && execAction === 'buy') ||
                         (trade.side === 'short' && execAction === 'sell')

          console.log(`[OPTIONS] Execution ${index}: ${execAction} ${execQty} @ option price $${execPrice}`)
          console.log(`  → Execution time: ${new Date(execTimestamp * 1000).toLocaleString()}`)
          console.log(`  → Closest candle: ${new Date(execCandle.time * 1000).toLocaleString()}`)
          console.log(`  → Time diff: ${Math.abs(execCandle.time - execTimestamp)} seconds`)
          console.log(`  → Underlying stock price at execution: $${formatNumber(execCandle.close)}`)
          console.log(`  → Option contract price: $${execPrice}`)

          // For exits, alternate between above and below to avoid overlap
          let position = isEntry ? 'belowBar' : 'aboveBar'
          if (!isEntry) {
            position = exitCount % 2 === 0 ? 'aboveBar' : 'belowBar'
            exitCount++
          }

          // For options trades, markers show TIMING only (not price)
          // The chart shows underlying stock prices, not option prices
          // Option execution prices are shown in the executions table
          const actionLabel = isEntry ? (trade.side === 'long' ? 'BUY' : 'SELL') : (trade.side === 'long' ? 'SELL' : 'BUY')

          allMarkers.push({
            time: execCandle.time,
            position: position,
            color: isEntry ? '#10b981' : '#ef4444',
            shape: isEntry ? 'arrowUp' : 'arrowDown',
            text: `${actionLabel} ${execQty}x`,  // Show action and quantity only, no price
            size: 2
          })
        })

        // Set all markers at once using standard API
        console.log(`[OPTIONS] Attempting to set ${allMarkers.length} markers:`, allMarkers)
        try {
          // Use standard setMarkers method on the series
          candleSeries.setMarkers(allMarkers)
          console.log(`[OPTIONS] ✓ Successfully set ${allMarkers.length} execution markers`)
        } catch (error) {
          console.error('[OPTIONS] ✗ Error setting markers:', error)
        }
      } else {
        // For stock trades, use the original single marker logic
        // Declare entryMarker in outer scope
        let entryMarker = null

        // Create precise trade execution indicators
        if (entryTimestamp) {
        console.log('[SUCCESS] Entry timestamp found, creating entry marker...')
        // Find the closest candle to entry time
        const entryCandle = uniqueCandles.reduce((closest, candle) => {
          const currentDiff = Math.abs(candle.time - entryTimestamp)
          const closestDiff = Math.abs(closest.time - entryTimestamp)
          return currentDiff < closestDiff ? candle : closest
        })
        
        // Debug: Analyze price differences at entry
        console.log('[STATS] ENTRY CANDLE ANALYSIS:')
        console.log(`Candle Time: ${new Date(entryCandle.time * 1000).toLocaleString()}`)
        console.log(`Trade Time:  ${new Date(entryTimestamp * 1000).toLocaleString()}`)
        console.log(`Time Diff:   ${Math.abs(entryCandle.time - entryTimestamp)} seconds`)
        
        // TIMEZONE DEBUGGING
        console.log('[WORLD] TIMEZONE ANALYSIS:')
        console.log(`Trade timestamp raw: ${entryTimestamp}`)
        console.log(`Trade time UTC: ${new Date(entryTimestamp * 1000).toISOString()}`)
        console.log(`Trade time Local: ${new Date(entryTimestamp * 1000).toLocaleString()}`)
        console.log(`Candle timestamp raw: ${entryCandle.time}`)
        console.log(`Candle time UTC: ${new Date(entryCandle.time * 1000).toISOString()}`)
        console.log(`Candle time Local: ${new Date(entryCandle.time * 1000).toLocaleString()}`)
        console.log(`You said trade was at 16:33 - does that match any of these times?`)
        // Get entry price first before using it
        const entryPrice = parseFloat(trade.entryPrice)
        
        console.log(`Candle OHLC: O=$${formatNumber(entryCandle.open)} H=$${formatNumber(entryCandle.high)} L=$${formatNumber(entryCandle.low)} C=$${formatNumber(entryCandle.close)}`)
        console.log(`Trade Price: $${formatNumber(entryPrice)}`)
        
        // Check if trade price is within candle range
        const withinRange = entryPrice >= entryCandle.low && entryPrice <= entryCandle.high
        const priceVsClose = ((entryPrice - entryCandle.close) / entryCandle.close * 100).toFixed(2)
        
        console.log(`Price within candle range: ${withinRange}`)
        console.log(`Trade price vs candle close: ${priceVsClose}% difference`)
        
        if (!withinRange) {
          console.warn('[WARNING] PRICE MISMATCH: Trade execution price is outside the candle\'s high-low range!')
          console.warn('This suggests data source differences or timing misalignment.')
          console.warn('[IDEA] POSSIBLE CAUSES:')
          console.warn('• Different data sources (your broker vs Finnhub)')
          console.warn('• Market orders executed between bid/ask spreads')
          console.warn('• Trade executed on different exchange/ECN')
          console.warn('• Timing misalignment or data delays')
          console.warn('• Pre/post-market trading vs regular hours data')
        }

        // Create entry execution marker using chart markers API
        entryMarker = {
          time: entryCandle.time,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: `BUY @ $${formatNumber(entryPrice)}`,
          size: 2
        }
        
        // Note: Don't set entry marker yet - wait for exit marker to set both together
        console.log('[INFO] Entry marker created, will be set with exit marker')

        // Just use the arrow marker - no stupid giant lines

        console.log('[SUCCESS] Entry execution marker created at:', {
          time: new Date(entryCandle.time * 1000).toLocaleString(),
          price: `$${formatNumber(entryPrice)}`,
          timeDiff: `${Math.abs(entryCandle.time - entryTimestamp)} seconds from actual execution`
        })
      }

      // Add exit execution marker if trade has exit
      if (exitTimestamp && exitInRange) {
        // Find the closest candle to exit time
        const exitCandle = uniqueCandles.reduce((closest, candle) => {
          const currentDiff = Math.abs(candle.time - exitTimestamp)
          const closestDiff = Math.abs(closest.time - exitTimestamp)
          return currentDiff < closestDiff ? candle : closest
        })
        
        // Debug: Analyze price differences at exit
        console.log('[STATS] EXIT CANDLE ANALYSIS:')
        console.log(`Candle Time: ${new Date(exitCandle.time * 1000).toLocaleString()}`)
        console.log(`Trade Time:  ${new Date(exitTimestamp * 1000).toLocaleString()}`)
        console.log(`Time Diff:   ${Math.abs(exitCandle.time - exitTimestamp)} seconds`)
        console.log(`Candle OHLC: O=$${formatNumber(exitCandle.open)} H=$${formatNumber(exitCandle.high)} L=$${formatNumber(exitCandle.low)} C=$${formatNumber(exitCandle.close)}`)
        console.log(`Trade Price: $${formatNumber(trade.exitPrice)}`)
        
        // Check if trade price is within candle range
        const exitWithinRange = trade.exitPrice >= exitCandle.low && trade.exitPrice <= exitCandle.high
        const exitPriceVsClose = ((trade.exitPrice - exitCandle.close) / exitCandle.close * 100).toFixed(2)
        
        console.log(`Price within candle range: ${exitWithinRange}`)
        console.log(`Trade price vs candle close: ${exitPriceVsClose}% difference`)
        
        if (!exitWithinRange) {
          console.warn('[WARNING] PRICE MISMATCH: Exit price is outside the candle\'s high-low range!')
          console.warn('This suggests data source differences or timing misalignment.')
        }
        
        const exitPriceValue = parseFloat(trade.exitPrice)
        const pnl = parseFloat(trade.pnl)
        const isProfit = pnl >= 0
        const exitColor = '#ef4444' // Always red for SELL
        const pnlText = isProfit ? `+$${formatNumber(pnl)}` : `-$${formatNumber(Math.abs(pnl))}`
        
        // Create exit execution marker - append to existing markers
        const exitMarker = {
          time: exitCandle.time,
          position: 'aboveBar',
          color: exitColor,
          shape: 'arrowDown',
          text: `SELL @ $${formatNumber(exitPriceValue)} (${pnlText})`,
          size: 2
        }
        
        // Add both entry and exit markers together using standard API
        const allMarkers = entryMarker ? [entryMarker, exitMarker] : [exitMarker]
        console.log('[STOCK] Setting', allMarkers.length, 'markers')
        try {
          candleSeries.setMarkers(allMarkers)
          console.log('[STOCK] ✓ Successfully set', allMarkers.length, 'markers')
        } catch (markerError) {
          console.error('[STOCK] ✗ Error setting markers:', markerError)
        }

        // Just use the arrow marker - no stupid giant lines

        console.log('[SUCCESS] Exit execution marker created at:', {
          time: new Date(exitCandle.time * 1000).toLocaleString(),
          price: `$${formatNumber(exitPriceValue)}`,
          pnl: pnlText,
          timeDiff: `${Math.abs(exitCandle.time - exitTimestamp)} seconds from actual execution`
        })
      }
      } // End of else block for stock trades
    } catch (markerError) {
      console.warn('Failed to add trade execution markers, but chart data is set:', markerError)
    }

    // Set visible range to focus on the trade period
    const tradeDuration = exitTimestamp ? (exitTimestamp - entryTimestamp) : 0
    
    let visibleFrom, visibleTo
    
    // If trade times are outside data range, show all available data
    if (!entryInRange && !exitInRange) {
      console.log('Trade times outside data range, showing all available data')
      visibleFrom = dataStartTime
      visibleTo = dataEndTime
    } else if (tradeDuration === 0 || tradeDuration < 86400) { // Same day trade or no exit
      // For intraday trades, show the full trading day with some context
      // Get the entry date in the user's timezone and create market hours for that day
      const entryDate = new Date(entryTimestamp * 1000)
      const entryDateStr = entryDate.toISOString().split('T')[0] // YYYY-MM-DD
      
      // Create market hours for the entry date (9:30 AM - 4:00 PM ET)
      // Convert to UTC: ET is UTC-5 (EST) or UTC-4 (EDT)
      // For simplicity, assume EST (UTC-5)
      const marketOpen = new Date(entryDateStr + 'T14:30:00.000Z') // 9:30 AM ET = 14:30 UTC
      const marketClose = new Date(entryDateStr + 'T21:00:00.000Z') // 4:00 PM ET = 21:00 UTC
      
      const dayStart = Math.floor(marketOpen.getTime() / 1000)
      const dayEnd = Math.floor(marketClose.getTime() / 1000)
      
      visibleFrom = Math.max(dayStart, dataStartTime)
      visibleTo = Math.min(dayEnd, dataEndTime)
    } else {
      // For multi-day trades, focus on the trade period with padding
      const padding = Math.max(tradeDuration * 0.2, 86400) // 20% padding, minimum 1 day
      visibleFrom = Math.max(entryTimestamp - padding, dataStartTime)
      visibleTo = Math.min(exitTimestamp + padding, dataEndTime)
    }
    
    // Ensure we have a reasonable visible range
    if (visibleTo <= visibleFrom) {
      console.warn('Invalid visible range, falling back to fit content')
      chart.timeScale().fitContent()
    } else {
      console.log('Setting visible range:', {
        from: new Date(visibleFrom * 1000).toLocaleString(),
        to: new Date(visibleTo * 1000).toLocaleString(),
        entryTime: new Date(entryTimestamp * 1000).toLocaleString(),
        exitTime: exitTimestamp ? new Date(exitTimestamp * 1000).toLocaleString() : 'N/A',
        tradeDuration: tradeDuration > 0 ? `${Math.round(tradeDuration / 3600)} hours` : 'N/A',
        entryDateStr: new Date(entryTimestamp * 1000).toISOString().split('T')[0],
        dataRange: {
          from: new Date(dataStartTime * 1000).toLocaleString(),
          to: new Date(dataEndTime * 1000).toLocaleString()
        }
      })
      
      chart.timeScale().setVisibleRange({
        from: visibleFrom,
        to: visibleTo
      })
    }

    // Handle resize
    const handleResize = () => {
      if (chart && chartContainer.value) {
        chart.applyOptions({ width: chartContainer.value.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)
    chart._resizeHandler = handleResize
    
    console.log('[SUCCESS] Single-day focused chart created successfully using our backend data')
    console.log('')
    console.log('[INFO] PRICE ALIGNMENT SUMMARY:')
    console.log('If you see price mismatches between your trade prices and candle data:')
    console.log('• This is normal and expected in real trading')
    console.log('• Your broker/exchange data differs from Finnhub\'s aggregated data')
    console.log('• Charts show market consensus prices, not your specific execution venue')
    console.log('• Focus on the timing and price level relationships, not exact price matches')
    console.log('')
    
  } catch (error) {
    console.error('Error creating focused chart:', error)
    error.value = `Chart creation failed: ${error.message}`
  }
}

const fetchChartData = async () => {
  loading.value = true
  error.value = null

  try {
    console.log(`Fetching chart data for trade ${props.tradeId}`)
    console.log('Making API call to:', `/trades/${props.tradeId}/chart-data`)
    const response = await api.get(`/trades/${props.tradeId}/chart-data`)
    console.log('Chart data response:', response.data)
    console.log('Trade data in response:', response.data.trade)
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
      const configMessage = userTier.value === 'pro' 
        ? 'Chart visualization requires Finnhub API configuration.'
        : 'Chart visualization requires API configuration (Finnhub for Pro, Alpha Vantage for Free).'
      showError('Chart Service Unavailable', configMessage)
    } else if (err.response?.status === 429) {
      error.value = err.response.data.error || 'API rate limit exceeded'
      const limitMessage = userTier.value === 'pro' 
        ? 'Finnhub Pro rate limit reached (150/min). Please wait a moment before retrying.'
        : 'Alpha Vantage daily limit reached (25/day). Try again tomorrow or upgrade to Pro for unlimited access.'
      showWarning('Chart API Limit Reached', limitMessage)
    } else if (err.response?.status === 404) {
      error.value = err.response.data.error || 'Chart data not available'
      const message = err.response.data.message || 'Chart data could not be found for this symbol. This may occur with delisted, inactive, or unsupported symbols.'
      showWarning('Chart Data Unavailable', message)
    } else if (err.response?.status === 400) {
      error.value = err.response.data.error || 'Invalid request'
      showWarning('Chart Data Unavailable', 'Chart data could not be resolved for this symbol. Try using major stocks like AAPL, MSFT, GOOGL, or TSLA.')
    } else {
      error.value = err.response?.data?.error || 'Failed to load chart data'
      showWarning('Chart Data Unavailable', 'Chart information could not be resolved for this symbol. This is common for smaller stocks or ETFs not covered by the free data tier.')
    }
  } finally {
    loading.value = false
  }
}

const loadChart = () => {
  console.log('[PROCESS] Loading chart for trade:', props.tradeId)
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
    try {
      if (chart._resizeHandler) {
        window.removeEventListener('resize', chart._resizeHandler)
      }
      chart.remove()
    } catch (error) {
      console.warn('Error cleaning up chart:', error)
    }
  }
})
</script>