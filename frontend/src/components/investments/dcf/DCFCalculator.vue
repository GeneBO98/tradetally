<template>
  <div>
    <!-- Estimate Inputs Grid - Combined Historical + My Assumptions -->
    <div class="overflow-x-auto mb-6">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="bg-gray-100 dark:bg-gray-700">
            <th class="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300"></th>
            <th colspan="3" class="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">Historical</th>
            <th colspan="3" class="px-4 py-2 text-center font-medium text-primary-600 dark:text-primary-400 border-b border-gray-200 dark:border-gray-600">My Assumptions</th>
          </tr>
          <tr class="bg-gray-50 dark:bg-gray-700/50">
            <th class="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300"></th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">1 Year</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">5 Years</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">10 Years</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-red-600 dark:text-red-400">Bear</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-yellow-600 dark:text-yellow-400">Base</th>
            <th class="px-4 py-2 text-center text-xs font-medium text-green-600 dark:text-green-400">Bull</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <!-- ROIC (display only) -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">ROIC</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.roic_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.roic_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.roic_10yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-400" colspan="3">-</td>
          </tr>
          <!-- Revenue Growth -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Rev. Growth %</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.revenue_growth_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.revenue_growth_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.revenue_growth_10yr) }}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.revenue_growth_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.revenue_growth_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.revenue_growth_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
          </tr>
          <!-- Profit Margin -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Profit Margin</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.profit_margin_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.profit_margin_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.profit_margin_10yr) }}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.profit_margin_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.profit_margin_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.profit_margin_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
          </tr>
          <!-- Free Cash Flow Margin -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Free Cash Flow Margin</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.fcf_margin_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.fcf_margin_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.fcf_margin_10yr) }}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.fcf_margin_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.fcf_margin_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.fcf_margin_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
          </tr>
          <!-- P/E -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">P/E</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400" colspan="3">{{ metrics?.pe_ratio ? metrics.pe_ratio.toFixed(1) : '-' }}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pe_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pe_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pe_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
          </tr>
          <!-- P/FCF -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">P/FCF</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400" colspan="3">{{ metrics?.price_to_fcf ? metrics.price_to_fcf.toFixed(1) : '-' }}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pfcf_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pfcf_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.pfcf_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="0.5" />
                <span class="ml-1 text-gray-400 text-xs">x</span>
              </div>
            </td>
          </tr>
          <!-- Desired Annual Return -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Desired Annual Return</td>
            <td class="px-4 py-3 text-center text-gray-400" colspan="3">-</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.desired_return_low" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="1" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.desired_return_medium" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="1" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center">
                <input type="number" v-model.number="inputs.desired_return_high" class="w-16 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-1 py-1 text-sm" step="1" />
                <span class="ml-1 text-gray-400 text-xs">%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Current Price Display -->
    <div class="flex items-center justify-between mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div>
        <span class="text-gray-600 dark:text-gray-400">Current price</span>
        <span class="ml-4 text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(currentPrice) }}</span>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        Years of Analysis: <span class="font-medium">10</span>
      </div>
    </div>

    <!-- Calculate Button -->
    <div class="flex justify-start mb-6">
      <button
        @click="calculate"
        :disabled="calculating || !canCalculate"
        class="btn-primary"
      >
        <span v-if="calculating" class="flex items-center">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Calculating...
        </span>
        <span v-else>Calculate Fair Value</span>
      </button>
    </div>

    <!-- Results -->
    <div v-if="results" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <DCFResultCard
        scenario="Bear"
        :fair-value="results.fair_value_low"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_low"
      />
      <DCFResultCard
        scenario="Base"
        :fair-value="results.fair_value_medium"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_medium"
      />
      <DCFResultCard
        scenario="Bull"
        :fair-value="results.fair_value_high"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_high"
      />
    </div>

    <!-- Save Button -->
    <div v-if="results" class="flex items-center gap-4">
      <button
        @click="save"
        :disabled="saving"
        class="btn-secondary"
      >
        {{ saving ? 'Saving...' : 'Save Valuation' }}
      </button>
      <div class="flex-1">
        <input
          type="text"
          v-model="notes"
          placeholder="Optional notes..."
          class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import DCFResultCard from './DCFResultCard.vue'

const props = defineProps({
  metrics: {
    type: Object,
    default: null
  },
  currentPrice: {
    type: Number,
    default: null
  },
  calculating: {
    type: Boolean,
    default: false
  },
  results: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['calculate', 'save'])

const inputs = ref({
  revenue_growth_low: null,
  revenue_growth_medium: null,
  revenue_growth_high: null,
  profit_margin_low: null,
  profit_margin_medium: null,
  profit_margin_high: null,
  fcf_margin_low: null,
  fcf_margin_medium: null,
  fcf_margin_high: null,
  pe_low: null,
  pe_medium: null,
  pe_high: null,
  pfcf_low: null,
  pfcf_medium: null,
  pfcf_high: null,
  desired_return_low: null,
  desired_return_medium: null,
  desired_return_high: null
})

const notes = ref('')
const saving = ref(false)

// Helper functions
function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}

// Reset inputs when metrics change (new symbol selected)
watch(() => props.metrics, () => {
  // Clear inputs when a new symbol is loaded - user must enter their own assumptions
  inputs.value = {
    revenue_growth_low: null,
    revenue_growth_medium: null,
    revenue_growth_high: null,
    profit_margin_low: null,
    profit_margin_medium: null,
    profit_margin_high: null,
    fcf_margin_low: null,
    fcf_margin_medium: null,
    fcf_margin_high: null,
    pe_low: null,
    pe_medium: null,
    pe_high: null,
    pfcf_low: null,
    pfcf_medium: null,
    pfcf_high: null,
    desired_return_low: null,
    desired_return_medium: null,
    desired_return_high: null
  }
})

const canCalculate = computed(() => {
  // Need metrics loaded (backend will validate financial data)
  if (!props.metrics) return false

  // Need at least one scenario's key inputs (growth + desired return + multiple)
  const hasLowInputs = inputs.value.revenue_growth_low !== null &&
    inputs.value.desired_return_low !== null &&
    (inputs.value.pe_low !== null || inputs.value.pfcf_low !== null)

  const hasMedInputs = inputs.value.revenue_growth_medium !== null &&
    inputs.value.desired_return_medium !== null &&
    (inputs.value.pe_medium !== null || inputs.value.pfcf_medium !== null)

  const hasHighInputs = inputs.value.revenue_growth_high !== null &&
    inputs.value.desired_return_high !== null &&
    (inputs.value.pe_high !== null || inputs.value.pfcf_high !== null)

  return hasLowInputs || hasMedInputs || hasHighInputs
})

// Helper to convert percentage to decimal, handling null
function toDecimal(value) {
  if (value === null || value === undefined || value === '') return null
  return value / 100
}

function calculate() {
  if (!canCalculate.value) return

  // Only send user inputs - backend fetches financial data itself
  emit('calculate', {
    // Convert percentages to decimals (null if not entered)
    revenue_growth_low: toDecimal(inputs.value.revenue_growth_low),
    revenue_growth_medium: toDecimal(inputs.value.revenue_growth_medium),
    revenue_growth_high: toDecimal(inputs.value.revenue_growth_high),
    profit_margin_low: toDecimal(inputs.value.profit_margin_low),
    profit_margin_medium: toDecimal(inputs.value.profit_margin_medium),
    profit_margin_high: toDecimal(inputs.value.profit_margin_high),
    fcf_margin_low: toDecimal(inputs.value.fcf_margin_low),
    fcf_margin_medium: toDecimal(inputs.value.fcf_margin_medium),
    fcf_margin_high: toDecimal(inputs.value.fcf_margin_high),
    pe_low: inputs.value.pe_low,
    pe_medium: inputs.value.pe_medium,
    pe_high: inputs.value.pe_high,
    pfcf_low: inputs.value.pfcf_low,
    pfcf_medium: inputs.value.pfcf_medium,
    pfcf_high: inputs.value.pfcf_high,
    // Note: Low scenario uses higher return requirement, high scenario uses lower
    desired_return_low: toDecimal(inputs.value.desired_return_low),
    desired_return_medium: toDecimal(inputs.value.desired_return_medium),
    desired_return_high: toDecimal(inputs.value.desired_return_high)
  })
}

function save() {
  if (!props.results) return

  saving.value = true

  emit('save', {
    ...props.metrics,
    // User inputs (as decimals)
    revenue_growth_low: inputs.value.revenue_growth_low / 100,
    revenue_growth_medium: inputs.value.revenue_growth_medium / 100,
    revenue_growth_high: inputs.value.revenue_growth_high / 100,
    profit_margin_low: inputs.value.profit_margin_low / 100,
    profit_margin_medium: inputs.value.profit_margin_medium / 100,
    profit_margin_high: inputs.value.profit_margin_high / 100,
    fcf_margin_low: inputs.value.fcf_margin_low / 100,
    fcf_margin_medium: inputs.value.fcf_margin_medium / 100,
    fcf_margin_high: inputs.value.fcf_margin_high / 100,
    pe_low: inputs.value.pe_low,
    pe_medium: inputs.value.pe_medium,
    pe_high: inputs.value.pe_high,
    pfcf_low: inputs.value.pfcf_low,
    pfcf_medium: inputs.value.pfcf_medium,
    pfcf_high: inputs.value.pfcf_high,
    desired_return_low: inputs.value.desired_return_low / 100,
    desired_return_medium: inputs.value.desired_return_medium / 100,
    desired_return_high: inputs.value.desired_return_high / 100,
    // Results
    fair_value_low: props.results.fair_value_low,
    fair_value_medium: props.results.fair_value_medium,
    fair_value_high: props.results.fair_value_high,
    notes: notes.value || null
  })

  setTimeout(() => {
    saving.value = false
    notes.value = ''
  }, 500)
}

// Method to load a saved valuation
function loadValuation(valuation) {
  inputs.value = {
    revenue_growth_low: (valuation.revenue_growth_low || 0) * 100,
    revenue_growth_medium: (valuation.revenue_growth_medium || 0) * 100,
    revenue_growth_high: (valuation.revenue_growth_high || 0) * 100,
    profit_margin_low: (valuation.profit_margin_low || 0.15) * 100,
    profit_margin_medium: (valuation.profit_margin_medium || 0.20) * 100,
    profit_margin_high: (valuation.profit_margin_high || 0.25) * 100,
    fcf_margin_low: (valuation.fcf_margin_low || 0) * 100,
    fcf_margin_medium: (valuation.fcf_margin_medium || 0) * 100,
    fcf_margin_high: (valuation.fcf_margin_high || 0) * 100,
    pe_low: valuation.pe_low || 15,
    pe_medium: valuation.pe_medium || 20,
    pe_high: valuation.pe_high || 25,
    pfcf_low: valuation.pfcf_low || 15,
    pfcf_medium: valuation.pfcf_medium || 20,
    pfcf_high: valuation.pfcf_high || 25,
    desired_return_low: (valuation.desired_return_low || 0.15) * 100,
    desired_return_medium: (valuation.desired_return_medium || 0.12) * 100,
    desired_return_high: (valuation.desired_return_high || 0.10) * 100
  }
  notes.value = valuation.notes || ''
}

defineExpose({ loadValuation })
</script>
