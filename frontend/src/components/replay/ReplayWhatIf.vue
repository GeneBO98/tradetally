<template>
  <div>
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-4">
      <div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">What-If Analysis</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          How this trade would have ended under different exits. Estimates use the chart's
          market data and exclude commissions.
        </p>
      </div>
      <div v-if="result.left_on_table !== null && result.left_on_table > 0.005" class="text-right">
        <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Left on the table</div>
        <div class="text-xl font-semibold text-yellow-600 dark:text-yellow-400">
          {{ formatCurrency(result.left_on_table) }}
        </div>
      </div>
    </div>

    <div
      v-if="!result.aligned"
      class="mb-3 p-2.5 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
    >
      <p class="text-xs text-yellow-800 dark:text-yellow-200">
        Your fill prices don't sit inside this session's market data, so scenarios are measured
        from the market price at your entry time and may not line up with your recorded P&amp;L.
      </p>
    </div>

    <div class="divide-y divide-gray-200 dark:divide-gray-700">
      <div class="flex items-center justify-between gap-4 py-2.5">
        <div>
          <div class="font-medium text-gray-900 dark:text-white">Your actual exit</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <span v-if="result.actual_exit_time">at {{ formatTime(result.actual_exit_time) }}</span>
            <span v-if="result.actual_exit_price"> &middot; {{ formatCurrency(result.actual_exit_price) }}</span>
          </div>
        </div>
        <div class="font-semibold tabular-nums" :class="pnlClass(result.actual_pnl)">
          {{ formatSigned(result.actual_pnl) }}
        </div>
      </div>

      <div
        v-for="scenario in result.scenarios"
        :key="scenario.key"
        class="flex items-center justify-between gap-4 py-2.5"
      >
        <div>
          <div class="text-gray-900 dark:text-white">{{ scenario.label }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <span v-if="scenario.detail">{{ scenario.detail }}</span>
            <template v-else-if="scenario.hit_time">
              at {{ formatTime(scenario.hit_time) }}
              <span v-if="scenario.exit_price !== null"> &middot; {{ formatCurrency(scenario.exit_price) }}</span>
            </template>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div v-if="scenario.pnl !== null" class="font-medium tabular-nums" :class="pnlClass(scenario.pnl)">
            {{ formatSigned(scenario.pnl) }}
          </div>
          <div v-else class="text-gray-400 dark:text-gray-500">&mdash;</div>
          <div
            v-if="scenario.delta !== null && Math.abs(scenario.delta) > 0.005"
            class="text-xs tabular-nums"
            :class="scenario.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
          >
            {{ formatCurrency(Math.abs(scenario.delta)) }} {{ scenario.delta > 0 ? 'better' : 'worse' }} than your exit
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  result: { type: Object, required: true },
  timezone: { type: String, default: 'America/New_York' },
  resolution: { type: String, default: '1min' }
})

const { formatCurrency } = useCurrencyFormatter()

function pnlClass(value) {
  if (value > 0) return 'text-green-600 dark:text-green-400'
  if (value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function formatSigned(value) {
  const formatted = formatCurrency(Math.abs(value || 0))
  if ((value || 0) < 0) return `-${formatted}`
  return (value || 0) > 0 ? `+${formatted}` : formatted
}

function formatTime(epochSeconds) {
  const date = new Date(epochSeconds * 1000)
  if (props.resolution === 'daily') {
    return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  }
  const time = date.toLocaleTimeString('en-US', {
    timeZone: props.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${time} ET`
}
</script>
