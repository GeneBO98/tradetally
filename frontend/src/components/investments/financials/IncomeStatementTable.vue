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
        <!-- Revenue Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Revenue
          </td>
        </tr>
        <tr>
          <td class="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Total Revenue
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-revenue'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
          >
            <div class="text-gray-700 dark:text-gray-300">{{ formatLargeNumber(period.revenue) }}</div>
            <div v-if="index < data.length - 1" :class="getGrowthClass(period.revenue, data[index + 1]?.revenue)" class="text-xs">
              {{ formatGrowth(period.revenue, data[index + 1]?.revenue) }}
            </div>
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Gross Profit
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-gross'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.grossProfit) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 pl-8 px-4 py-3">
            Gross Margin
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-grossmargin'"
            class="text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap px-4 py-3"
          >
            {{ formatPercent(period.grossProfit, period.revenue) }}
          </td>
        </tr>

        <!-- Operating Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Operating
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Operating Income
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-operating'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.operatingIncome) }}
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 pl-8 px-4 py-3">
            Operating Margin
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-opmargin'"
            class="text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap px-4 py-3"
          >
            {{ formatPercent(period.operatingIncome, period.revenue) }}
          </td>
        </tr>
        <tr v-if="hasEbitData">
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            EBIT
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-ebit'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.ebit) }}
          </td>
        </tr>
        <tr v-if="hasEbitdaData">
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            EBITDA
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-ebitda'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatLargeNumber(period.ebitda) }}
          </td>
        </tr>

        <!-- Net Income Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Net Income
          </td>
        </tr>
        <tr>
          <td class="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            Net Income
          </td>
          <td
            v-for="(period, index) in data"
            :key="period.year + '-netincome'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
          >
            <div :class="period.netIncome >= 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'">
              {{ formatLargeNumber(period.netIncome) }}
            </div>
            <div v-if="index < data.length - 1" :class="getGrowthClass(period.netIncome, data[index + 1]?.netIncome)" class="text-xs">
              {{ formatGrowth(period.netIncome, data[index + 1]?.netIncome) }}
            </div>
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 pl-8 px-4 py-3">
            Net Profit Margin
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-netmargin'"
            class="text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap px-4 py-3"
          >
            {{ formatPercent(period.netIncome, period.revenue) }}
          </td>
        </tr>

        <!-- Per Share Section -->
        <tr class="bg-gray-100 dark:bg-gray-700/50">
          <td colspan="100" class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase px-4 py-3">
            Per Share Data
          </td>
        </tr>
        <tr>
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            EPS (Basic)
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-eps'"
            class="text-sm text-right whitespace-nowrap px-4 py-3"
            :class="getEpsValue(period) >= 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'"
          >
            {{ formatCurrency(getEpsValue(period), { currency }) }}
          </td>
        </tr>
        <tr v-if="hasEpsDiluted">
          <td class="text-sm text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 px-4 py-3">
            EPS (Diluted)
          </td>
          <td
            v-for="period in data"
            :key="period.year + '-epsdiluted'"
            class="text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap px-4 py-3"
          >
            {{ formatCurrency(period.epsDiluted, { currency }) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { pnlClass } from '@/utils/metricTone'
import { computed } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const { formatCurrency, symbolFor } = useCurrencyFormatter()

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

const hasEbitData = computed(() => props.data.some(p => p.ebit != null))
const hasEbitdaData = computed(() => props.data.some(p => p.ebitda != null))
const hasEpsDiluted = computed(() => props.data.some(p => p.epsDiluted != null))

function getEpsValue(period) {
  return period.epsBasic || period.eps || null
}

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

function formatPercent(numerator, denominator) {
  if (!numerator || !denominator) return '-'
  return ((numerator / denominator) * 100).toFixed(1) + '%'
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
  return pnlClass(growth)
}
</script>
