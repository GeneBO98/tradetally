<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label for="symbol" class="label">Symbol</label>
        <input
          id="symbol"
          v-model="filters.symbol"
          type="text"
          class="input"
          placeholder="e.g., AAPL"
        />
      </div>
      
      <div>
        <label for="startDate" class="label">Start Date</label>
        <input
          id="startDate"
          v-model="filters.startDate"
          type="date"
          class="input"
        />
      </div>
      
      <div>
        <label for="endDate" class="label">End Date</label>
        <input
          id="endDate"
          v-model="filters.endDate"
          type="date"
          class="input"
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
        />
      </div>
    </div>
    
    <div class="flex justify-end space-x-3">
      <button @click="resetFilters" class="btn-secondary">
        Reset
      </button>
      <button @click="applyFilters" class="btn-primary">
        Apply Filters
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['filter'])

const filters = ref({
  symbol: '',
  startDate: '',
  endDate: '',
  strategy: ''
})

function applyFilters() {
  emit('filter', { ...filters.value })
}

function resetFilters() {
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategy: ''
  }
  emit('filter', filters.value)
}
</script>