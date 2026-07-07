<template>
  <!-- Stats + Top Symbols side by side -->
  <div class="grid grid-cols-1 gap-8 xl:grid-cols-3">
    <!-- Stats -->
    <div class="card xl:col-span-2">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Stats</h3>
          <span
            v-if="overview.position_grouping"
            class="text-xs font-normal text-primary-600 dark:text-primary-400"
          >whole trade</span>
        </div>

        <!-- Core stats (available to all users) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div
            v-for="row in freeStatRows"
            :key="row.label"
            class="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800"
          >
            <span class="text-sm text-gray-500 dark:text-gray-400">{{ row.label }}</span>
            <span
              class="text-sm font-semibold whitespace-nowrap"
              :class="row.class || 'text-gray-900 dark:text-white'"
            >{{ row.display }}</span>
          </div>
        </div>

        <!-- Advanced metrics (Pro) -->
        <div class="relative mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Advanced Metrics</p>

          <!-- Pro Tier Overlay for Free Users -->
          <div v-if="isFreeTier" class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-lg">
            <div class="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md">
              <svg class="mx-auto h-12 w-12 text-primary-600 dark:text-primary-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Pro Feature</h3>
              <p class="text-gray-600 dark:text-gray-400 mb-6">
                Unlock advanced trading metrics including SQN, Kelly Criterion, K-Ratio, MAE/MFE, and more with Pro.
              </p>
              <router-link
                to="/pricing"
                class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Upgrade to Pro - {{ monthlyPricePerMonthLabel }}
              </router-link>
            </div>
          </div>

          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-x-8"
            :class="{ 'filter blur-sm pointer-events-none select-none': isFreeTier }"
          >
            <div
              v-for="row in advancedStatRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800"
              :title="row.tip"
            >
              <span class="text-sm text-gray-500 dark:text-gray-400 cursor-help">{{ row.label }}</span>
              <span
                class="text-sm font-semibold whitespace-nowrap"
                :class="row.class || 'text-gray-900 dark:text-white'"
              >{{ row.display }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top Symbols -->
    <div class="card xl:col-span-1">
      <div class="card-body">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Performing Symbols</h3>
        <div v-if="symbolStats.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
          No data available
        </div>
        <div v-else>
          <!-- Column Headers — must mirror the body row's flex structure
               (logo w-8, gap-2, symbol w-16, gap-2, trades count) so the
               header labels sit directly above their values. -->
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-baseline gap-2">
              <span class="w-8" aria-hidden="true"></span>
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Symbol</span>
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</span>
            </div>
            <div class="flex items-center">
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 text-right">P&L</span>
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12 text-right">Win %</span>
            </div>
          </div>

          <!-- Data Rows -->
          <div class="space-y-1">
            <div
              v-for="symbol in symbolStats.slice(0, 10)"
              :key="symbol.symbol"
              class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1 cursor-pointer transition-colors"
              @click="$emit('navigate-symbol', symbol.symbol)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <StockLogo
                  :symbol="symbol.symbol"
                  size-class="w-8 h-8"
                />
                <span class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 w-16">{{ symbol.symbol }}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ symbol.total_trades }}
                </span>
              </div>
              <div class="flex items-center">
                <div class="text-sm font-medium w-20 text-right" :class="[
                  symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                ]">
                  {{ formatCurrency(symbol.total_pnl) }}
                </div>
                <div class="w-12 text-right">
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ (symbol.winning_trades / symbol.total_trades * 100).toFixed(0) }}%
                  </div>
                  <div
                    v-if="(Number(symbol.breakeven_trades) || 0) > 0"
                    class="text-[10px] text-gray-400 dark:text-gray-500 leading-tight"
                    :title="`Excludes ${symbol.breakeven_trades} breakeven trade${Number(symbol.breakeven_trades) === 1 ? '' : 's'}`"
                  >
                    {{ winRateExclBERounded(symbol) }}% BE
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StockLogo from '@/components/common/StockLogo.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { winRateExclBERounded } from '@/utils/analyticsFormatters'

const props = defineProps({
  overview: { type: Object, default: () => ({}) },
  calculationMethod: { type: String, default: 'Average' },
  symbolStats: { type: Array, default: () => [] },
  isFreeTier: { type: Boolean, default: false },
  monthlyPricePerMonthLabel: { type: String, default: '' }
})

defineEmits(['navigate-symbol'])

const { formatCurrency } = useCurrencyFormatter()

const POSITIVE_CLASS = 'text-green-600'
const NEGATIVE_CLASS = 'text-red-600'
const NEUTRAL_CLASS = 'text-gray-900 dark:text-white'

function signClass(value) {
  return (Number(value) || 0) >= 0 ? POSITIVE_CLASS : NEGATIVE_CLASS
}

// Whole-number thousands separator for counts/volume in the stats table
function formatCount(value) {
  return (Number(value) || 0).toLocaleString('en-US')
}

// Human-readable hold time from a minutes value (Tradervue-style)
function formatHoldDuration(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return '—'
  if (m < 1) return 'less than a minute'
  if (m < 60) {
    const mins = Math.round(m)
    return `${mins} minute${mins === 1 ? '' : 's'}`
  }
  if (m < 1440) {
    const hours = m / 60
    const h = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const days = m / 1440
  const d = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10
  return `${d} day${d === 1 ? '' : 's'}`
}

// Free-tier stats shown to every user in the unified "Stats" table
const freeStatRows = computed(() => {
  const o = props.overview || {}
  const m = props.calculationMethod
  const total = Number(o.total_trades) || 0
  const winPct = total > 0 ? ((Number(o.winning_trades) / total) * 100).toFixed(1) : '0.0'
  const lossPct = total > 0 ? ((Number(o.losing_trades) / total) * 100).toFixed(1) : '0.0'
  return [
    { label: 'Total Gain/Loss', display: formatCurrency(o.total_pnl ?? 0), class: signClass(o.total_pnl) },
    { label: 'Largest Gain', display: formatCurrency(o.best_trade ?? 0), class: POSITIVE_CLASS },
    { label: 'Largest Loss', display: formatCurrency(o.worst_trade ?? 0), class: NEGATIVE_CLASS },

    { label: 'Average Daily Gain/Loss', display: formatCurrency(o.avg_daily_pnl ?? 0), class: signClass(o.avg_daily_pnl) },
    { label: 'Average Daily Volume', display: formatCount(Math.round(o.avg_daily_volume ?? 0)) },
    { label: `${m} Per-share Gain/Loss`, display: formatCurrency(o.avg_per_share_pnl ?? 0), class: signClass(o.avg_per_share_pnl) },

    { label: `${m} Trade Gain/Loss`, display: formatCurrency(o.avg_pnl ?? 0), class: signClass(o.avg_pnl) },
    { label: `${m} Winning Trade`, display: formatCurrency(o.avg_win ?? 0), class: POSITIVE_CLASS },
    { label: `${m} Losing Trade`, display: formatCurrency(o.avg_loss ?? 0), class: NEGATIVE_CLASS },

    { label: 'Total Number of Trades', display: formatCount(o.total_trades ?? 0) },
    { label: 'Number of Winning Trades', display: `${formatCount(o.winning_trades ?? 0)} (${winPct}%)`, class: POSITIVE_CLASS },
    { label: 'Number of Losing Trades', display: `${formatCount(o.losing_trades ?? 0)} (${lossPct}%)`, class: NEGATIVE_CLASS },

    { label: 'Average Hold Time (scratch trades)', display: formatHoldDuration(o.avg_hold_scratch_minutes) },
    { label: 'Average Hold Time (winning trades)', display: formatHoldDuration(o.avg_hold_win_minutes) },
    { label: 'Average Hold Time (losing trades)', display: formatHoldDuration(o.avg_hold_loss_minutes) },

    { label: 'Number of Scratch Trades', display: formatCount(o.breakeven_trades ?? 0) },
    { label: 'Max Consecutive Wins', display: formatCount(o.max_consecutive_wins ?? 0), class: POSITIVE_CLASS },
    { label: 'Max Consecutive Losses', display: formatCount(o.max_consecutive_losses ?? 0), class: NEGATIVE_CLASS },

    { label: 'Profit Factor', display: o.profit_factor ?? '0.00' }
  ]
})

// Advanced stats gated behind Pro (single overlay, matching existing behavior)
const advancedStatRows = computed(() => {
  const o = props.overview || {}
  const m = props.calculationMethod
  const mae = (o.avg_mae === 'N/A' || o.avg_mae == null) ? 'N/A' : formatCurrency(o.avg_mae)
  const mfe = (o.avg_mfe === 'N/A' || o.avg_mfe == null) ? 'N/A' : formatCurrency(o.avg_mfe)
  return [
    { label: 'Trade P&L Standard Deviation', display: formatCurrency(o.pnl_std_dev ?? 0), tip: 'Spread of individual trade results around the average. Lower means more consistent trades.' },
    { label: 'System Quality Number (SQN)', display: o.sqn ?? '0.00', tip: `(${m} Trade / Standard Deviation) × √Number of Trades. Higher values indicate a more consistent system.` },
    { label: 'Probability of Random Chance', display: o.probability_random ?? 'N/A', tip: 'Likelihood your results occurred by random chance. Lower is more statistically significant.' },

    { label: 'Kelly Percentage', display: `${o.kelly_percentage ?? '0.00'}%`, tip: 'Optimal fraction of capital to risk per trade for long-term growth, from win rate and avg win/loss.' },
    { label: 'K-Ratio', display: o.k_ratio ?? '0.00', tip: 'Consistency of the equity curve over time. Requires 3+ equity entries.' },
    { label: 'Total Commissions', display: formatCurrency(o.total_commissions ?? 0), class: NEGATIVE_CLASS },

    { label: 'Total Fees', display: formatCurrency(o.total_fees ?? 0), class: NEGATIVE_CLASS },
    { label: `${m} Position MAE`, display: mae, class: mae === 'N/A' ? NEUTRAL_CLASS : NEGATIVE_CLASS, tip: 'Maximum Adverse Excursion — largest unrealized loss during the trade (estimated).' },
    { label: `${m} Position MFE`, display: mfe, class: mfe === 'N/A' ? NEUTRAL_CLASS : POSITIVE_CLASS, tip: 'Maximum Favorable Excursion — largest unrealized profit during the trade (estimated).' }
  ]
})
</script>
