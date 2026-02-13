<template>
  <div class="space-y-4">
    <div>
      <label class="label">TradingView Charts</label>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Add TradingView chart URLs to display with this trade. You can add multiple charts.
      </p>

      <!-- Chart URL input form -->
      <div class="space-y-3 p-4 border border-gray-300 dark:border-gray-600 rounded-lg">
        <div>
          <label for="chartUrl" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Chart URL *
          </label>
          <input
            id="chartUrl"
            v-model="newChart.url"
            type="url"
            placeholder="https://www.tradingview.com/x/..."
            class="mt-1 shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
            @keypress.enter="addChart"
          />
        </div>

        <div>
          <label for="chartTitle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Chart Title (Optional)
          </label>
          <input
            id="chartTitle"
            v-model="newChart.title"
            type="text"
            placeholder="Entry setup, Exit point, etc."
            class="mt-1 shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
            @keypress.enter="addChart"
          />
        </div>

        <button
          type="button"
          @click="addChart"
          :disabled="!newChart.url || adding"
          class="btn-primary w-full"
        >
          <span v-if="adding">Adding...</span>
          <span v-else>Add Chart</span>
        </button>
      </div>
    </div>

    <!-- Pending charts (create mode) -->
    <div v-if="pendingCharts.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">Pending Charts ({{ pendingCharts.length }})</h4>
      <div class="space-y-2">
        <div
          v-for="(chart, index) in pendingCharts"
          :key="index"
          class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
              {{ chart.title || 'Untitled Chart' }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ chart.url }}</p>
          </div>
          <button
            type="button"
            @click="removePendingChart(index)"
            class="ml-3 text-red-500 hover:text-red-700 flex-shrink-0"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Help text -->
    <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
      <p>To get a TradingView chart URL:</p>
      <ol class="list-decimal list-inside ml-2 space-y-1">
        <li>Open your chart on TradingView</li>
        <li>Click the camera icon to take a snapshot</li>
        <li>Copy the snapshot URL and paste it above</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const props = defineProps({
  tradeId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['added'])

const { showSuccess, showError } = useNotification()

const newChart = ref({
  url: '',
  title: ''
})

const adding = ref(false)
const pendingCharts = ref([])

function removePendingChart(index) {
  pendingCharts.value.splice(index, 1)
}

async function addChart() {
  if (!newChart.value.url || newChart.value.url.trim().length === 0) {
    showError('Error', 'Chart URL is required')
    return
  }

  // Basic URL validation
  try {
    new URL(newChart.value.url)
  } catch (e) {
    showError('Error', 'Please enter a valid URL')
    return
  }

  // Create mode: queue locally
  if (!props.tradeId) {
    pendingCharts.value.push({
      url: newChart.value.url.trim(),
      title: newChart.value.title.trim() || null
    })
    showSuccess('Chart Queued', 'Chart will be saved when the trade is created')
    newChart.value = { url: '', title: '' }
    return
  }

  // Edit mode: upload immediately
  adding.value = true

  try {
    const response = await api.post(`/trades/${props.tradeId}/charts`, {
      chartUrl: newChart.value.url.trim(),
      chartTitle: newChart.value.title.trim() || null
    })

    showSuccess('Success', 'Chart added successfully')

    // Clear form
    newChart.value = {
      url: '',
      title: ''
    }

    // Notify parent component
    emit('added', response.data.chart)

  } catch (error) {
    console.error('Chart add error:', error)
    showError('Error', error.response?.data?.error || 'Failed to add chart')
  } finally {
    adding.value = false
  }
}

async function flushPendingCharts(tradeId) {
  const results = []
  for (const chart of pendingCharts.value) {
    try {
      const response = await api.post(`/trades/${tradeId}/charts`, {
        chartUrl: chart.url,
        chartTitle: chart.title
      })
      results.push({ success: true, chart: response.data.chart })
    } catch (err) {
      console.error('[ChartUpload] Failed to flush chart:', err)
      results.push({ success: false, error: err })
    }
  }
  pendingCharts.value = []
  return results
}

defineExpose({ pendingCharts, flushPendingCharts })
</script>
