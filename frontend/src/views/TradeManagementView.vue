<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Trade Management</h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          Analyze trade execution quality with R-Multiple analysis
        </p>
      </div>
    </div>

    <!-- R-Multiple Performance Chart -->
    <RPerformanceChart :filters="filters" :refresh-trigger="rPerfRefreshTrigger" class="mb-8" />

    <!-- Divider -->
    <div class="border-t border-gray-200 dark:border-gray-700 my-8"></div>

    <!-- Individual Trade Analysis Section -->
    <div class="mb-6">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Individual Trade Analysis</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Select a trade to view detailed R-Multiple breakdown and chart visualization
      </p>
    </div>

    <!-- Trade Selector -->
    <TradeSelector
      :trades="trades"
      :loading="loading"
      :pagination="pagination"
      :selected-trade-id="selectedTradeId"
      :initial-filters="filters"
      @trade-selected="onTradeSelected"
      @filters-changed="onFiltersChanged"
      @load-more="loadMoreTrades"
    />

    <!-- Stop Loss / Take Profit Form (conditional) -->
    <StopLossTakeProfitForm
      v-if="selectedTrade && (needsRiskLevels || editingLevels)"
      :trade="selectedTrade"
      :saving="savingLevels"
      @levels-saved="onLevelsSaved"
      @cancel="cancelEditing"
    />

    <!-- Analysis Section (shown when trade has required data) -->
    <div v-if="selectedTrade && !needsRiskLevels && analysis" class="space-y-6 mt-6">
      <!-- Candlestick Chart with Markers (only shown when chart data loads successfully and instrument is supported) -->
      <TradeManagementChart
        v-if="chartAvailable && isChartSupportedInstrument"
        :trade="selectedTrade"
        :loading="chartLoading"
        @chart-loaded="onChartLoaded"
      />

      <!-- Message for unsupported instruments -->
      <div v-else-if="!isChartSupportedInstrument" class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <p class="text-gray-600 dark:text-gray-400 text-sm">
          Chart visualization is not available for {{ selectedTrade?.instrument_type }} trades.
        </p>
      </div>

      <!-- R-Multiple Analysis -->
      <RMultipleAnalysis :analysis="analysis" :trade="selectedTrade" />

      <!-- Summary Metrics (with inline editing) -->
      <TradeSummaryMetrics
        :trade="selectedTrade"
        :analysis="analysis"
        @levels-updated="onLevelsUpdated"
        @target-hit-updated="onTargetHitUpdated"
      />

      <!-- TradingView Charts (if any) -->
      <TradeCharts
        v-if="selectedTrade.charts && selectedTrade.charts.length > 0"
        :trade-id="selectedTrade.id"
        :charts="selectedTrade.charts"
        :can-delete="true"
        @deleted="onChartDeleted"
      />
    </div>

    <!-- Loading State for Analysis -->
    <div
      v-if="selectedTrade && !needsRiskLevels && analysisLoading"
      class="mt-6 bg-white dark:bg-gray-800 shadow-sm rounded-lg p-8 text-center"
    >
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
      <p class="text-gray-600 dark:text-gray-400">Calculating R-Multiple analysis...</p>
    </div>

    <!-- Error State -->
    <div
      v-if="error"
      class="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
    >
      <p class="text-red-800 dark:text-red-200">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import TradeSelector from '@/components/trade-management/TradeSelector.vue'
import StopLossTakeProfitForm from '@/components/trade-management/StopLossTakeProfitForm.vue'
import TradeManagementChart from '@/components/trade-management/TradeManagementChart.vue'
import RMultipleAnalysis from '@/components/trade-management/RMultipleAnalysis.vue'
import TradeSummaryMetrics from '@/components/trade-management/TradeSummaryMetrics.vue'
import RPerformanceChart from '@/components/trade-management/RPerformanceChart.vue'
import TradeCharts from '@/components/trades/TradeCharts.vue'

const route = useRoute()
const router = useRouter()
const { selectedAccount } = useGlobalAccountFilter()

// State
const trades = ref([])
const loading = ref(false)
const pagination = ref({
  total: 0,
  limit: 50,
  offset: 0,
  has_more: false
})
const filters = ref({
  startDate: '',
  endDate: '',
  symbol: ''
})

const selectedTradeId = ref(null)
const selectedTrade = ref(null)
const analysis = ref(null)
const analysisLoading = ref(false)
const chartLoading = ref(false)
const chartAvailable = ref(false)
const savingLevels = ref(false)
const editingLevels = ref(false)
const error = ref(null)
const rPerfRefreshTrigger = ref(0)

// Computed
const needsRiskLevels = computed(() => {
  if (!selectedTrade.value) return false
  return !selectedTrade.value.stop_loss
})

// Check if chart should be available for this instrument type
// Futures are not supported by Alpha Vantage
const isChartSupportedInstrument = computed(() => {
  if (!selectedTrade.value) return true
  const instrumentType = selectedTrade.value.instrument_type
  // Futures are not supported
  if (instrumentType === 'future') return false
  return true
})

// URL State Management
function updateUrlParams() {
  const query = {}

  if (filters.value.symbol) query.symbol = filters.value.symbol
  if (filters.value.startDate) query.startDate = filters.value.startDate
  if (filters.value.endDate) query.endDate = filters.value.endDate
  if (selectedTradeId.value) query.tradeId = selectedTradeId.value

  // Only update if query params have changed
  const currentQuery = route.query
  const hasChanged =
    query.symbol !== currentQuery.symbol ||
    query.startDate !== currentQuery.startDate ||
    query.endDate !== currentQuery.endDate ||
    query.tradeId !== currentQuery.tradeId

  if (hasChanged) {
    router.replace({ query })
  }
}

function restoreFromUrl() {
  const query = route.query

  // Restore filters
  if (query.symbol) filters.value.symbol = query.symbol
  if (query.startDate) filters.value.startDate = query.startDate
  if (query.endDate) filters.value.endDate = query.endDate

  // Return trade ID to restore after trades are loaded
  return query.tradeId || null
}

// Methods
async function fetchTrades() {
  loading.value = true
  error.value = null

  try {
    // Build params, excluding empty values
    const params = {
      limit: pagination.value.limit,
      offset: pagination.value.offset
    }

    // Only add filters that have values
    if (filters.value.symbol && filters.value.symbol.trim()) {
      params.symbol = filters.value.symbol.trim()
    }
    if (filters.value.startDate) {
      params.startDate = filters.value.startDate
    }
    if (filters.value.endDate) {
      params.endDate = filters.value.endDate
    }
    if (selectedAccount.value) {
      params.accounts = selectedAccount.value
    }

    console.log('[TRADE-MGMT] Fetching trades with params:', params)
    const response = await api.get('/trade-management/trades', { params })
    trades.value = response.data.trades
    pagination.value = response.data.pagination
    console.log('[TRADE-MGMT] Fetched', trades.value.length, 'trades')
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to fetch trades'
    console.error('Error fetching trades:', err)
  } finally {
    loading.value = false
  }
}

async function loadMoreTrades() {
  if (!pagination.value.has_more || loading.value) return

  loading.value = true
  error.value = null

  try {
    // Build params, excluding empty values
    const params = {
      limit: pagination.value.limit,
      offset: pagination.value.offset + pagination.value.limit
    }

    if (filters.value.symbol && filters.value.symbol.trim()) {
      params.symbol = filters.value.symbol.trim()
    }
    if (filters.value.startDate) {
      params.startDate = filters.value.startDate
    }
    if (filters.value.endDate) {
      params.endDate = filters.value.endDate
    }
    if (selectedAccount.value) {
      params.accounts = selectedAccount.value
    }

    const response = await api.get('/trade-management/trades', { params })
    trades.value = [...trades.value, ...response.data.trades]
    pagination.value = response.data.pagination
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load more trades'
  } finally {
    loading.value = false
  }
}

function onFiltersChanged(newFilters) {
  filters.value = { ...filters.value, ...newFilters }
  pagination.value.offset = 0
  // Clear selection when filters change
  clearSelection()
  fetchTrades()
  updateUrlParams()
}

async function onTradeSelected(trade) {
  selectedTradeId.value = trade.id
  selectedTrade.value = trade
  analysis.value = null
  error.value = null
  editingLevels.value = false
  chartAvailable.value = false

  // Update URL with selected trade
  updateUrlParams()

  // If trade has stop loss, fetch analysis
  if (trade.stop_loss) {
    await fetchAnalysis(trade.id)
  }
}

function onChartLoaded({ success }) {
  chartAvailable.value = success
}

async function fetchAnalysis(tradeId) {
  analysisLoading.value = true
  chartLoading.value = true
  chartAvailable.value = true  // Optimistically show chart, will hide if load fails
  error.value = null

  try {
    const response = await api.get(`/trade-management/analysis/${tradeId}`)
    selectedTrade.value = response.data.trade
    analysis.value = response.data.analysis

    // Skip chart visualization for futures (not supported)
    if (selectedTrade.value?.instrument_type === 'future') {
      chartAvailable.value = false
      chartLoading.value = false
    }
  } catch (err) {
    if (err.response?.data?.needs_stop_loss) {
      // Trade needs stop loss - this is handled by needsRiskLevels computed
    } else {
      error.value = err.response?.data?.error || 'Failed to fetch analysis'
    }
  } finally {
    analysisLoading.value = false
    chartLoading.value = false
  }
}

async function onLevelsSaved(updatedTrade) {
  selectedTrade.value = updatedTrade
  editingLevels.value = false
  // Re-fetch analysis with new levels
  await fetchAnalysis(updatedTrade.id)
  updateTradeInList(updatedTrade)
}

async function onLevelsUpdated(updatedTrade) {
  // Update the selected trade
  selectedTrade.value = updatedTrade
  // Re-fetch analysis with new levels
  await fetchAnalysis(updatedTrade.id)
  updateTradeInList(updatedTrade)
}

async function onTargetHitUpdated(data) {
  // Re-fetch analysis to get updated trade data including manual_target_hit_first
  if (selectedTradeId.value) {
    await fetchAnalysis(selectedTradeId.value)
  }
  // Trigger refresh of the R-Performance chart to reflect updated management R values
  rPerfRefreshTrigger.value++
}

function onChartDeleted(chartId) {
  // Remove the deleted chart from selectedTrade's charts array
  if (selectedTrade.value && selectedTrade.value.charts) {
    selectedTrade.value.charts = selectedTrade.value.charts.filter(chart => chart.id !== chartId)
  }
}

function updateTradeInList(updatedTrade) {
  // Update the trade in the list
  const index = trades.value.findIndex(t => t.id === updatedTrade.id)
  if (index !== -1) {
    trades.value[index] = {
      ...trades.value[index],
      stop_loss: updatedTrade.stop_loss,
      take_profit: updatedTrade.take_profit,
      needs_stop_loss: !updatedTrade.stop_loss,
      needs_take_profit: !updatedTrade.take_profit,
      can_analyze: !!updatedTrade.stop_loss
    }
  }
}

function cancelEditing() {
  editingLevels.value = false
  // If trade doesn't have stop loss, clear selection entirely
  if (!selectedTrade.value?.stop_loss) {
    clearSelection()
  }
}

function clearSelection() {
  selectedTradeId.value = null
  selectedTrade.value = null
  analysis.value = null
  error.value = null
  editingLevels.value = false
  chartAvailable.value = false
  updateUrlParams()
}

// Lifecycle
// Watch for global account filter changes
watch(selectedAccount, () => {
  console.log('[TRADE-MGMT] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  pagination.value.offset = 0
  clearSelection()
  fetchTrades()
})

onMounted(async () => {
  // Restore filters from URL
  const savedTradeId = restoreFromUrl()

  // Fetch trades with restored filters
  await fetchTrades()

  // If there was a selected trade ID in the URL, try to restore it
  if (savedTradeId) {
    // First check if the trade is in the current list
    const trade = trades.value.find(t => t.id === savedTradeId)
    if (trade) {
      // Trade is in the list, select it
      await onTradeSelected(trade)
    } else {
      // Trade not in current list - fetch it directly and load analysis
      try {
        const response = await api.get(`/trade-management/analysis/${savedTradeId}`)
        selectedTradeId.value = savedTradeId
        selectedTrade.value = response.data.trade
        analysis.value = response.data.analysis
      } catch (err) {
        console.error('[TRADE-MGMT] Could not restore selected trade:', err)
        // Clear the invalid trade ID from URL
        updateUrlParams()
      }
    }
  }
})
</script>
