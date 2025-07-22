<template>
  <div class="space-y-4">
    <!-- Basic filters always visible -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <div>
        <label for="symbol" class="label">Symbol</label>
        <input
          id="symbol"
          v-model="filters.symbol"
          type="text"
          class="input"
          placeholder="e.g., AAPL"
          @keydown.enter="applyFilters"
        />
      </div>
      
      <div>
        <label for="startDate" class="label">Start Date</label>
        <input
          id="startDate"
          v-model="filters.startDate"
          type="date"
          class="input"
          @keydown.enter="applyFilters"
        />
      </div>
      
      <div>
        <label for="endDate" class="label">End Date</label>
        <input
          id="endDate"
          v-model="filters.endDate"
          type="date"
          class="input"
          @keydown.enter="applyFilters"
        />
      </div>
      
      <div>
        <label class="label">Strategy</label>
        <div class="relative" data-dropdown="strategy">
          <button
            @click.stop="showStrategyDropdown = !showStrategyDropdown"
            class="input w-full text-left flex items-center justify-between"
            type="button"
          >
            <span class="truncate">
              {{ getSelectedStrategyText() }}
            </span>
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
          
          <div v-if="showStrategyDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            <div class="p-1">
              <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  :checked="filters.strategies.length === 0"
                  @change="toggleAllStrategies"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                />
                <span class="ml-3 text-sm text-gray-900 dark:text-white">All Strategies</span>
              </label>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-600">
              <div v-for="strategy in strategyOptions" :key="strategy.value" class="p-1">
                <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    :value="strategy.value"
                    v-model="filters.strategies"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                  />
                  <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ strategy.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div>
        <label class="label">Sector</label>
        <div class="relative" data-dropdown="sector">
          <button
            @click.stop="showSectorDropdown = !showSectorDropdown"
            class="input w-full text-left flex items-center justify-between"
            type="button"
            :disabled="loadingSectors"
          >
            <span class="truncate">
              {{ getSelectedSectorText() }}
            </span>
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
          
          <div v-if="showSectorDropdown && !loadingSectors" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            <div class="p-1">
              <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  :checked="filters.sectors.length === 0"
                  @change="toggleAllSectors"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                />
                <span class="ml-3 text-sm text-gray-900 dark:text-white">All Sectors</span>
              </label>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-600">
              <div v-for="sector in availableSectors" :key="sector" class="p-1">
                <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    :value="sector"
                    v-model="filters.sectors"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                  />
                  <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ sector }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div>
        <label for="hasNews" class="label">News</label>
        <select
          id="hasNews"
          v-model="filters.hasNews"
          class="input"
        >
          <option value="">All Trades</option>
          <option value="true">With News</option>
          <option value="false">No News</option>
        </select>
      </div>
    </div>

    <!-- Advanced filters toggle -->
    <div class="pt-2">
      <button
        @click="showAdvanced = !showAdvanced"
        class="flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ChevronRightIcon 
          :class="[showAdvanced ? 'rotate-90' : '', 'h-4 w-4 mr-1 transition-transform']"
        />
        Advanced Filters
        <span v-if="activeAdvancedCount > 0" class="ml-2 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs px-2 py-0.5 rounded-full">
          {{ activeAdvancedCount }}
        </span>
      </button>
    </div>

    <!-- Advanced filters (collapsible) -->
    <div v-if="showAdvanced" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <!-- Position Type -->
        <div>
          <label class="label">Position Type</label>
          <div class="mt-2 space-y-2">
            <label class="inline-flex items-center">
              <input
                type="radio"
                v-model="filters.side"
                value=""
                class="form-radio text-primary-600"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">All</span>
            </label>
            <label class="inline-flex items-center ml-4">
              <input
                type="radio"
                v-model="filters.side"
                value="long"
                class="form-radio text-primary-600"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Long</span>
            </label>
            <label class="inline-flex items-center ml-4">
              <input
                type="radio"
                v-model="filters.side"
                value="short"
                class="form-radio text-primary-600"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Short</span>
            </label>
          </div>
        </div>

        <!-- Price Range -->
        <div>
          <label class="label">Entry Price Range</label>
          <div class="flex items-center space-x-2">
            <input
              v-model.number="filters.minPrice"
              type="number"
              step="0.01"
              min="0"
              class="input"
              placeholder="Min"
            />
            <span class="text-gray-500 dark:text-gray-400">-</span>
            <input
              v-model.number="filters.maxPrice"
              type="number"
              step="0.01"
              min="0"
              class="input"
              placeholder="Max"
            />
          </div>
        </div>

        <!-- Quantity Range -->
        <div>
          <label class="label">Share Quantity</label>
          <div class="flex items-center space-x-2">
            <input
              v-model.number="filters.minQuantity"
              type="number"
              min="0"
              class="input"
              placeholder="Min"
            />
            <span class="text-gray-500 dark:text-gray-400">-</span>
            <input
              v-model.number="filters.maxQuantity"
              type="number"
              min="0"
              class="input"
              placeholder="Max"
            />
          </div>
        </div>

        <!-- Trade Status -->
        <div>
          <label class="label">Trade Status</label>
          <select v-model="filters.status" class="input">
            <option value="">All Trades</option>
            <option value="open">Open Only</option>
            <option value="closed">Closed Only</option>
          </select>
        </div>
      </div>

      <!-- P&L Filters and Broker -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="label">Broker</label>
          <select v-model="filters.broker" class="input">
            <option value="">All Brokers</option>
            <option value="generic">Generic</option>
            <option value="lightspeed">Lightspeed</option>
            <option value="thinkorswim">thinkorswim</option>
            <option value="ibkr">Interactive Brokers</option>
            <option value="etrade">E*TRADE</option>
            <option value="schwab">Schwab</option>
          </select>
        </div>

        <div>
          <label class="label">P&L Range ($)</label>
          <div class="flex items-center space-x-2">
            <input
              v-model.number="filters.minPnl"
              type="number"
              step="0.01"
              class="input"
              placeholder="Min"
            />
            <span class="text-gray-500 dark:text-gray-400">-</span>
            <input
              v-model.number="filters.maxPnl"
              type="number"
              step="0.01"
              class="input"
              placeholder="Max"
            />
          </div>
        </div>

        <div>
          <label class="label">P&L Type</label>
          <select v-model="filters.pnlType" class="input">
            <option value="">All</option>
            <option value="profit">Profit Only</option>
            <option value="loss">Loss Only</option>
          </select>
        </div>
        
        <div>
          <label class="label">Hold Time</label>
          <select v-model="filters.holdTime" class="input">
            <option value="">All</option>
            <option value="< 1 min">< 1 minute</option>
            <option value="1-5 min">1-5 minutes</option>
            <option value="5-15 min">5-15 minutes</option>
            <option value="15-30 min">15-30 minutes</option>
            <option value="30-60 min">30-60 minutes</option>
            <option value="1-2 hours">1-2 hours</option>
            <option value="2-4 hours">2-4 hours</option>
            <option value="4-24 hours">4-24 hours</option>
            <option value="1-7 days">1-7 days</option>
            <option value="1-4 weeks">1-4 weeks</option>
            <option value="1+ months">1+ months</option>
          </select>
        </div>
      </div>
    </div>
    
    <div class="flex justify-between items-center">
      <div v-if="activeFiltersCount > 0" class="text-sm text-gray-600 dark:text-gray-400">
        {{ activeFiltersCount }} filter{{ activeFiltersCount !== 1 ? 's' : '' }} active
      </div>
      <div v-else></div>
      <div class="flex space-x-3">
        <button @click="resetFilters" class="btn-secondary">
          Reset
        </button>
        <button @click="applyFilters" class="btn-primary">
          Apply Filters
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const emit = defineEmits(['filter'])
const route = useRoute()

const showAdvanced = ref(false)
const availableSectors = ref([])
const loadingSectors = ref(false)

// Dropdown visibility
const showStrategyDropdown = ref(false)
const showSectorDropdown = ref(false)

// Strategy options
const strategyOptions = [
  { value: 'scalper', label: 'Scalper' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'mean_reversion', label: 'Mean Reversion' },
  { value: 'swing', label: 'Swing' },
  { value: 'day_trading', label: 'Day Trading' },
  { value: 'position', label: 'Position Trading' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'trend_following', label: 'Trend Following' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'news_momentum', label: 'News Momentum' },
  { value: 'news_swing', label: 'News Swing' },
  { value: 'news_uncertainty', label: 'News Uncertainty' }
]

const filters = ref({
  // Basic filters
  symbol: '',
  startDate: '',
  endDate: '',
  strategy: '', // Keep for backward compatibility
  strategies: [], // New multi-select array
  sector: '', // Keep for backward compatibility  
  sectors: [], // New multi-select array
  hasNews: '',
  // Advanced filters
  side: '',
  minPrice: null,
  maxPrice: null,
  minQuantity: null,
  maxQuantity: null,
  status: '',
  minPnl: null,
  maxPnl: null,
  pnlType: '',
  holdTime: '',
  broker: ''
})

// Helper methods for multi-select dropdowns
function getSelectedStrategyText() {
  if (filters.value.strategies.length === 0) return 'All Strategies'
  if (filters.value.strategies.length === 1) {
    const strategy = strategyOptions.find(s => s.value === filters.value.strategies[0])
    return strategy ? strategy.label : 'All Strategies'
  }
  return `${filters.value.strategies.length} strategies selected`
}

function getSelectedSectorText() {
  if (filters.value.sectors.length === 0) return loadingSectors.value ? 'Loading sectors...' : 'All Sectors'
  if (filters.value.sectors.length === 1) return filters.value.sectors[0]
  return `${filters.value.sectors.length} sectors selected`
}

function toggleAllStrategies(event) {
  if (event.target.checked) {
    filters.value.strategies = []
  }
}

function toggleAllSectors(event) {
  if (event.target.checked) {
    filters.value.sectors = []
  }
}

// Count active filters
const activeFiltersCount = computed(() => {
  let count = 0
  if (filters.value.symbol) count++
  if (filters.value.startDate) count++
  if (filters.value.endDate) count++
  if (filters.value.strategies.length > 0) count++
  if (filters.value.sectors.length > 0) count++
  if (filters.value.hasNews) count++
  if (filters.value.side) count++
  if (filters.value.minPrice !== null) count++
  if (filters.value.maxPrice !== null) count++
  if (filters.value.minQuantity !== null) count++
  if (filters.value.maxQuantity !== null) count++
  if (filters.value.status) count++
  if (filters.value.minPnl !== null) count++
  if (filters.value.maxPnl !== null) count++
  if (filters.value.pnlType) count++
  if (filters.value.holdTime) count++
  if (filters.value.broker) count++
  return count
})

// Count active advanced filters only
const activeAdvancedCount = computed(() => {
  let count = 0
  if (filters.value.side) count++
  if (filters.value.minPrice !== null) count++
  if (filters.value.maxPrice !== null) count++
  if (filters.value.minQuantity !== null) count++
  if (filters.value.maxQuantity !== null) count++
  if (filters.value.status) count++
  if (filters.value.minPnl !== null) count++
  if (filters.value.maxPnl !== null) count++
  if (filters.value.pnlType) count++
  if (filters.value.holdTime) count++
  if (filters.value.broker) count++
  return count
})

function applyFilters() {
  // Clean up the filters before sending
  const cleanFilters = {}
  
  // Basic filters
  if (filters.value.symbol) cleanFilters.symbol = filters.value.symbol
  if (filters.value.startDate) cleanFilters.startDate = filters.value.startDate
  if (filters.value.endDate) cleanFilters.endDate = filters.value.endDate
  
  // Handle multi-select strategies - convert to comma-separated or use first one for backward compatibility
  if (filters.value.strategies.length > 0) {
    cleanFilters.strategies = filters.value.strategies.join(',')
  }
  
  // Handle multi-select sectors - convert to comma-separated or use first one for backward compatibility  
  if (filters.value.sectors.length > 0) {
    cleanFilters.sectors = filters.value.sectors.join(',')
  }
  
  if (filters.value.hasNews) cleanFilters.hasNews = filters.value.hasNews
  
  console.log('🎯 APPLYING FILTERS:', cleanFilters)
  
  // Advanced filters
  if (filters.value.side) cleanFilters.side = filters.value.side
  if (filters.value.minPrice !== null && filters.value.minPrice !== '') cleanFilters.minPrice = filters.value.minPrice
  if (filters.value.maxPrice !== null && filters.value.maxPrice !== '') cleanFilters.maxPrice = filters.value.maxPrice
  if (filters.value.minQuantity !== null && filters.value.minQuantity !== '') cleanFilters.minQuantity = filters.value.minQuantity
  if (filters.value.maxQuantity !== null && filters.value.maxQuantity !== '') cleanFilters.maxQuantity = filters.value.maxQuantity
  if (filters.value.status) cleanFilters.status = filters.value.status
  if (filters.value.minPnl !== null && filters.value.minPnl !== '') cleanFilters.minPnl = filters.value.minPnl
  if (filters.value.maxPnl !== null && filters.value.maxPnl !== '') cleanFilters.maxPnl = filters.value.maxPnl
  if (filters.value.pnlType) cleanFilters.pnlType = filters.value.pnlType
  if (filters.value.holdTime) cleanFilters.holdTime = filters.value.holdTime
  if (filters.value.broker) cleanFilters.broker = filters.value.broker
  
  emit('filter', cleanFilters)
}

function resetFilters() {
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategy: '',
    strategies: [],
    sector: '',
    sectors: [],
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    broker: ''
  }
  // Emit empty filters to trigger immediate refresh
  emit('filter', {})
}

async function fetchAvailableSectors() {
  try {
    loadingSectors.value = true
    const response = await api.get('/analytics/sectors/available')
    availableSectors.value = response.data.sectors || []
  } catch (error) {
    console.warn('Failed to fetch available sectors:', error)
    availableSectors.value = []
  } finally {
    loadingSectors.value = false
  }
}

// Convert minHoldTime/maxHoldTime to holdTime range option
const convertHoldTimeRange = (minMinutes, maxMinutes) => {
  // Handle specific strategy ranges first (more inclusive approach)
  if (maxMinutes <= 15) return '5-15 min' // Scalper: trades under 15 minutes
  if (maxMinutes <= 240) return '2-4 hours' // Momentum: up to 4 hours (more inclusive)
  if (maxMinutes <= 480) return '4-24 hours' // Mean reversion: up to 8 hours (more inclusive) 
  if (minMinutes >= 1440) return '1-7 days' // Swing: over 1 day
  
  // Fallback to exact mapping for edge cases
  if (maxMinutes < 1) return '< 1 min'
  if (maxMinutes <= 5) return '1-5 min'
  if (maxMinutes <= 30) return '15-30 min'
  if (maxMinutes <= 60) return '30-60 min'
  if (maxMinutes <= 120) return '1-2 hours'
  if (maxMinutes <= 1440) return '4-24 hours'
  if (maxMinutes <= 10080) return '1-7 days'
  if (maxMinutes <= 40320) return '1-4 weeks'
  
  return '1+ months' // Default for very long trades
}

// Close dropdowns when clicking outside
function handleClickOutside(event) {
  // Use refs instead of querySelector for better performance and reliability
  const target = event.target
  
  // Check if click is outside strategy dropdown
  if (showStrategyDropdown.value) {
    const strategyDropdown = target.closest('[data-dropdown="strategy"]')
    if (!strategyDropdown) {
      showStrategyDropdown.value = false
    }
  }
  
  // Check if click is outside sector dropdown  
  if (showSectorDropdown.value) {
    const sectorDropdown = target.closest('[data-dropdown="sector"]')
    if (!sectorDropdown) {
      showSectorDropdown.value = false
    }
  }
}

onMounted(() => {
  // Add click outside listener after a small delay to avoid conflicts
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside)
  }, 100)
  
  // Existing code...
  // Fetch available sectors for dropdown
  fetchAvailableSectors()
  
  // Initialize filters from query parameters if present
  let shouldApply = false
  
  // First clear all filters to start fresh
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategy: '',
    strategies: [],
    sector: '',
    sectors: [],
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    broker: ''
  }
  
  // Then set only the filters from query parameters
  if (route.query.symbol) {
    filters.value.symbol = route.query.symbol
    shouldApply = true
  }
  
  if (route.query.sector) {
    filters.value.sector = route.query.sector
    shouldApply = true
  }
  
  if (route.query.status) {
    filters.value.status = route.query.status
    shouldApply = true
  }
  
  if (route.query.startDate) {
    filters.value.startDate = route.query.startDate
    shouldApply = true
  }
  
  if (route.query.endDate) {
    filters.value.endDate = route.query.endDate
    shouldApply = true
  }
  
  if (route.query.pnlType) {
    filters.value.pnlType = route.query.pnlType
    shouldApply = true
  }
  
  if (route.query.minPrice) {
    filters.value.minPrice = parseFloat(route.query.minPrice)
    shouldApply = true
  }
  
  if (route.query.maxPrice) {
    filters.value.maxPrice = parseFloat(route.query.maxPrice)
    shouldApply = true
  }
  
  if (route.query.minQuantity) {
    filters.value.minQuantity = parseInt(route.query.minQuantity)
    shouldApply = true
  }
  
  if (route.query.maxQuantity) {
    filters.value.maxQuantity = parseInt(route.query.maxQuantity)
    shouldApply = true
  }
  
  if (route.query.holdTime) {
    filters.value.holdTime = route.query.holdTime
    shouldApply = true
  }
  
  if (route.query.broker) {
    filters.value.broker = route.query.broker
    shouldApply = true
  }
  
  // Handle strategy from query parameters 
  if (route.query.strategy) {
    filters.value.strategy = route.query.strategy
    // Also populate the strategies array for consistency
    filters.value.strategies = [route.query.strategy]
    shouldApply = true
  }
  
  // Handle multi-select strategies from query parameters
  if (route.query.strategies) {
    filters.value.strategies = route.query.strategies.split(',')
    shouldApply = true
  }
  
  // Handle multi-select sectors from query parameters
  if (route.query.sectors) {
    filters.value.sectors = route.query.sectors.split(',')
    shouldApply = true
  }
  
  // Convert minHoldTime/maxHoldTime to holdTime range
  if (route.query.minHoldTime || route.query.maxHoldTime) {
    const minTime = parseInt(route.query.minHoldTime) || 0
    const maxTime = parseInt(route.query.maxHoldTime) || Infinity
    const holdTimeRange = convertHoldTimeRange(minTime, maxTime)
    
    if (holdTimeRange) {
      filters.value.holdTime = holdTimeRange
      shouldApply = true
    }
  }
  
  // Auto-expand advanced filters if any advanced filter is set
  if (route.query.minPrice || route.query.maxPrice || route.query.minQuantity || route.query.maxQuantity || route.query.holdTime || route.query.broker || route.query.minHoldTime || route.query.maxHoldTime) {
    showAdvanced.value = true
  }
  
  // Auto-apply the filter when coming from dashboard/other pages
  if (shouldApply) {
    applyFilters()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>