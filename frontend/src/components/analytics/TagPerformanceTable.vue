<template>
  <div v-if="stats.length > 0" class="card">
    <div class="card-body">
      <h3 class="heading-card mb-4">Tag Performance</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="table-head">
            <tr>
              <th class="text-left table-th px-4 py-2">
                Tag
              </th>
              <th class="text-right table-th px-4 py-2">
                Trades
              </th>
              <th class="text-right table-th px-4 py-2">
                Breakeven
              </th>
              <th class="text-right table-th px-4 py-2">
                Win Rate
              </th>
              <th class="text-right table-th px-4 py-2">
                {{ rValueMode ? 'Total R' : 'Total P&L' }}
              </th>
              <th class="text-right table-th px-4 py-2">
                {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="tag in stats" :key="tag.tag">
              <td class="whitespace-nowrap px-4 py-3">
                <span class="badge-primary">
                  {{ tag.tag }}
                </span>
              </td>
              <td class="whitespace-nowrap text-right text-sm text-gray-900 dark:text-white px-4 py-3">
                {{ tag.total_trades }}
              </td>
              <td class="whitespace-nowrap text-right text-sm px-4 py-3">
                <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="badge-neutral">
                  {{ tag.breakeven_trades }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="whitespace-nowrap text-right text-sm text-gray-900 dark:text-white px-4 py-3">
                <div class="flex flex-col">
                  <span>{{ winRateInclBE(tag) }}%<span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                  <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="text-xs text-gray-500 dark:text-gray-400">
                    {{ winRateExclBE(tag) }}% excl. BE
                  </span>
                </div>
              </td>
              <td class="whitespace-nowrap text-right text-sm px-4 py-3" :class="[
                (rValueMode ? tag.total_r_value : pnlClass(tag.total_pnl))
              ]">
                <span v-if="rValueMode">{{ formatNumber(tag.total_r_value) }}R</span>
                <span v-else>{{ formatCurrency(tag.total_pnl) }}</span>
              </td>
              <td class="whitespace-nowrap text-right text-sm px-4 py-3" :class="[
                (rValueMode ? tag.avg_r_value : pnlClass(tag.avg_pnl))
              ]">
                <span v-if="rValueMode">{{ formatNumber(tag.avg_r_value) }}R</span>
                <span v-else>{{ formatCurrency(tag.avg_pnl) }}</span>
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
import { formatNumber, winRateInclBE, winRateExclBE } from '@/utils/analyticsFormatters'

defineProps({
  stats: { type: Array, default: () => [] },
  rValueMode: { type: Boolean, default: false },
  calculationMethod: { type: String, default: 'Average' }
})

const { formatCurrency } = useCurrencyFormatter()
</script>
