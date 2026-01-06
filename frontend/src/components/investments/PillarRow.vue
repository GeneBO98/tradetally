<template>
  <div>
    <!-- Main Row (Clickable) -->
    <div
      @click="toggleExpanded"
      class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
    >
      <!-- Left Side: Pillar Info -->
      <div class="flex items-center space-x-4">
        <!-- Pass/Fail Icon -->
        <div
          :class="[
            'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
            pillar.passed
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          ]"
        >
          <svg
            v-if="pillar.passed"
            class="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <svg
            v-else
            class="w-6 h-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>

        <!-- Pillar Details -->
        <div>
          <div class="flex items-center">
            <span class="text-xs font-medium text-gray-400 dark:text-gray-500 mr-2">Pillar {{ pillarNumber }}</span>
            <h4 class="text-sm font-medium text-gray-900 dark:text-white">{{ pillar.name }}</h4>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ pillar.description }}</p>
        </div>
      </div>

      <!-- Right Side: Value & Expand Icon -->
      <div class="flex items-center space-x-4">
        <div class="text-right">
          <p
            :class="[
              'text-lg font-bold',
              pillar.passed ? 'text-green-600' : 'text-red-600'
            ]"
          >
            {{ displayValue }}
          </p>
          <p v-if="pillar.threshold" class="text-xs text-gray-500 dark:text-gray-400">
            Threshold: {{ formatThreshold }}
          </p>
          <p v-if="pillar.reason" class="text-xs text-gray-400 dark:text-gray-500">
            {{ pillar.reason }}
          </p>
        </div>

        <!-- Expand Icon -->
        <svg
          v-if="hasDetails"
          :class="['w-5 h-5 text-gray-400 transition-transform', expanded ? 'rotate-180' : '']"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </div>
    </div>

    <!-- Expanded Details -->
    <div
      v-if="expanded && hasDetails"
      class="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700"
    >
      <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Calculation Details</h5>

      <!-- Annual P/E Table -->
      <div v-if="pillar.data?.annualPEs && pillar.data.annualPEs.length > 0" class="mb-4">
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Annual P/E Ratios</p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-gray-100 dark:bg-gray-800">
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Year</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Price</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">EPS</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">P/E</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="row in pillar.data.annualPEs" :key="row.year" class="bg-white dark:bg-gray-800">
                <td class="px-3 py-2 text-gray-900 dark:text-white">{{ row.year }}</td>
                <td class="px-3 py-2 text-right text-gray-900 dark:text-white">${{ row.price?.toFixed(2) }}</td>
                <td class="px-3 py-2 text-right text-gray-900 dark:text-white">${{ row.eps?.toFixed(2) }}</td>
                <td class="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{{ row.pe?.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Annual ROIC Table -->
      <div v-if="pillar.data?.annualROICs && pillar.data.annualROICs.length > 0" class="mb-4">
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Annual ROIC</p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-gray-100 dark:bg-gray-800">
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Year</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Op. Income</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Invested Capital</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">ROIC</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="row in pillar.data.annualROICs" :key="row.year" class="bg-white dark:bg-gray-800">
                <td class="px-3 py-2 text-gray-900 dark:text-white">{{ row.year }}</td>
                <td class="px-3 py-2 text-right text-gray-900 dark:text-white">{{ formatCurrency(row.operatingIncome) }}</td>
                <td class="px-3 py-2 text-right text-gray-900 dark:text-white">{{ formatCurrency(row.investedCapital) }}</td>
                <td class="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{{ row.roic?.toFixed(2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Regular Data Grid (excluding arrays) -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <template v-for="(fieldValue, fieldKey) in formattedData" :key="fieldKey">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ formatLabel(fieldKey) }}</p>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ fieldValue }}</p>
          </div>
        </template>

        <!-- Threshold Card if applicable -->
        <div v-if="pillar.threshold" class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Threshold</p>
          <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ formatThreshold }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const props = defineProps({
  pillarNumber: {
    type: [String, Number],
    required: true
  },
  pillar: {
    type: Object,
    required: true
  }
})

// Get unique key for localStorage based on symbol and pillar number
const storageKey = computed(() => {
  const symbol = route.params.symbol?.toUpperCase() || 'unknown'
  return `pillar_expanded_${symbol}_${props.pillarNumber}`
})

// Initialize expanded state from localStorage
const expanded = ref(false)

// Function to load expanded state from localStorage
function loadExpandedState() {
  const symbol = route.params.symbol?.toUpperCase()
  if (symbol && symbol !== 'UNKNOWN') {
    const key = `pillar_expanded_${symbol}_${props.pillarNumber}`
    const stored = localStorage.getItem(key)
    if (stored === 'true') {
      expanded.value = true
      return true // Indicate state was loaded
    }
  }
  return false // Indicate state was not loaded
}

// Try to load state immediately if route params are available
if (route.params.symbol) {
  loadExpandedState()
}

onMounted(async () => {
  // Use nextTick to ensure route params are available after Vue has finished updating
  await nextTick()
  
  // Try loading state - if route params weren't available, try again
  let loaded = loadExpandedState()
  
  // If still not loaded, try multiple times with increasing delays
  // This handles cases where route params become available slightly after mount
  if (!loaded) {
    const attempts = [50, 100, 200]
    for (const delay of attempts) {
      await new Promise(resolve => setTimeout(resolve, delay))
      loaded = loadExpandedState()
      if (loaded) break
    }
  }
})

// Watch for when the pillar prop becomes available (component might mount before analysis loads)
watch(() => props.pillar, () => {
  // When pillar data becomes available, ensure state is loaded
  if (props.pillar && route.params.symbol) {
    loadExpandedState()
  }
}, { immediate: true })

// Watch for route param changes (handles refresh/navigation)
watch(() => route.params.symbol, (newSymbol, oldSymbol) => {
  if (newSymbol && newSymbol !== oldSymbol) {
    // Reset expanded state and reload from localStorage when symbol changes
    expanded.value = false
    loadExpandedState()
  }
}, { immediate: true })

// Also watch the entire route object to catch when params become available
watch(() => route.params, (newParams) => {
  if (newParams.symbol && !expanded.value) {
    // Only load if not already expanded (to avoid overriding user's current state)
    loadExpandedState()
  }
}, { deep: true, immediate: true })

// Watch for changes and persist to localStorage
watch(expanded, (newValue) => {
  const symbol = route.params.symbol?.toUpperCase()
  if (symbol && symbol !== 'UNKNOWN') {
    const key = `pillar_expanded_${symbol}_${props.pillarNumber}`
    if (newValue) {
      localStorage.setItem(key, 'true')
    } else {
      localStorage.removeItem(key)
    }
  }
})

const hasDetails = computed(() => {
  return props.pillar.data && Object.keys(props.pillar.data).length > 0
})

function toggleExpanded() {
  if (hasDetails.value) {
    expanded.value = !expanded.value
  }
}

const displayValue = computed(() => {
  if (props.pillar.displayValue) {
    return props.pillar.displayValue
  }

  // Always return a number - use 0 as fallback if value is null/undefined
  const value = props.pillar.value !== null && props.pillar.value !== undefined 
    ? props.pillar.value 
    : 0

  if (typeof value === 'number') {
    return value.toFixed(2)
  }

  return String(value)
})

const formatThreshold = computed(() => {
  const t = props.pillar.threshold
  if (t === null || t === undefined) return ''

  // For pillars with < threshold
  if (props.pillar.name.includes('P/E') || props.pillar.name.includes('Price/FCF')) {
    return `< ${t}`
  }

  if (props.pillar.name.includes('Debt') || props.pillar.name.includes('Liabilities')) {
    return `< ${t}x`
  }

  return t
})

const formattedData = computed(() => {
  if (!props.pillar.data) return {}

  const formatted = {}
  // Skip array fields (they're displayed as tables above)
  const skipFields = ['annualPEs', 'annualROICs']

  for (const [key, value] of Object.entries(props.pillar.data)) {
    if (value === null || value === undefined) continue
    if (skipFields.includes(key)) continue
    if (Array.isArray(value)) continue
    formatted[key] = formatValue(key, value)
  }
  return formatted
})

function formatLabel(key) {
  const labels = {
    marketCap: 'Market Cap',
    fiveYearNetIncome: '5-Year Net Income',
    fiveYearFCF: '5-Year FCF',
    avgFCF: 'Avg Annual FCF',
    avgEquity: 'Avg Equity',
    avgDebt: 'Avg Debt',
    investedCapital: 'Invested Capital',
    currentShares: 'Current Shares',
    priorShares: 'Prior Shares (5yr ago)',
    currentFCF: 'Current FCF (TTM)',
    priorFCF: 'Prior FCF (5yr ago)',
    currentIncome: 'Current Net Income',
    priorIncome: 'Prior Net Income',
    currentRevenue: 'Current Revenue',
    priorRevenue: 'Prior Revenue',
    longTermDebt: 'Long-Term Debt'
  }
  return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  if (Math.abs(value) >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`
  } else if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`
  } else if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`
  } else {
    return `$${value.toLocaleString()}`
  }
}

function formatValue(key, value) {
  if (typeof value !== 'number') return value

  // Format shares as plain numbers with commas
  if (key.toLowerCase().includes('shares')) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  }

  // Format large currency values (billions/millions)
  const currencyKeys = ['marketCap', 'netIncome', 'fcf', 'equity', 'debt', 'capital', 'revenue', 'income']
  if (currencyKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
    return formatCurrency(value)
  }

  // Default number formatting
  return value.toLocaleString()
}
</script>
