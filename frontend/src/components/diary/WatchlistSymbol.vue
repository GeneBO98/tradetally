<template>
  <div class="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs group relative">
    <span>{{ symbol }}</span>

    <!-- Action Buttons (show on hover) -->
    <div class="hidden group-hover:flex items-center gap-1 ml-1">
      <!-- Add to Watchlist Button -->
      <button
        @click="handleAddToWatchlist"
        :disabled="addingToWatchlist"
        class="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
        title="Add to main watchlist"
      >
        <PlusCircleIcon class="w-3.5 h-3.5" />
      </button>

      <!-- Create Price Alert Button -->
      <button
        @click="handleCreateAlert"
        class="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
        title="Create price alert"
      >
        <BellAlertIcon class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>

  <!-- Price Alert Modal -->
  <Teleport to="body">
    <div
      v-if="showAlertModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="showAlertModal = false"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Create Price Alert for {{ symbol }}
        </h3>

        <form @submit.prevent="submitAlert">
          <!-- Alert Type -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Alert Type
            </label>
            <select
              v-model="alertForm.alertType"
              class="input"
              required
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>

          <!-- Target Price -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Price
            </label>
            <input
              v-model.number="alertForm.targetPrice"
              type="number"
              step="0.01"
              min="0"
              class="input"
              placeholder="0.00"
              required
            />
            <p v-if="currentPrice" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Current price: ${{ currentPrice.toFixed(2) }}
            </p>
          </div>

          <!-- Notification Methods -->
          <div class="mb-4 space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notification Methods
            </label>
            <label class="flex items-center">
              <input
                v-model="alertForm.emailEnabled"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Email</span>
            </label>
            <label class="flex items-center">
              <input
                v-model="alertForm.browserEnabled"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Browser Push</span>
            </label>
          </div>

          <!-- Error Message -->
          <div v-if="alertError" class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-800 dark:text-red-200">{{ alertError }}</p>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-3">
            <button
              type="button"
              @click="showAlertModal = false"
              class="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="creatingAlert || (!alertForm.emailEnabled && !alertForm.browserEnabled)"
              class="btn-primary"
            >
              {{ creatingAlert ? 'Creating...' : 'Create Alert' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { PlusCircleIcon, BellAlertIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['added-to-watchlist', 'alert-created'])

const addingToWatchlist = ref(false)
const showAlertModal = ref(false)
const creatingAlert = ref(false)
const alertError = ref(null)
const currentPrice = ref(null)

const alertForm = ref({
  alertType: 'above',
  targetPrice: null,
  emailEnabled: true,
  browserEnabled: true
})

const handleAddToWatchlist = async () => {
  try {
    addingToWatchlist.value = true
    alertError.value = null

    // Get user's watchlists
    const watchlistsResponse = await api.get('/watchlists')
    const watchlists = watchlistsResponse.data.data

    if (watchlists.length === 0) {
      alertError.value = 'No watchlist found. Please create a watchlist first.'
      return
    }

    // Find default watchlist or use the first one
    const defaultWatchlist = watchlists.find(w => w.is_default) || watchlists[0]

    // Add symbol to watchlist
    await api.post(`/watchlists/${defaultWatchlist.id}/symbols`, {
      symbol: props.symbol
    })

    emit('added-to-watchlist', props.symbol)

  } catch (error) {
    console.error('Error adding to watchlist:', error)
    if (error.response?.data?.error) {
      alertError.value = error.response.data.error
    }
  } finally {
    addingToWatchlist.value = false
  }
}

const handleCreateAlert = async () => {
  showAlertModal.value = true
  alertError.value = null

  // Fetch current price
  try {
    const response = await api.get(`/market/quote/${props.symbol}`)
    if (response.data && response.data.currentPrice) {
      currentPrice.value = response.data.currentPrice
    }
  } catch (error) {
    console.error('Error fetching current price:', error)
  }
}

const submitAlert = async () => {
  try {
    creatingAlert.value = true
    alertError.value = null

    await api.post('/price-alerts', {
      symbol: props.symbol,
      alert_type: alertForm.value.alertType,
      target_price: alertForm.value.targetPrice,
      email_enabled: alertForm.value.emailEnabled,
      browser_enabled: alertForm.value.browserEnabled
    })

    emit('alert-created', props.symbol)
    showAlertModal.value = false

    // Reset form
    alertForm.value = {
      alertType: 'above',
      targetPrice: null,
      emailEnabled: true,
      browserEnabled: true
    }

  } catch (error) {
    console.error('Error creating alert:', error)
    alertError.value = error.response?.data?.error || 'Failed to create price alert'
  } finally {
    creatingAlert.value = false
  }
}
</script>
