<template>
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="table-head">
        <tr>
          <th class="text-left sticky left-0 bg-gray-50 dark:bg-gray-700 table-th px-4 py-2">
            Metric
          </th>
          <th
            v-for="period in data"
            :key="period.year"
            class="text-right min-w-[120px] table-th px-4 py-2"
          >
            {{ period.year }}
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <!-- Operating Activities -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Operating Activities
          </td>
        </tr>
        <tr>
          <td class="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Operating Cash Flow
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-ocf'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
          >
            <div :class="getCashFlowClass(period.operatingCashFlow)">
              {{ formatLargeNumber(period.operatingCashFlow) }}
            </div>
            <div v-if="index < data.length - 1" :class="getGrowthClass(period.operatingCashFlow, data[index + 1]?.operatingCashFlow)" class="text-xs">
              {{ formatGrowth(period.operatingCashFlow, data[index + 1]?.operatingCashFlow) }}
            </div>
          </td>
        </tr>

        <!-- Investing Activities -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Investing Activities
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Capital Expenditures
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-capex'"
            class="text-sm text-right text-red-600 dark:text-red-400 whitespace-nowrap px-4 py-3"
          >
            {{ formatCapex(period.capitalExpenditures) }}
          </td>
        </tr>

        <!-- Financing Activities -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Financing Activities
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Dividends Paid
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-dividends'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
            :class="period.dividendsPaid ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'"
          >
            {{ formatDividends(period.dividendsPaid) }}
          </td>
        </tr>

        <!-- Free Cash Flow -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Free Cash Flow
          </td>
        </tr>
        <tr>
          <td class="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Free Cash Flow
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-fcf'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
          >
            <div :class="getCashFlowClass(period.freeCashFlow)" class="font-medium">
              {{ formatLargeNumber(period.freeCashFlow) }}
            </div>
            <div v-if="index < data.length - 1" :class="getGrowthClass(period.freeCashFlow, data[index + 1]?.freeCashFlow)" class="text-xs">
              {{ formatGrowth(period.freeCashFlow, data[index + 1]?.freeCashFlow) }}
            </div>
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 pl-8 px-4 py-3">
            FCF Margin
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-fcfmargin'"
            class="text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap px-4 py-3"
          >
            {{ formatFcfMargin(period) }}
          </td>
        </tr>

        <!-- Cash Flow Quality -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Cash Flow Quality
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            CapEx to OCF Ratio
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-capexratio'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatCapexRatio(period) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { pnlClass } from '@/utils/metricTone'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatDecimal, formatPercent } from '@/utils/formatters'

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

const { symbolFor } = useCurrencyFormatter()

function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-'
  const absValue = Math.abs(value)
  const isNegative = value < 0
  const prefix = isNegative ? '(' : ''
  const suffix = isNegative ? ')' : ''
  const sym = symbolFor(props.currency)

  if (absValue >= 1e12) return `${prefix}${sym}${(absValue / 1e12).toFixed(2)}T${suffix}`
  if (absValue >= 1e9) return `${prefix}${sym}${(absValue / 1e9).toFixed(2)}B${suffix}`
  if (absValue >= 1e6) return `${prefix}${sym}${(absValue / 1e6).toFixed(2)}M${suffix}`
  if (absValue >= 1e3) return `${prefix}${sym}${(absValue / 1e3).toFixed(2)}K${suffix}`
  return `${prefix}${sym}${absValue.toFixed(0)}${suffix}`
}

function formatCapex(value) {
  if (value === null || value === undefined) return '-'
  // CapEx is typically shown as negative (cash outflow)
  return `(${symbolFor(props.currency)}${formatNumber(Math.abs(value))})`
}

function formatNumber(value) {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(0)
}

function formatDividends(value) {
  if (value === null || value === undefined || value === 0) return '-'
  // Dividends paid is typically negative (cash outflow)
  return `(${symbolFor(props.currency)}${formatNumber(Math.abs(value))})`
}

function formatGrowth(current, previous) {
  if (!current || !previous) return ''
  const growth = ((current - previous) / Math.abs(previous)) * 100
  return `${formatDecimal(growth, { digits: 1, showSign: true })}% YoY`
}

function getGrowthClass(current, previous) {
  if (!current || !previous) return 'text-gray-400'
  const growth = ((current - previous) / Math.abs(previous)) * 100
  return pnlClass(growth)
}

function getCashFlowClass(value) {
  if (value === null || value === undefined) return 'text-gray-700 dark:text-gray-300'
  return pnlClass(value)
}

function formatFcfMargin(period) {
  // Need revenue data - this would come from income statement, we'll show N/A if not available
  if (!period.freeCashFlow) return '-'
  // FCF Margin can't be calculated without revenue from the same data source
  return 'N/A'
}

function formatCapexRatio(period) {
  if (!period.capitalExpenditures || !period.operatingCashFlow) return '-'
  const ratio = (Math.abs(period.capitalExpenditures) / period.operatingCashFlow) * 100
  return formatPercent(ratio, { digits: 1 })
}
</script>
