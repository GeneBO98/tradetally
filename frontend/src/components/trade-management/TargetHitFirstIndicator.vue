<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Target Hit Analysis
      </h4>
      <button
        v-if="!loading && !analysis"
        @click="runAnalysis"
        class="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        Analyze
      </button>
      <button
        v-else-if="analysis"
        @click="runAnalysis"
        class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        title="Refresh analysis"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Analyzing chart data...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="py-3 px-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
      <div class="flex items-start">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="ml-2">
          <p class="text-sm text-yellow-700 dark:text-yellow-300">{{ error }}</p>
          <p v-if="dataUnavailable" class="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            Chart data may not be available for this symbol or time period.
          </p>
        </div>
      </div>
    </div>

    <!-- No Analysis Yet -->
    <div v-else-if="!analysis" class="text-center py-4">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Click "Analyze" to determine which target was hit first.
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Requires chart data availability
      </p>
    </div>

    <!-- Analysis Result -->
    <div v-else class="space-y-4">
      <!-- Main Result Badge -->
      <div class="flex items-center space-x-3">
        <span :class="resultBadgeClass">
          {{ resultLabel }}
        </span>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {{ resultDescription }}
        </span>
      </div>

      <!-- Timeline Details -->
      <div class="space-y-2">
        <!-- Stop Loss -->
        <div class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50">
          <div class="flex items-center">
            <span class="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
            <span class="text-sm text-gray-700 dark:text-gray-300">Stop Loss (${{ formatPrice(analysis.analysis_result?.stop_loss_analysis?.price) }})</span>
          </div>
          <div class="text-right">
            <span v-if="analysis.analysis_result?.stop_loss_analysis?.was_crossed" class="text-xs text-red-600 dark:text-red-400">
              Crossed
            </span>
            <span v-else class="text-xs text-gray-400 dark:text-gray-500">
              Not reached
            </span>
          </div>
        </div>

        <!-- Take Profit Targets -->
        <div
          v-for="tp in analysis.analysis_result?.take_profit_analysis || []"
          :key="tp.id"
          class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50"
        >
          <div class="flex items-center">
            <span class="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ tp.label }} (${{ formatPrice(tp.price) }})</span>
          </div>
          <div class="text-right">
            <span v-if="tp.was_crossed" class="text-xs text-green-600 dark:text-green-400">
              Reached
            </span>
            <span v-else class="text-xs text-gray-400 dark:text-gray-500">
              Not reached
            </span>
          </div>
        </div>
      </div>

      <!-- Conclusion -->
      <div v-if="analysis.analysis_result?.conclusion" class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
        <p class="text-sm text-primary-800 dark:text-primary-200">
          {{ analysis.analysis_result.conclusion }}
        </p>
      </div>

      <!-- Data Source Info -->
      <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
        <span>Source: {{ analysis.candle_data_used?.source || 'Unknown' }}</span>
        <span>{{ analysis.candle_data_used?.candle_count || 0 }} candles analyzed</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/services/api'

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  autoAnalyze: {
    type: Boolean,
    default: false
  }
})

const loading = ref(false)
const error = ref('')
const dataUnavailable = ref(false)
const analysis = ref(null)

const resultBadgeClass = computed(() => {
  const firstHit = analysis.value?.analysis_result?.first_target_hit

  if (!firstHit || firstHit === 'none') {
    return 'px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  }

  if (firstHit === 'stop_loss') {
    return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  }

  // Take profit was hit first
  return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
})

const resultLabel = computed(() => {
  const result = analysis.value?.analysis_result
  if (!result) return 'Unknown'

  if (result.first_target_hit === 'none') {
    return 'Neither Target Hit'
  }

  return `${result.first_target_label} Hit First`
})

const resultDescription = computed(() => {
  const result = analysis.value?.analysis_result
  if (!result || !result.first_hit_time) return ''

  const time = new Date(result.first_hit_time)
  return `at ${time.toLocaleTimeString()}`
})

async function runAnalysis() {
  if (!props.trade.id || !props.trade.stop_loss) {
    error.value = 'Stop loss must be set for analysis'
    return
  }

  loading.value = true
  error.value = ''
  dataUnavailable.value = false

  try {
    const response = await api.get(`/trade-management/analysis/${props.trade.id}/target-hit-first`)
    analysis.value = response.data
  } catch (err) {
    const errorData = err.response?.data
    error.value = errorData?.error || 'Failed to analyze target hit order'
    dataUnavailable.value = errorData?.data_unavailable || false

    // If we have cached analysis, keep showing it
    if (props.trade.target_hit_analysis) {
      analysis.value = props.trade.target_hit_analysis
    }
  } finally {
    loading.value = false
  }
}

function formatPrice(value) {
  if (!value) return '-'
  return parseFloat(value).toFixed(2)
}

// Auto-analyze if requested and we have cached analysis
onMounted(() => {
  if (props.trade.target_hit_analysis) {
    analysis.value = props.trade.target_hit_analysis
  } else if (props.autoAnalyze && props.trade.stop_loss && props.trade.entry_time) {
    runAnalysis()
  }
})

// Re-analyze when trade changes
watch(() => props.trade.id, () => {
  analysis.value = null
  error.value = ''
  if (props.trade.target_hit_analysis) {
    analysis.value = props.trade.target_hit_analysis
  }
})
</script>
