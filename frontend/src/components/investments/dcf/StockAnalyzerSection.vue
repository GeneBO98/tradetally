<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="dcfLoading && !dcfMetrics" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-3"></div>
        <span class="text-gray-600 dark:text-gray-400">Loading financial data...</span>
      </div>
    </div>

    <!-- DCF Calculator (includes Historical + Assumptions combined table) -->
    <div v-else class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Stock Valuation Calculator</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Review historical metrics and enter your assumptions to calculate fair value.
      </p>

      <DCFCalculator
        ref="calculatorRef"
        :metrics="dcfMetrics"
        :current-price="currentPrice"
        :calculating="dcfLoading"
        :results="dcfResults"
        @calculate="handleCalculate"
        @save="handleSave"
      />
    </div>

    <!-- Saved Valuations -->
    <div v-if="symbolValuations.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Saved Valuations</h2>
      <SavedValuationsList
        :valuations="symbolValuations"
        @load="handleLoadValuation"
        @delete="handleDeleteValuation"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useInvestmentsStore } from '@/stores/investments'
import { useNotification } from '@/composables/useNotification'
import DCFCalculator from './DCFCalculator.vue'
import SavedValuationsList from './SavedValuationsList.vue'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  },
  currentPrice: {
    type: Number,
    default: null
  }
})

const store = useInvestmentsStore()
const { showSuccess, showError } = useNotification()

const calculatorRef = ref(null)

// Computed from store
const dcfMetrics = computed(() => store.dcfMetrics)
const dcfResults = computed(() => store.dcfResults)
const dcfLoading = computed(() => store.dcfLoading)
const savedValuations = computed(() => store.savedValuations)

// Filter valuations for current symbol
const symbolValuations = computed(() => {
  return savedValuations.value.filter(v => v.symbol === props.symbol.toUpperCase())
})

// Fetch data when symbol changes
watch(() => props.symbol, async (newSymbol) => {
  if (newSymbol) {
    store.clearDCFData()
    await fetchData()
  }
}, { immediate: true })

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
</script>
