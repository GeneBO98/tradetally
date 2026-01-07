<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <!-- Header with collapse toggle -->
    <div
      class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer"
      @click="toggleExpanded"
    >
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">DCF Valuation Calculator</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Calculate intrinsic value using Discounted Cash Flow</p>
        </div>
        <button class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <svg
            class="w-5 h-5 transition-transform"
            :class="{ 'rotate-180': expanded }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="expanded" class="p-6">
      <!-- Error State -->
      <div v-if="error" class="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-red-700 dark:text-red-400">{{ error }}</p>
      </div>

      <!-- Historical Metrics Table -->
      <HistoricalMetricsTable
        :metrics="dcfMetrics"
        :loading="dcfLoading"
      />

      <!-- DCF Calculator -->
      <DCFCalculator
        ref="calculatorRef"
        :metrics="dcfMetrics"
        :current-price="currentPrice"
        :calculating="dcfLoading"
        :results="dcfResults"
        @calculate="handleCalculate"
        @save="handleSave"
      />

      <!-- Saved Valuations List -->
      <SavedValuationsList
        :valuations="symbolValuations"
        @load="handleLoadValuation"
        @delete="handleDeleteValuation"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useInvestmentsStore } from '@/stores/investments'
import { useNotification } from '@/composables/useNotification'
import HistoricalMetricsTable from './HistoricalMetricsTable.vue'
import DCFCalculator from './DCFCalculator.vue'
import SavedValuationsList from './SavedValuationsList.vue'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  },
  analysis: {
    type: Object,
    default: null
  }
})

const store = useInvestmentsStore()
const { showSuccess, showError } = useNotification()

const expanded = ref(false)
const calculatorRef = ref(null)

// Computed from store
const dcfMetrics = computed(() => store.dcfMetrics)
const dcfResults = computed(() => store.dcfResults)
const dcfLoading = computed(() => store.dcfLoading)
const error = computed(() => store.error)
const savedValuations = computed(() => store.savedValuations)

// Filter valuations for current symbol
const symbolValuations = computed(() => {
  return savedValuations.value.filter(v => v.symbol === props.symbol.toUpperCase())
})

// Get current price from analysis
const currentPrice = computed(() => props.analysis?.currentPrice || null)

function toggleExpanded() {
  expanded.value = !expanded.value

  // Fetch data when expanding for the first time
  if (expanded.value && !dcfMetrics.value) {
    fetchData()
  }
}

async function fetchData() {
  try {
    await Promise.all([
      store.fetchDCFMetrics(props.symbol),
      store.fetchValuations(props.symbol)
    ])
  } catch (err) {
    console.error('Failed to fetch DCF data:', err)
  }
}

async function handleCalculate(inputs) {
  try {
    await store.calculateDCF(props.symbol, inputs)
  } catch (err) {
    showError('Calculation Failed', err.message || 'Failed to calculate DCF')
  }
}

async function handleSave(data) {
  try {
    await store.saveValuation(data)
    showSuccess('Valuation Saved', 'Your valuation has been saved successfully')
  } catch (err) {
    showError('Save Failed', err.message || 'Failed to save valuation')
  }
}

function handleLoadValuation(valuation) {
  if (calculatorRef.value) {
    calculatorRef.value.loadValuation(valuation)
  }
}

async function handleDeleteValuation(id) {
  try {
    await store.deleteValuation(id)
    showSuccess('Valuation Deleted', 'The valuation has been deleted')
  } catch (err) {
    showError('Delete Failed', err.message || 'Failed to delete valuation')
  }
}

// Clear DCF data when symbol changes
watch(() => props.symbol, () => {
  store.clearDCFData()
  if (expanded.value) {
    fetchData()
  }
})

// Clean up on unmount
onMounted(() => {
  // Don't auto-expand, let user click to expand
})
</script>
