<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Background overlay -->
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" aria-hidden="true" @click="$emit('close')"></div>

      <!-- Modal panel -->
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
        <div>
          <!-- Success/Warning Icon -->
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full" :class="iconBgClass">
            <CheckCircleIcon v-if="importStatus === 'success'" class="h-6 w-6" :class="iconClass" />
            <ExclamationTriangleIcon v-else-if="importStatus === 'warning'" class="h-6 w-6" :class="iconClass" />
            <XCircleIcon v-else class="h-6 w-6" :class="iconClass" />
          </div>

          <div class="mt-3 text-center sm:mt-5">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              {{ title }}
            </h3>
          </div>

          <!-- Summary Stats -->
          <div class="mt-4 grid grid-cols-3 gap-4">
            <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ tradesImported }}</p>
              <p class="text-xs text-green-700 dark:text-green-300">Imported</p>
            </div>
            <div v-if="duplicatesSkipped > 0" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ duplicatesSkipped }}</p>
              <p class="text-xs text-blue-700 dark:text-blue-300">Duplicates</p>
            </div>
            <div v-else class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-gray-400">0</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Duplicates</p>
            </div>
            <div v-if="rowsSkipped > 0" class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{{ rowsSkipped }}</p>
              <p class="text-xs text-yellow-700 dark:text-yellow-300">Skipped</p>
            </div>
            <div v-else class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
              <p class="text-2xl font-bold text-gray-400">0</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
            </div>
          </div>

          <!-- Diagnostics Details -->
          <div v-if="diagnostics" class="mt-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Processed {{ diagnostics.totalRows?.toLocaleString() || 0 }} rows from CSV
              <span v-if="diagnostics.detectedBroker">
                (detected as {{ formatBrokerName(diagnostics.detectedBroker) }})
              </span>
            </p>
          </div>

          <!-- Warnings Section -->
          <div v-if="warnings && warnings.length > 0" class="mt-4">
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div class="flex items-start">
                <ExclamationTriangleIcon class="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-yellow-800 dark:text-yellow-200">Warnings</p>
                  <ul class="mt-1 text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                    <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Skipped Rows Details (expandable) -->
          <div v-if="skippedReasons && skippedReasons.length > 0" class="mt-4">
            <button
              @click="showSkippedDetails = !showSkippedDetails"
              class="flex items-center justify-between w-full text-left text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
            >
              <span class="flex items-center">
                <InformationCircleIcon class="h-5 w-5 mr-2" />
                View skipped row details ({{ skippedReasons.length }})
              </span>
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showSkippedDetails }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-if="showSkippedDetails" class="mt-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead class="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Row</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="(item, index) in displayedSkippedReasons" :key="index">
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{{ item.row }}</td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{{ item.reason }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="skippedReasons.length > maxDisplayedReasons" class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                Showing first {{ maxDisplayedReasons }} of {{ skippedReasons.length }} skipped rows
              </div>
            </div>
          </div>

          <!-- Failed Trades Details -->
          <div v-if="failedTrades && failedTrades.length > 0" class="mt-4">
            <button
              @click="showFailedDetails = !showFailedDetails"
              class="flex items-center justify-between w-full text-left text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-3"
            >
              <span class="flex items-center">
                <XCircleIcon class="h-5 w-5 mr-2" />
                View failed trades ({{ failedTrades.length }})
              </span>
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showFailedDetails }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-if="showFailedDetails" class="mt-2 max-h-48 overflow-y-auto border border-red-200 dark:border-red-800 rounded-lg">
              <div v-for="(item, index) in failedTrades.slice(0, maxDisplayedReasons)" :key="index" class="px-3 py-2 border-b border-red-100 dark:border-red-900 last:border-b-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ item.trade?.symbol || 'Unknown' }}</p>
                <p class="text-xs text-red-600 dark:text-red-400">{{ item.error }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Close Button -->
        <div class="mt-5 sm:mt-6">
          <button
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
            @click="$emit('close')"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  tradesImported: {
    type: Number,
    default: 0
  },
  duplicatesSkipped: {
    type: Number,
    default: 0
  },
  diagnostics: {
    type: Object,
    default: null
  },
  failedTrades: {
    type: Array,
    default: () => []
  }
})

defineEmits(['close'])

const showSkippedDetails = ref(false)
const showFailedDetails = ref(false)
const maxDisplayedReasons = 50

const brokerNames = {
  auto: 'Auto-Detect',
  generic: 'Generic CSV',
  lightspeed: 'Lightspeed Trader',
  schwab: 'Charles Schwab',
  thinkorswim: 'ThinkorSwim',
  ibkr: 'Interactive Brokers',
  ibkr_trade_confirmation: 'IBKR Trade Confirmation',
  webull: 'Webull',
  etrade: 'E*TRADE',
  papermoney: 'PaperMoney',
  tradingview: 'TradingView',
  tradovate: 'Tradovate',
  questrade: 'Questrade',
  projectx: 'ProjectX'
}

function formatBrokerName(broker) {
  return brokerNames[broker] || broker
}

const rowsSkipped = computed(() => {
  if (!props.diagnostics) return 0
  return (props.diagnostics.skippedRows || 0) + (props.diagnostics.invalidRows || 0)
})

const skippedReasons = computed(() => {
  return props.diagnostics?.skippedReasons || []
})

const warnings = computed(() => {
  return props.diagnostics?.warnings || []
})

const displayedSkippedReasons = computed(() => {
  return skippedReasons.value.slice(0, maxDisplayedReasons)
})

const importStatus = computed(() => {
  if (props.failedTrades && props.failedTrades.length > 0) return 'error'
  if (rowsSkipped.value > 0 || (warnings.value && warnings.value.length > 0)) return 'warning'
  return 'success'
})

const title = computed(() => {
  if (props.tradesImported === 0 && props.failedTrades?.length > 0) {
    return 'Import Failed'
  }
  if (props.tradesImported === 0) {
    return 'No Trades Imported'
  }
  if (importStatus.value === 'warning') {
    return 'Import Completed with Warnings'
  }
  return 'Import Successful'
})

const iconBgClass = computed(() => {
  switch (importStatus.value) {
    case 'success': return 'bg-green-100 dark:bg-green-900'
    case 'warning': return 'bg-yellow-100 dark:bg-yellow-900'
    default: return 'bg-red-100 dark:bg-red-900'
  }
})

const iconClass = computed(() => {
  switch (importStatus.value) {
    case 'success': return 'text-green-600 dark:text-green-400'
    case 'warning': return 'text-yellow-600 dark:text-yellow-400'
    default: return 'text-red-600 dark:text-red-400'
  }
})
</script>
