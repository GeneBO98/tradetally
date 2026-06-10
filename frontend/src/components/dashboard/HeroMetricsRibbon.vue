<template>
  <div class="card-dense relative overflow-hidden">
    <!-- Subtle grid background for command-center feel -->
    <div class="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] pointer-events-none" aria-hidden="true">
      <div class="w-full h-full" style="background-image: linear-gradient(rgba(120,120,120,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(120,120,120,0.6) 1px, transparent 1px); background-size: 24px 24px;" />
    </div>

    <div class="relative card-dense-body">
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-stretch">
        <!-- Hero P&L: full row on mobile, ~40% on desktop. min-w-0 lets the
             number shrink to fit inside the flex item instead of pushing
             out into the sub-stats. The number itself uses whitespace-nowrap
             (never truncated) and a length-aware size class so it always
             reads completely. The bar chart is hidden below xl since the
             number takes priority for available space. -->
        <div class="lg:flex-[2] min-w-0 flex flex-col">
          <div class="flex items-baseline justify-between mb-1 gap-2">
            <span class="text-label whitespace-nowrap">{{ rMode ? 'Net R' : 'Net P&L' }}</span>
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">{{ rangeLabel }}</span>
              <!-- $ / R toggle: lets the ribbon be shared without dollar values -->
              <div class="inline-flex shrink-0 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium" role="group" aria-label="Display values in dollars or R-multiples">
                <button
                  type="button"
                  class="px-2 py-0.5 transition-colors"
                  :class="!rMode ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                  :aria-pressed="!rMode"
                  @click="emit('update:rMode', false)"
                >$</button>
                <button
                  type="button"
                  class="px-2 py-0.5 transition-colors"
                  :class="rMode ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                  :aria-pressed="rMode"
                  @click="emit('update:rMode', true)"
                >R</button>
              </div>
            </div>
          </div>
          <!-- Value block is bottom-anchored with mt-auto so the hero number,
               win-rate, profit-factor and streak all share a virtual row at
               the bottom of the ribbon (the outer flex uses items-stretch so
               every column has the same height). The sub-text below the
               number lines up with each column's own sub-text. -->
          <div class="mt-auto pt-1">
            <div class="flex items-end gap-4 min-w-0">
              <div
                class="text-mono-num font-semibold tracking-tight leading-none whitespace-nowrap"
                :class="[pnlValueClass, pnlSizeClass]"
              >
                {{ heroDisplay }}
              </div>
              <!-- Recent daily P&L bars: distinct from the cumulative equity
                   curve below — shows per-day rhythm and magnitude. -->
              <div
                v-if="dailyBarValues.length >= 2"
                class="hidden xl:flex flex-1 min-w-0 items-center pb-1"
              >
                <MiniBarChart
                  :values="dailyBarValues"
                  :labels="dailyBarLabels"
                  :height="40"
                  fill
                  class="w-full"
                />
              </div>
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400 text-mono-num">
              <span v-if="totalTrades > 0">
                {{ totalTrades }} {{ totalTrades === 1 ? 'trade' : 'trades' }}<!--
                --><span v-if="tradingDays > 0"> · {{ tradingDays }} {{ tradingDays === 1 ? 'day' : 'days' }}</span><!--
                --><span v-if="totalCosts > 0 && !rMode"> · {{ formatCurrency(totalCosts) }} costs</span>
              </span>
              <span v-else class="italic">Import trades to see your P&amp;L</span>
            </div>
          </div>
        </div>

        <!-- Sub-stats: 3-col grid, takes ~60% on desktop. Each cell is
             flex-col with the number pinned to the bottom via mt-auto so
             stat values line up even when a label wraps to two lines at
             narrow widths. Labels are allowed to wrap (no whitespace-nowrap)
             to keep them from overflowing into adjacent cells. -->
        <div class="grid grid-cols-3 gap-3 sm:gap-4 lg:flex-[3] lg:gap-6 lg:border-l lg:border-gray-200 lg:dark:border-gray-700 lg:pl-4 xl:pl-6">
          <div class="flex flex-col min-w-0">
            <div class="text-label mb-1">Win Rate</div>
            <div class="mt-auto pt-1">
              <div class="text-mono-num text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight" :class="winRateClass">
                {{ totalTrades > 0 ? winRate + '%' : '—' }}<span v-if="totalTrades > 0" class="text-xs font-normal text-gray-500 dark:text-gray-400"> incl. BE</span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 text-mono-num mt-0.5 truncate">
                <span v-if="totalTrades > 0">{{ winningTrades }}W · {{ losingTrades }}L<span v-if="breakevenTrades > 0"> · {{ winRateExcludingBe }}% excl. BE</span></span>
                <span v-else>—</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col min-w-0 lg:border-l lg:border-gray-200 lg:dark:border-gray-700 lg:pl-4 xl:pl-6">
            <div class="text-label mb-1">Profit Factor</div>
            <div class="mt-auto pt-1">
              <div class="text-mono-num text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight" :class="profitFactorClass">
                {{ profitFactorDisplay }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                <span v-if="profitFactor >= 2">Strong</span>
                <span v-else-if="profitFactor >= 1.3">Solid</span>
                <span v-else-if="profitFactor >= 1">Marginal</span>
                <span v-else-if="totalTrades > 0">Losing</span>
                <span v-else>—</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col min-w-0 lg:border-l lg:border-gray-200 lg:dark:border-gray-700 lg:pl-4 xl:pl-6">
            <div class="text-label mb-1">Streak</div>
            <div class="mt-auto pt-1">
              <div class="flex items-baseline gap-1 min-w-0">
                <div
                  class="text-mono-num text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight"
                  :class="streakClass"
                  :title="streakTooltip"
                >
                  {{ streakDisplay }}
                </div>
                <!-- "2L days" read as a cryptic unit; spell out win/loss -->
                <span v-if="currentStreak !== 0" class="text-xs text-gray-500 dark:text-gray-400 lowercase whitespace-nowrap">
                  {{ currentStreak > 0 ? 'win' : 'loss' }} {{ Math.abs(currentStreak) === 1 ? 'day' : 'days' }}
                </span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 text-mono-num mt-0.5 truncate" v-if="bestWinStreak > 0" title="Longest run of consecutive winning days">
                best {{ bestWinStreak }}W
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5" v-else>—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Today strip (when there is activity today) -->
      <div
        v-if="todayTradeCount > 0"
        class="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs"
      >
        <span class="text-label">Today</span>
        <span class="text-data-secondary text-mono-num">
          {{ todayTradeCount }} {{ todayTradeCount === 1 ? 'trade' : 'trades' }}
        </span>
        <span class="text-mono-num font-medium" :class="todayPnlClass">
          {{ rMode ? formatSignedR(todayR) : formatSignedCurrency(todayPnl) }}
        </span>
        <span class="text-gray-500 dark:text-gray-400 text-mono-num" v-if="avgDailyTrades > 0">
          avg {{ avgDailyTrades.toFixed(1) }}/day
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MiniBarChart from '@/components/common/MiniBarChart.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  analytics: {
    type: Object,
    required: true,
    default: () => ({ summary: {}, dailyPnL: [] })
  },
  rangeLabel: {
    type: String,
    default: 'All Time'
  },
  // When true, the hero number and daily bars show R-multiples instead of
  // dollar values so the ribbon can be shared without exposing account size.
  rMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:rMode'])

const { formatCurrency, formatSignedCurrency } = useCurrencyFormatter()

// R-multiples are unitless; show a signed value with a trailing R.
function formatSignedR(value) {
  const v = Number(value) || 0
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`
}

const summary = computed(() => props.analytics?.summary || {})

const netPnl = computed(() => parseFloat(summary.value.totalNetPnL ?? summary.value.totalPnL ?? 0) || 0)
// Total R across trades with a defined stop loss (NULL r_value trades are
// excluded server-side, matching the analytics performance endpoint).
const totalR = computed(() => parseFloat(summary.value.totalRValue ?? summary.value.total_r_value ?? 0) || 0)

// The active hero metric: drives both the displayed string and the sign-based
// color/size classes so $ and R modes share one code path.
const heroSign = computed(() => props.rMode ? totalR.value : netPnl.value)
const heroDisplay = computed(() => props.rMode ? formatSignedR(totalR.value) : formatSignedCurrency(netPnl.value))
const totalTrades = computed(() => parseInt(summary.value.totalTrades) || 0)
const winningTrades = computed(() => parseInt(summary.value.winningTrades) || 0)
const losingTrades = computed(() => parseInt(summary.value.losingTrades) || 0)
const tradingDays = computed(() => parseInt(summary.value.tradingDays) || 0)
const totalCosts = computed(() => parseFloat(summary.value.totalCosts) || 0)

const winRate = computed(() => {
  if (totalTrades.value === 0) return 0
  return ((winningTrades.value / totalTrades.value) * 100).toFixed(1)
})

// Win rate among decisive (non-breakeven) trades only.
const winRateExcludingBe = computed(() => {
  const decisive = winningTrades.value + losingTrades.value
  if (decisive === 0) return 0
  return ((winningTrades.value / decisive) * 100).toFixed(1)
})
const breakevenTrades = computed(() => parseInt(summary.value.breakevenTrades) || 0)

const profitFactor = computed(() => parseFloat(summary.value.profitFactor) || 0)
const profitFactorDisplay = computed(() => {
  if (totalTrades.value === 0) return '—'
  if (!Number.isFinite(profitFactor.value)) return '∞'
  if (profitFactor.value === 0) return '0.00'
  return profitFactor.value.toFixed(2)
})

const dailyPnL = computed(() => Array.isArray(props.analytics?.dailyPnL) ? props.analytics.dailyPnL : [])

// Derive streak metrics from daily P&L array (already returned by /trades/analytics).
// Keeps the dashboard one HTTP request — no separate /api/analytics/overview call.
const streakStats = computed(() => {
  const days = dailyPnL.value
  if (days.length === 0) {
    return { current: 0, bestWin: 0, worstLoss: 0, todayPnl: 0, todayR: 0, todayTrades: 0, avgDailyTrades: 0 }
  }
  let current = 0
  let bestWin = 0
  let worstLoss = 0
  let runResult = null
  let runLen = 0
  let totalTradeCount = 0

  const tagged = days.map(d => {
    const p = parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0
    totalTradeCount += parseInt(d.trade_count ?? d.tradeCount ?? 0) || 0
    return p > 0 ? 'W' : (p < 0 ? 'L' : 'B')
  })

  for (let i = 0; i < tagged.length; i++) {
    const r = tagged[i]
    if (r === runResult) {
      runLen++
    } else {
      runResult = r
      runLen = 1
    }
    if (r === 'W' && runLen > bestWin) bestWin = runLen
    if (r === 'L' && runLen > worstLoss) worstLoss = runLen
  }

  // Current streak: take the run ending at the last day
  const lastResult = tagged[tagged.length - 1]
  let lastRunLen = 0
  for (let i = tagged.length - 1; i >= 0; i--) {
    if (tagged[i] === lastResult) lastRunLen++
    else break
  }
  current = lastResult === 'W' ? lastRunLen
    : lastResult === 'L' ? -lastRunLen
    : 0

  // Today's data (last entry, if it's today)
  const lastDay = days[days.length - 1]
  const todayPnl = parseFloat(lastDay?.daily_pnl ?? lastDay?.dailyPnL ?? 0) || 0
  const todayR = parseFloat(lastDay?.r_value ?? lastDay?.rValue ?? 0) || 0
  const todayTrades = parseInt(lastDay?.trade_count ?? lastDay?.tradeCount ?? 0) || 0

  // Is the last entry actually today? Compare as YYYY-MM-DD strings in LOCAL
  // time. toISOString returns UTC, which rolls forward in the evening for US
  // timezones and would otherwise misclassify Friday-evening data as Saturday.
  const lastDateStr = lastDay?.trade_date || lastDay?.tradeDate || ''
  const nowLocal = new Date()
  const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
  const isToday = String(lastDateStr).slice(0, 10) === todayStr

  const avgDailyTrades = days.length > 0 ? totalTradeCount / days.length : 0

  return {
    current,
    bestWin,
    worstLoss,
    todayPnl: isToday ? todayPnl : 0,
    todayR: isToday ? todayR : 0,
    todayTrades: isToday ? todayTrades : 0,
    avgDailyTrades
  }
})

const currentStreak = computed(() => streakStats.value.current)
const bestWinStreak = computed(() => streakStats.value.bestWin)
const todayPnl = computed(() => streakStats.value.todayPnl)
const todayTradeCount = computed(() => streakStats.value.todayTrades)
const avgDailyTrades = computed(() => streakStats.value.avgDailyTrades)

const streakDisplay = computed(() => {
  if (currentStreak.value === 0) return '—'
  const abs = Math.abs(currentStreak.value)
  return `${abs}${currentStreak.value > 0 ? 'W' : 'L'}`
})

const streakTooltip = computed(() => {
  if (currentStreak.value === 0) return 'No active streak'
  const abs = Math.abs(currentStreak.value)
  const kind = currentStreak.value > 0 ? 'winning' : 'losing'
  return `${abs} consecutive ${kind} ${abs === 1 ? 'day' : 'days'}`
})

const streakClass = computed(() => {
  if (currentStreak.value > 0) return 'text-green-600 dark:text-green-400'
  if (currentStreak.value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-400 dark:text-gray-500'
})

const pnlValueClass = computed(() => {
  if (heroSign.value > 0) return 'text-green-600 dark:text-green-400 hero-glow-positive'
  if (heroSign.value < 0) return 'text-red-600 dark:text-red-400 hero-glow-negative'
  return 'text-gray-500 dark:text-gray-400'
})

// Scale the hero P&L font size by character count so the FULL number
// always reads. lg is the tight "narrow main column + news rail" case,
// so the lg sizes are intentionally one step below xl. The number is
// never truncated — fitting it is always the priority.
const pnlSizeClass = computed(() => {
  const len = heroDisplay.value.length
  if (len >= 12) return 'text-xl sm:text-2xl lg:text-2xl xl:text-3xl'    // e.g. +$1,234,567.89
  if (len >= 10) return 'text-2xl sm:text-3xl lg:text-2xl xl:text-4xl'   // e.g. +$15,786.64
  if (len >= 8)  return 'text-3xl sm:text-4xl lg:text-3xl xl:text-4xl'   // e.g. +$1,234.56
  return 'text-3xl sm:text-4xl lg:text-4xl xl:text-5xl'                  // shorter
})

const winRateClass = computed(() => {
  if (totalTrades.value === 0) return 'text-gray-400 dark:text-gray-500'
  const wr = parseFloat(winRate.value)
  if (wr >= 60) return 'text-green-600 dark:text-green-400'
  if (wr >= 45) return 'text-gray-900 dark:text-gray-100'
  return 'text-red-600 dark:text-red-400'
})

const profitFactorClass = computed(() => {
  if (totalTrades.value === 0) return 'text-gray-400 dark:text-gray-500'
  if (!Number.isFinite(profitFactor.value)) return 'text-green-600 dark:text-green-400'
  if (profitFactor.value >= 1.5) return 'text-green-600 dark:text-green-400'
  if (profitFactor.value >= 1) return 'text-gray-900 dark:text-gray-100'
  return 'text-red-600 dark:text-red-400'
})

const todayR = computed(() => streakStats.value.todayR)

const todayPnlClass = computed(() => {
  const v = props.rMode ? todayR.value : todayPnl.value
  if (v > 0) return 'text-green-600 dark:text-green-400'
  if (v < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-700 dark:text-gray-300'
})

// Recent daily P&L for the mini bar chart (last 30 trading days). Uses the
// per-day P&L — NOT cumulative — so it reads differently from the equity
// curve below and surfaces recent rhythm and volatility at a glance.
const recentDays = computed(() => dailyPnL.value.slice(-30))

const dailyBarValues = computed(() =>
  recentDays.value.map(d => props.rMode
    ? parseFloat(d.r_value ?? d.rValue ?? 0) || 0
    : parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0)
)

const dailyBarLabels = computed(() =>
  recentDays.value.map(d => {
    const date = String(d.trade_date ?? d.tradeDate ?? '').slice(0, 10)
    const value = props.rMode
      ? parseFloat(d.r_value ?? d.rValue ?? 0) || 0
      : parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0
    const formatted = props.rMode ? formatSignedR(value) : formatSignedCurrency(value)
    return date ? `${date}: ${formatted}` : formatted
  })
)
</script>
