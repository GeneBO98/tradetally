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
          <!-- Gross Profit Margin (display only) -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Gross Profit Margin</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.gross_profit_margin_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.gross_profit_margin_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatPercent(metrics?.gross_profit_margin_10yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-400" colspan="3">-</td>
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
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pe_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pe_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pe_10yr) }}</td>
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
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pfcf_1yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pfcf_5yr) }}</td>
            <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{{ formatRatio(metrics?.pfcf_10yr) }}</td>
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
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Required Annual Return</td>
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
          <!-- Current Price Return -->
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Current Price Return</td>
            <td class="px-4 py-3 text-center text-gray-400" colspan="3">-</td>
            <td class="px-4 py-3 text-center font-medium text-red-600 dark:text-red-400">
              {{ formatPercent(results?.current_price_return_low) }}
            </td>
            <td class="px-4 py-3 text-center font-medium text-yellow-600 dark:text-yellow-400">
              {{ formatPercent(results?.current_price_return_medium) }}
            </td>
            <td class="px-4 py-3 text-center font-medium text-green-600 dark:text-green-400">
              {{ formatPercent(results?.current_price_return_high) }}
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
        <label class="inline-flex items-center gap-2">
          <span>Years of Analysis</span>
          <select
            v-model.number="inputs.projection_years"
            class="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 text-sm"
          >
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="15">15</option>
          </select>
        </label>
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

    <div
      v-if="scenarioWarnings.length"
      class="mb-6 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <p class="font-medium mb-2">Scenario assumptions need review</p>
      <ul class="space-y-1">
        <li v-for="warning in scenarioWarnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <!-- Results -->
    <div v-if="results" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <DCFResultCard
        scenario="Bear"
        :fair-value="results.fair_value_low"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_low"
        :current-price-return="results.current_price_return_low"
      />
      <DCFResultCard
        scenario="Base"
        :fair-value="results.fair_value_medium"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_medium"
        :current-price-return="results.current_price_return_medium"
      />
      <DCFResultCard
        scenario="Bull"
        :fair-value="results.fair_value_high"
        :current-price="currentPrice"
        :margin-of-safety="results.margin_of_safety_high"
        :current-price-return="results.current_price_return_high"
      />
    </div>

    <!-- Disclaimer (shown below results) -->
    <div
      v-if="results"
      class="mb-6 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <p class="font-medium mb-1">Disclaimer — not financial advice</p>
      <p>
        Fair value estimates above are calculated from the assumptions you entered and historical financial data, which may be incomplete or revised over time. They are not a recommendation to buy or sell any security. Past performance does not predict future results. Always conduct your own research and consult a licensed financial advisor before making investment decisions.
      </p>
    </div>

    <!-- Save Button (manual save mode only) -->
    <div v-if="results && !autoSave" class="flex items-center gap-4">
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
  },
  autoSave: {
    type: Boolean,
    default: false
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
  desired_return_high: null,
  projection_years: 10
})

const notes = ref('')
const saving = ref(false)
const awaitingAutoSave = ref(false)

// Helper functions
function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatRatio(value) {
  if (value === null || value === undefined) return '-'
  return `${value.toFixed(1)}x`
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
    desired_return_high: null,
    projection_years: 10
  }
  awaitingAutoSave.value = false
})

// Auto-save when fresh results arrive from a Calculate (skipped when results
// were injected by loading a saved valuation).
watch(() => props.results, (newResults) => {
  if (!props.autoSave) return
  if (!newResults) return
  if (!awaitingAutoSave.value) return

  awaitingAutoSave.value = false
  emitSave()
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

const scenarioWarnings = computed(() => {
  const warnings = []
  const backendWarnings = props.results?.inputs?.input_warnings || []
  for (const warning of backendWarnings) {
    if (!warnings.includes(warning)) {
      warnings.push(warning)
    }
  }

  return warnings
})

// Helper to convert percentage to decimal, handling null
function toDecimal(value) {
  if (value === null || value === undefined || value === '') return null
  return value / 100
}

function calculate() {
  if (!canCalculate.value) return

  // Mark this calculation as eligible for auto-save when results arrive.
  awaitingAutoSave.value = true

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
    desired_return_low: toDecimal(inputs.value.desired_return_low),
    desired_return_medium: toDecimal(inputs.value.desired_return_medium),
    desired_return_high: toDecimal(inputs.value.desired_return_high),
    projection_years: inputs.value.projection_years
  })
}

function emitSave() {
  if (!props.results) return

  emit('save', {
    ...props.metrics,
    // User inputs (as decimals)
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
    desired_return_low: toDecimal(inputs.value.desired_return_low),
    desired_return_medium: toDecimal(inputs.value.desired_return_medium),
    desired_return_high: toDecimal(inputs.value.desired_return_high),
    projection_years: inputs.value.projection_years,
    // Results
    fair_value_low: props.results.fair_value_low,
    fair_value_medium: props.results.fair_value_medium,
    fair_value_high: props.results.fair_value_high,
    notes: notes.value || null
  })
}

function save() {
  if (!props.results) return

  saving.value = true
  emitSave()

  setTimeout(() => {
    saving.value = false
    notes.value = ''
  }, 500)
}

function percentFromDecimal(value) {
  return value === null || value === undefined ? null : Number(value) * 100
}

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value)
}

// Method to load a saved valuation
function loadValuation(valuation) {
  // Loading is a read action, not a fresh analysis — never auto-save off the
  // results that the parent will inject afterwards.
  awaitingAutoSave.value = false
  inputs.value = {
    revenue_growth_low: percentFromDecimal(valuation.revenue_growth_low),
    revenue_growth_medium: percentFromDecimal(valuation.revenue_growth_medium),
    revenue_growth_high: percentFromDecimal(valuation.revenue_growth_high),
    profit_margin_low: percentFromDecimal(valuation.profit_margin_low),
    profit_margin_medium: percentFromDecimal(valuation.profit_margin_medium),
    profit_margin_high: percentFromDecimal(valuation.profit_margin_high),
    fcf_margin_low: percentFromDecimal(valuation.fcf_margin_low),
    fcf_margin_medium: percentFromDecimal(valuation.fcf_margin_medium),
    fcf_margin_high: percentFromDecimal(valuation.fcf_margin_high),
    pe_low: numberOrNull(valuation.pe_low),
    pe_medium: numberOrNull(valuation.pe_medium),
    pe_high: numberOrNull(valuation.pe_high),
    pfcf_low: numberOrNull(valuation.pfcf_low),
    pfcf_medium: numberOrNull(valuation.pfcf_medium),
    pfcf_high: numberOrNull(valuation.pfcf_high),
    desired_return_low: percentFromDecimal(valuation.desired_return_low),
    desired_return_medium: percentFromDecimal(valuation.desired_return_medium),
    desired_return_high: percentFromDecimal(valuation.desired_return_high),
    projection_years: valuation.projection_years ?? 10
  }
  notes.value = valuation.notes || ''
}

defineExpose({ loadValuation })
</script>
