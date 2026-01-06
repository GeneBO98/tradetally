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
        <!-- Operating Activities -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Operating Activities
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Operating Cash Flow
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-ocf'"
            class="px-4 py-3 text-sm text-right whitespace-nowrap"
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
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Investing Activities
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Capital Expenditures
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-capex'"
            class="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400 whitespace-nowrap"
          >
            {{ formatCapex(period.capitalExpenditures) }}
          </td>
        </tr>

        <!-- Financing Activities -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Financing Activities
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Dividends Paid
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-dividends'"
            class="px-4 py-3 text-sm text-right whitespace-nowrap"
            :class="period.dividendsPaid ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'"
          >
            {{ formatDividends(period.dividendsPaid) }}
          </td>
        </tr>

        <!-- Free Cash Flow -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Free Cash Flow
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            Free Cash Flow
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-fcf'"
            class="px-4 py-3 text-sm text-right whitespace-nowrap"
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
          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 pl-8">
            FCF Margin
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-fcfmargin'"
            class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap"
          >
            {{ formatFcfMargin(period) }}
          </td>
        </tr>

        <!-- Cash Flow Quality -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Cash Flow Quality
          </td>
        </tr>
        <tr>
          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800">
            CapEx to OCF Ratio
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-capexratio'"
            class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            {{ formatCapexRatio(period) }}
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
  const prefix = isNegative ? '(' : ''
  const suffix = isNegative ? ')' : ''

  if (absValue >= 1e12) return `${prefix}$${(absValue / 1e12).toFixed(2)}T${suffix}`
  if (absValue >= 1e9) return `${prefix}$${(absValue / 1e9).toFixed(2)}B${suffix}`
  if (absValue >= 1e6) return `${prefix}$${(absValue / 1e6).toFixed(2)}M${suffix}`
  if (absValue >= 1e3) return `${prefix}$${(absValue / 1e3).toFixed(2)}K${suffix}`
  return `${prefix}$${absValue.toFixed(0)}${suffix}`
}

function formatCapex(value) {
  if (value === null || value === undefined) return '-'
  // CapEx is typically shown as negative (cash outflow)
  return `($${formatNumber(Math.abs(value))})`
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
  return `($${formatNumber(Math.abs(value))})`
}

function formatGrowth(current, previous) {
  if (!current || !previous) return ''
  const growth = ((current - previous) / Math.abs(previous)) * 100
  const sign = growth >= 0 ? '+' : ''
  return `${sign}${growth.toFixed(1)}% YoY`
}

function getGrowthClass(current, previous) {
  if (!current || !previous) return 'text-gray-400'
  const growth = ((current - previous) / Math.abs(previous)) * 100
  return growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}

function getCashFlowClass(value) {
  if (value === null || value === undefined) return 'text-gray-700 dark:text-gray-300'
  return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
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
  return `${ratio.toFixed(1)}%`
}
</script>
