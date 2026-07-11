<template>
  <div v-if="valuations.length > 0" class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
    <h3 class="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">Saved Valuations</h3>

    <div class="space-y-3">
      <div
        v-for="valuation in valuations"
        :key="valuation.id"
        @click="$emit('load', valuation)"
        :class="[
          'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors',
          loadedId === valuation.id
            ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500'
            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
        ]"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3 flex-wrap">
            <span
              :class="[
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide',
                currentSymbol && valuation.symbol === currentSymbol.toUpperCase()
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              ]"
            >
              {{ valuation.symbol }}
            </span>
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(valuation.valuation_date) }}
            </span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">
              @ {{ formatCurrency(valuation.current_price) }}
            </span>
            <span
              v-if="loadedId === valuation.id"
              class="text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wide"
            >
              Loaded
            </span>
          </div>
          <div class="mt-1 flex items-center gap-4 text-sm">
            <span class="text-red-600 dark:text-red-400">
              Bear: {{ formatCurrency(valuation.fair_value_low) }}
            </span>
            <span class="text-yellow-600 dark:text-yellow-400">
              Base: {{ formatCurrency(valuation.fair_value_medium) }}
            </span>
            <span class="text-green-600 dark:text-green-400">
              Bull: {{ formatCurrency(valuation.fair_value_high) }}
            </span>
          </div>
          <p v-if="valuation.notes" class="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ valuation.notes }}
          </p>
        </div>
        <div class="flex items-center gap-2 ml-4">
          <button
            @click.stop="confirmDelete(valuation)"
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
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

defineProps({
  valuations: {
    type: Array,
    default: () => []
  },
  loadedId: {
    type: [String, Number],
    default: null
  },
  currentSymbol: {
    type: String,
    default: null
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

const { formatCurrency: formatCurrencyBase } = useCurrencyFormatter()

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  return formatCurrencyBase(value)
}
</script>
