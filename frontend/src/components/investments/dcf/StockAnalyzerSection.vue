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
      <div class="flex items-start justify-between gap-4 mb-2">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Stock Valuation Calculator</h2>
        <div v-if="isProUser" class="flex shrink-0 gap-2">
          <button
            type="button"
            @click="openWatchlistModal"
            class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            <span class="hidden sm:inline">Add to </span>Watchlist
          </button>
          <button
            type="button"
            @click="openAlertModal"
            class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span class="hidden sm:inline">Set </span>Price Alert
          </button>
        </div>
      </div>
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

    <!-- Add to Watchlist Modal -->
    <div
      v-if="showWatchlistModal"
      class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Add {{ symbol }} to Watchlist
        </h3>

        <!-- Loading State -->
        <div v-if="watchlistsLoading" class="flex justify-center py-4">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>

        <!-- No Watchlists -->
        <div v-else-if="watchlists.length === 0" class="text-center py-4">
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            You don't have any watchlists yet.
          </p>
          <router-link to="/watchlists" class="text-primary-600 hover:text-primary-800">
            Create your first watchlist
          </router-link>
        </div>

        <!-- Watchlist Selection -->
        <div v-else class="space-y-2 mb-6">
          <label
            v-for="watchlist in watchlists"
            :key="watchlist.id"
            class="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            :class="{
              'border-primary-500 bg-primary-50 dark:bg-primary-900/20':
                selectedWatchlistId === watchlist.id
            }"
          >
            <input
              type="radio"
              v-model="selectedWatchlistId"
              :value="watchlist.id"
              class="text-primary-600 focus:ring-primary-500"
            />
            <div class="ml-3">
              <span class="font-medium text-gray-900 dark:text-white">{{ watchlist.name }}</span>
              <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">({{ watchlist.item_count }} symbols)</span>
              <span
                v-if="watchlist.is_default"
                class="ml-2 text-xs text-primary-600 dark:text-primary-400"
              >Default</span>
            </div>
          </label>
        </div>

        <div class="flex justify-end space-x-3">
          <button @click="closeWatchlistModal" class="btn-secondary">Cancel</button>
          <button
            v-if="watchlists.length > 0"
            @click="addToWatchlist"
            :disabled="!selectedWatchlistId || addingToWatchlist"
            class="btn-primary"
          >
            {{ addingToWatchlist ? 'Adding...' : 'Add to Watchlist' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Set Price Alert Modal -->
    <div
      v-if="showAlertModal"
      class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Set Price Alert for {{ symbol }}
        </h3>
        <p v-if="currentPrice" class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Current price:
          <span class="font-medium text-gray-900 dark:text-white">{{ formatPrice(currentPrice) }}</span>
        </p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alert me when price is
            </label>
            <BaseSelect
              v-model="alertForm.alert_type"
              :options="[
                { value: 'above', label: 'Above target price' },
                { value: 'below', label: 'Below target price' },
                { value: 'change_percent', label: 'Changes by percent' },
              ]"
            />
          </div>

          <div v-if="alertForm.alert_type !== 'change_percent'">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target price ($)
            </label>
            <input
              v-model.number="alertForm.target_price"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 150.00"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ alertForm.alert_type === 'above'
                ? 'Must be higher than the current price.'
                : 'Must be lower than the current price.' }}
            </p>
          </div>

          <div v-else>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Change percent (%)
            </label>
            <input
              v-model.number="alertForm.change_percent"
              type="number"
              step="0.1"
              placeholder="e.g. 5"
              class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div class="space-y-2">
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                v-model="alertForm.email_enabled"
                class="rounded text-primary-600 focus:ring-primary-500 mr-2"
              />
              Email notification
            </label>
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                v-model="alertForm.browser_enabled"
                class="rounded text-primary-600 focus:ring-primary-500 mr-2"
              />
              Browser notification
            </label>
            <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                v-model="alertForm.repeat_enabled"
                class="rounded text-primary-600 focus:ring-primary-500 mr-2"
              />
              Repeat (re-trigger after it fires)
            </label>
          </div>
        </div>

        <div class="flex justify-end space-x-3 mt-6">
          <button @click="closeAlertModal" class="btn-secondary">Cancel</button>
          <button
            @click="saveAlert"
            :disabled="savingAlert || !alertIsValid"
            class="btn-primary"
          >
            {{ savingAlert ? 'Saving...' : 'Create Alert' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useInvestmentsStore } from '@/stores/investments'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'
import DCFCalculator from './DCFCalculator.vue'
import SavedValuationsList from './SavedValuationsList.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'

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
const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

// Watchlist and price alerts are Pro features (the backend gates both routes
// with requiresTier('pro')). Mirror the frontend check used elsewhere so we
// only surface the action buttons to users who can actually use them.
// Self-hosted instances (billing disabled) grant full access.
const isProUser = computed(() => {
  if (authStore.user?.billingEnabled === false) return true
  return authStore.user?.tier === 'pro'
})

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

// --- Add to watchlist ---------------------------------------------------
// Self-contained here (rather than emitting up to InvestmentsView) because
// StockAnalyzerSection is mounted in several places; keeping the modal local
// means the action works the same wherever the analyzer appears.
const showWatchlistModal = ref(false)
const watchlists = ref([])
const watchlistsLoading = ref(false)
const selectedWatchlistId = ref(null)
const addingToWatchlist = ref(false)

async function openWatchlistModal() {
  if (!props.symbol) return
  showWatchlistModal.value = true
  selectedWatchlistId.value = null
  await loadWatchlists()
}

function closeWatchlistModal() {
  showWatchlistModal.value = false
  selectedWatchlistId.value = null
}

async function loadWatchlists() {
  watchlistsLoading.value = true
  try {
    const response = await api.get('/watchlists')
    watchlists.value = response.data.data || []
    // Auto-select the default watchlist so the common case is one click.
    const defaultWatchlist = watchlists.value.find(w => w.is_default)
    if (defaultWatchlist) selectedWatchlistId.value = defaultWatchlist.id
  } catch (err) {
    console.error('Error loading watchlists:', err)
    showError('Error', 'Failed to load watchlists')
  } finally {
    watchlistsLoading.value = false
  }
}

async function addToWatchlist() {
  if (!selectedWatchlistId.value || !props.symbol) return
  addingToWatchlist.value = true
  try {
    await api.post(`/watchlists/${selectedWatchlistId.value}/items`, {
      symbol: props.symbol
    })
    const watchlistName = watchlists.value.find(w => w.id === selectedWatchlistId.value)?.name || 'watchlist'
    showSuccess('Added to Watchlist', `${props.symbol} has been added to ${watchlistName}`)
    closeWatchlistModal()
  } catch (err) {
    console.error('Error adding to watchlist:', err)
    if (err.response?.data?.error?.includes('already in this watchlist')) {
      showError('Already in Watchlist', `${props.symbol} is already in this watchlist`)
    } else {
      showError('Error', 'Failed to add symbol to watchlist')
    }
  } finally {
    addingToWatchlist.value = false
  }
}

// --- Set price alert ----------------------------------------------------
const showAlertModal = ref(false)
const savingAlert = ref(false)
const alertForm = ref({
  alert_type: 'above',
  target_price: null,
  change_percent: null,
  email_enabled: true,
  browser_enabled: true,
  repeat_enabled: false
})

const alertIsValid = computed(() => {
  // The backend requires at least one notification method.
  if (!alertForm.value.email_enabled && !alertForm.value.browser_enabled) return false
  if (alertForm.value.alert_type === 'change_percent') {
    return Number.isFinite(alertForm.value.change_percent) && alertForm.value.change_percent !== 0
  }
  return Number.isFinite(alertForm.value.target_price) && alertForm.value.target_price > 0
})

function openAlertModal() {
  if (!props.symbol) return
  alertForm.value = {
    alert_type: 'above',
    target_price: null,
    change_percent: null,
    email_enabled: true,
    browser_enabled: true,
    repeat_enabled: false
  }
  showAlertModal.value = true
}

function closeAlertModal() {
  showAlertModal.value = false
}

async function saveAlert() {
  if (!props.symbol || !alertIsValid.value) return
  savingAlert.value = true
  try {
    const isPercent = alertForm.value.alert_type === 'change_percent'
    await api.post('/price-alerts', {
      symbol: props.symbol,
      alert_type: alertForm.value.alert_type,
      target_price: isPercent ? null : alertForm.value.target_price,
      change_percent: isPercent ? alertForm.value.change_percent : null,
      email_enabled: alertForm.value.email_enabled,
      browser_enabled: alertForm.value.browser_enabled,
      repeat_enabled: alertForm.value.repeat_enabled
    })
    showSuccess('Price Alert Created', `You'll be notified about ${props.symbol}`)
    closeAlertModal()
  } catch (err) {
    console.error('Error creating price alert:', err)
    // The backend returns a helpful message for direction/current-price
    // mismatches and duplicates — surface it directly.
    showError('Error', err.response?.data?.error || 'Failed to create price alert')
  } finally {
    savingAlert.value = false
  }
}

function formatPrice(value) {
  if (value === null || value === undefined) return 'N/A'
  return `$${Number(value).toFixed(2)}`
}
</script>
