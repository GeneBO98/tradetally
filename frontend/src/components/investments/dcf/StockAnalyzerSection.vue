<template>
  <div class="space-y-6">
    <!-- Loading State (fetching metrics for the selected symbol) -->
    <div
      v-if="symbol && dcfLoading && !dcfMetrics"
      class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6"
    >
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-3"></div>
        <span class="text-gray-600 dark:text-gray-400">Loading financial data...</span>
      </div>
    </div>

    <!-- DCF Calculator -->
    <div
      v-else-if="symbol"
      ref="calculatorCardRef"
      class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6"
    >
      <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Stock Valuation Calculator</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Review historical metrics and enter your assumptions to calculate fair value. Each calculation is saved automatically below.
      </p>

      <DCFCalculator
        ref="calculatorRef"
        :metrics="dcfMetrics"
        :current-price="currentPrice"
        :calculating="dcfLoading"
        :results="dcfResults"
        :auto-save="true"
        @calculate="handleCalculate"
        @save="handleSave"
      />
    </div>

    <!-- Empty state when no symbol is selected -->
    <div
      v-else-if="!analyzerLoading"
      class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
    >
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">DCF Valuation Calculator</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Enter a stock symbol above to calculate fair value, or pick one of your saved valuations below.
      </p>
    </div>

    <!-- Saved Valuations (all symbols) -->
    <div v-if="sortedValuations.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <div class="flex items-center justify-between mb-1">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Saved Valuations</h2>
        <label
          v-if="symbol"
          class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
        >
          <input
            type="checkbox"
            v-model="currentSymbolOnly"
            class="rounded text-primary-600 focus:ring-primary-500 mr-2"
          />
          Only {{ symbol }}
        </label>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Click any saved valuation to load its assumptions and fair-value results. Selecting a different symbol switches the analyzer to that stock.
      </p>
      <SavedValuationsList
        :valuations="filteredValuations"
        :loaded-id="loadedValuationId"
        :current-symbol="symbol"
        @load="handleLoadValuation"
        @delete="handleDeleteValuation"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useInvestmentsStore } from '@/stores/investments'
import { useNotification } from '@/composables/useNotification'
import DCFCalculator from './DCFCalculator.vue'
import SavedValuationsList from './SavedValuationsList.vue'

const props = defineProps({
  symbol: {
    type: String,
    default: ''
  },
  currentPrice: {
    type: Number,
    default: null
  },
  pendingValuationId: {
    type: String,
    default: null
  },
  analyzerLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select-symbol', 'pending-consumed'])

const store = useInvestmentsStore()
const { showSuccess, showError } = useNotification()

const calculatorRef = ref(null)
const calculatorCardRef = ref(null)
const loadedValuationId = ref(null)
const currentSymbolOnly = ref(false)

// Computed from store
const dcfMetrics = computed(() => store.dcfMetrics)
const dcfResults = computed(() => store.dcfResults)
const dcfLoading = computed(() => store.dcfLoading)
const savedValuations = computed(() => store.savedValuations)

// All saved valuations, with current symbol's analyses grouped at the top,
// then everything else newest-first.
const sortedValuations = computed(() => {
  const all = [...savedValuations.value]
  const current = props.symbol?.toUpperCase() || ''
  return all.sort((a, b) => {
    const aIsCurrent = current && a.symbol === current
    const bIsCurrent = current && b.symbol === current
    if (aIsCurrent && !bIsCurrent) return -1
    if (bIsCurrent && !aIsCurrent) return 1
    return new Date(b.valuation_date) - new Date(a.valuation_date)
  })
})

const filteredValuations = computed(() => {
  if (!currentSymbolOnly.value || !props.symbol) return sortedValuations.value
  const current = props.symbol.toUpperCase()
  return sortedValuations.value.filter(v => v.symbol === current)
})

// Always fetch the user's saved valuations on mount, even before a symbol
// is selected, so the panel can be populated from the start.
onMounted(() => {
  store.fetchValuations().catch(err => console.error('Failed to fetch valuations:', err))
})

// Fetch fresh metrics whenever the symbol changes; clear results so the
// previous symbol's data doesn't bleed through. With no symbol, just keep
// whatever saved valuations are already loaded.
watch(() => props.symbol, async (newSymbol) => {
  store.clearDCFData()
  loadedValuationId.value = null

  if (!newSymbol) return

  try {
    await Promise.all([
      store.fetchDCFMetrics(newSymbol),
      store.fetchValuations()
    ])
  } catch (err) {
    console.error('Failed to fetch DCF data:', err)
  }

  consumePendingValuation()
}, { immediate: true })

// If parent sets a pending id after we're already mounted with metrics, try
// to apply it as soon as it arrives.
watch(() => props.pendingValuationId, () => {
  if (props.pendingValuationId && dcfMetrics.value) {
    consumePendingValuation()
  }
})

function consumePendingValuation() {
  if (!props.pendingValuationId) return
  const target = savedValuations.value.find(v => v.id === props.pendingValuationId)
  if (target && target.symbol === props.symbol?.toUpperCase()) {
    handleLoadValuation(target)
    emit('pending-consumed')
  }
}

async function handleCalculate(inputs) {
  // A fresh calculation supersedes any loaded saved valuation.
  loadedValuationId.value = null
  try {
    await store.calculateDCF(props.symbol, inputs)
  } catch (err) {
    showError('Calculation Failed', err.message || 'Failed to calculate DCF')
  }
}

async function handleSave(data) {
  try {
    const saved = await store.saveValuation(data)
    showSuccess('Analysis Saved', 'Your valuation was saved automatically')
    if (saved?.id) {
      loadedValuationId.value = saved.id
    }
  } catch (err) {
    showError('Save Failed', err.message || 'Failed to save valuation')
  }
}

function marginOfSafety(fairValue, current) {
  if (fairValue === null || fairValue === undefined) return null
  if (!current) return null
  return (fairValue - current) / current
}

async function handleLoadValuation(valuation) {
  // Cross-symbol click (or no symbol loaded yet) — ask the parent to switch
  // the analyzer to that stock.
  if (!props.symbol || valuation.symbol !== props.symbol.toUpperCase()) {
    emit('select-symbol', { symbol: valuation.symbol, valuationId: valuation.id })
    return
  }

  if (!calculatorRef.value) return

  calculatorRef.value.loadValuation(valuation)
  loadedValuationId.value = valuation.id

  // Reconstruct results so the result cards reflect the saved fair values.
  const currentForMos = valuation.current_price ?? props.currentPrice
  store.setDCFResults({
    fair_value_low: valuation.fair_value_low,
    fair_value_medium: valuation.fair_value_medium,
    fair_value_high: valuation.fair_value_high,
    margin_of_safety_low: marginOfSafety(valuation.fair_value_low, currentForMos),
    margin_of_safety_medium: marginOfSafety(valuation.fair_value_medium, currentForMos),
    margin_of_safety_high: marginOfSafety(valuation.fair_value_high, currentForMos)
  })

  await nextTick()
  if (calculatorCardRef.value) {
    calculatorCardRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

async function handleDeleteValuation(id) {
  try {
    await store.deleteValuation(id)
    if (loadedValuationId.value === id) {
      loadedValuationId.value = null
    }
    showSuccess('Valuation Deleted', 'The valuation has been deleted')
  } catch (err) {
    showError('Delete Failed', err.message || 'Failed to delete valuation')
  }
}
</script>
