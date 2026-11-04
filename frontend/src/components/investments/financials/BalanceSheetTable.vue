<template>
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="table-head">
        <tr>
          <th class="px-4 py-3 text-left sticky left-0 bg-gray-50 dark:bg-gray-700 table-th">
            Metric
          </th>
          <th
            v-for="period in data"
            :key="period.year"
            class="px-4 py-3 text-right min-w-[120px] table-th"
          >
            {{ period.year }}
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <!-- Assets Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Assets
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Total Assets
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-assets'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.totalAssets) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Cash & Equivalents
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-cash'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.cashAndEquivalents) }}
          </td>
        </tr>

        <!-- Liabilities Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Liabilities
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Total Liabilities
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-liabilities'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.totalLiabilities) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Long-Term Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-ltdebt'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.longTermDebt) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Short-Term Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-stdebt'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.shortTermDebt) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Total Debt
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-totaldebt'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.totalDebt) }}
          </td>
        </tr>

        <!-- Equity Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Equity
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Total Equity
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-equity'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.totalEquity) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Shares Outstanding
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-shares'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatShares(period.sharesOutstanding) }}
          </td>
        </tr>

        <!-- Key Ratios Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Key Ratios
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Debt-to-Equity Ratio
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-de'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatRatio(period.totalDebt, period.totalEquity) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Book Value per Share
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-bvps'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatCurrency(period.totalEquity / period.sharesOutstanding, { currency }) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  currency: {
    type: String,
    default: ''
  }
})

const { formatCurrency, symbolFor } = useCurrencyFormatter()

function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-'
  const absValue = Math.abs(value)
  const isNegative = value < 0
  const sym = symbolFor(props.currency)
  const prefix = isNegative ? '-' : ''

  if (absValue >= 1e12) return `${prefix}${sym}${(absValue / 1e12).toFixed(2)}T`
  if (absValue >= 1e9) return `${prefix}${sym}${(absValue / 1e9).toFixed(2)}B`
  if (absValue >= 1e6) return `${prefix}${sym}${(absValue / 1e6).toFixed(2)}M`
  if (absValue >= 1e3) return `${prefix}${sym}${(absValue / 1e3).toFixed(2)}K`
  return `${prefix}${sym}${absValue.toFixed(0)}`
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

</script>
