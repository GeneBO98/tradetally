<template>
  <!-- Overview Stats -->
  <div class="card overflow-hidden">
    <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y divide-gray-100 dark:divide-gray-800 lg:divide-y-0 lg:divide-x lg:divide-gray-200 lg:dark:divide-gray-700">
      <!-- Total P&L -->
      <div class="px-4 py-3.5">
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Total P&L</dt>
        <dd class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="overview.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ formatCurrency(overview.total_pnl) }}
        </dd>
      </div>

      <!-- Win Rate -->
      <div class="px-4 py-3.5">
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          Win Rate<span v-if="overview.position_grouping" class="ml-1 normal-case text-primary-600 dark:text-primary-400">· whole trade</span>
        </dt>
        <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">
          {{ overview.win_rate }}%<span class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">incl. BE</span>
        </dd>
        <dd v-if="overview.breakeven_trades > 0" class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {{ overview.win_rate_excluding_breakeven }}% excl. BE
        </dd>
      </div>

      <!-- Total Trades -->
      <div class="px-4 py-3.5">
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Total Trades</dt>
        <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">{{ overview.total_trades }}</dd>
      </div>

      <!-- Average / Median Trade -->
      <div class="px-4 py-3.5">
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">{{ calculationMethod }} Trade</dt>
        <dd class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="overview.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ formatCurrency(overview.avg_pnl) }}
        </dd>
      </div>

      <!-- Profit Factor -->
      <div class="px-4 py-3.5">
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Profit Factor</dt>
        <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">{{ overview.profit_factor ?? '0.00' }}</dd>
      </div>

      <!-- R-Multiple (click to toggle Average / Total) -->
      <div
        class="px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        @click="toggleRMultipleDisplay"
        title="Click to toggle Average / Total R"
      >
        <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          {{ rMultipleFlipped ? 'Total R' : calculationMethod + ' R-Multiple' }}
          <span class="ml-1 normal-case text-gray-400">↻</span>
        </dt>
        <transition name="r-fade" mode="out-in">
          <dd v-if="!rMultipleFlipped" key="avg" class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">
            {{ overview.avg_r_value !== undefined && overview.avg_r_value !== null ? Number(overview.avg_r_value).toFixed(1) + 'R' : '0.0R' }}
          </dd>
          <dd v-else key="total" class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="(overview.total_r_value ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ overview.total_r_value !== undefined && overview.total_r_value !== null ? Number(overview.total_r_value).toFixed(2) + 'R' : '0.00R' }}
          </dd>
        </transition>
      </div>
    </dl>
  </div>

  <!-- Equity Notice for K-Ratio -->
  <div v-if="overview.k_ratio === '0.00'" class="card mt-6 mb-8">
    <div class="card-body">
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0">
          <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">K-Ratio Requires Account Equity Tracking</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            To calculate your K-Ratio, you need to track your account equity over time. The K-Ratio requires at least 3 equity entries to calculate meaningful consistency metrics.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <router-link to="/settings" class="inline-flex items-center px-3 py-1 text-xs font-medium text-primary-700 bg-primary-100 rounded-full hover:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40">
              Update Current Equity
            </router-link>
            <router-link to="/equity-history" class="inline-flex items-center px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40">
              View Equity History
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

defineProps({
  overview: { type: Object, default: () => ({}) },
  calculationMethod: { type: String, default: 'Average' }
})

const { formatCurrency } = useCurrencyFormatter()

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
