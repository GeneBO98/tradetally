<template>
  <div class="card-dense" data-testid="performance-score-card">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
      <h3 class="heading-card">Performance Score</h3>
      <span class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ rangeLabel }}</span>
    </div>

    <div class="card-dense-body">
      <!-- Not enough closed trades yet -->
      <div v-if="!isReady" data-testid="performance-score-pending">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <template v-if="tradesNeeded > 0">
            {{ tradesNeeded }} more closed {{ tradesNeeded === 1 ? 'trade' : 'trades' }} in this period to unlock your score.
          </template>
          <template v-else>
            Your score appears here once this period has {{ minTrades }} closed trades.
          </template>
        </p>
        <div
          class="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
          role="progressbar"
          aria-label="Closed trades toward a performance score"
          :aria-valuenow="tradesCounted"
          aria-valuemin="0"
          :aria-valuemax="minTrades"
        >
          <div class="h-full rounded-full bg-primary-600" :style="{ width: `${pendingPercent}%` }" />
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 text-mono-num">
          {{ tradesCounted }} / {{ minTrades }} closed trades
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-8">
        <!-- Headline number -->
        <div class="flex flex-col justify-center">
          <div class="flex items-baseline gap-1.5">
            <span class="text-mono-num text-5xl font-semibold leading-none tracking-tight" :class="scoreClass">
              {{ score.score }}
            </span>
            <span class="text-mono-num text-sm text-gray-500 dark:text-gray-400">/ 100</span>
          </div>
          <div class="mt-2 text-sm font-medium text-gray-900 dark:text-white">{{ score.bandLabel }}</div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            From {{ tradesCounted }} closed trades. Weighted across the {{ factors.length }} measures shown.
          </p>
        </div>

        <!-- Factor breakdown -->
        <dl class="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <div v-for="factor in factors" :key="factor.key" :title="factor.description">
            <div class="flex items-baseline justify-between gap-2 text-xs">
              <dt class="truncate text-gray-700 dark:text-gray-300">{{ factor.label }}</dt>
              <dd class="text-mono-num shrink-0 text-gray-500 dark:text-gray-400">
                {{ formatFactorValue(factor) }}
                <span class="ml-1.5 font-medium text-gray-900 dark:text-white">{{ factor.score }}</span>
              </dd>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
              <div class="h-full rounded-full" :class="barClass(factor.score)" :style="{ width: `${factor.score}%` }" />
            </div>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // `performanceScore` from GET /trades/analytics. Absent on older backends.
  score: {
    type: Object,
    default: null
  },
  rangeLabel: {
    type: String,
    default: ''
  }
})

const isReady = computed(() => !!props.score?.ready && Number.isFinite(props.score?.score))
const factors = computed(() => (Array.isArray(props.score?.factors) ? props.score.factors : []))
const minTrades = computed(() => props.score?.minTrades || 20)
const tradesCounted = computed(() => props.score?.tradesCounted || 0)
const tradesNeeded = computed(() => Math.max(0, minTrades.value - tradesCounted.value))
const pendingPercent = computed(() => Math.min(100, Math.round((tradesCounted.value / minTrades.value) * 100)))

const scoreClass = computed(() => {
  const value = props.score?.score ?? 0
  if (value >= 65) return 'text-green-700 dark:text-green-400'
  if (value < 35) return 'text-red-600 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
})

function barClass(value) {
  if (value >= 65) return 'bg-green-600 dark:bg-green-500'
  if (value < 35) return 'bg-red-500 dark:bg-red-500'
  return 'bg-gray-400 dark:bg-gray-500'
}

// Raw value behind each factor, in the unit a trader would recognise.
function formatFactorValue(factor) {
  const value = factor.value
  if (value === null || value === undefined) {
    // No losing trades or no drawdown: the ratio has no finite value.
    return factor.key === 'drawdown' ? 'no drawdown' : 'no losses'
  }
  switch (factor.key) {
    case 'winRate':
    case 'consistency':
      return `${Math.round(value)}%`
    case 'expectancy':
      return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`
    case 'drawdown':
      return `${value.toFixed(1)}x`
    case 'profitFactor':
      return value >= 100 ? '99+' : value.toFixed(2)
    default:
      return value.toFixed(2)
  }
}
</script>
