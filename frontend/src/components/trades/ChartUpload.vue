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

async function addChart() {
  if (!props.tradeId) {
    showError('Error', 'Trade ID is required to add chart')
    return
  }

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
</script>
