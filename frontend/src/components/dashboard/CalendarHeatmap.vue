<template>
  <div class="card-dense">
    <!-- Header: title + W/L/B summary on top, Win/Loss legend below.
         Stacking these vertically by default keeps everything aligned when
         the card is narrow; on wider screens we push the legend to the right
         side of the title via flex-row. -->
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="min-w-0">
        <h3 class="heading-card">Trading Calendar</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 text-mono-num">
          <span v-if="hasData">{{ winDays }}W · {{ lossDays }}L · {{ breakevenDays }}B</span>
          <span v-else>Trade days light up here</span>
        </p>
      </div>
      <!-- Legend stacked vertically. Each chip+label takes ~"Loss"-width
           which fits even in very narrow cards. -->
      <div class="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 shrink-0">
        <div class="flex items-center gap-1.5">
          <span class="heatmap-cell" style="background-color: #16a34a" />
          <span>Win</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="heatmap-cell" style="background-color: #dc2626" />
          <span>Loss</span>
        </div>
      </div>
    </div>

    <div class="p-4">
      <div v-for="month in months" :key="`${month.year}-${month.month}`" class="mb-4 last:mb-0">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ month.label }}</span>
          <span
            class="text-xs text-mono-num font-medium"
            :class="month.totalPnl > 0 ? 'text-green-600 dark:text-green-400'
                  : month.totalPnl < 0 ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'"
          >
            {{ formatSignedCurrency(month.totalPnl) }}
          </span>
        </div>
        <!-- 7-col grid with day-of-week header -->
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="dow in ['S', 'M', 'T', 'W', 'T', 'F', 'S']"
            :key="`dow-${dow}-${month.year}-${month.month}`"
            class="text-[10px] text-center text-gray-400 dark:text-gray-500"
          >
            {{ dow }}
          </div>
          <div
            v-for="(cell, idx) in month.cells"
            :key="`cell-${month.year}-${month.month}-${idx}`"
            class="aspect-square"
          >
            <button
              v-if="cell.date"
              type="button"
              class="w-full h-full rounded-sm border border-transparent transition-all hover:scale-110 hover:border-primary-400 hover:z-10 relative group"
              :style="{ backgroundColor: cell.color }"
              :title="cell.tooltip"
              @click="onCellClick(cell)"
            >
              <span
                v-if="cell.isToday"
                class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary-500"
              />
            </button>
            <div v-else class="w-full h-full" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div v-if="!hasData" class="mt-2 text-center text-xs text-gray-500 dark:text-gray-400 italic">
        Days you trade will color-code by P&amp;L
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  dailyPnL: {
    type: Array,
    default: () => []
  },
  // How many months to show, ending at the current month.
  monthsToShow: {
    type: Number,
    default: 1
  }
})

const router = useRouter()
const { formatSignedCurrency, formatCurrency } = useCurrencyFormatter()

// Build a YYYY-MM-DD -> {pnl, count} index from props.dailyPnL.
const dayIndex = computed(() => {
  const map = new Map()
  for (const d of props.dailyPnL || []) {
    const dateStr = String(d.trade_date || d.tradeDate || '').slice(0, 10)
    if (!dateStr) continue
    map.set(dateStr, {
      pnl: parseFloat(d.daily_pnl ?? d.dailyPnL ?? 0) || 0,
      count: parseInt(d.trade_count ?? d.tradeCount ?? 0) || 0
    })
  }
  return map
})

const hasData = computed(() => dayIndex.value.size > 0)

const stats = computed(() => {
  let win = 0, loss = 0, be = 0
  for (const v of dayIndex.value.values()) {
    if (v.pnl > 0) win++
    else if (v.pnl < 0) loss++
    else be++
  }
  return { win, loss, be }
})

const winDays = computed(() => stats.value.win)
const lossDays = computed(() => stats.value.loss)
const breakevenDays = computed(() => stats.value.be)

// Solid green for winning days, solid red for losing days, neutral gray for
// breakeven days. No magnitude-based gradient — the heatmap is a yes/no
// readout of win/loss day, not a heatmap of P&L size.
function colorFor(pnl) {
  if (pnl > 0) return '#16a34a' // green-600
  if (pnl < 0) return '#dc2626' // red-600
  return 'rgb(229, 231, 235)'   // gray-200, breakeven
}

function emptyCellColor() {
  // Dark mode picks up via CSS but inline style overrides — use a neutral
  // that reads in both themes. The button itself is invisible without bg.
  return 'rgba(156, 163, 175, 0.15)'
}

// Local date (NOT UTC). toISOString() returns UTC, which rolls over to the
// next day for US timezones in the evening — that's why the "today" dot was
// landing on Saturday while local Friday was still in progress.
const todayStr = computed(() => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
})

const months = computed(() => {
  const result = []
  const now = new Date()
  const baseYear = now.getFullYear()
  const baseMonth = now.getMonth() // 0-indexed

  for (let offset = props.monthsToShow - 1; offset >= 0; offset--) {
    const d = new Date(baseYear, baseMonth - offset, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

    const firstDayOfMonth = new Date(year, month, 1)
    const leadingBlanks = firstDayOfMonth.getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const totalCells = leadingBlanks + daysInMonth
    const trailingBlanks = (7 - (totalCells % 7)) % 7

    const cells = []
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ date: null })
    }

    let totalPnl = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const entry = dayIndex.value.get(dateStr)
      const pnl = entry?.pnl ?? null
      const count = entry?.count ?? 0
      if (pnl !== null) totalPnl += pnl

      const color = entry ? colorFor(pnl) : emptyCellColor()
      const tooltip = entry
        ? `${dateStr} — ${formatSignedCurrency(pnl)} (${count} ${count === 1 ? 'trade' : 'trades'})`
        : `${dateStr} — no trades`

      cells.push({
        date: dateStr,
        pnl,
        count,
        color,
        tooltip,
        isToday: dateStr === todayStr.value,
        hasTrades: !!entry
      })
    }
    for (let i = 0; i < trailingBlanks; i++) {
      cells.push({ date: null })
    }

    result.push({ year, month, label, cells, totalPnl })
  }

  return result
})

function onCellClick(cell) {
  if (!cell.hasTrades) return
  router.push({
    path: '/trades',
    query: { startDate: cell.date, endDate: cell.date }
  })
}
</script>
