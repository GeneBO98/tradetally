<template>
  <span
    v-if="session"
    class="inline-flex flex-shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-4 ring-1 ring-inset"
    :class="sessionClasses"
    :title="session.title"
  >
    {{ session.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { getTradeMarketSession } from '@/utils/tradeMarketSession'

const props = defineProps({
  trade: {
    type: Object,
    required: true,
  },
})

const instrumentType = computed(() => String(
  props.trade.instrument_type ?? props.trade.instrumentType ?? 'stock'
).toLowerCase())

const session = computed(() => {
  if (!['stock', 'option'].includes(instrumentType.value)) return null
  return getTradeMarketSession(props.trade.entry_time ?? props.trade.entryTime)
})

const sessionClasses = computed(() => ({
  pre_market: 'bg-white text-primary-700 ring-primary-300 dark:bg-gray-900 dark:text-primary-300 dark:ring-primary-700',
  regular: 'bg-primary-600 text-white ring-primary-600 dark:bg-primary-500 dark:ring-primary-500',
  post_market: 'bg-primary-100 text-primary-900 ring-primary-200 dark:bg-primary-900/50 dark:text-primary-200 dark:ring-primary-800',
}[session.value?.key] || 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700'))
</script>
