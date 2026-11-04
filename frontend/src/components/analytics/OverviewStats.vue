<template>
  <!-- Overview Stats -->
  <div class="card overflow-hidden text-mono-num">
    <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y divide-gray-100 dark:divide-gray-800 lg:divide-y-0 lg:divide-x lg:divide-gray-200 lg:dark:divide-gray-600">
      <!-- Total P&L -->
      <div class="px-4 py-3.5">
        <dt class="text-label truncate">Total P&L</dt>
        <dd class="stat-value stat-value-sm mt-1 whitespace-nowrap" :class="pnlClass(overview.total_pnl)">
          {{ formatSignedCurrency(overview.total_pnl) }}
        </dd>
      </div>

      <!-- Win Rate -->
      <div class="px-4 py-3.5">
        <dt class="text-label truncate">
          Win Rate<span v-if="overview.position_grouping" class="ml-1 normal-case text-primary-700 dark:text-primary-400">· whole trade</span>
        </dt>
        <dd class="stat-value stat-value-sm mt-1 whitespace-nowrap" :class="winRateClass(overview.win_rate)">
          {{ Number(overview.win_rate).toFixed(1) }}%<span class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">incl. BE</span>
        </dd>
        <dd v-if="overview.breakeven_trades > 0" class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {{ Number(overview.win_rate_excluding_breakeven).toFixed(1) }}% excl. BE
        </dd>
      </div>

      <!-- Total Trades -->
      <div class="px-4 py-3.5">
        <dt class="text-label truncate">Total Trades</dt>
        <dd class="stat-value stat-value-sm mt-1 text-gray-900 dark:text-white whitespace-nowrap">{{ overview.total_trades }}</dd>
      </div>

      <!-- Average / Median Trade -->
      <div class="px-4 py-3.5">
        <dt class="text-label truncate">{{ calculationMethod }} Trade</dt>
        <dd class="stat-value stat-value-sm mt-1 whitespace-nowrap" :class="pnlClass(overview.avg_pnl)">
          {{ formatSignedCurrency(overview.avg_pnl) }}
        </dd>
      </div>

      <!-- Profit Factor -->
      <div class="px-4 py-3.5">
        <dt class="text-label truncate">Profit Factor</dt>
        <dd class="stat-value stat-value-sm mt-1 whitespace-nowrap" :class="profitFactorClass(overview.profit_factor)">{{ overview.profit_factor ?? '0.00' }}</dd>
      </div>

      <!-- R-Multiple (click to toggle Average / Total) -->
      <div
        class="px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        @click="toggleRMultipleDisplay"
        title="Click to toggle Average / Total R"
      >
        <dt class="text-label truncate">
          {{ rMultipleFlipped ? 'Total R' : calculationMethod + ' R-Multiple' }}
          <span class="ml-1 normal-case text-gray-400">↻</span>
        </dt>
        <transition name="r-fade" mode="out-in">
          <dd v-if="!rMultipleFlipped" key="avg" class="stat-value stat-value-sm mt-1 text-gray-900 dark:text-white whitespace-nowrap">
            {{ overview.avg_r_value !== undefined && overview.avg_r_value !== null ? Number(overview.avg_r_value).toFixed(1) + 'R' : '0.0R' }}
          </dd>
          <dd v-else key="total" class="stat-value stat-value-sm mt-1 whitespace-nowrap" :class="pnlClass(overview.total_r_value ?? 0)">
            {{ overview.total_r_value !== undefined && overview.total_r_value !== null ? Number(overview.total_r_value).toFixed(1) + 'R' : '0.0R' }}
          </dd>
        </transition>
      </div>
    </dl>
  </div>

  <!-- K-Ratio needs equity history: one compact notice under the stats, not a card of its own. -->
  <div v-if="overview.k_ratio === '0.00'" class="callout-info mt-4 mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
    <p>K-Ratio needs at least 3 account equity entries before it can be calculated.</p>
    <div class="flex gap-4">
      <router-link to="/settings" class="btn-link">Update equity</router-link>
      <router-link to="/equity-history" class="btn-link">Equity history</router-link>
    </div>
  </div>
</template>

<script setup>
import { pnlClass, winRateClass, profitFactorClass } from '@/utils/metricTone'
import { ref } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

defineProps({
  overview: { type: Object, default: () => ({}) },
  calculationMethod: { type: String, default: 'Average' }
})

const { formatCurrency, formatSignedCurrency } = useCurrencyFormatter()

// Local display-only toggle: flip the R card between Average R and Total R.
const rMultipleFlipped = ref(false)
function toggleRMultipleDisplay() {
  rMultipleFlipped.value = !rMultipleFlipped.value
}
</script>

<style scoped>
/* Crossfade between Average R-Multiple and Total R on the toggleable card */
.r-fade-enter-active,
.r-fade-leave-active {
  transition: opacity 0.2s ease;
}
.r-fade-enter-from,
.r-fade-leave-to {
  opacity: 0;
}
</style>
