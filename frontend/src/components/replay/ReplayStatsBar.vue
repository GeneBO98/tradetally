<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Time</dt>
      <dd class="font-medium text-gray-900 dark:text-white tabular-nums">
        {{ clockLabel }}
      </dd>
    </div>
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Position</dt>
      <dd class="font-medium text-gray-900 dark:text-white tabular-nums">
        <span v-if="stats.position !== 0">
          {{ stats.position > 0 ? '+' : '' }}{{ stats.position }}
          <span v-if="stats.avg_cost !== null" class="text-gray-500 dark:text-gray-400 font-normal">
            @ {{ formatCurrency(stats.avg_cost) }}
          </span>
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">Flat</span>
      </dd>
    </div>
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Realized</dt>
      <dd class="font-medium tabular-nums" :class="pnlClass(stats.realized_pnl)">
        {{ formatSignedCurrency(stats.realized_pnl) }}
      </dd>
    </div>
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Unrealized</dt>
      <dd class="font-medium tabular-nums" :class="pnlClass(stats.unrealized_pnl)">
        {{ formatSignedCurrency(stats.unrealized_pnl) }}
      </dd>
    </div>
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Total P&amp;L</dt>
      <dd class="font-semibold tabular-nums" :class="pnlClass(stats.total_pnl)">
        {{ formatSignedCurrency(stats.total_pnl) }}
      </dd>
    </div>
    <div>
      <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">R Multiple</dt>
      <dd class="font-medium tabular-nums" :class="stats.r_multiple !== null ? pnlClass(stats.r_multiple) : 'text-gray-500 dark:text-gray-400'">
        {{ stats.r_multiple !== null ? `${stats.r_multiple >= 0 ? '+' : ''}${stats.r_multiple.toFixed(2)}R` : 'No stop set' }}
      </dd>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  stats: { type: Object, required: true },
  currentTime: { type: Number, default: null }, // epoch seconds UTC
  timezone: { type: String, default: 'America/New_York' },
  resolution: { type: String, default: '1min' }
})

const { formatCurrency } = useCurrencyFormatter()

const clockLabel = computed(() => {
  if (!props.currentTime) return '--:--'
  const date = new Date(props.currentTime * 1000)
  if (props.resolution === 'daily') {
    return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  }
  const time = date.toLocaleTimeString('en-US', {
    timeZone: props.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return `${time} ET`
})

function pnlClass(value) {
  if (value > 0) return 'text-green-600 dark:text-green-400'
  if (value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function formatSignedCurrency(value) {
  const formatted = formatCurrency(Math.abs(value || 0))
  if ((value || 0) < 0) return `-${formatted}`
  return (value || 0) > 0 ? `+${formatted}` : formatted
}
</script>
