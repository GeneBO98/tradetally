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

    <!-- Saved Valuations -->
    <div v-if="sortedValuations.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <div class="flex items-center justify-between mb-1">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Saved Valuations</h2>
        <label
          v-if="symbol"
          class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
        >
          <input
            type="checkbox"
            v-model="showAllSymbols"
            class="rounded text-primary-600 focus:ring-primary-500 mr-2"
          />
          Show all symbols
        </label>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Click any saved valuation to load its assumptions and fair-value results. Selecting a different symbol switches the analyzer to that stock.
      </p>

      <!-- Search -->
      <div class="relative mb-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by symbol or notes..."
          class="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
        />
        <svg
          class="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <!-- Empty filtered state -->
      <div
        v-if="filteredValuations.length === 0"
        class="text-center py-6 text-sm text-gray-500 dark:text-gray-400"
      >
        No saved valuations match your filters.
      </div>

      <SavedValuationsList
        v-else
        :valuations="pagedValuations"
        :loaded-id="loadedValuationId"
        :current-symbol="symbol"
        @load="handleLoadValuation"
        @delete="handleDeleteValuation"
      />

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="mt-4 flex items-center justify-between text-sm"
      >
        <div class="text-gray-500 dark:text-gray-400">
          Showing {{ pageStart }}-{{ pageEnd }} of {{ filteredValuations.length }}
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Previous
          </button>
          <span class="text-gray-600 dark:text-gray-300">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      </div>
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

const PAGE_SIZE = 10

const calculatorRef = ref(null)
const calculatorCardRef = ref(null)
const loadedValuationId = ref(null)
// Default to current-symbol-only when a symbol is loaded; user can toggle
// "Show all symbols" to see the rest of their saved valuations.
const showAllSymbols = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)

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
  let list = sortedValuations.value

  // Restrict to the current symbol unless "Show all symbols" is toggled on.
  if (props.symbol && !showAllSymbols.value) {
    const current = props.symbol.toUpperCase()
    list = list.filter(v => v.symbol === current)
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter(v => {
      const symbolMatch = v.symbol?.toLowerCase().includes(query)
      const notesMatch = v.notes?.toLowerCase().includes(query)
      return symbolMatch || notesMatch
    })
  }

  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredValuations.value.length / PAGE_SIZE)))

const pagedValuations = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredValuations.value.slice(start, start + PAGE_SIZE)
})

const pageStart = computed(() => {
  if (filteredValuations.value.length === 0) return 0
  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const pageEnd = computed(() => Math.min(currentPage.value * PAGE_SIZE, filteredValuations.value.length))

// Reset to page 1 whenever the filtered set changes so the user isn't stranded
// on an empty page after toggling filters or searching.
watch([showAllSymbols, searchQuery, () => props.symbol], () => {
  currentPage.value = 1
})

// If the filtered list shrinks below the current page (e.g. after a delete),
// snap back into range.
watch(totalPages, (newTotal) => {
  if (currentPage.value > newTotal) currentPage.value = newTotal
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
    const duplicate = findMatchingValuation(data)
    if (duplicate) {
      loadedValuationId.value = duplicate.id
      return
    }

    const saved = await store.saveValuation(data)
    showSuccess('Analysis Saved', 'Your valuation was saved automatically')
    if (saved?.id) {
      loadedValuationId.value = saved.id
    }
  } catch (err) {
    showError('Save Failed', err.message || 'Failed to save valuation')
  }
}

function numbersMatch(left, right, tolerance = 0.000001) {
  if (left === null || left === undefined || left === '') {
    return right === null || right === undefined || right === ''
  }
  if (right === null || right === undefined || right === '') {
    return false
  }

  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return left === right
  }

  return Math.abs(leftNumber - rightNumber) <= tolerance
}

function valuationMatchesData(valuation, data) {
  // Compare only the user-input fields. The fair values are deterministic
  // derivations of these inputs (plus current financial data), so if every
  // input matches we treat it as the same analysis. Comparing the computed
  // fair_value_* fields was brittle: tiny float-precision drift between the
  // freshly calculated value and the DB-stored value caused false negatives
  // and produced duplicate saves on every recalculation.
  const fields = [
    'symbol',
    'revenue_growth_low',
    'revenue_growth_medium',
    'revenue_growth_high',
    'profit_margin_low',
    'profit_margin_medium',
    'profit_margin_high',
    'fcf_margin_low',
    'fcf_margin_medium',
    'fcf_margin_high',
    'pe_low',
    'pe_medium',
    'pe_high',
    'pfcf_low',
    'pfcf_medium',
    'pfcf_high',
    'desired_return_low',
    'desired_return_medium',
    'desired_return_high',
    'projection_years'
  ]

  return fields.every(field => {
    if (field === 'symbol') {
      return valuation.symbol === data.symbol?.toUpperCase()
    }
    return numbersMatch(valuation[field], data[field])
  })
}

function findMatchingValuation(data) {
  return savedValuations.value.find(valuation => valuationMatchesData(valuation, data))
}

function marginOfSafety(fairValue, current) {
  if (fairValue === null || fairValue === undefined) return null
  if (!current) return null
  return (fairValue - current) / current
}

function futurePriceFromSaved(fairValue, requiredReturn, years) {
  if (fairValue === null || fairValue === undefined) return null
  if (requiredReturn === null || requiredReturn === undefined) return null
  if (!years || years <= 0) return null
  return Number(fairValue) * Math.pow(1 + Number(requiredReturn), Number(years))
}

function currentPriceReturnFromSaved(fairValue, requiredReturn, years, current) {
  const futurePrice = futurePriceFromSaved(fairValue, requiredReturn, years)
  if (!futurePrice || !current || !years || years <= 0) return null
  return Math.pow(futurePrice / Number(current), 1 / Number(years)) - 1
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
    future_price_low: futurePriceFromSaved(valuation.fair_value_low, valuation.desired_return_low, valuation.projection_years),
    future_price_medium: futurePriceFromSaved(valuation.fair_value_medium, valuation.desired_return_medium, valuation.projection_years),
    future_price_high: futurePriceFromSaved(valuation.fair_value_high, valuation.desired_return_high, valuation.projection_years),
    current_price_return_low: currentPriceReturnFromSaved(valuation.fair_value_low, valuation.desired_return_low, valuation.projection_years, currentForMos),
    current_price_return_medium: currentPriceReturnFromSaved(valuation.fair_value_medium, valuation.desired_return_medium, valuation.projection_years, currentForMos),
    current_price_return_high: currentPriceReturnFromSaved(valuation.fair_value_high, valuation.desired_return_high, valuation.projection_years, currentForMos),
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
