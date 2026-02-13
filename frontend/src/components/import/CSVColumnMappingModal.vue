<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" aria-hidden="true" @click="$emit('close')"></div>

      <!-- Modal panel -->
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full sm:p-6">
        <div class="absolute top-0 right-0 pt-4 pr-4">
          <button
            type="button"
            class="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            @click="$emit('close')"
          >
            <span class="sr-only">Close</span>
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="sm:flex sm:items-start">
          <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900 sm:mx-0 sm:h-10 sm:w-10">
            <ExclamationTriangleIcon class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              CSV Format Not Recognized
            </h3>
            <div class="mt-2">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                We couldn't automatically detect the format of your CSV file. Please map the columns below and save the mapping. Your file will then be imported automatically.
              </p>
            </div>
          </div>
        </div>

        <form @submit.prevent="saveMapping" class="mt-5">
          <div class="space-y-4">
            <!-- Mapping Name -->
            <div>
              <label for="mappingName" class="label">Mapping Name (optional)</label>
              <input
                id="mappingName"
                v-model="mappingForm.mapping_name"
                type="text"
                placeholder="Leave blank for auto-generated name"
                class="input"
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                If left blank, a unique name will be generated automatically
              </p>
            </div>

            <!-- CSV Headers Detected -->
            <div v-if="csvHeaders.length > 0" class="bg-gray-50 dark:bg-gray-900 rounded-md p-3">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Detected {{ csvHeaders.length }} columns:
              </p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="header in csvHeaders"
                  :key="header"
                  class="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-xs rounded text-gray-700 dark:text-gray-300"
                >
                  {{ header }}
                </span>
              </div>
            </div>

            <!-- Required Column Mappings -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="symbolColumn" class="label required">Symbol Column</label>
                <select
                  id="symbolColumn"
                  v-model="mappingForm.symbol_column"
                  required
                  class="input"
                >
                  <option value="">Select column...</option>
                  <option v-for="header in csvHeaders" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>

              <div>
                <label for="sideColumn" class="label">Side/Direction Column</label>
                <select
                  id="sideColumn"
                  v-model="mappingForm.side_column"
                  class="input"
                >
                  <option value="">Not used (infer from quantity)</option>
                  <option v-for="header in csvHeaders" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  If not specified, side will be inferred from quantity (positive = long/buy, negative = short/sell)
                </p>
              </div>

              <div>
                <label for="quantityColumn" class="label required">Quantity Column</label>
                <select
                  id="quantityColumn"
                  v-model="mappingForm.quantity_column"
                  required
                  class="input"
                >
                  <option value="">Select column...</option>
                  <option v-for="header in csvHeaders" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>

              <div>
                <label for="entryPriceColumn" class="label required">Entry/Buy Price Column</label>
                <select
                  id="entryPriceColumn"
                  v-model="mappingForm.entry_price_column"
                  required
                  class="input"
                >
                  <option value="">Select column...</option>
                  <option v-for="header in csvHeaders" :key="header" :value="header">
                    {{ header }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Optional Column Mappings -->
            <details class="border border-gray-200 dark:border-gray-700 rounded-md">
              <summary class="px-4 py-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Optional Column Mappings
              </summary>
              <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label for="exitPriceColumn" class="label">Exit/Sell Price Column</label>
                  <select
                    id="exitPriceColumn"
                    v-model="mappingForm.exit_price_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="entryDateColumn" class="label">Entry/Trade Date Column</label>
                  <select
                    id="entryDateColumn"
                    v-model="mappingForm.entry_date_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="exitDateColumn" class="label">Exit Date Column</label>
                  <select
                    id="exitDateColumn"
                    v-model="mappingForm.exit_date_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="pnlColumn" class="label">P&L Column</label>
                  <select
                    id="pnlColumn"
                    v-model="mappingForm.pnl_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="feesColumn" class="label">Fees/Commission Column</label>
                  <select
                    id="feesColumn"
                    v-model="mappingForm.fees_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="notesColumn" class="label">Notes Column</label>
                  <select
                    id="notesColumn"
                    v-model="mappingForm.notes_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                </div>

                <div>
                  <label for="stopLossColumn" class="label">Stop Loss Column</label>
                  <select
                    id="stopLossColumn"
                    v-model="mappingForm.stop_loss_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Column containing stop loss price values
                  </p>
                </div>

                <div>
                  <label for="takeProfitColumn" class="label">Take Profit Column</label>
                  <select
                    id="takeProfitColumn"
                    v-model="mappingForm.take_profit_column"
                    class="input"
                  >
                    <option value="">Not used</option>
                    <option v-for="header in csvHeaders" :key="header" :value="header">
                      {{ header }}
                    </option>
                  </select>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Column containing take profit price values
                  </p>
                </div>
              </div>
            </details>

            <!-- CSV Settings -->
            <details class="border border-gray-200 dark:border-gray-700 rounded-md">
              <summary class="px-4 py-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                CSV Settings
              </summary>
              <div class="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label for="delimiter" class="label">Delimiter</label>
                  <select
                    id="delimiter"
                    v-model="mappingForm.delimiter"
                    class="input"
                  >
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value="\t">Tab</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>

                <div>
                  <label for="dateFormat" class="label">Date Format</label>
                  <select
                    id="dateFormat"
                    v-model="mappingForm.date_format"
                    class="input"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  </select>
                </div>

                <div class="flex items-center">
                  <input
                    id="hasHeaderRow"
                    v-model="mappingForm.has_header_row"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label for="hasHeaderRow" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    First row contains column headers
                  </label>
                </div>
              </div>
            </details>
          </div>

          <!-- Validation Info -->
          <div v-if="!isFormValid" class="mt-4 rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4">
            <p class="text-sm text-yellow-800 dark:text-yellow-400">
              Please select values for all required fields: Symbol, Quantity, and Entry Price
            </p>
          </div>

          <!-- Error Message -->
          <div v-if="error" class="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <p class="text-sm font-medium text-red-800 dark:text-red-400">{{ error }}</p>
          </div>

          <!-- Actions -->
          <div class="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
            <button
              type="submit"
              :disabled="loading || !isFormValid"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:col-start-2 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loading">Saving...</span>
              <span v-else>Save Mapping & Continue</span>
            </button>
            <button
              type="button"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:col-start-1 sm:text-sm"
              @click="$emit('close')"
              :disabled="loading"
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
import { ref, computed, watch } from 'vue'
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  csvHeaders: {
    type: Array,
    default: () => []
  },
  csvFile: {
    type: File,
    default: null
  }
})

const emit = defineEmits(['close', 'mappingSaved'])

const { showSuccess, showError } = useNotification()

const loading = ref(false)
const error = ref(null)

const mappingForm = ref({
  mapping_name: '',
  description: '',
  symbol_column: '',
  side_column: '',
  quantity_column: '',
  entry_price_column: '',
  exit_price_column: '',
  entry_date_column: '',
  exit_date_column: '',
  pnl_column: '',
  fees_column: '',
  notes_column: '',
  stop_loss_column: '',
  take_profit_column: '',
  date_format: 'MM/DD/YYYY',
  delimiter: ',',
  has_header_row: true,
  parsing_options: {}
})

const isFormValid = computed(() => {
  return (
    mappingForm.value.symbol_column &&
    mappingForm.value.quantity_column &&
    mappingForm.value.entry_price_column
  )
})

// Auto-detect common column mappings when headers change
watch(() => props.csvHeaders, (headers) => {
  if (headers.length > 0) {
    autoDetectMappings(headers)
  }
}, { immediate: true })

// Reset form when modal opens
watch(() => props.isOpen, (isOpen) => {
  console.log('[CSV MAPPING MODAL] isOpen changed:', isOpen)
  if (isOpen) {
    // Clear the mapping name and description to start fresh
    console.log('[CSV MAPPING MODAL] Resetting form - clearing mapping name')
    mappingForm.value.mapping_name = ''
    mappingForm.value.description = ''
    error.value = null

    // Column mappings will be auto-detected by the other watch
  }
})

function autoDetectMappings(headers) {
  const lowerHeaders = headers.map(h => ({ original: h, lower: h.toLowerCase() }))

  // Symbol column
  const symbolMatch = lowerHeaders.find(h =>
    h.lower.includes('symbol') || h.lower.includes('ticker') || h.lower.includes('stock')
  )
  if (symbolMatch) mappingForm.value.symbol_column = symbolMatch.original

  // Side column
  const sideMatch = lowerHeaders.find(h =>
    h.lower.includes('side') || h.lower.includes('direction') || h.lower.includes('type') ||
    h.lower.includes('action') || h.lower.includes('buy/sell')
  )
  if (sideMatch) mappingForm.value.side_column = sideMatch.original

  // Quantity column
  const quantityMatch = lowerHeaders.find(h =>
    h.lower.includes('quantity') || h.lower.includes('qty') || h.lower.includes('shares') ||
    h.lower.includes('size') || h.lower.includes('amount')
  )
  if (quantityMatch) mappingForm.value.quantity_column = quantityMatch.original

  // Entry price column
  const entryPriceMatch = lowerHeaders.find(h =>
    h.lower.includes('entry') && h.lower.includes('price') ||
    h.lower.includes('buy') && h.lower.includes('price') ||
    h.lower.includes('price') || h.lower.includes('fill price')
  )
  if (entryPriceMatch) mappingForm.value.entry_price_column = entryPriceMatch.original

  // Exit price column (optional)
  const exitPriceMatch = lowerHeaders.find(h =>
    h.lower.includes('exit') && h.lower.includes('price') ||
    h.lower.includes('sell') && h.lower.includes('price')
  )
  if (exitPriceMatch) mappingForm.value.exit_price_column = exitPriceMatch.original

  // Date columns (optional)
  const dateMatch = lowerHeaders.find(h =>
    h.lower.includes('date') || h.lower.includes('trade date') || h.lower.includes('entry date')
  )
  if (dateMatch) mappingForm.value.entry_date_column = dateMatch.original

  // Fees column (optional)
  const feesMatch = lowerHeaders.find(h =>
    h.lower.includes('fee') || h.lower.includes('commission') || h.lower.includes('comm')
  )
  if (feesMatch) mappingForm.value.fees_column = feesMatch.original

  // P&L column (optional)
  const pnlMatch = lowerHeaders.find(h =>
    h.lower.includes('pnl') || h.lower.includes('p&l') || h.lower.includes('profit') ||
    h.lower.includes('gain/loss')
  )
  if (pnlMatch) mappingForm.value.pnl_column = pnlMatch.original

  // Stop Loss column (optional)
  const stopLossMatch = lowerHeaders.find(h =>
    h.lower.includes('stop') && h.lower.includes('loss') ||
    h.lower.includes('stop loss') || h.lower.includes('sl') ||
    h.lower.includes('stop_loss')
  )
  if (stopLossMatch) mappingForm.value.stop_loss_column = stopLossMatch.original

  // Take Profit column (optional)
  const takeProfitMatch = lowerHeaders.find(h =>
    h.lower.includes('take') && h.lower.includes('profit') ||
    h.lower.includes('take profit') || h.lower.includes('tp') ||
    h.lower.includes('target') || h.lower.includes('take_profit')
  )
  if (takeProfitMatch) mappingForm.value.take_profit_column = takeProfitMatch.original
}

async function saveMapping() {
  if (!isFormValid.value) {
    error.value = 'Please map all required columns (Symbol, Quantity, Entry Price)'
    return
  }

  loading.value = true
  error.value = null

  // Declare mappingData outside try block so it's accessible in catch
  let mappingData = null

  try {
    // Clean up empty optional fields - convert empty strings to null
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    mappingData = {
      mapping_name: mappingForm.value.mapping_name.trim() || `Custom Mapping ${timestamp}`,
      description: mappingForm.value.description?.trim() || null,
      symbol_column: mappingForm.value.symbol_column || null,
      side_column: mappingForm.value.side_column || null,
      quantity_column: mappingForm.value.quantity_column || null,
      entry_price_column: mappingForm.value.entry_price_column || null,
      exit_price_column: mappingForm.value.exit_price_column || null,
      entry_date_column: mappingForm.value.entry_date_column || null,
      exit_date_column: mappingForm.value.exit_date_column || null,
      pnl_column: mappingForm.value.pnl_column || null,
      fees_column: mappingForm.value.fees_column || null,
      notes_column: mappingForm.value.notes_column || null,
      stop_loss_column: mappingForm.value.stop_loss_column || null,
      take_profit_column: mappingForm.value.take_profit_column || null,
      date_format: mappingForm.value.date_format || 'MM/DD/YYYY',
      delimiter: mappingForm.value.delimiter || ',',
      has_header_row: mappingForm.value.has_header_row !== undefined ? mappingForm.value.has_header_row : true,
      parsing_options: mappingForm.value.parsing_options || {}
    }

    console.log('[CSV MAPPING] Sending mapping data:', mappingData)

    const response = await api.post('/csv-mappings', mappingData)

    if (response.data.success) {
      showSuccess('Mapping Saved', 'Your CSV column mapping has been saved successfully')
      emit('mappingSaved', response.data.data)
      emit('close')
    } else {
      throw new Error(response.data.error || 'Failed to save mapping')
    }
  } catch (err) {
    console.error('Error saving CSV mapping:', err)
    console.error('Error response:', err.response?.data)

    const errorMsg = err.response?.data?.error || err.message || 'Failed to save CSV column mapping'

    // Special handling for duplicate name error
    if (errorMsg.includes('already exists') && mappingData) {
      error.value = `A mapping named "${mappingData.mapping_name}" already exists. Please choose a different name.`
    } else {
      error.value = errorMsg
    }

    showError('Save Failed', error.value)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(55 65 81);
  margin-bottom: 0.25rem;
}

.dark .label {
  color: rgb(209 213 219);
}

.label.required::after {
  content: " *";
  color: rgb(239 68 68);
}

.input {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: rgb(17 24 39);
  background-color: white;
  border: 1px solid rgb(209 213 219);
  border-radius: 0.375rem;
}

.input:focus {
  outline: none;
  border-color: rgb(59 130 246);
  ring: 2px;
  ring-color: rgb(59 130 246);
}

.dark .input {
  color: rgb(243 244 246);
  background-color: rgb(55 65 81);
  border-color: rgb(75 85 99);
}

.dark .input:focus {
  border-color: rgb(96 165 250);
  ring-color: rgb(96 165 250);
}
</style>
