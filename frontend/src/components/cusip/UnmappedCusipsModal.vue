<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center ">
      <!-- Background overlay -->
      <div
        class="modal-backdrop"
        @click="$emit('close')"
      ></div>

      <!-- Modal -->
      <div role="dialog" aria-modal="true" class="modal-panel w-full p-6 max-w-4xl">
        <!-- Header -->
        <div class="px-4 pt-5 pb-4 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="modal-title">
                Unmapped CUSIPs
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                These CUSIPs appear in your trades but don't have ticker symbol mappings yet.
              </p>
            </div>
            <button
              @click="$emit('close')"
              class="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="px-4 pb-4 sm:px-6 sm:pb-6">
          <!-- Empty State -->
          <div v-if="unmappedCusips.length === 0" class="text-center py-8">
            <CheckCircleIcon class="h-16 w-16 text-green-700 dark:text-green-400 mx-auto mb-4" />
            <h3 class="heading-card mb-2">
              All CUSIPs Mapped!
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
              All CUSIPs in your trades have been successfully mapped to ticker symbols.
            </p>
          </div>

          <!-- Unmapped CUSIPs List -->
          <div v-else>
            <div class="callout-warning mb-6">
              <div class="flex items-start justify-between">
                <div class="flex">
                  <ExclamationTriangleIcon class="h-5 w-5 text-yellow-400" />
                  <div class="ml-3">
                    <h3 class="heading-sub text-yellow-800 dark:text-yellow-200">
                      {{ unmappedCusips.length }} Unmapped CUSIP{{ unmappedCusips.length !== 1 ? 's' : '' }}
                    </h3>
                    <p class="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                      Create mappings for these CUSIPs to make your trades searchable by ticker symbol.
                    </p>
                  </div>
                </div>
                <button
                  @click="autoRemapAll"
                  :disabled="remapping"
                  class="btn-primary ml-3 flex-shrink-0"
                >
                  <span v-if="remapping" class="flex items-center">
                    <div class="spinner h-3 w-3 spinner-light mr-1"></div>
                    Remapping...
                  </span>
                  <span v-else>Auto Remap All</span>
                </button>
              </div>
            </div>

            <div class="space-y-4 max-h-96 overflow-y-auto">
              <div
                v-for="cusip in unmappedCusips"
                :key="cusip.cusip"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center space-x-3">
                      <code class="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {{ cusip.cusip }}
                      </code>
                      <span class="text-sm text-gray-600 dark:text-gray-400">
                        {{ cusip.trade_count }} trade{{ cusip.trade_count !== 1 ? 's' : '' }}
                      </span>
                      <span class="text-xs text-gray-500 dark:text-gray-500">
                        {{ formatDateRange(cusip.first_trade_date, cusip.last_trade_date) }}
                      </span>
                    </div>
                    
                    <div class="mt-2 flex items-center space-x-2">
                      <span
                        v-for="side in cusip.trade_sides"
                        :key="side"
                        class="badge"
                        :class="side === 'buy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'"
                      >
                        {{ side.toUpperCase() }}
                      </span>
                    </div>

                    <!-- Quick mapping form -->
                    <div v-if="mappingCusip === cusip.cusip" class="mt-3 space-y-3">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Ticker Symbol
                          </label>
                          <input
                            v-model="quickMapping.ticker"
                            type="text"
                            placeholder="e.g., AAPL"
                            class="input uppercase"
                          />
                        </div>
                        <div>
                          <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Company Name (Optional)
                          </label>
                          <input
                            v-model="quickMapping.company_name"
                            type="text"
                            placeholder="e.g., Apple Inc."
                            class="input"
                          />
                        </div>
                      </div>
                      
                      <div class="flex items-center justify-between">
                        <div class="flex items-center">
                          <input
                            v-model="quickMapping.verified"
                            type="checkbox"
                            id="quick-verified"
                            class="checkbox"
                          />
                          <label for="quick-verified" class="ml-2 block text-xs text-gray-700 dark:text-gray-300">
                            Mark as verified
                          </label>
                        </div>
                        
                        <div class="flex items-center space-x-2">
                          <button
                            @click="cancelQuickMapping"
                            class="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            @click="saveQuickMapping"
                            :disabled="!quickMapping.ticker || savingMapping"
                            class="btn-primary btn-sm"
                          >
                            <span v-if="savingMapping" class="flex items-center">
                              <div class="spinner h-3 w-3 spinner-light mr-1"></div>
                              Saving...
                            </span>
                            <span v-else>Save</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="mappingCusip !== cusip.cusip" class="ml-4">
                    <button
                      @click="startQuickMapping(cusip)"
                      class="btn-link"
                    >
                      Map Ticker
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            @click="$emit('close')"
            class="btn-secondary w-full sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  unmappedCusips: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['close', 'mappingCreated', 'resolutionStarted'])

const authStore = useAuthStore()
const { showImportantWarning, showCriticalError } = useNotification()

// Component state
const mappingCusip = ref(null)
const quickMapping = ref({
  ticker: '',
  company_name: '',
  verified: false
})
const savingMapping = ref(false)
const remapping = ref(false)

// Methods
const startQuickMapping = (cusip) => {
  mappingCusip.value = cusip.cusip
  quickMapping.value = {
    ticker: '',
    company_name: '',
    verified: false
  }
}

const cancelQuickMapping = () => {
  mappingCusip.value = null
  quickMapping.value = {
    ticker: '',
    company_name: '',
    verified: false
  }
}

const autoRemapAll = async () => {
  try {
    remapping.value = true
    
    const response = await fetch('/api/trades/cusip/resolve-unresolved', {
      method: 'POST',
    })
    
    if (response.ok) {
      const result = await response.json()
      const total = result.total || 0
      
      showImportantWarning('CUSIP Resolution Started', `Processing ${total} CUSIPs in background. This may take a few minutes.`)
      
      emit('resolutionStarted', { total })
      emit('mappingCreated')
    } else {
      const error = await response.json()
      console.error('Failed to auto remap:', error)
      showCriticalError('Auto Remap Failed', 'Failed to auto remap CUSIPs. Please try again.')
    }
  } catch (error) {
    console.error('Error auto remapping:', error)
    showCriticalError('Auto Remap Failed', 'Failed to auto remap CUSIPs. Please try again.')
  } finally {
    remapping.value = false
  }
}

const saveQuickMapping = async () => {
  if (!quickMapping.value.ticker || !mappingCusip.value) return
  
  try {
    savingMapping.value = true
    
    const response = await fetch('/api/cusip-mappings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cusip: mappingCusip.value,
        ticker: quickMapping.value.ticker,
        company_name: quickMapping.value.company_name || null,
        verified: quickMapping.value.verified
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      emit('mappingCreated', result)
      cancelQuickMapping()
    } else {
      const error = await response.json()
      console.error('Failed to save mapping:', error)
    }
  } catch (error) {
    console.error('Error saving mapping:', error)
  } finally {
    savingMapping.value = false
  }
}

const formatDateRange = (firstDate, lastDate) => {
  const first = new Date(firstDate).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: firstDate.includes(new Date().getFullYear().toString()) ? undefined : 'numeric'
  })
  
  if (firstDate === lastDate) {
    return first
  }
  
  const last = new Date(lastDate).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: lastDate.includes(new Date().getFullYear().toString()) ? undefined : 'numeric'
  })
  
  return `${first} - ${last}`
}

// Reset state when modal closes
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    cancelQuickMapping()
  }
})
</script>
