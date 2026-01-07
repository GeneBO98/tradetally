<template>
  <div v-if="valuations.length > 0" class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
    <h3 class="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">Saved Valuations</h3>

    <div class="space-y-3">
      <div
        v-for="valuation in valuations"
        :key="valuation.id"
        class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
      >
        <div class="flex-1">
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(valuation.valuation_date) }}
            </span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">
              @ {{ formatCurrency(valuation.current_price) }}
            </span>
          </div>
          <div class="mt-1 flex items-center gap-4 text-sm">
            <span class="text-red-600 dark:text-red-400">
              Low: {{ formatCurrency(valuation.fair_value_low) }}
            </span>
            <span class="text-yellow-600 dark:text-yellow-400">
              Med: {{ formatCurrency(valuation.fair_value_medium) }}
            </span>
            <span class="text-green-600 dark:text-green-400">
              High: {{ formatCurrency(valuation.fair_value_high) }}
            </span>
          </div>
          <p v-if="valuation.notes" class="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ valuation.notes }}
          </p>
        </div>
        <div class="flex items-center gap-2 ml-4">
          <button
            @click="$emit('load', valuation)"
            class="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors"
          >
            Load
          </button>
          <button
            @click="confirmDelete(valuation)"
            class="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useNotification } from '@/composables/useNotification'

defineProps({
  valuations: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['load', 'delete'])

const { showDangerConfirmation } = useNotification()

function confirmDelete(valuation) {
  showDangerConfirmation(
    'Delete Valuation',
    `Are you sure you want to delete the valuation from ${formatDate(valuation.valuation_date)}?`,
    () => {
      emit('delete', valuation.id)
    }
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}
</script>
