<template>
  <div class="card-dense h-full">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Momentum</h3>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        <template v-if="scope === 'day'">Last {{ Math.min(recentDays.length, 14) }} days</template>
        <template v-else>Last {{ stripCells.length }} trades</template>
      </span>
    </div>
    <div class="card-dense-body">
      <!-- Empty state -->
      <div v-if="recentDays.length === 0" class="text-center py-6">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Trade 5 days to start tracking your streak.
        </p>
      </div>

      <template v-else>
        <!-- Streak scope toggle: by-day (default) vs by-trade -->
        <div v-if="hasTradeData" class="mb-3 inline-flex rounded-md border border-gray-200 dark:border-gray-700 p-0.5 text-xs">
          <button
            type="button"
            @click="scope = 'day'"
            class="px-2.5 py-1 rounded transition-colors"
            :class="scope === 'day'
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            By day
          </button>
          <button
            type="button"
            @click="scope = 'trade'"
            class="px-2.5 py-1 rounded transition-colors"
            :class="scope === 'trade'
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            By trade
          </button>
        </div>

        <!-- Main streak -->
        <div class="flex items-baseline gap-3">
          <div
            class="text-mono-num text-4xl font-semibold tracking-tight"
            :class="streakClass"
          >
            {{ streakLabel }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <template v-if="scope === 'day'">
              <div v-if="currentStreak > 0">{{ currentStreak === 1 ? 'winning day' : 'winning days' }} in a row</div>
              <div v-else-if="currentStreak < 0">{{ Math.abs(currentStreak) === 1 ? 'losing day' : 'losing days' }} in a row</div>
              <div v-else>no current streak</div>
            </template>
            <template v-else>
              <div v-if="currentStreak > 0">{{ currentStreak === 1 ? 'winning trade' : 'winning trades' }} in a row</div>
              <div v-else-if="currentStreak < 0">{{ Math.abs(currentStreak) === 1 ? 'losing trade' : 'losing trades' }} in a row</div>
              <div v-else>no current streak</div>
            </template>
          </div>
        </div>

        <!-- Recent strip: last N days OR last N trades -->
        <div class="mt-4">
          <div class="flex items-center gap-1">
            <div
              v-for="(cell, idx) in stripCells"
              :key="`cell-${idx}`"
              class="flex-1 h-8 rounded-sm transition-transform hover:scale-y-110"
              :class="cell.cellClass"
              :title="cell.title"
            />
          </div>
          <div class="mt-1 flex justify-between text-[10px] text-gray-400 dark:text-gray-500 text-mono-num">
            <span v-if="scope === 'day'">{{ stripCells[0]?.shortDate }}</span>
            <span v-else>oldest</span>
            <span v-if="scope === 'day'">{{ stripCells[stripCells.length - 1]?.shortDate }}</span>
            <span v-else>most recent</span>
          </div>
        </div>

        <!-- Best / worst -->
        <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
            <div class="text-label">Best streak</div>
            <div class="text-mono-num text-lg font-semibold text-green-600 dark:text-green-400">
              {{ bestWinStreak }}W
            </div>
          </div>
          <div class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
            <div class="text-label">Worst streak</div>
            <div class="text-mono-num text-lg font-semibold text-red-600 dark:text-red-400">
              {{ worstLossStreak }}L
            </div>
          </div>
        </div>

        <!-- Today vs avg -->
        <div v-if="hasToday" class="mt-3 flex items-center justify-between text-xs px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700/40">
          <div>
            <div class="text-label">Today</div>
            <div class="text-mono-num font-medium" :class="todayPnlClass">
              {{ formatSignedCurrency(todayPnl) }} · {{ todayTrades }} {{ todayTrades === 1 ? 'trade' : 'trades' }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-label">vs avg</div>
            <div class="text-mono-num text-gray-700 dark:text-gray-300">
              {{ avgDailyTrades > 0 ? avgDailyTrades.toFixed(1) : '—' }}/day
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  dailyPnL: {
    type: Array,
    default: () => []
  },
  recentTradePnls: {
    type: Array,
    default: () => []
  }
})

const { formatSignedCurrency } = useCurrencyFormatter()

const scope = ref('day') // 'day' | 'trade'

const recentDays = computed(() => {
  return (props.dailyPnL || []).map(d => ({
    date: String(d.trade_date || d.tradeDate || '').slice(0, 10),
    pnl: parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0,
    count: parseInt(d.trade_count ?? d.tradeCount ?? 0) || 0
  }))
})

const recentTrades = computed(() => {
  return (props.recentTradePnls || []).map(t => ({
    date: String(t.trade_date || t.tradeDate || '').slice(0, 10),
    pnl: parseFloat(t.pnl ?? 0) || 0
  }))
})

const hasTradeData = computed(() => recentTrades.value.length > 0)

const recentDaysSliced = computed(() => {
  const slice = recentDays.value.slice(-14)
  return slice.map(d => {
    const isWin = d.pnl > 0
    const isLoss = d.pnl < 0
    return {
      ...d,
      shortDate: d.date.slice(5).replace('-', '/'),
      cellClass: isWin
        ? 'bg-green-500/80 dark:bg-green-500'
        : isLoss
          ? 'bg-red-500/80 dark:bg-red-500'
          : 'bg-gray-300 dark:bg-gray-600',
      title: `${d.date}: ${d.pnl > 0 ? '+' : ''}${d.pnl.toFixed(2)} (${d.count})`
    }
  })
})

const recentTradesSliced = computed(() => {
  const slice = recentTrades.value.slice(-30)
  return slice.map(t => {
    const isWin = t.pnl > 0
    const isLoss = t.pnl < 0
    return {
      ...t,
      cellClass: isWin
        ? 'bg-green-500/80 dark:bg-green-500'
        : isLoss
          ? 'bg-red-500/80 dark:bg-red-500'
          : 'bg-gray-300 dark:bg-gray-600',
      title: `${t.date}: ${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(2)}`
    }
  })
})

const stripCells = computed(() =>
  scope.value === 'trade' ? recentTradesSliced.value : recentDaysSliced.value
)

// Compute current/best/worst streaks over an array of pnl-bearing items in
// chronological order. Wins are pnl > 0; losses are pnl < 0; breakeven (== 0)
// neither extends nor breaks a run.
function computeStreaks(items) {
  if (!items || items.length === 0) {
    return { current: 0, bestWin: 0, worstLoss: 0 }
  }
  let bestWin = 0, worstLoss = 0
  let prev = null, run = 0
  for (let i = 0; i < items.length; i++) {
    const r = items[i].pnl > 0 ? 'W' : (items[i].pnl < 0 ? 'L' : 'B')
    if (r === prev) run++
    else { prev = r; run = 1 }
    if (r === 'W' && run > bestWin) bestWin = run
    if (r === 'L' && run > worstLoss) worstLoss = run
  }
  const last = items[items.length - 1]
  const lastR = last.pnl > 0 ? 'W' : (last.pnl < 0 ? 'L' : 'B')
  let lastRun = 0
  for (let i = items.length - 1; i >= 0; i--) {
    const r = items[i].pnl > 0 ? 'W' : (items[i].pnl < 0 ? 'L' : 'B')
    if (r === lastR) lastRun++
    else break
  }
  const current = lastR === 'W' ? lastRun : lastR === 'L' ? -lastRun : 0
  return { current, bestWin, worstLoss }
}

const dayStreakStats = computed(() => {
  const stats = computeStreaks(recentDays.value)
  const days = recentDays.value
  let totalCount = 0
  for (const d of days) totalCount += d.count
  // Local date (NOT UTC) — toISOString rolls forward into tomorrow's date
  // for US timezones in the evening.
  const nowLocal = new Date()
  const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`
  const last = days[days.length - 1]
  const hasToday = last ? last.date === todayStr : false
  return {
    ...stats,
    todayPnl: hasToday && last ? last.pnl : 0,
    todayTrades: hasToday && last ? last.count : 0,
    avgDailyTrades: days.length > 0 ? totalCount / days.length : 0,
    hasToday
  }
})

const tradeStreakStats = computed(() => computeStreaks(recentTrades.value))

const activeStats = computed(() =>
  scope.value === 'trade' ? tradeStreakStats.value : dayStreakStats.value
)

const currentStreak = computed(() => activeStats.value.current)
const bestWinStreak = computed(() => activeStats.value.bestWin)
const worstLossStreak = computed(() => activeStats.value.worstLoss)
const hasToday = computed(() => scope.value === 'day' && dayStreakStats.value.hasToday)
const todayPnl = computed(() => dayStreakStats.value.todayPnl)
const todayTrades = computed(() => dayStreakStats.value.todayTrades)
const avgDailyTrades = computed(() => dayStreakStats.value.avgDailyTrades)

const streakLabel = computed(() => {
  if (currentStreak.value === 0) return '—'
  return `${Math.abs(currentStreak.value)}${currentStreak.value > 0 ? 'W' : 'L'}`
})

const streakClass = computed(() => {
  if (currentStreak.value > 0) return 'text-green-600 dark:text-green-400'
  if (currentStreak.value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-400 dark:text-gray-500'
})

const todayPnlClass = computed(() => {
  if (todayPnl.value > 0) return 'text-green-600 dark:text-green-400'
  if (todayPnl.value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-700 dark:text-gray-300'
})
</script>
