<template>
  <div class="card-dense h-full flex flex-col">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Win Rate</h3>
      <span class="text-xs text-gray-500 dark:text-gray-400 text-mono-num">
        {{ totalTrades }} {{ totalTrades === 1 ? 'trade' : 'trades' }}
      </span>
    </div>

    <div class="card-dense-body flex-1 flex flex-col">
      <div v-if="totalTrades === 0" class="flex-1 flex items-center justify-center py-6">
        <p class="text-sm text-gray-600 dark:text-gray-400 text-center">No trades to score yet.</p>
      </div>

      <template v-else>
        <!-- 1. Hero gauge -->
        <div class="relative flex items-end justify-center" style="height: 110px;">
          <svg
            :width="gaugeW"
            :height="gaugeH"
            :viewBox="`0 0 ${gaugeW} ${gaugeH}`"
            role="img"
            aria-hidden="true"
            class="overflow-visible"
          >
            <path
              :d="arcPath(100)"
              fill="none"
              :stroke="trackColor"
              :stroke-width="arcStrokeWidth"
              stroke-linecap="round"
            />
            <path
              v-if="winRate > 0"
              :d="arcPath(winRate)"
              fill="none"
              :stroke="arcColor"
              :stroke-width="arcStrokeWidth"
              stroke-linecap="round"
              class="transition-all duration-500"
            />
            <g
              v-for="tick in [25, 50, 75]"
              :key="`tick-${tick}`"
              :transform="`translate(${tickPos(tick).x}, ${tickPos(tick).y}) rotate(${tickAngle(tick)})`"
            >
              <line x1="0" y1="-3" x2="0" y2="3" :stroke="tickColor" stroke-width="1" />
            </g>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
            <div
              class="text-mono-num font-semibold tracking-tight leading-none"
              :class="winRateClass"
              style="font-size: 2.5rem;"
            >
              {{ winRate.toFixed(0) }}<span class="text-lg">%</span>
            </div>
            <div class="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {{ winRateVerdict }}
            </div>
            <div v-if="breakeven > 0" class="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              {{ winRateExcludingBe.toFixed(0) }}% excl. BE
            </div>
          </div>
        </div>

        <!-- 2. Outcome tiles — backgrounds dynamically tinted by win rate so
             the card reads at a glance: heavy green = winning, heavy red =
             bleeding. Wins tile intensifies above 50% win rate; Losses tile
             intensifies below 50%. BE stays neutral. -->
        <div class="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            class="flex flex-col items-center py-2 rounded-md border border-gray-200 dark:border-gray-700 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-100/60 dark:hover:bg-green-900/30"
            :style="winsTileStyle"
            @click="$emit('navigate', 'profit')"
          >
            <div class="flex items-center gap-1 mb-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wins</span>
            </div>
            <span class="text-mono-num text-base font-semibold text-green-600 dark:text-green-400">{{ winning }}</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center py-2 rounded-md border border-gray-200 dark:border-gray-700 transition-colors hover:border-red-300 dark:hover:border-red-700 hover:bg-red-100/60 dark:hover:bg-red-900/30"
            :style="lossesTileStyle"
            @click="$emit('navigate', 'loss')"
          >
            <div class="flex items-center gap-1 mb-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Losses</span>
            </div>
            <span class="text-mono-num text-base font-semibold text-red-600 dark:text-red-400">{{ losing }}</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            @click="$emit('navigate', 'breakeven')"
          >
            <div class="flex items-center gap-1 mb-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">BE</span>
            </div>
            <span class="text-mono-num text-base font-semibold text-gray-700 dark:text-gray-200">{{ breakeven }}</span>
          </button>
        </div>

        <!-- 3. Stat ladder. Each stat is a horizontal row with the label on
             the left and the value right-aligned. Replaces the 3-col grid
             which kept jamming labels into cramped cells at narrow widths.
             Group A (averages) and Group B (extremes) are visually separated
             by a stronger divider in the middle. -->
        <dl class="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg win</dt>
            <dd class="text-mono-num text-sm font-medium text-green-600 dark:text-green-400">
              {{ formatCurrency(avgWin) }}
            </dd>
          </div>
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg loss</dt>
            <dd class="text-mono-num text-sm font-medium text-red-600 dark:text-red-400">
              {{ formatCurrency(avgLoss) }}
            </dd>
          </div>
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Risk / reward</dt>
            <dd class="text-mono-num text-sm font-medium text-gray-900 dark:text-white">
              <template v-if="avgLoss > 0">{{ (avgWin / avgLoss).toFixed(2) }}<span class="text-gray-400">x</span></template>
              <template v-else>—</template>
            </dd>
          </div>
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Best win</dt>
            <dd class="text-mono-num text-sm font-medium text-green-600 dark:text-green-400">
              {{ formatCurrency(bestTrade) }}
            </dd>
          </div>
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Worst loss</dt>
            <dd class="text-mono-num text-sm font-medium text-red-600 dark:text-red-400">
              {{ formatCurrency(worstTrade) }}
            </dd>
          </div>
          <div class="py-2.5 flex items-baseline justify-between gap-3">
            <dt class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expectancy / trade</dt>
            <dd class="text-mono-num text-sm font-medium" :class="expectancyClass">
              {{ formatSignedCurrency(expectancy) }}
            </dd>
          </div>
        </dl>

        <!-- 4. Synthesis — Profit Factor as the bottom headline.
             Pinned to the bottom with mt-auto so the card looks anchored when
             it stretches to match a taller neighbor (e.g. Recent Trades). -->
        <div class="mt-auto pt-4">
          <div
            class="flex items-center justify-between gap-3 rounded-md border px-4 py-3"
            :class="profitFactor >= 1
              ? 'border-green-200 dark:border-green-900/50 bg-green-50/40 dark:bg-green-900/10'
              : 'border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-900/10'"
          >
            <div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profit factor</div>
              <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Gross wins / gross losses</div>
            </div>
            <div class="text-mono-num text-2xl font-semibold tracking-tight" :class="profitFactorClass">
              {{ profitFactorDisplay }}
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
  summary: {
    type: Object,
    default: () => ({})
  }
})

defineEmits(['navigate'])

const { formatCurrency, formatSignedCurrency } = useCurrencyFormatter()

const winning = computed(() => parseInt(props.summary.winningTrades) || 0)
const losing = computed(() => parseInt(props.summary.losingTrades) || 0)
const breakeven = computed(() => parseInt(props.summary.breakevenTrades) || 0)
const totalTrades = computed(() => winning.value + losing.value + breakeven.value)

const winRate = computed(() => {
  if (totalTrades.value === 0) return 0
  return (winning.value / totalTrades.value) * 100
})

// Win rate among decisive (non-breakeven) trades only. Breakeven here means
// gross P&L = 0, classified server-side; this just divides by wins + losses.
const winRateExcludingBe = computed(() => {
  const decisive = winning.value + losing.value
  if (decisive === 0) return 0
  return (winning.value / decisive) * 100
})

const winRateClass = computed(() => {
  if (winRate.value >= 60) return 'text-green-600 dark:text-green-400'
  if (winRate.value >= 45) return 'text-gray-900 dark:text-white'
  return 'text-red-600 dark:text-red-400'
})

const winRateVerdict = computed(() => {
  if (totalTrades.value < 10) return 'small sample'
  if (winRate.value >= 65) return 'elite'
  if (winRate.value >= 55) return 'strong'
  if (winRate.value >= 45) return 'balanced'
  if (winRate.value >= 35) return 'underwater'
  return 'rough patch'
})

// Tile tint intensity ramps with how far above/below 50% the win rate sits.
// At 50% no tint; at 100% Wins reaches max green tint; at 0% Losses reaches
// max red tint. Below a small threshold we return empty styles so the
// Tailwind classes (gray-200 / dark:gray-700 border) handle the neutral case
// and look right in both light and dark mode. Above the threshold we paint
// rgba directly — green/red read well on both card surfaces.
const MAX_TILE_ALPHA = 0.35
const TINT_VISIBLE_THRESHOLD = 0.05
const tileTintAlpha = pct => Math.min(1, Math.max(0, pct / 50)) * MAX_TILE_ALPHA

function tintStyle(rgb, distanceFromFifty) {
  const alpha = tileTintAlpha(distanceFromFifty)
  if (alpha < TINT_VISIBLE_THRESHOLD) {
    // Let the Tailwind border-gray-200 / dark:border-gray-700 class take over.
    return { borderColor: '' }
  }
  return {
    backgroundColor: `rgba(${rgb}, ${alpha.toFixed(3)})`,
    borderColor: `rgba(${rgb}, ${(alpha + 0.25).toFixed(3)})`
  }
}

const winsTileStyle = computed(() => {
  if (totalTrades.value === 0) return {}
  return tintStyle('34, 197, 94', winRate.value - 50)
})

const lossesTileStyle = computed(() => {
  if (totalTrades.value === 0) return {}
  return tintStyle('239, 68, 68', 50 - winRate.value)
})

const avgWin = computed(() => Math.abs(parseFloat(props.summary.avgWin) || 0))
const avgLoss = computed(() => Math.abs(parseFloat(props.summary.avgLoss) || 0))

const bestTrade = computed(() => parseFloat(props.summary.bestTrade) || 0)
const worstTrade = computed(() => parseFloat(props.summary.worstTrade) || 0)

const expectancy = computed(() => {
  if (totalTrades.value === 0) return 0
  const wRate = winning.value / totalTrades.value
  const lRate = losing.value / totalTrades.value
  return wRate * avgWin.value - lRate * avgLoss.value
})

const expectancyClass = computed(() => {
  if (expectancy.value > 0) return 'text-green-600 dark:text-green-400'
  if (expectancy.value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-700 dark:text-gray-200'
})

const profitFactor = computed(() => parseFloat(props.summary.profitFactor) || 0)
const profitFactorDisplay = computed(() => {
  if (totalTrades.value === 0) return '—'
  if (!Number.isFinite(profitFactor.value)) return '∞'
  if (profitFactor.value === 0) return '0.00'
  return profitFactor.value.toFixed(2)
})
const profitFactorClass = computed(() => {
  if (!Number.isFinite(profitFactor.value)) return 'text-green-600 dark:text-green-400'
  if (profitFactor.value >= 1.5) return 'text-green-600 dark:text-green-400'
  if (profitFactor.value >= 1) return 'text-gray-900 dark:text-white'
  return 'text-red-600 dark:text-red-400'
})

const gaugeW = 220
const gaugeH = 120
const arcStrokeWidth = 10
const cx = gaugeW / 2
const cy = gaugeH - 8
const radius = gaugeW / 2 - arcStrokeWidth

const trackColor = computed(() => 'rgba(156, 163, 175, 0.25)')
const arcColor = computed(() => {
  if (winRate.value >= 60) return '#16a34a'
  if (winRate.value >= 45) return '#F0812A'
  return '#dc2626'
})
const tickColor = computed(() => 'rgba(156, 163, 175, 0.5)')

function pointAtPct(pct) {
  const clamped = Math.max(0, Math.min(100, pct))
  const rad = Math.PI * (1 - clamped / 100)
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad)
  }
}

function arcPath(pct) {
  const start = pointAtPct(0)
  const end = pointAtPct(pct)
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

function tickPos(pct) {
  return pointAtPct(pct)
}

function tickAngle(pct) {
  const clamped = Math.max(0, Math.min(100, pct))
  return -(180 - 180 * clamped / 100)
}
</script>
