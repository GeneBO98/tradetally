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

        <div class="pr-8">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white" id="modal-title">
            Match your CSV columns
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tell TradeTally what each column in your file represents. We've pre-filled what we recognized — change anything that's wrong.
          </p>
        </div>

        <form @submit.prevent="saveMapping" class="mt-5 space-y-4">
          <!-- Column mapper table -->
          <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 bg-gray-50 dark:bg-gray-900/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <div>Your column</div>
              <div>Sample value</div>
              <div>TradeTally field</div>
            </div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              <div
                v-for="header in csvHeaders"
                :key="header"
                class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-4 py-2.5"
              >
                <div class="min-w-0 truncate font-mono text-sm font-medium text-gray-900 dark:text-white" :title="header">
                  {{ header }}
                </div>
                <div class="min-w-0 truncate font-mono text-xs text-gray-500 dark:text-gray-400" :title="getSampleText(header) || ''">
                  {{ getSampleText(header) || '—' }}
                </div>
                <div>
                  <select
                    :value="getMappedField(header)"
                    @change="setMappedField(header, $event.target.value)"
                    class="row-select"
                    :class="rowSelectClass(header)"
                  >
                    <option value="">— Skip —</option>
                    <optgroup label="Required">
                      <option
                        v-for="opt in requiredFieldOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </optgroup>
                    <optgroup label="Optional">
                      <option
                        v-for="opt in optionalFieldOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- CSV settings (collapsed by default) -->
          <details class="rounded-md border border-gray-200 dark:border-gray-700">
            <summary class="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50">
              CSV settings
            </summary>
            <div class="grid grid-cols-1 gap-4 border-t border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-2">
              <div>
                <label for="delimiter" class="label">Delimiter</label>
                <select id="delimiter" v-model="mappingForm.delimiter" class="input">
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
              <div>
                <label for="dateFormat" class="label">Date format</label>
                <select id="dateFormat" v-model="mappingForm.date_format" class="input">
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                </select>
              </div>
              <div class="flex items-center sm:col-span-2">
                <input
                  id="hasHeaderRow"
                  v-model="mappingForm.has_header_row"
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label for="hasHeaderRow" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  First row contains column headers
                </label>
              </div>
            </div>
          </details>

          <!-- Mapping name -->
          <div>
            <label for="mappingName" class="label">Save this mapping as</label>
            <input
              id="mappingName"
              v-model="mappingForm.mapping_name"
              type="text"
              placeholder="Optional — auto-generated if blank"
              class="input"
            />
          </div>

          <!-- Error -->
          <div v-if="error" class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
            <p class="text-sm font-medium text-red-800 dark:text-red-400">{{ error }}</p>
          </div>

          <!-- Help link -->
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Not sure?
            <a
              :href="supportMailtoLink"
              class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              @click="$emit('support-clicked', { source: 'mapping_modal', detectedBroker: selectedBroker, headerCount: csvHeaders.length })"
            >
              Send us the headers
            </a>
            and we'll add support for this export.
          </p>

          <!-- Actions -->
          <div class="sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
            <button
              type="submit"
              :disabled="loading || !isFormValid"
              class="w-full inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-2 sm:text-sm"
            >
              <span v-if="loading">Saving...</span>
              <span v-else-if="!isFormValid">{{ unmatchedRequiredLabel }}</span>
              <span v-else>Save mapping &amp; import</span>
            </button>
            <button
              type="button"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:col-start-1 sm:mt-0 sm:text-sm"
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
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
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
  csvSampleRows: {
    type: Object,
    default: () => ({})
  },
  csvFile: {
    type: File,
    default: null
  },
  selectedBroker: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'mappingSaved', 'support-clicked'])

const { showSuccess, showError } = useNotification()

function handleEscape(e) {
  if (e.key === 'Escape' && props.isOpen) emit('close')
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) window.addEventListener('keydown', handleEscape)
    else window.removeEventListener('keydown', handleEscape)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
})

const loading = ref(false)
const error = ref(null)

const FIELD_OPTIONS = [
  { value: 'symbol_column', label: 'Symbol', required: true },
  { value: 'quantity_column', label: 'Quantity', required: true },
  { value: 'entry_price_column', label: 'Entry Price', required: true },
  { value: 'side_column', label: 'Side / Direction' },
  { value: 'exit_price_column', label: 'Exit Price' },
  { value: 'entry_date_column', label: 'Entry Date' },
  { value: 'exit_date_column', label: 'Exit Date' },
  { value: 'pnl_column', label: 'P&L' },
  { value: 'fees_column', label: 'Fees / Commission' },
  { value: 'notes_column', label: 'Notes' },
  { value: 'stop_loss_column', label: 'Stop Loss' },
  { value: 'take_profit_column', label: 'Take Profit' }
]

const requiredFieldOptions = computed(() => FIELD_OPTIONS.filter(f => f.required))
const optionalFieldOptions = computed(() => FIELD_OPTIONS.filter(f => !f.required))
const COLUMN_FIELD_NAMES = FIELD_OPTIONS.map(f => f.value)
const REQUIRED_FIELD_NAMES = FIELD_OPTIONS.filter(f => f.required).map(f => f.value)

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

const requiredMappedCount = computed(
  () => REQUIRED_FIELD_NAMES.filter(f => !!mappingForm.value[f]).length
)

const unmatchedRequiredLabel = computed(() => {
  const missing = REQUIRED_FIELD_NAMES
    .filter(f => !mappingForm.value[f])
    .map(f => FIELD_OPTIONS.find(opt => opt.value === f)?.label)
    .filter(Boolean)
  if (missing.length === 3) return 'Match Symbol, Quantity & Entry Price to continue'
  if (missing.length === 0) return 'Save mapping & import'
  return `Still need: ${missing.join(', ')}`
})

function getMappedField(header) {
  for (const fieldName of COLUMN_FIELD_NAMES) {
    if (mappingForm.value[fieldName] === header) return fieldName
  }
  return ''
}

function setMappedField(header, fieldName) {
  // Clear any existing mapping for this header (in case it was mapped to something else)
  const prev = getMappedField(header)
  if (prev) mappingForm.value[prev] = ''
  // Apply new mapping (latest wins if another header was on the same field)
  if (fieldName) mappingForm.value[fieldName] = header
}

function rowSelectClass(header) {
  const fieldName = getMappedField(header)
  if (!fieldName) return 'is-unmapped'
  if (REQUIRED_FIELD_NAMES.includes(fieldName)) return 'is-required'
  return 'is-optional'
}

function getSampleText(header) {
  const samples = props.csvSampleRows?.[header]
  if (!samples || samples.length === 0) return ''
  // Show first non-empty sample, truncate if too long
  const first = samples.find(s => s !== undefined && s !== null && String(s).trim() !== '') ?? ''
  const text = String(first).trim()
  return text.length > 40 ? `${text.slice(0, 38)}…` : text
}

const supportMailtoLink = computed(() => {
  const subject = encodeURIComponent(`Import Mapping Help: ${props.selectedBroker || 'unknown broker'}`)
  const body = encodeURIComponent(
    `I need help mapping this CSV for import.\n\n` +
    `Selected broker: ${props.selectedBroker || 'N/A'}\n` +
    `File name: ${props.csvFile?.name || 'N/A'}\n` +
    `Headers:\n${props.csvHeaders.join(', ')}\n\n` +
    `Notes:\n`
  )

  return `mailto:support@tradetally.io?subject=${subject}&body=${body}`
})

// Auto-detect common column mappings when headers change
watch(() => props.csvHeaders, (headers) => {
  if (headers.length > 0) {
    autoDetectMappings(headers)
  }
}, { immediate: true })

// Reset form when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    mappingForm.value.mapping_name = ''
    mappingForm.value.description = ''
    error.value = null
  }
})

function autoDetectMappings(headers) {
  const lowerHeaders = headers.map(h => ({ original: h, lower: h.toLowerCase() }))

  const symbolMatch = lowerHeaders.find(h =>
    h.lower.includes('symbol') || h.lower.includes('ticker') || h.lower.includes('stock') ||
    h.lower === 'instrument'
  )
  if (symbolMatch) mappingForm.value.symbol_column = symbolMatch.original

  const sideMatch = lowerHeaders.find(h =>
    h.lower.includes('side') || h.lower.includes('direction') || h.lower.includes('action') ||
    h.lower.includes('buy/sell') || h.lower === 'flow' || h.lower === 'type'
  )
  if (sideMatch) mappingForm.value.side_column = sideMatch.original

  const quantityMatch = lowerHeaders.find(h =>
    h.lower.includes('quantity') || h.lower.includes('qty') || h.lower.includes('shares') ||
    h.lower.includes('size') || h.lower === 'units' || h.lower === 'amount'
  )
  if (quantityMatch) mappingForm.value.quantity_column = quantityMatch.original

  const entryPriceMatch = lowerHeaders.find(h =>
    (h.lower.includes('entry') && h.lower.includes('price')) ||
    (h.lower.includes('buy') && h.lower.includes('price')) ||
    h.lower.includes('fill price') || h.lower === 'rate' || h.lower === 'price'
  )
  if (entryPriceMatch) mappingForm.value.entry_price_column = entryPriceMatch.original

  const exitPriceMatch = lowerHeaders.find(h =>
    (h.lower.includes('exit') && (h.lower.includes('price') || h.lower.includes('rate'))) ||
    (h.lower.includes('sell') && h.lower.includes('price'))
  )
  if (exitPriceMatch) mappingForm.value.exit_price_column = exitPriceMatch.original

  const dateMatch = lowerHeaders.find(h =>
    h.lower.includes('trade date') || h.lower.includes('entry date') || h.lower === 'date' ||
    h.lower === 'day'
  )
  if (dateMatch) mappingForm.value.entry_date_column = dateMatch.original

  const feesMatch = lowerHeaders.find(h =>
    h.lower.includes('fee') || h.lower.includes('commission') || h.lower.includes('comm') ||
    h.lower === 'charges'
  )
  if (feesMatch) mappingForm.value.fees_column = feesMatch.original

  const notesMatch = lowerHeaders.find(h =>
    h.lower.includes('note') || h.lower === 'commentary' || h.lower === 'comment' ||
    h.lower === 'description'
  )
  if (notesMatch) mappingForm.value.notes_column = notesMatch.original

  const pnlMatch = lowerHeaders.find(h =>
    h.lower.includes('pnl') || h.lower.includes('p&l') || h.lower.includes('profit') ||
    h.lower.includes('gain/loss')
  )
  if (pnlMatch) mappingForm.value.pnl_column = pnlMatch.original

  const stopLossMatch = lowerHeaders.find(h =>
    (h.lower.includes('stop') && h.lower.includes('loss')) ||
    h.lower === 'sl' || h.lower === 'stop_loss'
  )
  if (stopLossMatch) mappingForm.value.stop_loss_column = stopLossMatch.original

  const takeProfitMatch = lowerHeaders.find(h =>
    (h.lower.includes('take') && h.lower.includes('profit')) ||
    h.lower === 'tp' || h.lower === 'target' || h.lower === 'take_profit'
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

  let mappingData = null

  try {
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

    const errorMsg = err.response?.data?.error || err.message || 'Failed to save CSV column mapping'

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
}

.dark .input {
  color: rgb(243 244 246);
  background-color: rgb(55 65 81);
  border-color: rgb(75 85 99);
}

.dark .input:focus {
  border-color: rgb(96 165 250);
}

/* Per-row mapping select — compact, themed by mapping state */
.row-select {
  display: block;
  width: 100%;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.25rem;
  background-color: white;
  border: 1px solid rgb(209 213 219);
  border-radius: 0.375rem;
}

.row-select:focus {
  outline: none;
  border-color: rgb(240 129 42);
  box-shadow: 0 0 0 2px rgba(240, 129, 42, 0.2);
}

.dark .row-select {
  background-color: rgb(31 41 55);
  border-color: rgb(75 85 99);
  color: rgb(243 244 246);
}

.row-select.is-unmapped {
  color: rgb(107 114 128);
}

.dark .row-select.is-unmapped {
  color: rgb(156 163 175);
}

.row-select.is-required {
  color: rgb(189 79 19);
  font-weight: 500;
  border-color: rgb(252 208 152);
}

.dark .row-select.is-required {
  color: rgb(250 176 91);
  border-color: rgb(151 63 23);
}

.row-select.is-optional {
  color: rgb(31 41 55);
}

.dark .row-select.is-optional {
  color: rgb(229 231 235);
}
</style>
