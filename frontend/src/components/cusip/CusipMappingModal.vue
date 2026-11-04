<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center ">
      <!-- Background overlay -->
      <div
        class="modal-backdrop"
        @click="$emit('close')"
      ></div>

      <!-- Modal -->
      <div role="dialog" aria-modal="true" class="modal-panel w-full p-6 max-w-lg">
        <form @submit.prevent="saveMapping">
          <!-- Header -->
          <div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="w-full">
                <h3 class="modal-title">
                  {{ isEditing ? 'Edit CUSIP Mapping' : 'Add CUSIP Mapping' }}
                </h3>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {{ isEditing ? 'Update the mapping for this CUSIP.' : 'Create a new CUSIP to ticker symbol mapping.' }}
                </p>

                <div class="mt-6 space-y-4">
                  <!-- CUSIP Input -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      CUSIP <span class="text-red-600 dark:text-red-400">*</span>
                    </label>
                    <input
                      v-model="form.cusip"
                      :disabled="isEditing"
                      type="text"
                      maxlength="9"
                      placeholder="e.g., 123456789"
                      class="input mt-1 block font-mono disabled:bg-gray-100 dark:disabled:bg-gray-600"
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
                      Ticker Symbol <span class="text-red-600 dark:text-red-400">*</span>
                    </label>
                    <input
                      v-model="form.ticker"
                      type="text"
                      placeholder="e.g., AAPL"
                      class="input mt-1 block uppercase"
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
                      class="input mt-1 block"
                    />
                  </div>

                  <!-- Verified Checkbox -->
                  <div class="flex items-center">
                    <input
                      v-model="form.verified"
                      type="checkbox"
                      id="verified"
                      class="checkbox"
                    />
                    <label for="verified" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Mark as verified (confirmed to be correct)
                    </label>
                  </div>

                  <!-- Impact Warning -->
                  <div v-if="expectedTradeUpdates > 0" class="rounded-md bg-primary-50 dark:bg-primary-900/20 p-4">
                    <div class="flex">
                      <InformationCircleIcon class="h-5 w-5 text-primary-400" />
                      <div class="ml-3">
                        <h3 class="heading-sub text-primary-800 dark:text-primary-200">
                          Trade Updates
                        </h3>
                        <p class="mt-1 text-sm text-primary-700 dark:text-primary-300">
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
              class="btn-primary w-full sm:ml-3 sm:w-auto"
            >
              <span v-if="saving" class="flex items-center">
                <div class="spinner h-4 w-4 spinner-light mr-2"></div>
                Saving...
              </span>
              <span v-else>{{ isEditing ? 'Update' : 'Create' }} Mapping</span>
            </button>
            <button
              type="button"
              @click="$emit('close')"
              :disabled="saving"
              class="btn-secondary mt-3 w-full sm:mt-0 sm:ml-3 sm:w-auto"
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
    const response = await fetch(`/api/trades?symbol=${cusip}&limit=1`)
    
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
        'Content-Type': 'application/json'
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
