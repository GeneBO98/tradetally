<template>
  <div class="inline-flex flex-wrap gap-2">
    <!-- Loading State -->
    <div v-if="loading" class="text-xs text-gray-500 dark:text-gray-400">
      Loading trades...
    </div>

    <!-- Trades -->
    <router-link
      v-for="trade in trades"
      :key="trade.id"
      :to="`/trades/${trade.id}`"
      class="inline-flex items-center px-3 py-1.5 rounded-lg border transition-all hover:shadow-md"
      :class="trade.pnl >= 0
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-700'
        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700'"
    >
      <div class="flex items-center space-x-2">
        <span
          class="text-sm font-medium"
          :class="trade.pnl >= 0
            ? 'text-green-800 dark:text-green-200'
            : 'text-red-800 dark:text-red-200'"
        >
          {{ trade.symbol }}
        </span>
        <span
          class="text-xs font-semibold px-1.5 py-0.5 rounded"
          :class="trade.side === 'buy' || trade.side === 'long'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'"
        >
          {{ (trade.side || '').toUpperCase() }}
        </span>
        <span v-if="trade.pnl !== null && trade.pnl !== undefined" class="text-xs font-medium" :class="trade.pnl >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
          {{ trade.pnl >= 0 ? '+' : '' }}${{ formatPrice(trade.pnl) }}
        </span>
      </div>
    </router-link>

    <!-- No trades found -->
    <div v-if="!loading && trades.length === 0" class="text-xs text-gray-500 dark:text-gray-400 italic">
      No trade details available
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import api from '@/services/api'

const props = defineProps({
  tradeIds: {
    type: Array,
    required: true
  }
})

const loading = ref(false)
const trades = ref([])

const formatPrice = (price) => {
  if (price === null || price === undefined) return '0.00'
  return Math.abs(price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const fetchTrades = async () => {
  if (!props.tradeIds || props.tradeIds.length === 0) {
    trades.value = []
    return
  }

  loading.value = true
  try {
    // Fetch each trade individually (could be optimized with a bulk endpoint)
    const tradePromises = props.tradeIds.map(id =>
      api.get(`/trades/${id}`).catch(err => {
        console.error(`Error fetching trade ${id}:`, err)
        return null
      })
    )

    const responses = await Promise.all(tradePromises)
    trades.value = responses
      .filter(response => response && response.data && response.data.trade)
      .map(response => response.data.trade)
  } catch (error) {
    console.error('Error fetching linked trades:', error)
    trades.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.tradeIds, () => {
  fetchTrades()
}, { deep: true })

onMounted(() => {
  fetchTrades()
})
</script>
