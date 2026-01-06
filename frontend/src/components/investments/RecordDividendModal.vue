<template>
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Record Dividend</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Track dividend income for this holding</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
        <!-- Amount -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Total Amount Received
          </label>
          <div class="relative">
            <span class="absolute left-3 top-2 text-gray-500">$</span>
            <input
              v-model.number="form.amount"
              type="number"
              required
              step="0.01"
              min="0.01"
              placeholder="e.g., 125.00"
              class="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <!-- Per Share (calculated) -->
        <div v-if="perShare">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Per Share (calculated)
          </label>
          <div class="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-700 dark:text-gray-300">
            {{ formatCurrency(perShare) }} / share
          </div>
        </div>

        <!-- Payment Date -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Payment Date
          </label>
          <input
            v-model="form.paymentDate"
            type="date"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- Dividend Type -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Dividend Type
          </label>
          <select
            v-model="form.dividendType"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="regular">Regular Dividend</option>
            <option value="special">Special Dividend</option>
            <option value="qualified">Qualified Dividend</option>
            <option value="return_of_capital">Return of Capital</option>
          </select>
        </div>

        <!-- Notes (optional) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes (optional)
          </label>
          <input
            v-model="form.notes"
            type="text"
            placeholder="e.g., Q4 2025 dividend"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
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
            {{ loading ? 'Recording...' : 'Record Dividend' }}
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
  },
  shares: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'created'])

const investmentsStore = useInvestmentsStore()

const form = ref({
  amount: null,
  paymentDate: format(new Date(), 'yyyy-MM-dd'),
  dividendType: 'regular',
  notes: ''
})

const loading = ref(false)
const error = ref(null)

const perShare = computed(() => {
  if (!form.value.amount || !props.shares || props.shares <= 0) return null
  return form.value.amount / props.shares
})

const isValid = computed(() => {
  return (
    form.value.amount > 0 &&
    form.value.paymentDate
  )
})

async function handleSubmit() {
  if (!isValid.value) return

  loading.value = true
  error.value = null

  try {
    await investmentsStore.recordDividend(props.holdingId, {
      amount: form.value.amount,
      perShare: perShare.value,
      paymentDate: form.value.paymentDate,
      dividendType: form.value.dividendType,
      notes: form.value.notes || null
    })

    emit('created')
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to record dividend'
  } finally {
    loading.value = false
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4
  }).format(value)
}
</script>
