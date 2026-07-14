<template>
  <div
    v-if="normalizedSymbol"
    class="mb-4 flex min-h-12 items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0">
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Current price for {{ normalizedSymbol }}
      </p>
      <div v-if="loading" class="mt-1 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" aria-hidden="true"></span>
        <span>Loading quote...</span>
      </div>
      <p v-else-if="currentPrice !== null" class="mt-0.5 text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ formatPrice(currentPrice) }}
      </p>
      <p v-else class="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
        {{ errorMessage }}
      </p>
    </div>

    <button
      v-if="!loading && currentPrice === null"
      type="button"
      class="shrink-0 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      @click="retry"
    >
      Retry
    </button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import api from '@/services/api'
import { debounce } from '@/utils/debounce'

const props = defineProps({
  symbol: {
    type: String,
    default: ''
  }
})

const currentPrice = ref(null)
const loading = ref(false)
const errorMessage = ref('Current price unavailable')
let requestSequence = 0

const normalizedSymbol = computed(() => props.symbol.trim().toUpperCase())

async function loadQuote(symbol, sequence) {
  try {
    const response = await api.get('/symbols/quote', { params: { symbol } })
    const price = Number(response.data?.current_price)

    if (sequence !== requestSequence) return

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Current price unavailable')
    }

    currentPrice.value = price
  } catch (error) {
    if (sequence !== requestSequence) return

    currentPrice.value = null
    errorMessage.value = error.response?.data?.error || 'Current price unavailable'
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
    }
  }
}

const debouncedLoadQuote = debounce(loadQuote, 400)

function queueQuote(symbol) {
  debouncedLoadQuote.cancel()
  requestSequence += 1
  currentPrice.value = null
  errorMessage.value = 'Current price unavailable'

  if (!symbol) {
    loading.value = false
    return
  }

  loading.value = true
  debouncedLoadQuote(symbol, requestSequence)
}

function retry() {
  debouncedLoadQuote.cancel()
  requestSequence += 1
  loading.value = true
  loadQuote(normalizedSymbol.value, requestSequence)
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price)
}

watch(normalizedSymbol, queueQuote, { immediate: true })

onBeforeUnmount(() => {
  debouncedLoadQuote.cancel()
  requestSequence += 1
})
</script>
