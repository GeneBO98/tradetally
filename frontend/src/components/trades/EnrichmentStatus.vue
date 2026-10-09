<template>
  <div
    v-if="showStatus"
    class="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-center gap-3 px-4 py-3">
      <div class="animate-spin h-4 w-4 flex-shrink-0 rounded-full border-2 border-primary-600 border-t-transparent"></div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enriching trades</span>
          <span class="text-sm text-gray-500 dark:text-gray-400">{{ statusMessage }}</span>
        </div>
      </div>

      <div class="flex flex-shrink-0 items-center gap-1">
        <button
          v-if="!enrichmentStatus?.unresolvedCusips"
          @click="syncEnrichmentStatus"
          class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white transition-colors"
          title="Sync enrichment status with completed jobs"
        >
          <ArrowPathIcon class="h-3.5 w-3.5" />
          Sync
        </button>
        <button
          @click="forceCompleteEnrichment"
          class="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
          title="Mark all pending enrichment jobs as complete"
        >
          Force complete
        </button>
        <button
          @click="dismiss"
          class="ml-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="Dismiss"
        >
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Progress -->
    <div class="px-4 pb-3">
      <div class="flex items-center gap-3">
        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          <div
            class="h-full rounded-full bg-primary-600 transition-all duration-500"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
        <span class="w-9 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">{{ Math.round(progress) }}%</span>
      </div>
    </div>

    <!-- CUSIP resolution issues -->
    <div
      v-if="enrichmentStatus?.cusipErrors?.length > 0"
      class="border-t border-gray-200 dark:border-gray-700 px-4 py-3"
    >
      <div class="flex items-start gap-2">
        <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300">Some CUSIPs could not be resolved</p>
          <ul class="mt-1 space-y-0.5">
            <li
              v-for="error in enrichmentStatus.cusipErrors"
              :key="error.error_message"
              class="flex justify-between gap-4 text-xs text-gray-500 dark:text-gray-400"
            >
              <span class="truncate">{{ error.error_message }}</span>
              <span class="flex-shrink-0 tabular-nums">{{ error.count }} CUSIP{{ error.count == 1 ? '' : 's' }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import api from '@/services/api'
import { useEnrichmentStatus } from '@/composables/usePriceAlertNotifications'
import { useNotification } from '@/composables/useNotification'
import { ExclamationTriangleIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const { showSuccess, showError, showWarning, showConfirmation } = useNotification()

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
  // Only show while enrichment is actively in progress; the completion state is suppressed.
  if (dismissed.value) return false
  return isEnriching.value
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

function countFor(status) {
  const statuses = currentEnrichmentStatus.value?.tradeEnrichment || []
  return parseInt(statuses.find(s => s.enrichment_status === status)?.count || 0)
}

const statusMessage = computed(() => {
  if (!currentEnrichmentStatus.value) return ''

  const statuses = currentEnrichmentStatus.value.tradeEnrichment || []
  const total = statuses.reduce((sum, s) => sum + parseInt(s.count), 0)
  const completed = countFor('completed')
  const processing = countFor('processing')
  const pending = countFor('pending')

  const parts = [`${completed.toLocaleString()} of ${total.toLocaleString()} done`]
  if (processing > 0) parts.push(`${processing.toLocaleString()} processing`)
  if (pending > 0) parts.push(`${pending.toLocaleString()} queued`)
  return parts.join(' \u00b7 ')
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
    
    console.log('[ENRICHMENT] Full status:', newStatus)
    enrichmentStatus.value = newStatus
    lastUpdateTime.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch enrichment status:', error)
  }
}


async function syncEnrichmentStatus() {
  try {
    const response = await api.post('/trades/sync-enrichment-status')
    console.log('Sync enrichment status:', response.data)
    
    // Refresh status immediately
    await fetchEnrichmentStatus()
    
    showSuccess(
      'Sync Complete', 
      `Successfully synced ${response.data.syncedTrades} trades to completed status`
    )
  } catch (error) {
    console.error('Failed to sync enrichment status:', error)
    showError('Sync Failed', 'Failed to sync enrichment status. Please try again.')
  }
}


async function forceCompleteEnrichment() {
  showConfirmation(
    'Force Complete All Jobs?',
    'WARNING: This will force complete ALL enrichment jobs immediately, even if they are not finished. This action cannot be undone. Are you sure?',
    async () => await performForceComplete(),
    null
  )
}

async function performForceComplete() {
  
  try {
    const response = await api.post('/trades/force-complete-enrichment')
    console.log('Force complete initiated:', response.data)
    
    // Refresh status immediately
    await fetchEnrichmentStatus()
    
    showSuccess(
      'Force Complete Successful', 
      `Force completed ${response.data.forceCompletedJobs} jobs and ${response.data.forceCompletedTrades} trades. All stuck jobs have been cleared.`
    )
  } catch (error) {
    console.error('Failed to force complete enrichment:', error)
    showError('Force Complete Failed', 'Failed to force complete enrichment. Please check the logs and try again.')
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