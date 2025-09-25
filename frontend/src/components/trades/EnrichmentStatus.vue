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
    
    <!-- Show CUSIP errors if available -->
    <div v-if="enrichmentStatus && enrichmentStatus.cusipErrors && enrichmentStatus.cusipErrors.length > 0" class="mt-3 mb-2">
      <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
        <div class="flex">
          <svg class="h-4 w-4 text-yellow-400 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
          <div class="flex-1">
            <p class="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              CUSIP Resolution Issues:
            </p>
            <ul class="text-sm text-yellow-700 dark:text-yellow-300 mt-1 space-y-1">
              <li v-for="error in enrichmentStatus.cusipErrors" :key="error.error_message" class="flex justify-between">
                <span>{{ error.error_message }}</span>
                <span class="text-yellow-600 dark:text-yellow-400">({{ error.count }} CUSIPs)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Show retry button if there are unresolved CUSIPs -->
    <div v-if="enrichmentStatus && enrichmentStatus.unresolvedCusips > 0" class="mt-3 space-x-2">
      <button 
        @click="retryEnrichment" 
        class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
      >
        Retry CUSIP Resolution ({{ enrichmentStatus.unresolvedCusips }} unresolved)
      </button>
      
      <!-- NUCLEAR OPTION for stuck jobs -->
      <button 
        @click="forceCompleteEnrichment" 
        class="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
        title="Nuclear option: Force complete ALL enrichment jobs immediately"
      >
        [ALERT] FORCE COMPLETE ALL
      </button>
    </div>
    
    <!-- Show nuclear button if there are pending jobs for too long -->
    <div v-if="isEnriching && !enrichmentStatus?.unresolvedCusips" class="mt-3 space-x-2">
      <button 
        @click="syncEnrichmentStatus" 
        class="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 transition-colors"
        title="Sync enrichment status with completed jobs"
      >
        [PROCESS] SYNC STATUS
      </button>
      
      <button 
        @click="forceCompleteEnrichment" 
        class="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
        title="Nuclear option: Force complete ALL enrichment jobs immediately"
      >
        [ALERT] FORCE COMPLETE ALL
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
const dismissed = ref(JSON.parse(localStorage.getItem('enrichmentBannerDismissed') || 'false'))
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
  // If dismissed and no tasks are actively pending/processing, don't show
  if (dismissed.value && !isEnriching.value) {
    return false
  }
  
  // Always show if there are pending/processing tasks, even if previously dismissed
  if (isEnriching.value) {
    return true
  }
  
  // Show recently completed only if not dismissed
  return !dismissed.value && currentEnrichmentStatus.value && recentlyCompleted.value
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
    const newStatus = response.data.data || response.data
    
    // Log enrichment progress for debugging
    if (newStatus.tradeEnrichment && newStatus.tradeEnrichment.length > 0) {
      const statuses = newStatus.tradeEnrichment.reduce((acc, s) => {
        acc[s.enrichment_status] = parseInt(s.count)
        return acc
      }, {})
      
      console.log('Enrichment status update:', statuses)
    }
    
    // Log unresolved CUSIPs if any
    if (newStatus.unresolvedCusips > 0) {
      console.log(`Unresolved CUSIPs: ${newStatus.unresolvedCusips}`)
    }
    if (newStatus.stuckCusipJobs > 0) {
      console.log(`Stuck CUSIP jobs: ${newStatus.stuckCusipJobs}`)
    }
    
    enrichmentStatus.value = newStatus
    lastUpdateTime.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch enrichment status:', error)
  }
}

async function retryEnrichment() {
  try {
    const response = await api.post('/trades/retry-enrichment')
    console.log('Enrichment retry initiated:', response.data)
    
    // Refresh status immediately
    await fetchEnrichmentStatus()
    
    // Show success message
    if (response.data.unresolvedCusips > 0 || response.data.resetJobs > 0) {
      alert(`Enrichment retry initiated. Processing ${response.data.unresolvedCusips} CUSIPs.`)
    } else {
      alert('No unresolved CUSIPs found.')
    }
  } catch (error) {
    console.error('Failed to retry enrichment:', error)
    alert('Failed to retry enrichment. Please try again.')
  }
}

async function syncEnrichmentStatus() {
  try {
    const response = await api.post('/trades/sync-enrichment-status')
    console.log('Sync enrichment status:', response.data)
    
    // Refresh status immediately
    await fetchEnrichmentStatus()
    
    alert(`[PROCESS] SYNCED: ${response.data.syncedTrades} trades synced to completed status`)
  } catch (error) {
    console.error('Failed to sync enrichment status:', error)
    alert('Failed to sync enrichment status. Please try again.')
  }
}

async function forceCompleteEnrichment() {
  if (!confirm('[ALERT] NUCLEAR OPTION: This will FORCE COMPLETE all enrichment jobs immediately. Are you sure?')) {
    return
  }
  
  try {
    const response = await api.post('/trades/force-complete-enrichment')
    console.log('Force complete initiated:', response.data)
    
    // Refresh status immediately
    await fetchEnrichmentStatus()
    
    alert(`[ALERT] FORCE COMPLETED: ${response.data.forceCompletedJobs} jobs and ${response.data.forceCompletedTrades} trades completed. No more stuck jobs!`)
  } catch (error) {
    console.error('Failed to force complete enrichment:', error)
    alert('Failed to force complete enrichment. Please try again.')
  }
}

function dismiss() {
  dismissed.value = true
  localStorage.setItem('enrichmentBannerDismissed', 'true')
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

// Watch for changes in enrichment status to adjust polling frequency and reset dismissed state
watch(isEnriching, (newValue, oldValue) => {
  // If enrichment starts and we were previously not enriching, reset dismissed state
  if (newValue && !oldValue) {
    dismissed.value = false
    localStorage.setItem('enrichmentBannerDismissed', 'false')
    console.log('New enrichment tasks detected, showing banner again')
  }
  
  // Restart polling with new interval if status changed
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