<template>
  <!-- The six factors behind the performance score. Shown inside the hero
       ribbon when the score is expanded; it brings no card of its own. -->
  <div data-testid="performance-score-breakdown">
    <dl class="grid grid-cols-1 gap-x-6 gap-y-2.5 @md:grid-cols-2 @3xl:grid-cols-3">
      <div v-for="factor in factors" :key="factor.key" :title="factor.description">
        <div class="flex items-baseline justify-between gap-2 text-xs">
          <dt class="truncate text-gray-700 dark:text-gray-300">{{ factor.label }}</dt>
          <dd class="text-mono-num shrink-0 text-gray-500 dark:text-gray-400">
            {{ formatFactorValue(factor) }}
            <span class="ml-1.5 font-medium text-gray-900 dark:text-white">{{ factor.score }}</span>
          </dd>
        </div>
        <div class="mt-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
          <div class="h-full rounded-full" :class="barClass(factor.score)" :style="{ width: `${factor.score}%` }" />
        </div>
      </div>
    </dl>
    <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
      Each measure is scored 0 to 100 and weighted into the total. From {{ tradesCounted }} closed trades.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // `performanceScore` from GET /trades/analytics.
  score: {
    type: Object,
    default: null
  }
})

const factors = computed(() => (Array.isArray(props.score?.factors) ? props.score.factors : []))
const tradesCounted = computed(() => props.score?.tradesCounted || 0)

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
