<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Background overlay -->
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" aria-hidden="true" @click="$emit('close')"></div>

      <!-- Modal panel -->
      <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
        <div>
          <!-- Warning Icon -->
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900">
            <ExclamationTriangleIcon class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>

          <div class="mt-3 text-center sm:mt-5">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              Broker Format Mismatch
            </h3>
            <div class="mt-2">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                The file you uploaded appears to be from a different broker than the one you selected.
              </p>
            </div>
          </div>

          <!-- Mismatch Details -->
          <div class="mt-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">You Selected</p>
                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ formatBrokerName(selectedBroker) }}</p>
              </div>
              <div>
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Detected Format</p>
                <p class="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">{{ formatBrokerName(detectedBroker) }}</p>
              </div>
            </div>
          </div>

          <!-- File Info -->
          <div class="mt-4">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">File Details</p>
            <div class="text-sm text-gray-700 dark:text-gray-300">
              <p><span class="font-medium">Name:</span> {{ fileName }}</p>
              <p><span class="font-medium">Rows:</span> {{ rowCount.toLocaleString() }}</p>
            </div>
          </div>

          <!-- Detected Headers (collapsible) -->
          <div v-if="detectedHeaders && detectedHeaders.length > 0" class="mt-4">
            <button
              @click="showHeaders = !showHeaders"
              class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <span>{{ showHeaders ? 'Hide' : 'Show' }} detected columns ({{ detectedHeaders.length }})</span>
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': showHeaders }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-if="showHeaders" class="mt-2 max-h-32 overflow-y-auto bg-gray-100 dark:bg-gray-900 rounded p-2">
              <p class="text-xs font-mono text-gray-600 dark:text-gray-400">
                {{ detectedHeaders.join(', ') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-5 sm:mt-6 space-y-3">
          <button
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
            @click="handleUseDetected"
          >
            Use {{ formatBrokerName(detectedBroker) }} format (Recommended)
          </button>
          <button
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm"
            @click="handleKeepSelected"
          >
            Keep {{ formatBrokerName(selectedBroker) }} anyway
          </button>
          <button
            type="button"
            class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:text-sm"
            @click="$emit('close')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  selectedBroker: {
    type: String,
    required: true
  },
  detectedBroker: {
    type: String,
    required: true
  },
  detectedHeaders: {
    type: Array,
    default: () => []
  },
  rowCount: {
    type: Number,
    default: 0
  },
  fileName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'use-detected', 'keep-selected'])

const showHeaders = ref(false)

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

function handleUseDetected() {
  emit('use-detected', props.detectedBroker)
}

function handleKeepSelected() {
  emit('keep-selected', props.selectedBroker)
}
</script>
