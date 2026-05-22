<template>
  <div class="card-dense h-full">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Momentum</h3>
      <span class="text-xs text-gray-500 dark:text-gray-400">Last {{ Math.min(recentDays.length, 14) }} days</span>
    </div>
    <div class="card-dense-body">
      <!-- Empty state -->
      <div v-if="recentDays.length === 0" class="text-center py-6">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Trade 5 days to start tracking your streak.
        </p>
      </div>

      <template v-else>
        <!-- Main streak -->
        <div class="flex items-baseline gap-3">
          <div
            class="text-mono-num text-4xl font-semibold tracking-tight"
            :class="streakClass"
          >
            {{ streakLabel }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <div v-if="currentStreak > 0">{{ currentStreak === 1 ? 'winning day' : 'winning days' }} in a row</div>
            <div v-else-if="currentStreak < 0">{{ Math.abs(currentStreak) === 1 ? 'losing day' : 'losing days' }} in a row</div>
            <div v-else>no current streak</div>
          </div>
        </div>

        <!-- Last N days strip -->
        <div class="mt-4">
          <div class="flex items-center gap-1">
            <div
              v-for="(day, idx) in recentDaysSliced"
              :key="`day-${idx}`"
              class="flex-1 h-8 rounded-sm transition-transform hover:scale-y-110"
              :class="day.cellClass"
              :title="day.title"
            />
          </div>
          <div class="mt-1 flex justify-between text-[10px] text-gray-400 dark:text-gray-500 text-mono-num">
            <span>{{ recentDaysSliced[0]?.shortDate }}</span>
            <span>{{ recentDaysSliced[recentDaysSliced.length - 1]?.shortDate }}</span>
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
import { computed } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  dailyPnL: {
    type: Array,
    default: () => []
  }
})

const { formatSignedCurrency } = useCurrencyFormatter()

const recentDays = computed(() => {
  return (props.dailyPnL || []).map(d => ({
    date: String(d.trade_date || d.tradeDate || '').slice(0, 10),
    pnl: parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0,
    count: parseInt(d.trade_count ?? d.tradeCount ?? 0) || 0
  }))
})

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

const streakStats = computed(() => {
  const days = recentDays.value
  if (days.length === 0) {
    return { current: 0, bestWin: 0, worstLoss: 0, todayPnl: 0, todayTrades: 0, avgDailyTrades: 0, hasToday: false }
  }
  let bestWin = 0, worstLoss = 0, totalCount = 0
  let prev = null, run = 0
  for (let i = 0; i < days.length; i++) {
    const r = days[i].pnl > 0 ? 'W' : (days[i].pnl < 0 ? 'L' : 'B')
    if (r === prev) run++
    else { prev = r; run = 1 }
    if (r === 'W' && run > bestWin) bestWin = run
    if (r === 'L' && run > worstLoss) worstLoss = run
    totalCount += days[i].count
  }
  // Current streak from end
  const last = days[days.length - 1]
  const lastR = last.pnl > 0 ? 'W' : (last.pnl < 0 ? 'L' : 'B')
  let lastRun = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const r = days[i].pnl > 0 ? 'W' : (days[i].pnl < 0 ? 'L' : 'B')
    if (r === lastR) lastRun++
    else break
  }
  const current = lastR === 'W' ? lastRun : lastR === 'L' ? -lastRun : 0
  const todayStr = new Date().toISOString().slice(0, 10)
  const hasToday = last.date === todayStr
  return {
    current,
    bestWin,
    worstLoss,
    todayPnl: hasToday ? last.pnl : 0,
    todayTrades: hasToday ? last.count : 0,
    avgDailyTrades: days.length > 0 ? totalCount / days.length : 0,
    hasToday
  }
})

const currentStreak = computed(() => streakStats.value.current)
const bestWinStreak = computed(() => streakStats.value.bestWin)
const worstLossStreak = computed(() => streakStats.value.worstLoss)
const hasToday = computed(() => streakStats.value.hasToday)
const todayPnl = computed(() => streakStats.value.todayPnl)
const todayTrades = computed(() => streakStats.value.todayTrades)
const avgDailyTrades = computed(() => streakStats.value.avgDailyTrades)

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
