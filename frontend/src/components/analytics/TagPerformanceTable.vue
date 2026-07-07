<template>
  <div v-if="stats.length > 0" class="card">
    <div class="card-body">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Tag Performance</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tag
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Trades
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Breakeven
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Win Rate
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ rValueMode ? 'Total R' : 'Total P&L' }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="tag in stats" :key="tag.tag">
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                  {{ tag.tag }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ tag.total_trades }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                  {{ tag.breakeven_trades }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                <div class="flex flex-col">
                  <span>{{ winRateInclBE(tag) }}%<span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                  <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="text-[10px] text-gray-500 dark:text-gray-400">
                    {{ winRateExclBE(tag) }}% excl. BE
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                (rValueMode ? tag.total_r_value : tag.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
              ]">
                <span v-if="rValueMode">{{ formatNumber(tag.total_r_value) }}R</span>
                <span v-else>{{ formatCurrency(tag.total_pnl) }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                (rValueMode ? tag.avg_r_value : tag.avg_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
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
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatNumber, winRateInclBE, winRateExclBE } from '@/utils/analyticsFormatters'

defineProps({
  stats: { type: Array, default: () => [] },
  rValueMode: { type: Boolean, default: false },
  calculationMethod: { type: String, default: 'Average' }
})

const { formatCurrency } = useCurrencyFormatter()
</script>
