<template>
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-700">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700">
            Metric
          </th>
          <th
            v-for="period in data"
            :key="period.year"
            class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]"
          >
            {{ period.year }}
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <!-- Assets Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Assets
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Total Assets
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-assets'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.totalAssets) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Cash & Equivalents
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-cash'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.cashAndEquivalents) }}
          </td>
        </tr>

        <!-- Liabilities Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Liabilities
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Total Liabilities
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-liabilities'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.totalLiabilities) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Long-Term Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-ltdebt'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.longTermDebt) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Short-Term Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-stdebt'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.shortTermDebt) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Total Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-totaldebt'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.totalDebt) }}
          </td>
        </tr>

        <!-- Equity Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Equity
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Total Equity
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-equity'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatLargeNumber(period.totalEquity) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Shares Outstanding
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-shares'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatShares(period.sharesOutstanding) }}
          </td>
        </tr>

        <!-- Key Ratios Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Key Ratios
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Debt-to-Equity Ratio
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-de'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatRatio(period.totalDebt, period.totalEquity) }}
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Book Value per Share
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-bvps'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatCurrency(period.totalEquity / period.sharesOutstanding) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  data: {
    type: Array,
    required: true
  }
})

function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-'
  const absValue = Math.abs(value)
  const isNegative = value < 0
  const prefix = isNegative ? '-' : ''

  if (absValue >= 1e12) return `${prefix}$${(absValue / 1e12).toFixed(2)}T`
  if (absValue >= 1e9) return `${prefix}$${(absValue / 1e9).toFixed(2)}B`
  if (absValue >= 1e6) return `${prefix}$${(absValue / 1e6).toFixed(2)}M`
  if (absValue >= 1e3) return `${prefix}$${(absValue / 1e3).toFixed(2)}K`
  return `${prefix}$${absValue.toFixed(0)}`
}

function formatShares(value) {
  if (value === null || value === undefined) return '-'
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toLocaleString()
}

function formatRatio(numerator, denominator) {
  if (!numerator || !denominator) return '-'
  return (numerator / denominator).toFixed(2)
}

function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}
</script>
