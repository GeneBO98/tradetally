<template>
  <div class="mb-6">
    <h3 class="heading-card mb-3">Historical Performance</h3>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="spinner spinner-md"></div>
    </div>

    <!-- Metrics Table -->
    <div v-else-if="metrics" class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="table-head">
          <tr class="bg-gray-100 dark:bg-gray-700">
            <th class="text-left table-th px-4 py-2">Metric</th>
            <th class="text-right table-th px-4 py-2">1 Year</th>
            <th class="text-right table-th px-4 py-2">5 Year Avg</th>
            <th class="text-right table-th px-4 py-2">10 Year Avg</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="text-gray-900 dark:text-white font-medium px-4 py-3">ROIC</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.roic_1yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.roic_5yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.roic_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="text-gray-900 dark:text-white font-medium px-4 py-3">Revenue Growth</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.revenue_growth_1yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.revenue_growth_5yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.revenue_growth_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="text-gray-900 dark:text-white font-medium px-4 py-3">Profit Margin</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.profit_margin_1yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.profit_margin_5yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.profit_margin_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="text-gray-900 dark:text-white font-medium px-4 py-3">FCF Margin</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.fcf_margin_1yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.fcf_margin_5yr) }}</td>
            <td class="text-right text-gray-700 dark:text-gray-300 px-4 py-3">{{ formatPercent(metrics.fcf_margin_10yr) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Current Ratios -->
    <div v-if="metrics" class="mt-4 flex flex-wrap gap-6">
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400">P/E Ratio:</span>
        <span class="ml-2 font-semibold text-gray-900 dark:text-white">
          {{ metrics.pe_ratio ? metrics.pe_ratio.toFixed(2) : 'N/A' }}
        </span>
      </div>
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400" title="Price divided by next fiscal year's consensus EPS estimate">Forward P/E:</span>
        <span class="ml-2 font-semibold text-gray-900 dark:text-white">
          {{ metrics.forward_pe ? metrics.forward_pe.toFixed(2) : 'N/A' }}
        </span>
      </div>
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400">P/FCF:</span>
        <span class="ml-2 font-semibold text-gray-900 dark:text-white">
          {{ metrics.price_to_fcf ? metrics.price_to_fcf.toFixed(2) : 'N/A' }}
        </span>
      </div>
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400">Current FCF:</span>
        <span class="ml-2 font-semibold text-gray-900 dark:text-white">
          {{ formatCurrency(metrics.current_fcf) }}
        </span>
      </div>
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400">Data Available:</span>
        <span class="ml-2 font-semibold text-gray-900 dark:text-white">
          {{ metrics.years_available }} years
        </span>
      </div>
    </div>

    <!-- No Data State -->
    <div v-else-if="!loading" class="text-center py-8 text-gray-500 dark:text-gray-400">
      No historical metrics available
    </div>
  </div>
</template>

<script setup>
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatPercent as formatPercentBase } from '@/utils/formatters'

const props = defineProps({
  metrics: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  currency: {
    type: String,
    default: ''
  }
})

const { formatCurrency: formatCurrencyBase, symbolFor } = useCurrencyFormatter()

function formatPercent(value) {
  return formatPercentBase(value, { digits: 1, multiplier: 100 })
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  // Format large numbers with abbreviations
  const absValue = Math.abs(value)
  const sym = symbolFor(props.currency)
  const sign = value < 0 ? '-' : ''
  if (absValue >= 1e12) {
    return sign + sym + (absValue / 1e12).toFixed(2) + 'T'
  }
  if (absValue >= 1e9) {
    return sign + sym + (absValue / 1e9).toFixed(2) + 'B'
  }
  if (absValue >= 1e6) {
    return sign + sym + (absValue / 1e6).toFixed(2) + 'M'
  }
  return formatCurrencyBase(value, { minimumFractionDigits: 0, maximumFractionDigits: 0, currency: props.currency || undefined })
}
</script>
