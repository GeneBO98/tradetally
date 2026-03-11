<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Target Hit Analysis
      </h4>
      <div class="flex items-center space-x-2">
        <!-- Mode Toggle -->
        <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          <button
            @click="setMode('auto')"
            :class="[
              'px-2 py-1 text-xs font-medium rounded-md transition-colors',
              mode === 'auto'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
          >
            Auto (API)
          </button>
          <button
            @click="setMode('manual')"
            :class="[
              'px-2 py-1 text-xs font-medium rounded-md transition-colors',
              mode === 'manual'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
          >
            Manual
          </button>
        </div>
        <!-- Refresh button for auto mode -->
        <button
          v-if="mode === 'auto' && analysis"
          @click="runAnalysis"
          class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          title="Refresh analysis"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Manual Mode -->
    <div v-if="mode === 'manual'" class="space-y-3">
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Select which targets were reached during this trade:
      </p>

      <!-- Target Checklist -->
      <div class="space-y-2">
        <!-- Take Profit Targets -->
        <div
          v-for="(target, index) in displayTargets"
          :key="'tp_' + index"
          class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50"
        >
          <label class="flex items-center gap-2 cursor-pointer flex-1">
            <input
              :checked="target.status === 'hit'"
              type="checkbox"
              class="rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700"
              :disabled="saving"
              @change="toggleTarget('tp', index, $event.target.checked)"
            />
            <span class="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
            <span class="text-sm text-gray-700 dark:text-gray-300">
              TP{{ index + 1 }} (${{ formatPrice(target.price) }})
            </span>
            <span v-if="target.rValue" class="text-xs text-primary-600 dark:text-primary-400 font-medium">
              {{ target.rValue }}R
            </span>
          </label>
          <span v-if="target.status === 'hit'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Hit
          </span>
        </div>

        <!-- Stop Loss -->
        <div
          v-if="trade.stop_loss"
          class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50"
        >
          <label class="flex items-center gap-2 cursor-pointer flex-1">
            <input
              :checked="slHit"
              type="checkbox"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700"
              :disabled="saving"
              @change="toggleTarget('sl', 0, $event.target.checked)"
            />
            <span class="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
            <span class="text-sm text-gray-700 dark:text-gray-300">
              Stop Loss (${{ formatPrice(trade.stop_loss) }})
            </span>
          </label>
          <span v-if="slHit" class="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Hit
          </span>
        </div>
      </div>

      <!-- Saving indicator -->
      <div v-if="saving" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <div class="animate-spin rounded-full h-3 w-3 border-2 border-primary-600 border-t-transparent"></div>
        Saving...
      </div>

      <!-- Current Result Summary -->
      <div v-if="derivedResult && !saving" class="p-3 rounded-lg border" :class="derivedResultBorderClass">
        <div class="flex items-center space-x-2">
          <span :class="derivedResultBadgeClass">
            {{ derivedResultLabel }}
          </span>
        </div>
      </div>

      <!-- Clear Selection -->
      <button
        v-if="hasAnySelection"
        @click="clearAllSelections"
        :disabled="saving"
        class="w-full px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400
               hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        Clear all selections
      </button>
    </div>

    <!-- Auto Mode -->
    <div v-else>
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
            <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              Tip: Switch to "Manual" mode to set this value without API access.
            </p>
          </div>
        </div>
      </div>

      <!-- No Analysis Yet -->
      <div v-else-if="!analysis && !trade.manual_target_hit_first" class="text-center py-4">
        <button
          @click="runAnalysis"
          class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Analyze with API
        </button>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Requires Alpha Vantage API access
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Or switch to "Manual" mode to set manually
        </p>
      </div>

      <!-- Show Manual Result if set (even in auto mode) -->
      <div v-else-if="trade.manual_target_hit_first && !analysis" class="space-y-3">
        <div class="flex items-center space-x-3">
          <span :class="manualResultBadgeClass">
            {{ manualResultLabel }}
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">(Manual)</span>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500">
          Manual value set. Switch to "Manual" mode to change.
        </p>
      </div>

      <!-- Analysis Result -->
      <div v-else-if="analysis" class="space-y-4">
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
        <div
          v-if="analysis.analysis_result?.conclusion &&
                !analysis.analysis_result.conclusion.includes('Neither stop loss nor take profit')"
          class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
        >
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/services/api'
import { useUserTimezone } from '@/composables/useUserTimezone'

const { formatTime: formatTimeTz } = useUserTimezone()

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

const emit = defineEmits(['updated'])

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const dataUnavailable = ref(false)
const analysis = ref(null)
const mode = ref('auto')

// Local state for target hit toggles
const slHit = ref(false)
const tpStatuses = ref([]) // array of 'hit' | 'pending'

// Build display targets from trade data
const displayTargets = computed(() => {
  const targets = props.trade.take_profit_targets || []
  const singleTp = props.trade.take_profit

  if (targets.length > 0) {
    return targets.map((t, index) => ({
      price: t.price,
      shares: t.shares || t.quantity || null,
      status: tpStatuses.value[index] || 'pending',
      rValue: calculateTargetR(t.price)
    }))
  } else if (singleTp) {
    return [{
      price: parseFloat(singleTp),
      shares: null,
      status: tpStatuses.value[0] || 'pending',
      rValue: calculateTargetR(singleTp)
    }]
  }
  return []
})

const hasAnySelection = computed(() => {
  return slHit.value || tpStatuses.value.some(s => s === 'hit')
})

// Derive the manual_target_hit_first value from toggles
const derivedResult = computed(() => {
  if (!hasAnySelection.value) return null
  if (slHit.value) return 'stop_loss'
  return 'take_profit'
})

const derivedResultLabel = computed(() => {
  if (derivedResult.value === 'stop_loss') {
    const hitTps = tpStatuses.value.filter(s => s === 'hit').length
    if (hitTps > 0) {
      return `SL Hit First (${hitTps} TP${hitTps > 1 ? 's' : ''} reached before SL)`
    }
    return 'SL Hit First'
  }
  if (derivedResult.value === 'take_profit') {
    return 'All Targets Hit'
  }
  return ''
})

const derivedResultBadgeClass = computed(() => {
  if (derivedResult.value === 'stop_loss') {
    return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  }
  return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
})

const derivedResultBorderClass = computed(() => {
  if (derivedResult.value === 'stop_loss') {
    return 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20'
  }
  return 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20'
})

// Initialize state from existing trade data
function initializeFromTrade() {
  const trade = props.trade

  // Initialize SL hit state
  slHit.value = trade.manual_target_hit_first === 'stop_loss'

  // Initialize TP statuses from take_profit_targets
  const targets = trade.take_profit_targets || []
  if (targets.length > 0) {
    tpStatuses.value = targets.map(t => t.status || 'pending')
  } else if (trade.take_profit) {
    // Single TP - if manual is 'take_profit', mark as hit
    tpStatuses.value = [trade.manual_target_hit_first === 'take_profit' ? 'hit' : 'pending']
  } else {
    tpStatuses.value = []
  }

  // If manual is take_profit, all TPs should be marked hit
  if (trade.manual_target_hit_first === 'take_profit') {
    tpStatuses.value = tpStatuses.value.map(() => 'hit')
  }
}

onMounted(() => {
  if (props.trade.manual_target_hit_first) {
    mode.value = 'manual'
    initializeFromTrade()
  } else if (props.trade.target_hit_analysis) {
    const cachedAnalysis = props.trade.target_hit_analysis
    if (!cachedAnalysis?.analysis_result?.conclusion?.includes('Neither stop loss nor take profit')) {
      analysis.value = cachedAnalysis
    } else if (props.autoAnalyze && props.trade.stop_loss && props.trade.entry_time) {
      runAnalysis()
    }
    initializeFromTrade()
  } else {
    if (props.autoAnalyze && props.trade.stop_loss && props.trade.entry_time) {
      runAnalysis()
    }
    initializeFromTrade()
  }
})

// Watch for trade changes
watch(() => props.trade.id, () => {
  analysis.value = null
  error.value = ''

  if (props.trade.manual_target_hit_first) {
    mode.value = 'manual'
  } else if (props.trade.target_hit_analysis) {
    mode.value = 'auto'
    const cachedAnalysis = props.trade.target_hit_analysis
    if (!cachedAnalysis?.analysis_result?.conclusion?.includes('Neither stop loss nor take profit')) {
      analysis.value = cachedAnalysis
    }
  } else {
    mode.value = 'auto'
  }

  initializeFromTrade()
})

function setMode(newMode) {
  mode.value = newMode
  error.value = ''
  if (newMode === 'manual') {
    initializeFromTrade()
  }
}

function calculateTargetR(tpPrice) {
  if (!tpPrice || !props.trade.stop_loss || !props.trade.entry_price) return null
  const entry = parseFloat(props.trade.entry_price)
  const sl = parseFloat(props.trade.stop_loss)
  const tp = parseFloat(tpPrice)
  let risk, reward
  if (props.trade.side === 'long') {
    risk = entry - sl
    reward = tp - entry
  } else {
    risk = sl - entry
    reward = entry - tp
  }
  if (risk <= 0) return null
  return (reward / risk).toFixed(2)
}

async function toggleTarget(type, index, checked) {
  if (type === 'sl') {
    slHit.value = checked
  } else {
    tpStatuses.value[index] = checked ? 'hit' : 'pending'
  }

  await saveSelection()
}

async function saveSelection() {
  const result = derivedResult.value
  saving.value = true
  error.value = ''

  try {
    // Build target_statuses array
    const target_statuses = tpStatuses.value.map((status, index) => ({
      index,
      status
    }))

    const response = await api.patch(`/trade-management/trades/${props.trade.id}/manual-target-hit`, {
      manual_target_hit_first: result,
      target_statuses
    })

    emit('updated', {
      trade_id: props.trade.id,
      manual_target_hit_first: result,
      management_r: response.data.management_r,
      take_profit_targets: response.data.take_profit_targets,
      analysis: response.data.analysis
    })
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save selection'
  } finally {
    saving.value = false
  }
}

async function clearAllSelections() {
  slHit.value = false
  tpStatuses.value = tpStatuses.value.map(() => 'pending')

  saving.value = true
  error.value = ''

  try {
    const response = await api.patch(`/trade-management/trades/${props.trade.id}/manual-target-hit`, {
      manual_target_hit_first: null,
      target_statuses: tpStatuses.value.map((status, index) => ({ index, status: 'pending' }))
    })

    emit('updated', {
      trade_id: props.trade.id,
      manual_target_hit_first: null,
      management_r: response.data.management_r,
      take_profit_targets: response.data.take_profit_targets,
      analysis: response.data.analysis
    })
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to clear selection'
  } finally {
    saving.value = false
  }
}

// Auto mode computed properties
const resultBadgeClass = computed(() => {
  const firstHit = analysis.value?.analysis_result?.first_target_hit
  if (!firstHit || firstHit === 'none') {
    return 'px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  }
  if (firstHit === 'stop_loss') {
    return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  }
  return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
})

const resultLabel = computed(() => {
  const result = analysis.value?.analysis_result
  if (!result) return 'Unknown'
  if (result.first_target_hit === 'none') {
    if (result.used_exit_price_analysis || analysis.value?.candle_data_used?.source === 'exit_price_analysis') {
      return 'Unable to Determine'
    }
    return 'Neither Target Hit'
  }
  return `${result.first_target_label} Hit First`
})

const resultDescription = computed(() => {
  const result = analysis.value?.analysis_result
  if (!result || !result.first_hit_time) return ''
  return `at ${formatTimeTz(result.first_hit_time)}`
})

const manualResultBadgeClass = computed(() => {
  const value = props.trade.manual_target_hit_first
  if (!value) return 'px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  if (value === 'stop_loss') return 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  return 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
})

const manualResultLabel = computed(() => {
  const value = props.trade.manual_target_hit_first
  switch (value) {
    case 'take_profit': return 'TP Hit First'
    case 'stop_loss': return 'SL Hit First'
    default: return 'Not Set'
  }
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
</script>
