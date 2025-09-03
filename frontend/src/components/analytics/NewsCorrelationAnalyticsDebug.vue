<template>
  <div class="space-y-6">
    <!-- Debug Info -->
    <div class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
      <h3 class="font-bold mb-2">Debug Information</h3>
      <div class="space-y-1 text-sm">
        <div>Loading: {{ loading }}</div>
        <div>Error: {{ error || 'None' }}</div>
        <div>Enabled: {{ enabled }}</div>
        <div>Has Analytics Data: {{ !!analytics }}</div>
        <div v-if="analytics">
          <div>Total Trades Analyzed: {{ analytics.metadata?.total_trades_analyzed }}</div>
          <div>Insights Count: {{ analytics.insights?.length || 0 }}</div>
        </div>
      </div>
    </div>

    <!-- Original Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">News Sentiment Analytics (Debug)</h2>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Analyze your trading patterns in correlation with news sentiment
        </p>
      </div>
      <button
        @click="refreshAnalytics"
        :disabled="loading"
        class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
      >
        <span :class="{ 'animate-spin': loading }">🔄</span>
        <span class="ml-2">Refresh</span>
      </button>
    </div>

    <!-- Raw API Response -->
    <div v-if="rawResponse" class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
      <h3 class="font-bold mb-2">Raw API Response:</h3>
      <pre class="text-xs overflow-auto">{{ JSON.stringify(rawResponse, null, 2) }}</pre>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="card">
      <div class="card-body text-center py-8">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Error</h3>
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
      </div>
    </div>

    <!-- Not Enabled State -->
    <div v-else-if="!enabled" class="card">
      <div class="card-body text-center py-8">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Not Enabled</h3>
        <p class="text-gray-600 dark:text-gray-400">
          Feature is not enabled for this user.
        </p>
      </div>
    </div>

    <!-- Analytics Summary -->
    <div v-else-if="analytics" class="card">
      <div class="card-body">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Analytics Summary</h3>
        <div class="space-y-2">
          <div>Total Trades: {{ analytics.metadata?.total_trades_analyzed || 0 }}</div>
          <div>Insights: {{ analytics.insights?.length || 0 }}</div>
          <div v-if="analytics.overall_performance?.by_sentiment">
            <div>Sentiment Types: {{ Object.keys(analytics.overall_performance.by_sentiment).join(', ') }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- No Data State -->
    <div v-else class="card">
      <div class="card-body text-center py-8">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Data</h3>
        <p class="text-gray-600 dark:text-gray-400">
          No analytics data available.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

// Data
const analytics = ref(null)
const loading = ref(false)
const error = ref(null)
const enabled = ref(false)
const rawResponse = ref(null)

// Methods
async function fetchAnalytics() {
  console.log('📊 NewsCorrelationAnalyticsDebug: Starting fetch...')
  
  loading.value = true
  error.value = null
  rawResponse.value = null

  try {
    // Check if feature is enabled first
    console.log('📊 Checking if enabled...')
    const enabledResponse = await api.get('/news-correlation/enabled')
    console.log('📊 Enabled response:', enabledResponse.data)
    enabled.value = enabledResponse.data.enabled
    
    if (!enabled.value) {
      console.log('📊 Feature not enabled, stopping')
      return
    }

    // Fetch analytics data
    console.log('📊 Fetching analytics...')
    const response = await api.get('/news-correlation/analytics')
    console.log('📊 Analytics response:', response.data)
    
    rawResponse.value = response.data
    analytics.value = response.data

  } catch (err) {
    console.error('📊 Failed to fetch news correlation analytics:', err)
    console.error('📊 Error details:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    })
    
    if (err.response?.status === 403) {
      error.value = 'This feature requires Pro tier access'
      enabled.value = false
    } else {
      error.value = err.response?.data?.error || err.message || 'Failed to load analytics'
    }
  } finally {
    loading.value = false
    console.log('📊 Fetch complete. State:', {
      loading: loading.value,
      error: error.value,
      enabled: enabled.value,
      hasData: !!analytics.value
    })
  }
}

function refreshAnalytics() {
  console.log('📊 Refresh button clicked')
  fetchAnalytics()
}

onMounted(() => {
  console.log('📊 NewsCorrelationAnalyticsDebug mounted')
  fetchAnalytics()
})
</script>