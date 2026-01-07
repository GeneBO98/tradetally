<template>
  <div
    :class="[
      'rounded-lg border p-4',
      colorClasses
    ]"
  >
    <div class="text-center">
      <p class="text-sm font-medium uppercase tracking-wide" :class="labelClass">
        {{ scenario }}
      </p>
      <p class="text-2xl font-bold mt-2" :class="valueClass">
        {{ formatCurrency(fairValue) }}
      </p>
      <p
        v-if="marginOfSafety !== null"
        class="text-sm mt-2 font-medium"
        :class="mosClass"
      >
        {{ marginOfSafety >= 0 ? '+' : '' }}{{ formatPercent(marginOfSafety) }} MoS
      </p>
      <p class="text-xs mt-1" :class="statusClass">
        {{ statusText }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  scenario: {
    type: String,
    required: true,
    validator: (v) => ['Bear', 'Base', 'Bull'].includes(v)
  },
  fairValue: {
    type: Number,
    default: null
  },
  currentPrice: {
    type: Number,
    default: null
  },
  marginOfSafety: {
    type: Number,
    default: null
  }
})

const colorClasses = computed(() => {
  // Color based on whether current price is above or below fair value
  // Green = undervalued (current price <= fair value)
  // Red = overvalued (current price > fair value)
  if (props.currentPrice !== null && props.currentPrice !== undefined && 
      props.fairValue !== null && props.fairValue !== undefined) {
    if (props.currentPrice <= props.fairValue) {
      // Current price is at or below fair value = undervalued = GREEN
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    } else {
      // Current price is above fair value = overvalued = RED
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    }
  }
  // Default gray if no price/fair value data
  return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
})

const labelClass = computed(() => {
  // Label color based on valuation status
  if (props.currentPrice !== null && props.currentPrice !== undefined && 
      props.fairValue !== null && props.fairValue !== undefined) {
    if (props.currentPrice <= props.fairValue) {
      return 'text-green-600 dark:text-green-400'
    } else {
      return 'text-red-600 dark:text-red-400'
    }
  }
  return 'text-gray-600 dark:text-gray-400'
})

const valueClass = computed(() => {
  // Value color based on valuation status
  if (props.currentPrice !== null && props.currentPrice !== undefined && 
      props.fairValue !== null && props.fairValue !== undefined) {
    if (props.currentPrice <= props.fairValue) {
      return 'text-green-700 dark:text-green-300'
    } else {
      return 'text-red-700 dark:text-red-300'
    }
  }
  return 'text-gray-900 dark:text-white'
})

const mosClass = computed(() => {
  if (props.marginOfSafety === null) return 'text-gray-500'
  if (props.marginOfSafety >= 0.15) return 'text-green-600 dark:text-green-400'
  if (props.marginOfSafety >= 0) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const statusClass = computed(() => {
  return 'text-gray-500 dark:text-gray-400'
})

const statusText = computed(() => {
  if (props.marginOfSafety === null || props.currentPrice === null) return ''
  if (props.marginOfSafety >= 0.15) return '(Undervalued)'
  if (props.marginOfSafety >= 0) return '(Fair Value)'
  return '(Overvalued)'
})

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A'
  return (value * 100).toFixed(1) + '%'
}
</script>
