<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="close"></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                Auto-Close Expired Options
              </h3>
              <div class="mt-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ expiredOptions.length }} expired option{{ expiredOptions.length !== 1 ? 's' : '' }} found that {{ expiredOptions.length !== 1 ? 'are' : 'is' }} still marked as open.
                </p>

                <!-- Loading state -->
                <div v-if="loading" class="flex justify-center py-12">
                  <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>

                <!-- Table of expired options -->
                <div v-else-if="expiredOptions.length > 0" class="mt-4 overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead>
                      <tr>
                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symbol</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                        <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Strike</th>
                        <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Quantity</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expired</th>
                        <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entry Price</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr v-for="option in expiredOptions" :key="option.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                          <div class="max-w-[200px] truncate" :title="option.symbol">
                            {{ option.symbol }}
                          </div>
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                          <span class="px-2 py-1 text-xs rounded" :class="[
                            option.option_type === 'call'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          ]">
                            {{ option.option_type?.toUpperCase() }}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                          ${{ option.strike_price }}
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                          {{ option.quantity }}
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                          {{ formatDate(option.expiration_date) }}
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                          ${{ formatCurrency(option.entry_price) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <p class="text-sm text-yellow-800 dark:text-yellow-400">
                      <strong>Note:</strong> Auto-closing will set exit_price to $0 (expired worthless), calculate the full loss, and mark trades as "auto-closed" for your records.
                    </p>
                  </div>
                </div>

                <!-- No expired options -->
                <div v-else class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                  <p class="text-sm text-green-800 dark:text-green-400">
                    No expired options found. All your option positions are up to date!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer buttons -->
        <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            v-if="expiredOptions.length > 0"
            @click="autoClose"
            :disabled="processing"
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="processing">Processing...</span>
            <span v-else>Close {{ expiredOptions.length }} Option{{ expiredOptions.length !== 1 ? 's' : '' }}</span>
          </button>
          <button
            @click="close"
            :disabled="processing"
            type="button"
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { format } from 'date-fns'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'success'])

const { showSuccessModal, showCriticalError } = useNotification()

const loading = ref(false)
const processing = ref(false)
const expiredOptions = ref([])

function formatDate(dateStr) {
  return format(new Date(dateStr), 'MMM dd, yyyy')
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0.00'
  return Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

async function fetchExpiredOptions() {
  loading.value = true
  try {
    const response = await api.get('/trades/expired-options')
    expiredOptions.value = response.data.expiredOptions || []
  } catch (error) {
    console.error('Error fetching expired options:', error)
    showCriticalError('Error', 'Failed to fetch expired options')
  } finally {
    loading.value = false
  }
}

async function autoClose() {
  processing.value = true
  try {
    const response = await api.post('/trades/expired-options/auto-close', {
      dryRun: false
    })

    showSuccessModal(
      'Options Closed',
      `Successfully auto-closed ${response.data.closedCount} expired option${response.data.closedCount !== 1 ? 's' : ''}. These have been marked as "auto-closed" in your records.`
    )

    emit('success')
    close()
  } catch (error) {
    console.error('Error auto-closing expired options:', error)
    showCriticalError(
      'Auto-Close Failed',
      error.response?.data?.error || 'Failed to auto-close expired options'
    )
  } finally {
    processing.value = false
  }
}

function close() {
  if (!processing.value) {
    emit('close')
  }
}

// Fetch expired options when modal opens
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    fetchExpiredOptions()
  }
})
</script>
