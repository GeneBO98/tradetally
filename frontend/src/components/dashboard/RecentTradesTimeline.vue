<template>
  <div class="card-dense h-full">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Recent Trades</h3>
      <router-link
        to="/trades"
        class="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
      >
        View all
      </router-link>
    </div>
    <div class="card-dense-body">
      <!-- Loading -->
      <div v-if="loading" class="space-y-3 animate-pulse">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
          <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="trades.length === 0" class="text-center py-6">
        <p class="text-sm text-gray-600 dark:text-gray-400">No closed trades yet.</p>
        <router-link
          to="/import"
          class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
        >
          Import trades
          <MdiIcon :icon="mdiArrowRight" :size="12" />
        </router-link>
      </div>

      <!-- Loaded -->
      <ul v-else class="divide-y divide-gray-100 dark:divide-gray-700">
        <li
          v-for="trade in trades"
          :key="trade.id"
          class="py-2.5 first:pt-0 last:pb-0 group"
        >
          <router-link
            :to="`/trades/${trade.id}`"
            class="flex items-center gap-3 -mx-2 px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
          >
            <StockLogo :symbol="trade.symbol" :size="32" class="flex-shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ trade.symbol }}</span>
                <span
                  class="text-[10px] uppercase tracking-wide px-1 py-px rounded font-medium"
                  :class="sideClass(trade.side)"
                >
                  {{ trade.side }}
                </span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 text-mono-num flex items-center gap-1">
                <span>{{ formatDate(trade.trade_date || trade.tradeDate) }}</span>
                <span v-if="trade.quantity">· {{ trade.quantity }} sh</span>
                <span v-if="trade.r_value || trade.rValue" class="text-gray-700 dark:text-gray-300">
                  · {{ formatR(trade.r_value ?? trade.rValue) }}R
                </span>
              </div>
            </div>
            <div class="text-right text-mono-num">
              <div
                class="text-sm font-semibold"
                :class="trade.pnl > 0
                  ? 'text-green-600 dark:text-green-400'
                  : trade.pnl < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'"
              >
                {{ formatSignedCurrency(trade.pnl) }}
              </div>
              <div v-if="trade.pnl_percent || trade.pnlPercent" class="text-[10px] text-gray-500 dark:text-gray-400">
                {{ formatPct(trade.pnl_percent ?? trade.pnlPercent) }}
              </div>
            </div>
          </router-link>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import StockLogo from '@/components/common/StockLogo.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiArrowRight } from '@mdi/js'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatTradeDate } from '@/utils/date'

const props = defineProps({
  trades: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const { formatSignedCurrency } = useCurrencyFormatter()

function sideClass(side) {
  const s = String(side || '').toLowerCase()
  if (s === 'long' || s === 'buy') {
    return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
  if (s === 'short' || s === 'sell') {
    return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}

function formatDate(d) {
  if (!d) return ''
  return formatTradeDate(d, 'MMM d')
}

function formatR(r) {
  const n = parseFloat(r)
  if (!Number.isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1)
}

function formatPct(p) {
  const n = parseFloat(p)
  if (!Number.isFinite(n)) return ''
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}
</script>
