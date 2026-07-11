<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white">Key Metrics</h2>
      <span v-if="metrics?.latest_year" class="text-xs text-gray-500 dark:text-gray-400">
        Latest fiscal year: {{ metrics.latest_year }}
      </span>
    </div>

    <div v-if="!metrics" class="p-6 text-sm text-gray-500 dark:text-gray-400">
      Loading key metrics...
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8">
      <dl
        v-for="(group, groupIndex) in groups"
        :key="groupIndex"
        class="divide-y divide-gray-100 dark:divide-gray-700"
      >
        <div
          v-for="item in group"
          :key="item.label"
          class="flex items-center justify-between px-6 py-3"
        >
          <dt class="text-sm text-gray-600 dark:text-gray-400" :title="item.hint || null">{{ item.label }}</dt>
          <dd class="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
            {{ item.value }}
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatPercent as formatPercentBase } from '@/utils/formatters'

const props = defineProps({
  metrics: {
    type: Object,
    default: null
  }
})

function formatLargeNumber(value, withCurrency = true) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A'
  const num = Number(value)
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  const prefix = withCurrency ? '$' : ''
  if (abs >= 1e12) return `${sign}${prefix}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${prefix}${(abs / 1e3).toFixed(2)}K`
  return `${sign}${prefix}${abs.toFixed(2)}`
}

function formatLargeCurrency(value) {
  return formatLargeNumber(value, true)
}

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A'
  return `$${Number(value).toFixed(2)}`
}

function formatPercent(decimal, digits = 2) {
  return formatPercentBase(decimal, { digits, multiplier: 100, nullValue: 'N/A' })
}

function formatRatio(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A'
  return Number(value).toFixed(2)
}

function formatDate(value) {
  if (!value) return null
  return value
}

const groups = computed(() => {
  const m = props.metrics || {}

  const column1 = [
    { label: 'Market Cap', value: formatLargeCurrency(m.market_cap) },
    { label: 'Revenue (TTM)', value: formatLargeCurrency(m.current_revenue) },
    { label: 'Net Income (TTM)', value: formatLargeCurrency(m.current_net_income) },
    { label: '5Yr Avg Net Income', value: formatLargeCurrency(m.avg_net_income_5yr) },
    { label: 'P/E (TTM)', value: formatRatio(m.pe_ratio) },
    { label: 'Forward P/E', value: formatRatio(m.forward_pe) },
    { label: '5Yr P/E', value: formatRatio(m.pe_5yr) },
    { label: 'PS Ratio', value: formatRatio(m.ps_ratio) },
    { label: 'PEG Ratio', value: formatRatio(m.peg_ratio), hint: 'Trailing P/E divided by the expected long-term EPS growth rate (3-year forward analyst EPS CAGR)' },
    { label: 'Profit Margin (TTM)', value: formatPercent(m.profit_margin_1yr) },
    { label: '5Yr Profit Margin', value: formatPercent(m.profit_margin_5yr) },
    { label: '10Yr Profit Margin', value: formatPercent(m.profit_margin_10yr) },
    { label: 'Gross Profit Margin (TTM)', value: formatPercent(m.gross_profit_margin_1yr) },
    { label: '3Yr Compound Revenue Growth', value: formatPercent(m.revenue_growth_3yr) },
    { label: '5Yr Compound Revenue Growth', value: formatPercent(m.revenue_growth_5yr) },
    { label: '10Yr Compound Revenue Growth', value: formatPercent(m.revenue_growth_10yr) }
  ]

  const column2 = [
    { label: 'Free Cash Flow (TTM)', value: formatLargeCurrency(m.current_fcf) },
    { label: '5Yr Avg FCF', value: formatLargeCurrency(m.avg_fcf_5yr) },
    { label: 'Price/FCF (TTM)', value: formatRatio(m.price_to_fcf) },
    { label: '5Yr Price/FCF', value: formatRatio(m.pfcf_5yr) },
    { label: 'FCF Margin (TTM)', value: formatPercent(m.fcf_margin_1yr) },
    { label: '5Yr FCF Margin', value: formatPercent(m.fcf_margin_5yr) },
    { label: 'Dividend Yield (TTM)', value: formatPercent(m.dividend_yield) },
    { label: 'Dividends Paid (TTM)', value: formatLargeCurrency(m.dividends_paid_ttm) },
    { label: 'Forward Dividend Yield', value: formatPercent(m.forward_dividend_yield) },
    { label: 'Enterprise Value', value: formatLargeCurrency(m.enterprise_value) },
    { label: 'Total Debt', value: formatLargeCurrency(m.total_debt) },
    { label: 'Cash & Equivalents', value: formatLargeCurrency(m.cash_and_equivalents) }
  ]

  const week52HighLabel = m.week_52_high_date
    ? `52 WK High (${formatDate(m.week_52_high_date)})`
    : '52 WK High'
  const week52LowLabel = m.week_52_low_date
    ? `52 WK Low (${formatDate(m.week_52_low_date)})`
    : '52 WK Low'

  const column3 = [
    { label: 'Return on Invested Capital (TTM)', value: formatPercent(m.roic_1yr) },
    { label: '5Yr Return on Invested Capital', value: formatPercent(m.roic_5yr) },
    { label: '10Yr Return on Invested Capital', value: formatPercent(m.roic_10yr) },
    { label: 'Current Price', value: formatPrice(m.current_price) },
    { label: week52HighLabel, value: formatPrice(m.week_52_high) },
    { label: week52LowLabel, value: formatPrice(m.week_52_low) },
    { label: 'Beta', value: formatRatio(m.beta) },
    { label: 'Shares Outstanding', value: formatLargeNumber(m.shares_outstanding, false) }
  ]

  return [column1, column2, column3]
})
</script>
