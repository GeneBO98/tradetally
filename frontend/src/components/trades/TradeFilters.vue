<template>
  <div class="space-y-4">
    <!-- Basic filters always visible -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <label for="strategy" class="label">Strategy</label>
        <input
          id="strategy"
          v-model="filters.strategy"
          type="text"
          class="input"
          placeholder="e.g., Scalping"
          @keydown.enter="applyFilters"
        />
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

      <!-- P&L Filters -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'

const emit = defineEmits(['filter'])
const route = useRoute()

const showAdvanced = ref(false)

const filters = ref({
  // Basic filters
  symbol: '',
  startDate: '',
  endDate: '',
  strategy: '',
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
  holdTime: ''
})

// Count active filters
const activeFiltersCount = computed(() => {
  let count = 0
  if (filters.value.symbol) count++
  if (filters.value.startDate) count++
  if (filters.value.endDate) count++
  if (filters.value.strategy) count++
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
  return count
})

function applyFilters() {
  // Clean up the filters before sending
  const cleanFilters = {}
  
  // Basic filters
  if (filters.value.symbol) cleanFilters.symbol = filters.value.symbol
  if (filters.value.startDate) cleanFilters.startDate = filters.value.startDate
  if (filters.value.endDate) cleanFilters.endDate = filters.value.endDate
  if (filters.value.strategy) cleanFilters.strategy = filters.value.strategy
  
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
  
  emit('filter', cleanFilters)
}

function resetFilters() {
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategy: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: ''
  }
  // Emit empty filters to trigger immediate refresh
  emit('filter', {})
}

onMounted(() => {
  // Initialize filters from query parameters if present
  let shouldApply = false
  
  // First clear all filters to start fresh
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategy: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: ''
  }
  
  // Then set only the filters from query parameters
  if (route.query.symbol) {
    filters.value.symbol = route.query.symbol
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
  
  // Auto-expand advanced filters if any advanced filter is set
  if (route.query.minPrice || route.query.maxPrice || route.query.minQuantity || route.query.maxQuantity || route.query.holdTime) {
    showAdvanced.value = true
  }
  
  // Auto-apply the filter when coming from dashboard/other pages
  if (shouldApply) {
    applyFilters()
  }
})
</script>