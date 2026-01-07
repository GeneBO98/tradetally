<template>
  <div class="mb-6">
    <h3 class="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">Historical Performance</h3>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Metrics Table -->
    <div v-else-if="metrics" class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="bg-gray-100 dark:bg-gray-700">
            <th class="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Metric</th>
            <th class="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">1 Year</th>
            <th class="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">5 Year Avg</th>
            <th class="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">10 Year Avg</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">ROIC</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.roic_1yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.roic_5yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.roic_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Revenue Growth</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.revenue_growth_1yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.revenue_growth_5yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.revenue_growth_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">Profit Margin</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.profit_margin_1yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.profit_margin_5yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.profit_margin_10yr) }}</td>
          </tr>
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 text-gray-900 dark:text-white font-medium">FCF Margin</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.fcf_margin_1yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.fcf_margin_5yr) }}</td>
            <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ formatPercent(metrics.fcf_margin_10yr) }}</td>
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
defineProps({
  metrics: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
})

function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return (value * 100).toFixed(1) + '%'
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  // Format large numbers with abbreviations
  const absValue = Math.abs(value)
  if (absValue >= 1e12) {
    return '$' + (value / 1e12).toFixed(2) + 'T'
  }
  if (absValue >= 1e9) {
    return '$' + (value / 1e9).toFixed(2) + 'B'
  }
  if (absValue >= 1e6) {
    return '$' + (value / 1e6).toFixed(2) + 'M'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}
</script>
