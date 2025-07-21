<template>
  <div v-if="showStatus" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="flex-shrink-0">
          <svg v-if="isEnriching" class="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <div>
          <h3 class="text-sm font-medium text-blue-900 dark:text-blue-100">
            {{ isEnriching ? 'Enriching Trade Data' : 'Trade Data Enrichment Complete' }}
          </h3>
          <p class="text-sm text-blue-700 dark:text-blue-300">
            {{ statusMessage }}
          </p>
        </div>
      </div>
      <button 
        @click="dismiss" 
        class="text-blue-400 hover:text-blue-600 transition-colors"
        aria-label="Dismiss"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
    
    <!-- Progress bar -->
    <div v-if="isEnriching && progress > 0" class="mt-3">
      <div class="bg-blue-200 dark:bg-blue-800 rounded-full h-2">
        <div 
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
      <p class="text-xs text-blue-600 dark:text-blue-400 mt-1">
        {{ Math.round(progress) }}% complete
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import api from '@/services/api'
import { useEnrichmentStatus } from '@/composables/usePriceAlertNotifications'

const enrichmentStatus = ref(null)
const dismissed = ref(false)
const pollInterval = ref(null)

// SSE enrichment status
const { enrichmentStatus: sseEnrichmentStatus, hasSSEData, getDataAge } = useEnrichmentStatus()

// Combined enrichment status - use SSE data if available and recent, otherwise fallback to API polling
const currentEnrichmentStatus = computed(() => {
  const dataAge = getDataAge()
  const isSSEDataFresh = dataAge !== null && dataAge < 60000 // Less than 1 minute old
  
  if (hasSSEData() && isSSEDataFresh && sseEnrichmentStatus.tradeEnrichment.length > 0) {
    console.log('Using SSE enrichment data (age:', dataAge, 'ms)')
    return {
      tradeEnrichment: sseEnrichmentStatus.tradeEnrichment
    }
  }
  
  // Fallback to API polling data
  return enrichmentStatus.value
})

const showStatus = computed(() => {
  return !dismissed.value && currentEnrichmentStatus.value && (isEnriching.value || recentlyCompleted.value)
})

const isEnriching = computed(() => {
  if (!currentEnrichmentStatus.value) return false
  
  const pending = currentEnrichmentStatus.value.tradeEnrichment?.find(s => s.enrichment_status === 'pending')?.count || 0
  const processing = currentEnrichmentStatus.value.tradeEnrichment?.find(s => s.enrichment_status === 'processing')?.count || 0
  
  return pending > 0 || processing > 0
})

const recentlyCompleted = computed(() => {
  // Show for 30 seconds after completion
  if (!currentEnrichmentStatus.value || isEnriching.value) return false
  
  const statuses = currentEnrichmentStatus.value.tradeEnrichment || []
  const completed = parseInt(statuses.find(s => s.enrichment_status === 'completed')?.count || 0)
  const pending = parseInt(statuses.find(s => s.enrichment_status === 'pending')?.count || 0)
  const processing = parseInt(statuses.find(s => s.enrichment_status === 'processing')?.count || 0)
  
  // Only show as completed if we have completed trades and no pending/processing trades
  const isFullyComplete = completed > 0 && pending === 0 && processing === 0
  return isFullyComplete && Date.now() - lastUpdateTime.value < 30000
})

const progress = computed(() => {
  if (!currentEnrichmentStatus.value) return 0
  
  const statuses = currentEnrichmentStatus.value.tradeEnrichment || []
  const total = statuses.reduce((sum, s) => sum + parseInt(s.count), 0)
  const completed = parseInt(statuses.find(s => s.enrichment_status === 'completed')?.count || 0)
  const processing = parseInt(statuses.find(s => s.enrichment_status === 'processing')?.count || 0)
  
  if (total === 0) return 0
  
  // If we're processing, show partial progress for those being processed
  const progressValue = ((completed + (processing * 0.5)) / total) * 100
  return Math.min(progressValue, 100)
})

const statusMessage = computed(() => {
  if (!currentEnrichmentStatus.value) return ''
  
  if (isEnriching.value) {
    const pending = currentEnrichmentStatus.value.tradeEnrichment?.find(s => s.enrichment_status === 'pending')?.count || 0
    const processing = currentEnrichmentStatus.value.tradeEnrichment?.find(s => s.enrichment_status === 'processing')?.count || 0
    
    if (processing > 0) {
      return `Processing ${processing} trades for strategy classification, symbol data, and price analysis...`
    } else if (pending > 0) {
      return `${pending} trades queued for enrichment with market data and analysis...`
    }
  }
  
  return 'Your trades have been enriched with strategy classifications, company data, and price analysis.'
})

const lastUpdateTime = ref(Date.now())

async function fetchEnrichmentStatus() {
  try {
    const response = await api.get('/trades/enrichment-status')
    const newStatus = response.data
    
    // Log enrichment progress for debugging
    if (newStatus.tradeEnrichment && newStatus.tradeEnrichment.length > 0) {
      const statuses = newStatus.tradeEnrichment.reduce((acc, s) => {
        acc[s.enrichment_status] = parseInt(s.count)
        return acc
      }, {})
      
      console.log('Enrichment status update:', statuses)
    }
    
    enrichmentStatus.value = newStatus
    lastUpdateTime.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch enrichment status:', error)
  }
}

function dismiss() {
  dismissed.value = true
}

function startPolling() {
  if (pollInterval.value) {
    clearTimeout(pollInterval.value)
  }
  
  // Poll every 3 seconds while enriching, every 30 seconds otherwise
  const interval = isEnriching.value ? 3000 : 30000
  
  pollInterval.value = setTimeout(async () => {
    await fetchEnrichmentStatus()
    if (showStatus.value) {
      startPolling() // Continue polling
    }
  }, interval)
}

// Watch for changes in enrichment status to adjust polling frequency
watch(isEnriching, (newValue, oldValue) => {
  if (newValue !== oldValue && showStatus.value) {
    startPolling() // Restart polling with new interval
  }
}, { flush: 'post' })

// Watch for SSE enrichment updates
watch(() => sseEnrichmentStatus.lastUpdate, (newValue) => {
  if (newValue) {
    lastUpdateTime.value = newValue
    console.log('SSE enrichment update received, updated lastUpdateTime')
  }
})

onMounted(async () => {
  await fetchEnrichmentStatus()
  if (showStatus.value) {
    startPolling()
  }
})

onUnmounted(() => {
  if (pollInterval.value) {
    clearTimeout(pollInterval.value)
  }
})
</script>