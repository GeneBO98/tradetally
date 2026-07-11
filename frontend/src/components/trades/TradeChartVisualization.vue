<template>
  <div class="card">
    <div class="card-body">
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trade Visualization</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review price action, execution timing, indicators, and your own annotations.
          </p>
        </div>
        <div v-if="chartData" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ intervalLabel }}<template v-if="chartData.interval !== 'daily'"> · {{ timezoneLabel }}</template>
          </span>
          <span
            v-if="chartData.trade?.instrumentType === 'option'"
            class="rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
          >
            Underlying price
          </span>
          <span
            v-if="chartData.source"
            class="rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
          >
            {{ sourceLabel }}
          </span>
        </div>
      </div>

      <ProUpgradePrompt
        v-if="requiresProUpgrade"
        variant="compact"
        description="Trade charts with high-precision candlestick data are available with a Pro subscription."
      />

      <div v-else-if="!showChart && !loading" class="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-600">
        <PresentationChartLineIcon class="mx-auto h-12 w-12 text-gray-400" />
        <h4 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Open interactive chart</h4>
        <p class="mx-auto mt-2 max-w-lg text-sm text-gray-600 dark:text-gray-400">
          Inspect the trade with editable trend lines, price levels, Fibonacci tools, moving averages, and execution markers.
        </p>
        <button type="button" class="btn-primary mt-5" @click="loadChart">
          Load Chart
        </button>
        <p class="mt-3 text-xs text-gray-500 dark:text-gray-500">
          <span v-if="isBillingEnabled">Uses the configured high-precision market data provider.</span>
          <span v-else>Uses the configured provider with Alpha Vantage as the daily-data fallback.</span>
        </p>
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <div class="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="!isConfigured" class="rounded-lg border border-gray-200 py-14 text-center dark:border-gray-700">
        <PresentationChartLineIcon class="mx-auto h-12 w-12 text-gray-400" />
        <p class="mt-3 font-medium text-gray-900 dark:text-white">Chart service not configured</p>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure a supported market-data provider to enable trade charts.</p>
      </div>

      <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 px-5 py-10 text-center dark:border-red-800 dark:bg-red-900/20">
        <p class="font-medium text-red-700 dark:text-red-300">{{ error }}</p>
        <button
          type="button"
          class="btn-secondary mt-4 text-sm"
          :disabled="error.includes('limit') || error.includes('not configured')"
          @click="loadChart"
        >
          Try Again
        </button>
      </div>

      <div v-else-if="showChart && chartData">
        <div
          v-if="chartData.trade?.instrumentType === 'option'"
          class="mb-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-100"
        >
          This chart displays the underlying security. Execution markers show option fill timing; contract prices remain in the execution table.
        </div>

        <KLineTradeChart
          :chart-data="chartData"
          :timezone="userTimezone || 'UTC'"
          :selected-resolution="selectedResolution"
          :available-resolutions="availableResolutions"
          :resolution-loading="loading"
          @resolution-change="selectResolution"
        />

        <dl v-if="chartData.trade" class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
            <dt class="text-gray-500 dark:text-gray-400">Entry</dt>
            <dd class="mt-0.5 font-semibold text-gray-900 dark:text-white">{{ formatCurrency(chartData.trade.entryPrice) }}</dd>
          </div>
          <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
            <dt class="text-gray-500 dark:text-gray-400">Exit</dt>
            <dd class="mt-0.5 font-semibold text-gray-900 dark:text-white">{{ formatCurrency(chartData.trade.exitPrice) }}</dd>
          </div>
          <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
            <dt class="text-gray-500 dark:text-gray-400">P&amp;L</dt>
            <dd class="mt-0.5 font-semibold" :class="metricClass(chartData.trade.pnl)">{{ formatCurrency(chartData.trade.pnl) }}</dd>
          </div>
          <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
            <dt class="text-gray-500 dark:text-gray-400">Return</dt>
            <dd class="mt-0.5 font-semibold" :class="metricClass(chartData.trade.pnlPercent)">{{ formatPercent(chartData.trade.pnlPercent) }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { PresentationChartLineIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import KLineTradeChart from '@/components/trades/KLineTradeChart.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'
import { useAuthStore } from '@/stores/auth'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useNotification } from '@/composables/useNotification'
import { useUserTimezone } from '@/composables/useUserTimezone'

const props = defineProps({
  tradeId: {
    type: [String, Number],
    required: true,
  },
})

const authStore = useAuthStore()
const { formatCurrency } = useCurrencyFormatter()
const { showError, showWarning } = useNotification()
const { userTimezone, timezoneLabel } = useUserTimezone()

const loading = ref(false)
const error = ref(null)
const isConfigured = ref(true)
const chartData = ref(null)
const showChart = ref(false)
const selectedResolution = ref('1')

const userTier = computed(() => authStore.user?.tier || 'free')
const isBillingEnabled = computed(() => authStore.user?.billingEnabled !== false)
const isAdmin = computed(() => ['admin', 'owner'].includes(authStore.user?.role))
const requiresProUpgrade = computed(() => isBillingEnabled.value && userTier.value !== 'pro' && !isAdmin.value)
const dailyOnlySource = computed(() => {
  const availableResolutions = chartData.value?.available_resolutions
  if (Array.isArray(availableResolutions)) {
    return !availableResolutions.some((resolution) => resolution !== 'D')
  }

  return [
    'alphavantage',
    'alphavantage_cache',
    'alphavantage_fallback',
    'coingecko',
  ].includes(chartData.value?.source) && !chartData.value?.fallback
})
const availableResolutions = computed(() => {
  const resolutions = chartData.value?.available_resolutions
  if (Array.isArray(resolutions)) return resolutions
  return dailyOnlySource.value ? ['D'] : ['1', '5', '15', '60', 'D']
})

const intervalLabel = computed(() => {
  const labels = {
    '1min': '1 minute candles',
    '5min': '5 minute candles',
    '15min': '15 minute candles',
    '1hour': '1 hour candles',
    daily: '1 day candles',
  }
  return labels[chartData.value?.interval] || `${chartData.value?.interval || 'Daily'} candles`
})

const sourceLabel = computed(() => {
  const labels = {
    finnhub: 'Finnhub',
    fmp: 'Financial Modeling Prep',
    alphavantage: 'Alpha Vantage',
    alphavantage_cache: 'Alpha Vantage cache',
    alphavantage_fallback: 'Alpha Vantage fallback',
    coingecko: 'CoinGecko',
  }
  return labels[chartData.value?.source] || 'Market data'
})

function metricClass(value) {
  return Number(value) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'N/A'
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`
}

function resolutionForInterval(interval) {
  return {
    '1min': '1',
    '5min': '5',
    '15min': '15',
    '1hour': '60',
    daily: 'D',
  }[interval] || 'D'
}

async function fetchChartData() {
  loading.value = true
  error.value = null
  isConfigured.value = true

  try {
    const response = await api.get(`/trades/${props.tradeId}/chart-data`, {
      params: { resolution: selectedResolution.value },
    })
    chartData.value = response.data
    selectedResolution.value = resolutionForInterval(response.data.interval)
    rememberChartState()
  } catch (requestError) {
    const status = requestError.response?.status
    const responseError = requestError.response?.data?.error

    if (status === 403 && requestError.response?.data?.requiresPro) {
      error.value = responseError || 'Trade charts require Pro access.'
    } else if (status === 503) {
      isConfigured.value = false
      error.value = responseError || 'Chart service not configured'
      showError('Chart Service Unavailable', 'Configure a supported market-data provider to enable chart visualization.')
    } else if (status === 429) {
      error.value = responseError || 'Chart API limit reached'
      showWarning('Chart API Limit Reached', 'Please wait before requesting chart data again.')
    } else {
      error.value = responseError || 'Failed to load chart data'
      showWarning('Chart Data Unavailable', requestError.response?.data?.message || error.value)
    }
  } finally {
    loading.value = false
  }
}

function chartStateStorageKey() {
  return `trade_chart_loaded:${props.tradeId}`
}

function rememberChartState() {
  try {
    sessionStorage.setItem(chartStateStorageKey(), selectedResolution.value)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function restoredResolution() {
  try {
    const resolution = sessionStorage.getItem(chartStateStorageKey())
    return ['1', '5', '15', '60', 'D'].includes(resolution) ? resolution : null
  } catch {
    return null
  }
}

function restoreChart() {
  const resolution = restoredResolution()
  if (!resolution || requiresProUpgrade.value) return
  selectedResolution.value = resolution
  showChart.value = true
  fetchChartData()
}

function loadChart() {
  showChart.value = true
  rememberChartState()
  fetchChartData()
}

function selectResolution(resolution) {
  if (loading.value || resolution === selectedResolution.value) return
  if (dailyOnlySource.value && resolution !== 'D') return
  selectedResolution.value = resolution
  rememberChartState()
  fetchChartData()
}

watch(
  () => props.tradeId,
  () => {
    chartData.value = null
    error.value = null
    isConfigured.value = true
    showChart.value = false
    selectedResolution.value = '1'
    queueMicrotask(restoreChart)
  }
)

onMounted(restoreChart)
</script>
