<template>
  <div v-if="charts && charts.length > 0" class="space-y-4">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
      TradingView Charts
    </h3>

    <!-- Charts display -->
    <div class="space-y-6">
      <div
        v-for="chart in charts"
        :key="chart.id"
        class="relative group max-w-4xl mx-auto"
      >
        <!-- Chart title if provided -->
        <h4 v-if="chart.chartTitle || chart.chart_title" class="text-md font-medium text-gray-800 dark:text-gray-200 mb-2">
          {{ chart.chartTitle || chart.chart_title }}
        </h4>

        <!-- Chart image preview -->
        <div class="bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg">
          <a
            :href="chart.chartUrl || chart.chart_url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="relative">
              <!-- Try to load as image first -->
              <img
                v-if="getDirectImageUrl(chart) && !chart._imageError"
                :src="getDirectImageUrl(chart)"
                :alt="chart.chartTitle || chart.chart_title || 'TradingView Chart'"
                class="w-full h-auto cursor-pointer hover:opacity-95 transition-opacity duration-200"
                @error="(e) => handleChartImageError(e, chart)"
                @click.prevent="openInNewTab(chart)"
              />
              <!-- If image fails, show nice preview card -->
              <div v-else-if="chart._imageError || !getDirectImageUrl(chart)"
                   class="w-full p-12 flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border-2 border-primary-200 dark:border-gray-600 hover:border-primary-400 dark:hover:border-gray-500 transition-colors cursor-pointer"
                   @click.prevent="openInNewTab(chart)">
                <svg class="h-16 w-16 mb-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 4 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p class="text-lg font-medium text-gray-900 dark:text-white mb-2">TradingView Chart</p>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 text-center max-w-md">
                  Click to view this chart on TradingView
                </p>
                <div class="flex items-center space-x-2 text-primary-600 dark:text-primary-400 font-medium">
                  <span>Open Chart</span>
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </div>
            </div>
          </a>
        </div>

        <!-- Chart URL link -->
        <div class="mt-2 flex items-center justify-between">
          <div class="flex items-center space-x-2 flex-1 min-w-0">
            <svg class="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <a
              :href="chart.chartUrl || chart.chart_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-sm truncate"
            >
              {{ chart.chartUrl || chart.chart_url }}
            </a>
            <button
              @click="copyChartUrl(chart)"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              title="Copy link"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <!-- Delete button (only for trade owner) -->
          <button
            v-if="canDelete"
            type="button"
            @click.stop="deleteChart(chart)"
            class="ml-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg flex-shrink-0"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Chart modal -->
    <div
      v-if="selectedChart"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
      @click="closeChart"
    >
      <div class="relative max-w-6xl w-full" @click.stop>
        <!-- Try image first -->
        <img
          v-if="getDirectImageUrl(selectedChart) && !selectedChart._imageError"
          :src="getDirectImageUrl(selectedChart)"
          :alt="selectedChart.chartTitle || selectedChart.chart_title || 'TradingView Chart'"
          class="max-w-full max-h-[90vh] object-contain mx-auto rounded"
        />
        <!-- If image fails, show message and open button -->
        <div v-else class="bg-white dark:bg-gray-800 rounded-lg p-12 text-center max-w-2xl mx-auto">
          <svg class="h-24 w-24 mx-auto mb-6 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {{ selectedChart.chartTitle || selectedChart.chart_title || 'TradingView Chart' }}
          </h3>
          <p class="text-gray-600 dark:text-gray-300 mb-8">
            This chart cannot be displayed inline due to TradingView's security settings.
          </p>
          <button
            @click="openInNewTab(selectedChart)"
            class="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <span>Open Chart on TradingView</span>
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>

        <!-- Close button -->
        <button
          type="button"
          @click="closeChart"
          class="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- Chart info (only show when image is displayed) -->
        <div v-if="getDirectImageUrl(selectedChart) && !selectedChart._imageError"
             class="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded">
          <p v-if="selectedChart.chartTitle || selectedChart.chart_title" class="text-sm font-medium">
            {{ selectedChart.chartTitle || selectedChart.chart_title }}
          </p>
          <a
            :href="selectedChart.chartUrl || selectedChart.chart_url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs opacity-75 hover:opacity-100 underline"
          >
            View on TradingView
          </a>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="chartToDelete"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click="cancelDelete"
    >
      <div class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div
          class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6"
          @click.stop
        >
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                Delete Chart
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete this chart? This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              @click="confirmDelete"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Delete
            </button>
            <button
              type="button"
              @click="cancelDelete"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
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
    required: true
  },
  charts: {
    type: Array,
    default: () => []
  },
  canDelete: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['deleted'])

const { showSuccess, showError } = useNotification()

const selectedChart = ref(null)
const chartToDelete = ref(null)

function isTradingViewUrl(chart) {
  const chartUrl = chart.chartUrl || chart.chart_url
  return chartUrl && chartUrl.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/i)
}

function getDirectImageUrl(chart) {
  const chartUrl = chart.chartUrl || chart.chart_url
  if (!chartUrl) return null

  // Try S3 image URL for TradingView
  const snapshotMatch = chartUrl.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/i)
  if (snapshotMatch) {
    return `https://s3.tradingview.com/snapshots/x/${snapshotMatch[1]}.png`
  }

  // Check if it's already an image URL
  if (chartUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i)) {
    return chartUrl
  }

  return null
}

function getTradingViewImageUrl(chart) {
  // Return the embed URL for iframe
  const chartUrl = chart.chartUrl || chart.chart_url
  if (!chartUrl) return null

  // Return TradingView page URL for iframe embedding
  const snapshotMatch = chartUrl.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/i)
  if (snapshotMatch) {
    return `https://www.tradingview.com/x/${snapshotMatch[1]}/`
  }

  return chartUrl
}

function openChart(chart) {
  selectedChart.value = chart
}

function closeChart() {
  selectedChart.value = null
}

function openInNewTab(chart) {
  const chartUrl = chart.chartUrl || chart.chart_url
  if (chartUrl) {
    window.open(chartUrl, '_blank', 'noopener,noreferrer')
  }
}

function handleChartImageError(event, chart) {
  // Set error flag on the chart object to show placeholder
  chart._imageError = true
}

async function copyChartUrl(chart) {
  const chartUrl = chart.chartUrl || chart.chart_url
  try {
    await navigator.clipboard.writeText(chartUrl)
    showSuccess('Success', 'Chart URL copied to clipboard')
  } catch (error) {
    console.error('Failed to copy URL:', error)
    showError('Error', 'Failed to copy URL to clipboard')
  }
}

function deleteChart(chart) {
  chartToDelete.value = chart
}

function cancelDelete() {
  chartToDelete.value = null
}

async function confirmDelete() {
  if (!chartToDelete.value) return

  try {
    await api.delete(`/trades/${props.tradeId}/charts/${chartToDelete.value.id}`)
    showSuccess('Success', 'Chart deleted successfully')
    emit('deleted', chartToDelete.value.id)
    chartToDelete.value = null
  } catch (error) {
    console.error('Failed to delete chart:', error)
    showError('Error', error.response?.data?.error || 'Failed to delete chart')
    chartToDelete.value = null
  }
}
</script>
