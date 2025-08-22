<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div
        class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        @click="$emit('close')"
      ></div>

      <!-- Modal -->
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        <form @submit.prevent="saveMapping">
          <!-- Header -->
          <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="w-full">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  {{ isEditing ? 'Edit CUSIP Mapping' : 'Add CUSIP Mapping' }}
                </h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {{ isEditing ? 'Update the mapping for this CUSIP.' : 'Create a new CUSIP to ticker symbol mapping.' }}
                </p>

                <div class="mt-6 space-y-4">
                  <!-- CUSIP Input -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      CUSIP <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="form.cusip"
                      :disabled="isEditing"
                      type="text"
                      maxlength="9"
                      placeholder="e.g., 123456789"
                      class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white font-mono disabled:bg-gray-100 dark:disabled:bg-gray-600"
                      @input="validateCusip"
                    />
                    <p v-if="errors.cusip" class="mt-1 text-sm text-red-600 dark:text-red-400">
                      {{ errors.cusip }}
                    </p>
                    <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      9-character identifier (8 alphanumeric + 1 check digit)
                    </p>
                  </div>

                  <!-- Ticker Input -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ticker Symbol <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="form.ticker"
                      type="text"
                      placeholder="e.g., AAPL"
                      class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white uppercase"
                      @input="validateTicker"
                    />
                    <p v-if="errors.ticker" class="mt-1 text-sm text-red-600 dark:text-red-400">
                      {{ errors.ticker }}
                    </p>
                  </div>

                  <!-- Company Name Input -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Company Name (Optional)
                    </label>
                    <input
                      v-model="form.company_name"
                      type="text"
                      placeholder="e.g., Apple Inc."
                      class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <!-- Verified Checkbox -->
                  <div class="flex items-center">
                    <input
                      v-model="form.verified"
                      type="checkbox"
                      id="verified"
                      class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label for="verified" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Mark as verified (confirmed to be correct)
                    </label>
                  </div>

                  <!-- Impact Warning -->
                  <div v-if="expectedTradeUpdates > 0" class="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
                    <div class="flex">
                      <InformationCircleIcon class="h-5 w-5 text-blue-400" />
                      <div class="ml-3">
                        <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Trade Updates
                        </h3>
                        <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
                          This mapping will update {{ expectedTradeUpdates }} existing trade{{ expectedTradeUpdates !== 1 ? 's' : '' }} 
                          that currently use the CUSIP {{ form.cusip }}.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="submit"
              :disabled="!isFormValid || saving"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="saving" class="flex items-center">
                <div class="animate-spin rounded-full h-4 w-4 border-b border-white mr-2"></div>
                Saving...
              </span>
              <span v-else>{{ isEditing ? 'Update' : 'Create' }} Mapping</span>
            </button>
            <button
              type="button"
              @click="$emit('close')"
              :disabled="saving"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { InformationCircleIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  mapping: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const authStore = useAuthStore()

// Component state
const form = ref({
  cusip: '',
  ticker: '',
  company_name: '',
  verified: false
})

const errors = ref({})
const saving = ref(false)
const expectedTradeUpdates = ref(0)

// Computed
const isEditing = computed(() => !!props.mapping)
const isFormValid = computed(() => {
  return form.value.cusip && 
         form.value.ticker && 
         !errors.value.cusip && 
         !errors.value.ticker
})

// Methods
const validateCusip = () => {
  const cusip = form.value.cusip.toUpperCase()
  form.value.cusip = cusip
  
  errors.value.cusip = ''
  
  if (!cusip) {
    errors.value.cusip = 'CUSIP is required'
  } else if (!/^[A-Z0-9]{8}[0-9]$/.test(cusip)) {
    errors.value.cusip = 'CUSIP must be 9 characters (8 alphanumeric + 1 digit)'
  }
  
  // Check expected trade updates if CUSIP is valid
  if (!errors.value.cusip && cusip.length === 9) {
    checkTradeImpact(cusip)
  }
}

const validateTicker = () => {
  const ticker = form.value.ticker.toUpperCase()
  form.value.ticker = ticker
  
  errors.value.ticker = ''
  
  if (!ticker) {
    errors.value.ticker = 'Ticker is required'
  } else if (!/^[A-Z]{1,10}(\.[A-Z]{1,3})?$/.test(ticker)) {
    errors.value.ticker = 'Invalid ticker format'
  }
}

const checkTradeImpact = async (cusip) => {
  try {
    const response = await fetch(`/api/trades?symbol=${cusip}&limit=1`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      expectedTradeUpdates.value = data.pagination?.total || 0
    }
  } catch (error) {
    console.error('Error checking trade impact:', error)
  }
}

const saveMapping = async () => {
  try {
    saving.value = true
    
    const response = await fetch('/api/cusip-mappings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        cusip: form.value.cusip,
        ticker: form.value.ticker,
        company_name: form.value.company_name || null,
        verified: form.value.verified
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      emit('saved', result)
    } else {
      const error = await response.json()
      console.error('Failed to save mapping:', error)
      // You could show a toast notification here
    }
  } catch (error) {
    console.error('Error saving mapping:', error)
  } finally {
    saving.value = false
  }
}

// Watchers
watch(() => props.mapping, (newMapping) => {
  if (newMapping) {
    form.value = {
      cusip: newMapping.cusip || '',
      ticker: newMapping.ticker || '',
      company_name: newMapping.company_name || '',
      verified: newMapping.verified || false
    }
    
    if (newMapping.cusip) {
      checkTradeImpact(newMapping.cusip)
    }
  } else {
    // Reset form for new mapping
    form.value = {
      cusip: '',
      ticker: '',
      company_name: '',
      verified: false
    }
    expectedTradeUpdates.value = 0
  }
  
  errors.value = {}
}, { immediate: true })

// Focus CUSIP input when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && !isEditing.value) {
    // Focus the first input after the modal is rendered
    setTimeout(() => {
      const cusipInput = document.querySelector('input[maxlength="9"]')
      if (cusipInput) {
        cusipInput.focus()
      }
    }, 100)
  }
})
</script>