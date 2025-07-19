<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Price Alerts</h1>
        <p class="text-gray-600">Get notified when your stocks reach target prices</p>
      </div>
      <button
        @click="showCreateAlertModal = true"
        class="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"></path>
        </svg>
        Create Alert
      </button>
    </div>

    <!-- Pro Feature Notice -->
    <div v-if="!isProUser" class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-yellow-700">
            <strong>Pro Feature:</strong> Price alerts are available for Pro users only.
            <router-link to="/billing" class="font-medium underline">Upgrade to Pro</router-link>
          </p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-6 flex flex-wrap items-center gap-4">
      <div class="flex items-center space-x-2">
        <label for="symbolFilter" class="text-sm font-medium text-gray-700">Symbol:</label>
        <input
          id="symbolFilter"
          v-model="filters.symbol"
          type="text"
          placeholder="Filter by symbol"
          class="input"
        >
      </div>
      <div class="flex items-center space-x-2">
        <label class="text-sm font-medium text-gray-700">Status:</label>
        <select
          v-model="filters.activeOnly"
          class="input"
        >
          <option value="true">Active Only</option>
          <option value="false">All Alerts</option>
        </select>
      </div>
      <button
        @click="loadAlerts"
        class="btn-secondary"
      >
        Refresh
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Alerts Table -->
    <div v-else-if="alerts.length > 0" class="bg-white shadow-sm rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alert Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notifications</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="alert in filteredAlerts" :key="alert.id">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ alert.symbol }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <span class="capitalize">{{ alert.alert_type.replace('_', ' ') }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <span v-if="alert.target_price">{{ formatPrice(alert.target_price) }}</span>
                <span v-else-if="alert.change_percent">{{ alert.change_percent }}%</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ alert.current_price ? formatPrice(alert.current_price) : 'N/A' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span v-if="alert.is_active" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
                <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  Inactive
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <div class="flex space-x-1">
                  <span v-if="alert.email_enabled" title="Email enabled" class="text-blue-500">✉</span>
                  <span v-if="alert.browser_enabled" title="Browser enabled" class="text-green-500">🔔</span>
                  <span v-if="alert.repeat_enabled" title="Repeat enabled" class="text-purple-500">🔄</span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(alert.created_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  @click="editAlert(alert)"
                  class="text-indigo-600 hover:text-indigo-900"
                >
                  Edit
                </button>
                <button
                  @click="testAlert(alert)"
                  class="text-blue-600 hover:text-blue-900"
                >
                  Test
                </button>
                <button
                  @click="deleteAlert(alert)"
                  class="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"></path>
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No price alerts</h3>
      <p class="mt-1 text-sm text-gray-500">Get started by creating your first price alert.</p>
      <div class="mt-6">
        <button
          @click="showCreateAlertModal = true"
          class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Create Alert
        </button>
      </div>
    </div>

    <!-- Create/Edit Alert Modal -->
    <div v-if="showCreateAlertModal || editingAlert" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-[500px] shadow-lg rounded-md bg-white dark:bg-gray-800 dark:border-gray-700">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            {{ editingAlert ? 'Edit Price Alert' : 'Create New Price Alert' }}
          </h3>
          <form @submit.prevent="saveAlert">
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label for="symbol" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Symbol</label>
                <input
                  id="symbol"
                  v-model="alertForm.symbol"
                  type="text"
                  required
                  class="input"
                  placeholder="e.g., AAPL"
                >
              </div>
              <div>
                <label for="alertType" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Alert Type</label>
                <select
                  id="alertType"
                  v-model="alertForm.alert_type"
                  required
                  class="input"
                >
                  <option value="above">Price Above</option>
                  <option value="below">Price Below</option>
                  <option value="change_percent">% Change</option>
                </select>
              </div>
            </div>

            <div class="mb-4" v-if="alertForm.alert_type !== 'change_percent'">
              <label for="targetPrice" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Price ($)</label>
              <input
                id="targetPrice"
                v-model.number="alertForm.target_price"
                type="number"
                step="0.01"
                min="0"
                required
                class="input"
                placeholder="0.00"
              >
            </div>

            <div class="mb-4" v-if="alertForm.alert_type === 'change_percent'">
              <label for="changePercent" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Change Percentage (%)</label>
              <input
                id="changePercent"
                v-model.number="alertForm.change_percent"
                type="number"
                step="0.1"
                required
                class="input"
                placeholder="5.0 (for ±5%)"
              >
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Notification Methods</label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    v-model="alertForm.email_enabled"
                    type="checkbox"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  >
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Email notifications</span>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="alertForm.browser_enabled"
                    type="checkbox"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  >
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Browser notifications</span>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="alertForm.repeat_enabled"
                    type="checkbox"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  >
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Repeat alerts (re-trigger after 1 hour)</span>
                </label>
              </div>
            </div>

            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="cancelEdit"
                class="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="btn-primary disabled:opacity-50"
              >
                {{ saving ? 'Saving...' : (editingAlert ? 'Update' : 'Create') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

export default {
  name: 'PriceAlertsView',
  setup() {
    const route = useRoute()
    const { showSuccess, showError } = useNotification()
    const authStore = useAuthStore()

    const alerts = ref([])
    const loading = ref(true)
    const saving = ref(false)
    const showCreateAlertModal = ref(false)
    const editingAlert = ref(null)

    const filters = ref({
      symbol: '',
      activeOnly: 'true'
    })

    const alertForm = ref({
      symbol: '',
      alert_type: 'above',
      target_price: null,
      change_percent: null,
      email_enabled: true,
      browser_enabled: true,
      repeat_enabled: false
    })

    const isProUser = computed(() => {
      return authStore.user?.tier === 'pro'
    })

    const filteredAlerts = computed(() => {
      let filtered = alerts.value

      if (filters.value.symbol) {
        filtered = filtered.filter(alert => 
          alert.symbol.toLowerCase().includes(filters.value.symbol.toLowerCase())
        )
      }

      return filtered
    })

    const loadAlerts = async () => {
      if (!isProUser.value) {
        loading.value = false
        return
      }

      try {
        loading.value = true
        const params = {
          active_only: filters.value.activeOnly
        }
        if (filters.value.symbol) {
          params.symbol = filters.value.symbol
        }

        const response = await api.get('/price-alerts', { params })
        alerts.value = response.data.data
      } catch (error) {
        console.error('Error loading alerts:', error)
        showError('Error', 'Failed to load price alerts')
      } finally {
        loading.value = false
      }
    }

    const editAlert = (alert) => {
      editingAlert.value = alert
      alertForm.value = {
        symbol: alert.symbol,
        alert_type: alert.alert_type,
        target_price: alert.target_price,
        change_percent: alert.change_percent,
        email_enabled: alert.email_enabled,
        browser_enabled: alert.browser_enabled,
        repeat_enabled: alert.repeat_enabled
      }
    }

    const deleteAlert = async (alert) => {
      if (!confirm(`Delete price alert for ${alert.symbol}?`)) {
        return
      }

      try {
        await api.delete(`/price-alerts/${alert.id}`)
        await loadAlerts()
        showSuccess('Success', 'Price alert deleted')
      } catch (error) {
        console.error('Error deleting alert:', error)
        showError('Error', 'Failed to delete alert')
      }
    }

    const testAlert = async (alert) => {
      try {
        await api.post(`/price-alerts/${alert.id}/test`)
        showSuccess('Success', 'Test alert sent')
      } catch (error) {
        console.error('Error testing alert:', error)
        showError('Error', 'Failed to send test alert')
      }
    }

    const saveAlert = async () => {
      try {
        saving.value = true

        if (editingAlert.value) {
          await api.put(`/price-alerts/${editingAlert.value.id}`, alertForm.value)
          showSuccess('Success', 'Price alert updated')
        } else {
          await api.post('/price-alerts', alertForm.value)
          showSuccess('Success', 'Price alert created')
        }

        cancelEdit()
        await loadAlerts()
      } catch (error) {
        console.error('Error saving alert:', error)
        console.error('Error response:', error.response)
        const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to save alert'
        showError('Error', message)
      } finally {
        saving.value = false
      }
    }

    const cancelEdit = () => {
      showCreateAlertModal.value = false
      editingAlert.value = null
      alertForm.value = {
        symbol: '',
        alert_type: 'above',
        target_price: null,
        change_percent: null,
        email_enabled: true,
        browser_enabled: true,
        repeat_enabled: false
      }
    }

    const formatPrice = (price) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      }).format(price)
    }

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    // Pre-fill symbol from query params
    watch(() => route.query.symbol, (symbol) => {
      if (symbol && !editingAlert.value) {
        alertForm.value.symbol = symbol.toUpperCase()
        showCreateAlertModal.value = true
      }
    }, { immediate: true })

    // Watch filters and reload
    watch(filters, () => {
      loadAlerts()
    }, { deep: true })

    onMounted(() => {
      loadAlerts()
    })

    return {
      alerts,
      loading,
      saving,
      showCreateAlertModal,
      editingAlert,
      filters,
      alertForm,
      isProUser,
      filteredAlerts,
      loadAlerts,
      editAlert,
      deleteAlert,
      testAlert,
      saveAlert,
      cancelEdit,
      formatPrice,
      formatDate
    }
  }
}
</script>