<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>

    <!-- No Trades -->
    <div v-else-if="availableTrades.length === 0" class="text-sm text-gray-500 dark:text-gray-400 italic">
      No trades found for this date
    </div>

    <!-- Trade List -->
    <div v-else class="space-y-2">
      <div
        v-for="trade in availableTrades"
        :key="trade.id"
        class="flex items-center justify-between p-3 border rounded-lg transition-colors"
        :class="isSelected(trade.id)
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
      >
        <div class="flex items-center space-x-3 flex-1">
          <input
            type="checkbox"
            :checked="isSelected(trade.id)"
            @change="toggleTrade(trade.id)"
            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <div class="flex-1">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {{ trade.symbol }}
              </span>
              <span
                class="px-2 py-0.5 text-xs font-semibold rounded"
                :class="trade.side === 'buy' || trade.side === 'long'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'"
              >
                {{ (trade.side || '').toUpperCase() }}
              </span>
              <span v-if="trade.instrument_type === 'option'" class="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                OPT
              </span>
            </div>
            <div class="mt-1 flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Qty: {{ Math.abs(trade.quantity) }}</span>
              <span v-if="trade.entry_price">Entry: ${{ formatPrice(trade.entry_price) }}</span>
              <span v-if="trade.pnl !== null && trade.pnl !== undefined" :class="trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                P/L: ${{ formatPrice(trade.pnl) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected Count -->
    <div v-if="selectedTrades.length > 0" class="mt-3 text-sm text-gray-600 dark:text-gray-400">
      {{ selectedTrades.length }} trade{{ selectedTrades.length !== 1 ? 's' : '' }} selected
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import api from '@/services/api'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  entryDate: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue'])

const loading = ref(false)
const availableTrades = ref([])
const selectedTrades = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isSelected = (tradeId) => {
  return selectedTrades.value.includes(tradeId)
}

const toggleTrade = (tradeId) => {
  const index = selectedTrades.value.indexOf(tradeId)
  if (index > -1) {
    // Remove
    const newSelection = [...selectedTrades.value]
    newSelection.splice(index, 1)
    selectedTrades.value = newSelection
  } else {
    // Add
    selectedTrades.value = [...selectedTrades.value, tradeId]
  }
}

const formatPrice = (price) => {
  if (price === null || price === undefined) return '0.00'
  return Math.abs(price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const fetchTrades = async () => {
  if (!props.entryDate) return

  loading.value = true
  try {
    const response = await api.get('/trades', {
      params: {
        startDate: props.entryDate,
        endDate: props.entryDate,
        limit: 100
      }
    })
    availableTrades.value = response.data.trades || []
  } catch (error) {
    console.error('Error fetching trades for date:', error)
    availableTrades.value = []
  } finally {
    loading.value = false
  }
}

// Watch for date changes
watch(() => props.entryDate, () => {
  fetchTrades()
}, { immediate: true })
</script>
