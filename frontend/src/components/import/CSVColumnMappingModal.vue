<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center ">
      <!-- Background overlay -->
      <div class="modal-backdrop" aria-hidden="true" @click="$emit('close')"></div>

      <!-- Modal panel -->
      <div class="modal-panel w-full p-6 max-w-3xl">
        <div class="absolute top-0 right-0 pt-4 pr-4">
          <button
            type="button"
            class="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            @click="$emit('close')"
          >
            <span class="sr-only">Close</span>
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="pr-8">
          <h3 class="modal-title" id="modal-title">
            Match your CSV columns
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tell TradeTally what each column in your file represents. We've pre-filled what we recognized — change anything that's wrong.
          </p>
        </div>

        <!-- AI column match: runs on open only when the keyword matching left a
             required column unmatched; otherwise it is offered, not run. -->
        <div
          v-if="aiStatus !== 'idle'"
          class="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900/40"
          data-testid="ai-match-status"
          role="status"
        >
          <p class="min-w-0 flex-1 text-gray-700 dark:text-gray-300">{{ aiStatusMessage }}</p>
          <button
            v-if="aiStatus !== 'matching' && canRetryAiMatch"
            type="button"
            class="shrink-0 text-sm font-medium text-primary-700 hover:text-primary-500 dark:text-primary-400"
            data-testid="ai-match-retry"
            @click="runAiMatch()"
          >
            {{ aiStatus === 'matched' ? 'Match again' : 'Match with AI instead' }}
          </button>
        </div>

        <form @submit.prevent="saveMapping" class="mt-5 space-y-4">
          <!-- Column mapper table -->
          <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="text-label grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 bg-gray-50 dark:bg-gray-900/40 px-4 py-2">
              <div>Your column</div>
              <div>Sample value</div>
              <div>TradeTally field</div>
            </div>
            <p
              v-if="isReparsing"
              class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
              Updating column preview…
            </p>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              <div
                v-for="header in displayHeaders"
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
                <BaseSelect
                  id="delimiter"
                  v-model="mappingForm.delimiter"
                  :options="[
                    { value: ',', label: 'Comma (,)' },
                    { value: ';', label: 'Semicolon (;)' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: 'Pipe (|)' }
                  ]"
                />
              </div>
              <div>
                <label for="dateFormat" class="label">Date format</label>
                <BaseSelect
                  id="dateFormat"
                  v-model="mappingForm.date_format"
                  :options="[
                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                    { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' },
                    { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY'} ]" /> </div> <div class="flex items-center sm:col-span-2"> <input id="hasHeaderRow" v-model="mappingForm.has_header_row" type="checkbox" class="checkbox" /> <label for="hasHeaderRow" class="ml-2 block text-sm text-gray-700 dark:text-gray-300"> First row contains column headers </label> </div> </div> </details> <!-- Mapping name --> <div> <label for="mappingName" class="label">Save this mapping as</label> <input id="mappingName" v-model="mappingForm.mapping_name" type="text" placeholder="Optional — auto-generated if blank" class="input" /> </div> <!-- Error --> <div v-if="error" class="callout-danger"> <p class="text-sm font-medium text-red-600 dark:text-red-400">{{ error }}</p> </div> <!-- Help link --> <p class="text-xs text-gray-500 dark:text-gray-400"> Not sure? <a :href="supportMailtoLink" class="font-medium text-primary-700 hover:text-primary-500 dark:text-primary-400" @click="$emit('support-clicked', { source: 'mapping_modal', detectedBroker: selectedBroker, headerCount: csvHeaders.length })"
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
              class="btn-primary w-full sm:col-start-2"
            >
              <span v-if="loading">Saving...</span>
              <span v-else-if="!isFormValid">{{ unmatchedRequiredLabel }}</span>
              <span v-else>Save mapping &amp; import</span>
            </button>
            <button
              type="button"
              class="btn-secondary mt-3 w-full dark:text-gray-200 sm:col-start-1 sm:mt-0"
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
import BaseSelect from '@/components/common/BaseSelect.vue'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { parseCSVFilePreview } from '@/utils/csvImportParse'
import { redactSample } from '@/utils/csvSampleRedaction'

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
  cancelAiMatch()
})

const loading = ref(false)
const error = ref(null)
const isReparsing = ref(false)
const isInitializing = ref(false)

// AI column match. 'idle' hides the status row entirely.
const aiStatus = ref('idle') // idle | recognized | matching | matched | stale | unavailable | credits | pro | failed
const aiMatchedCount = ref(0)
const aiMissingRequired = ref([])
// Fields and columns the user set by hand while an AI match was in flight. A
// slow AI reply fills in around them and never overwrites them.
const userEditedFields = new Set()
const userEditedHeaders = new Set()
let aiRequestId = 0
let aiAbortController = null

// Stop waiting for an AI reply that can no longer be used. Aborting tells the
// server nobody is listening, so it does not charge credits for it.
function cancelAiMatch() {
  aiRequestId++
  if (aiAbortController) {
    aiAbortController.abort()
    aiAbortController = null
  }
}
const displayHeaders = ref([])
const displaySampleRows = ref({})

const FIELD_OPTIONS = [
  { value: 'symbol_column', label: 'Symbol', required: true },
  { value: 'quantity_column', label: 'Quantity', required: true },
  { value: 'entry_price_column', label: 'Entry Price', required: true },
  { value: 'side_column', label: 'Side / Direction' },
  { value: 'exit_price_column', label: 'Exit Price' },
  { value: 'entry_date_column', label: 'Entry Date' },
  { value: 'exit_date_column', label: 'Exit Date' },
  { value: 'pnl_column', label: 'P&L' },
  { value: 'commission_column', label: 'Commission' },
  { value: 'fees_column', label: 'Fees' },
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
  commission_column: '',
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

const canRetryAiMatch = computed(() => !['unavailable', 'credits', 'pro'].includes(aiStatus.value))

const aiStatusMessage = computed(() => {
  switch (aiStatus.value) {
    case 'recognized':
      return 'We recognized the required columns from their names.'
    case 'pro':
      return 'AI column matching is a Pro feature, so we pre-filled what we recognized.'
    case 'matching':
      return 'AI is matching your columns…'
    case 'matched': {
      const count = aiMatchedCount.value
      const base = `AI matched ${count} ${count === 1 ? 'column' : 'columns'}.`
      if (aiMissingRequired.value.length > 0) {
        return `${base} It could not find ${aiMissingRequired.value.join(', ')}; pick ${aiMissingRequired.value.length === 1 ? 'it' : 'them'} below.`
      }
      return `${base} Check them and change anything that's wrong.`
    }
    case 'stale':
      return 'The columns changed, so the AI match no longer applies.'
    case 'credits':
      return "You're out of AI credits this month, so we pre-filled what we recognized."
    case 'unavailable':
      return "AI matching isn't available right now, so we pre-filled what we recognized."
    case 'failed':
      return "AI couldn't work out this file, so we pre-filled what we recognized."
    default:
      return ''
  }
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
  if (prev) userEditedFields.add(prev)
  if (fieldName) userEditedFields.add(fieldName)
  userEditedHeaders.add(header)
}

function rowSelectClass(header) {
  const fieldName = getMappedField(header)
  if (!fieldName) return 'is-unmapped'
  if (REQUIRED_FIELD_NAMES.includes(fieldName)) return 'is-required'
  return 'is-optional'
}

function getSampleText(header) {
  const samples = displaySampleRows.value?.[header]
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
    `Headers:\n${displayHeaders.value.join(', ')}\n\n` +
    `Notes:\n`
  )

  return `mailto:support@tradetally.io?subject=${subject}&body=${body}`
})

function clearColumnMappings() {
  for (const fieldName of COLUMN_FIELD_NAMES) {
    mappingForm.value[fieldName] = ''
  }
}

function detectDateFormatFromSamples(sampleRows) {
  const timeKey = Object.keys(sampleRows).find(k => k.toLowerCase() === 'time')
  if (!timeKey) return

  const samples = sampleRows[timeKey] || []
  for (const sample of samples) {
    const text = String(sample).trim()
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!match) continue

    const first = parseInt(match[1], 10)
    const second = parseInt(match[2], 10)
    if (first > 12 && second <= 12) {
      mappingForm.value.date_format = 'DD/MM/YYYY'
    }
    return
  }
}

async function refreshPreviewFromFile(autoDetectDelimiter = false) {
  if (!props.csvFile) {
    displayHeaders.value = [...props.csvHeaders]
    displaySampleRows.value = { ...props.csvSampleRows }
    return
  }

  isReparsing.value = true
  try {
    const { headers, sampleRows, delimiter } = await parseCSVFilePreview(props.csvFile, {
      delimiter: autoDetectDelimiter ? undefined : mappingForm.value.delimiter,
      has_header_row: mappingForm.value.has_header_row
    })

    displayHeaders.value = headers
    displaySampleRows.value = sampleRows

    if (autoDetectDelimiter && delimiter) {
      mappingForm.value.delimiter = delimiter
    }

    if (headers.length > 0) {
      clearColumnMappings()
      autoDetectMappings(headers)
      detectDateFormatFromSamples(sampleRows)
    }
  } finally {
    isReparsing.value = false
  }
}

/**
 * Ask the backend which column holds each field and pre-fill the form with
 * the answer. The keyword matches from autoDetectMappings stay in place if
 * this fails, so the modal is always usable without AI.
 */
async function runAiMatch() {
  const headers = [...displayHeaders.value]
  if (headers.length < 2) return

  cancelAiMatch()
  const requestId = aiRequestId
  const controller = new AbortController()
  aiAbortController = controller
  userEditedFields.clear()
  userEditedHeaders.clear()
  aiStatus.value = 'matching'

  // Account numbers and other long identifiers are masked before the samples
  // leave the browser; the server masks them again before the AI sees them.
  const sampleRows = {}
  for (const header of headers) {
    sampleRows[header] = (displaySampleRows.value?.[header] || [])
      .slice(0, 3)
      .map(value => redactSample(header, value))
  }

  try {
    const response = await api.post('/csv-mappings/suggest', { headers, sampleRows }, { signal: controller.signal })
    // A newer request or a re-parse makes this reply stale (and aborted it).
    if (requestId !== aiRequestId) return

    const suggestion = response.data?.data
    const mapping = suggestion?.mapping || {}
    // Choices the user made while waiting win over the AI's.
    const matched = COLUMN_FIELD_NAMES.filter(f =>
      mapping[f] && headers.includes(mapping[f]) &&
      !userEditedFields.has(f) && !userEditedHeaders.has(mapping[f])
    )
    if (matched.length === 0) {
      aiStatus.value = userEditedFields.size > 0 || userEditedHeaders.size > 0 ? 'idle' : 'failed'
      return
    }

    // The AI's columns win over keyword matches for the same column, but a
    // keyword match the AI had no answer for is kept.
    const aiHeaders = new Set(matched.map(f => mapping[f]))
    for (const fieldName of COLUMN_FIELD_NAMES) {
      if (userEditedFields.has(fieldName)) continue
      if (aiHeaders.has(mappingForm.value[fieldName])) mappingForm.value[fieldName] = ''
    }
    for (const fieldName of matched) {
      mappingForm.value[fieldName] = mapping[fieldName]
    }
    if (suggestion.date_format) {
      mappingForm.value.date_format = suggestion.date_format
    }
    aiMatchedCount.value = matched.length
    aiMissingRequired.value = REQUIRED_FIELD_NAMES
      .filter(f => !mappingForm.value[f])
      .map(f => FIELD_OPTIONS.find(opt => opt.value === f)?.label)
      .filter(Boolean)
    aiStatus.value = 'matched'
  } catch (err) {
    if (requestId !== aiRequestId) return
    const code = err.response?.data?.code
    if (code === 'INSUFFICIENT_CREDITS') aiStatus.value = 'credits'
    else if (code === 'PRO_REQUIRED') aiStatus.value = 'pro'
    else if (code === 'NO_SUGGESTION') aiStatus.value = 'failed'
    else aiStatus.value = 'unavailable'
  }
}

// Reset form and re-parse when modal opens
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    isInitializing.value = true
    mappingForm.value.mapping_name = ''
    mappingForm.value.description = ''
    mappingForm.value.delimiter = ','
    mappingForm.value.date_format = 'MM/DD/YYYY'
    mappingForm.value.has_header_row = true
    error.value = null
    aiStatus.value = 'idle'
    await refreshPreviewFromFile(true)
    isInitializing.value = false
    // AI is the fallback, not the default: when the keyword matching already
    // found every required column, offer it instead of spending credits.
    if (displayHeaders.value.length >= 2) {
      if (isFormValid.value) {
        aiStatus.value = 'recognized'
      } else {
        // Not awaited: the form is usable with the keyword matches meanwhile.
        runAiMatch()
      }
    }
  } else {
    cancelAiMatch()
  }
  // immediate: ImportView creates this component with is-open already true
  // (it sits behind a v-if), so there is no false-to-true change to react to.
}, { immediate: true })

// Re-parse when CSV settings change (delimiter / header row)
watch(
  () => [mappingForm.value.delimiter, mappingForm.value.has_header_row],
  async () => {
    if (props.isOpen && props.csvFile && !isInitializing.value) {
      // The columns are about to change: drop any in-flight or applied AI
      // match and let the user ask for a new one.
      cancelAiMatch()
      await refreshPreviewFromFile(false)
      if (aiStatus.value === 'matching' || aiStatus.value === 'matched') {
        aiStatus.value = 'stale'
      } else if (aiStatus.value === 'recognized' && !isFormValid.value) {
        aiStatus.value = 'stale'
      }
    }
  }
)

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
    h.lower === 'day' || h.lower === 'time'
  )
  if (dateMatch) mappingForm.value.entry_date_column = dateMatch.original

  const commissionMatch = lowerHeaders.find(h =>
    h.lower.includes('commission') || h.lower === 'comm' || h.lower === 'commissions'
  )
  if (commissionMatch) mappingForm.value.commission_column = commissionMatch.original

  const feesMatch = lowerHeaders.find(h =>
    h.original !== commissionMatch?.original && (
      h.lower.includes('fee') || h.lower === 'fees' || h.lower === 'charges' ||
      h.lower.includes('regulatory') || h.lower.includes('exchange') ||
      h.lower === 'sec' || h.lower === 'taf'
    )
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
      commission_column: mappingForm.value.commission_column || null,
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

/* Per-row mapping select — compact, themed by mapping state */
.row-select {
  display: block;
  width: 100%;
  /* Mirrors .input.input-sm: 16px on phones (no iOS zoom), 14px from sm up. */
  padding: 0.25rem 0.5rem;
  min-height: 32px;
  font-size: 16px;
  line-height: 1.25rem;
  background-color: white;
  border: 1px solid rgb(209 213 219);
  border-radius: 0.375rem;
}

@media (min-width: 640px) {
  .row-select {
    font-size: 0.875rem;
  }
}

.row-select:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent);
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
