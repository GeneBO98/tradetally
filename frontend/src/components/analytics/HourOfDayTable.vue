<template>
  <div v-if="stats.length > 0" class="card">
    <div class="card-body">
      <h3 class="heading-card mb-4">Hour of Day Performance</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="table-head">
            <tr>
              <th class="px-6 py-3 text-left table-th">
                Hour
              </th>
              <th class="px-6 py-3 text-right table-th">
                Trades
              </th>
              <th class="px-6 py-3 text-right table-th">
                Breakeven
              </th>
              <th class="px-6 py-3 text-right table-th">
                Win Rate
              </th>
              <th class="px-6 py-3 text-right table-th">
                {{ rValueMode ? 'Total R' : 'Total P&L' }}
              </th>
              <th class="px-6 py-3 text-right table-th">
                {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="hour in stats" :key="hour.hour">
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="badge-primary">
                  {{ formatHour(hour.hour) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                {{ hour.total_trades }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                <span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                  {{ hour.breakeven_trades }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                <div class="flex flex-col">
                  <span>{{ winRateInclBE(hour) }}%<span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                  <span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="text-xs text-gray-500 dark:text-gray-400">
                    {{ winRateExclBE(hour) }}% excl. BE
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm" :class="[
                (rValueMode ? hour.total_r_value : pnlClass(hour.total_pnl))
              ]">
                <span v-if="rValueMode">{{ formatNumber(hour.total_r_value) }}R</span>
                <span v-else>{{ formatCurrency(hour.total_pnl) }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm" :class="[
                (rValueMode ? hour.avg_r_value : pnlClass(hour.avg_pnl))
              ]">
                <span v-if="rValueMode">{{ formatNumber(hour.avg_r_value) }}R</span>
                <span v-else>{{ formatCurrency(hour.avg_pnl) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { pnlClass } from '@/utils/metricTone'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { formatNumber, winRateInclBE, winRateExclBE } from '@/utils/analyticsFormatters'

defineProps({
  stats: { type: Array, default: () => [] },
  rValueMode: { type: Boolean, default: false },
  calculationMethod: { type: String, default: 'Average' }
})

const { formatCurrency } = useCurrencyFormatter()
const { use12Hour } = useUserTimezone()

function formatHour(hour) {
  const h = parseInt(hour)
  if (use12Hour.value) {
    if (h === 0) return '12:00 AM'
    if (h < 12) return `${h}:00 AM`
    if (h === 12) return '12:00 PM'
    return `${h - 12}:00 PM`
  }
  return `${String(h).padStart(2, '0')}:00`
}
</script>
