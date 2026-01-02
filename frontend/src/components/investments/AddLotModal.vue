<template>
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Add Shares</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Record a new purchase lot</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
        <!-- Shares -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Number of Shares
          </label>
          <input
            v-model.number="form.shares"
            type="number"
            required
            step="any"
            min="0.000001"
            placeholder="e.g., 100"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- Cost Per Share -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cost Per Share
          </label>
          <div class="relative">
            <span class="absolute left-3 top-2 text-gray-500">$</span>
            <input
              v-model.number="form.costPerShare"
              type="number"
              required
              step="0.0001"
              min="0.0001"
              placeholder="e.g., 150.00"
              class="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <!-- Purchase Date -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Purchase Date
          </label>
          <input
            v-model="form.purchaseDate"
            type="date"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- Notes (optional) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes (optional)
          </label>
          <input
            v-model="form.notes"
            type="text"
            placeholder="e.g., Bought on dip"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- Total Cost Display -->
        <div v-if="totalCost" class="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
          <div class="flex justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400">Total Cost</span>
            <span class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(totalCost) }}</span>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- Actions -->
        <div class="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            @click="$emit('close')"
            class="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="loading || !isValid"
            class="btn-primary"
          >
            {{ loading ? 'Adding...' : 'Add Lot' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useInvestmentsStore } from '@/stores/investments'
import { format } from 'date-fns'

const props = defineProps({
  holdingId: {
    type: [Number, String],
    required: true
  }
})

const emit = defineEmits(['close', 'created'])

const investmentsStore = useInvestmentsStore()

const form = ref({
  shares: null,
  costPerShare: null,
  purchaseDate: format(new Date(), 'yyyy-MM-dd'),
  notes: ''
})

const loading = ref(false)
const error = ref(null)

const totalCost = computed(() => {
  if (!form.value.shares || !form.value.costPerShare) return null
  return form.value.shares * form.value.costPerShare
})

const isValid = computed(() => {
  return (
    form.value.shares > 0 &&
    form.value.costPerShare > 0 &&
    form.value.purchaseDate
  )
})

async function handleSubmit() {
  if (!isValid.value) return

  loading.value = true
  error.value = null

  try {
    await investmentsStore.addLot(props.holdingId, {
      shares: form.value.shares,
      costPerShare: form.value.costPerShare,
      purchaseDate: form.value.purchaseDate,
      notes: form.value.notes || null
    })

    emit('created')
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to add lot'
  } finally {
    loading.value = false
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}
</script>
