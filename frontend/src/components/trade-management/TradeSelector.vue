<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <!-- Filters -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Select a Trade to Analyze</h2>
      <div class="flex flex-wrap gap-4">
        <!-- Symbol Search -->
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Symbol</label>
          <input
            v-model="localFilters.symbol"
            type="text"
            placeholder="Search by symbol..."
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            @input="debouncedFilterChange"
          />
        </div>

        <!-- Start Date -->
        <div class="min-w-[150px]">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
          <input
            v-model="localFilters.startDate"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            @change="emitFiltersChanged"
          />
        </div>

        <!-- End Date -->
        <div class="min-w-[150px]">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
          <input
            v-model="localFilters.endDate"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            @change="emitFiltersChanged"
          />
        </div>

        <!-- Clear Filters -->
        <div class="flex items-end">
          <button
            @click="clearFilters"
            class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && trades.length === 0" class="p-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
      <p class="text-gray-600 dark:text-gray-400">Loading trades...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading && trades.length === 0" class="p-8 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>
      <p class="mt-2 text-gray-600 dark:text-gray-400">No closed trades found</p>
      <p class="text-sm text-gray-500 dark:text-gray-500">Try adjusting your filters</p>
    </div>

    <!-- Trade List -->
    <div v-else class="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
      <button
        v-for="trade in trades"
        :key="trade.id"
        @click="selectTrade(trade)"
        :class="[
          'w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left',
          selectedTradeId === trade.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
        ]"
      >
        <div class="flex items-center space-x-4">
          <!-- Symbol & Date -->
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-medium text-gray-900 dark:text-white">{{ trade.symbol }}</span>
              <!-- Instrument Type Badge -->
              <span
                v-if="trade.instrument_type && trade.instrument_type !== 'stock'"
                :class="[
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  trade.instrument_type === 'option'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                    : trade.instrument_type === 'future'
                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                ]"
              >
                {{ formatInstrumentType(trade.instrument_type) }}
              </span>
              <span
                :class="[
                  'text-xs px-2 py-0.5 rounded-full',
                  trade.side === 'long'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                ]"
              >
                {{ trade.side }}
              </span>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(trade.trade_date) }}
              <span v-if="trade.strategy" class="ml-2 text-gray-400 dark:text-gray-500">- {{ trade.strategy }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-6">
          <!-- P&L -->
          <div class="text-right">
            <div
              :class="[
                'font-medium',
                parseFloat(trade.pnl) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              ]"
            >
              {{ formatCurrency(trade.pnl) }}
            </div>
            <div
              :class="[
                'text-sm',
                parseFloat(trade.pnl_percent) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              ]"
            >
              {{ formatPercent(trade.pnl_percent) }}
            </div>
          </div>

          <!-- Data Status -->
          <div class="flex items-center space-x-2">
            <span
              v-if="!trade.can_analyze"
              class="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded"
              title="Stop loss required for analysis"
            >
              Needs SL
            </span>
            <span
              v-else-if="trade.needs_take_profit"
              class="text-xs px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded"
              title="Take profit not set"
            >
              No TP
            </span>
            <span
              v-else
              class="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded"
            >
              Ready
            </span>

            <!-- Selection Arrow -->
            <svg
              :class="[
                'w-5 h-5 transition-transform',
                selectedTradeId === trade.id ? 'text-primary-600 rotate-90' : 'text-gray-400'
              ]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      </button>
    </div>

    <!-- Load More -->
    <div v-if="pagination.has_more" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
      <button
        @click="$emit('load-more')"
        :disabled="loading"
        class="w-full py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
      >
        {{ loading ? 'Loading...' : `Load more (${pagination.total - trades.length} remaining)` }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { format } from 'date-fns'

const props = defineProps({
  trades: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  pagination: {
    type: Object,
    default: () => ({ total: 0, limit: 50, offset: 0, has_more: false })
  },
  selectedTradeId: {
    type: String,
    default: null
  },
  initialFilters: {
    type: Object,
    default: () => ({ symbol: '', startDate: '', endDate: '' })
  }
})

const emit = defineEmits(['trade-selected', 'filters-changed', 'load-more'])

const localFilters = ref({
  symbol: '',
  startDate: '',
  endDate: ''
})

// Initialize filters from props on mount
onMounted(() => {
  if (props.initialFilters) {
    localFilters.value = { ...props.initialFilters }
  }
})

// Watch for external filter changes (e.g., from URL restore)
watch(() => props.initialFilters, (newFilters) => {
  if (newFilters) {
    localFilters.value = { ...newFilters }
  }
}, { deep: true })

let debounceTimer = null

function debouncedFilterChange() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emitFiltersChanged()
  }, 300)
}

function emitFiltersChanged() {
  emit('filters-changed', { ...localFilters.value })
}

function clearFilters() {
  localFilters.value = {
    symbol: '',
    startDate: '',
    endDate: ''
  }
  emitFiltersChanged()
}

function selectTrade(trade) {
  emit('trade-selected', trade)
}

function formatDate(dateString) {
  if (!dateString) return ''
  try {
    return format(new Date(dateString), 'MMM d, yyyy')
  } catch {
    return dateString
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num)
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
}

function formatInstrumentType(type) {
  const types = {
    'option': 'Option',
    'future': 'Future',
    'forex': 'Forex',
    'crypto': 'Crypto',
    'stock': 'Stock'
  }
  return types[type] || type
}
</script>
