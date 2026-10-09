<template>
  <div v-if="stats.length > 0" id="strategies" class="card">
    <div class="card-body">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Strategy/Setup Performance</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Strategy
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
            <tr v-for="strategy in stats" :key="strategy.strategy">
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                  {{ strategy.strategy }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ strategy.total_trades }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                  {{ strategy.breakeven_trades }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                <div class="flex flex-col">
                  <span>{{ winRateInclBE(strategy) }}%<span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                  <span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="text-[10px] text-gray-500 dark:text-gray-400">
                    {{ winRateExclBE(strategy) }}% excl. BE
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                (rValueMode ? strategy.total_r_value : strategy.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
              ]">
                <span v-if="rValueMode">{{ formatNumber(strategy.total_r_value) }}R</span>
                <span v-else>{{ formatCurrency(strategy.total_pnl) }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                (rValueMode ? strategy.avg_r_value : strategy.avg_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
              ]">
                <span v-if="rValueMode">{{ formatNumber(strategy.avg_r_value) }}R</span>
                <span v-else>{{ formatCurrency(strategy.avg_pnl) }}</span>
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
