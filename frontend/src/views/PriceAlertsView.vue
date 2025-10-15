<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Price Alerts</h1>
        <p class="text-gray-600 dark:text-gray-400">Get notified when your stocks reach target prices</p>
      </div>
      <button
        v-if="isProUser"
        @click="showCreateAlertModal = true"
        class="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
      >
        <MdiIcon :icon="mdiBell" :size="16" classes="mr-2" />
        Create Alert
      </button>
    </div>

    <!-- Pro Feature Notice -->
    <ProUpgradePrompt 
      v-if="!isProUser" 
      variant="card"
      description="Price alerts are available for Pro users only."
    />

    <!-- Notification Status (for Pro users) -->
    <div v-if="isProUser" class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <!-- Market Status -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-3">
          <div :class="['w-3 h-3 rounded-full', marketStatus.isOpen ? 'bg-green-500' : 'bg-yellow-500']"></div>
          <span class="text-sm text-gray-700 dark:text-gray-300">
            {{ marketStatus.status }}
          </span>
          <span v-if="!marketStatus.isOpen && marketStatus.nextOpen" class="text-xs text-gray-500 dark:text-gray-400">
            (Opens {{ marketStatus.nextOpen }})
          </span>
          <span v-else-if="marketStatus.isOpen && marketStatus.closesAt" class="text-xs text-gray-500 dark:text-gray-400">
            (Closes {{ marketStatus.closesAt }})
          </span>
        </div>
      </div>
      
      <!-- Connection Status -->
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div :class="['w-3 h-3 rounded-full', getConnectionStatusColor()]"></div>
          <span class="text-sm text-gray-700 dark:text-gray-300">
            {{ getConnectionStatusText() }}
          </span>
        </div>
        <button
          v-if="!notificationPermissionGranted"
          @click="requestBrowserNotifications"
          class="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Enable browser notifications
        </button>
      </div>
      <div v-if="notifications.length > 0" class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Alerts</h4>
        <div class="space-y-1">
          <div v-for="notification in notifications.slice(0, 3)" :key="notification.id" class="text-xs text-gray-600 dark:text-gray-400">
            {{ notification.symbol }} - {{ notification.message }}
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="isProUser" class="mb-6 flex flex-wrap items-center gap-4">
      <div class="flex items-center space-x-2">
        <label for="symbolFilter" class="text-sm font-medium text-gray-700 dark:text-gray-300">Symbol:</label>
        <input
          id="symbolFilter"
          v-model="filters.symbol"
          type="text"
          placeholder="Filter by symbol"
          class="input"
        >
      </div>
      <div class="flex items-center space-x-2">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
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
    <div v-if="isProUser && loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Alerts Table -->
    <div v-else-if="isProUser && alerts.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Alert Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Target</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Price</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Notifications</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="alert in filteredAlerts" :key="alert.id">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ alert.symbol }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                <span class="capitalize">{{ alert.alert_type.replace('_', ' ') }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                <span v-if="alert.target_price">{{ formatPrice(alert.target_price) }}</span>
                <span v-else-if="alert.change_percent">{{ alert.change_percent }}%</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                {{ alert.current_price ? formatPrice(alert.current_price) : 'N/A' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span v-if="alert.is_active && !alert.triggered_at" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
                <span v-else-if="alert.is_active && alert.triggered_at" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Triggered (Repeat)
                </span>
                <span v-else-if="!alert.is_active && alert.triggered_at" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  Triggered
                </span>
                <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  Inactive
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                <div class="flex space-x-1">
                  <span v-if="alert.email_enabled" title="Email enabled" class="text-blue-500">✉</span>
                  <MdiIcon v-if="alert.browser_enabled" :icon="mdiBell" :size="16" title="Browser enabled" classes="text-green-500" />
                  <MdiIcon v-if="alert.repeat_enabled" :icon="mdiRepeat" :size="16" title="Repeat enabled" classes="text-purple-500" />
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
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
    <div v-else-if="isProUser && !loading" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No price alerts</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by creating your first price alert.</p>
      <div class="mt-6">
        <button
          @click="showCreateAlertModal = true"
          class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
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
                    class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  >
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Email notifications</span>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="alertForm.browser_enabled"
                    type="checkbox"
                    class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  >
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Browser notifications</span>
                </label>
                <label class="flex items-center">
                  <input
                    v-model="alertForm.repeat_enabled"
                    type="checkbox"
                    class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiBell, mdiRepeat } from '@mdi/js'
import { getMarketStatus } from '@/utils/marketStatus'

export default {
  name: 'PriceAlertsView',
  components: {
    ProUpgradePrompt,
    MdiIcon
  },
  setup() {
    const route = useRoute()
    const { showSuccess, showError, showCriticalError, showConfirmation } = useNotification()
    const authStore = useAuthStore()
    const { isConnected, notifications, requestNotificationPermission } = usePriceAlertNotifications()

    const alerts = ref([])
    const loading = ref(true)
    const saving = ref(false)
    const showCreateAlertModal = ref(false)
    const editingAlert = ref(null)

    // Market status tracking
    const marketStatus = ref(getMarketStatus())
    
    // Update market status every minute
    setInterval(() => {
      marketStatus.value = getMarketStatus()
    }, 60000)

    const filters = ref({
      symbol: '',
      activeOnly: 'false'
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
      // If billing is disabled (self-hosted), all users have pro access
      if (authStore.user?.billingEnabled === false) {
        return true
      }
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
        showCriticalError('Error', 'Failed to load price alerts')
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
      showConfirmation(
        'Delete Price Alert',
        `Are you sure you want to delete the price alert for ${alert.symbol}?`,
        async () => {
          try {
            await api.delete(`/price-alerts/${alert.id}`)
            await loadAlerts()
            showSuccess('Success', 'Price alert deleted')
          } catch (error) {
            console.error('Error deleting alert:', error)
            showCriticalError('Error', 'Failed to delete alert')
          }
        }
      )
    }

    const testAlert = async (alert) => {
      try {
        await api.post(`/price-alerts/${alert.id}/test`)
        showSuccess('Success', 'Test alert sent')
      } catch (error) {
        console.error('Error testing alert:', error)
        showCriticalError('Error', 'Failed to send test alert')
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
        console.error('Error response data:', error.response?.data)
        const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to save alert'
        showCriticalError('Error', message)
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

    const getConnectionStatusColor = () => {
      if (!marketStatus.value.isOpen) {
        return 'bg-gray-400' // Gray when market is closed
      }
      return isConnected.value ? 'bg-green-500' : 'bg-red-500'
    }

    const getConnectionStatusText = () => {
      if (!marketStatus.value.isOpen) {
        return 'Notifications paused (market closed)'
      }
      return `Real-time notifications: ${isConnected.value ? 'Connected' : 'Disconnected'}`
    }

    const notificationPermissionGranted = ref(
      'Notification' in window && Notification.permission === 'granted'
    )

    const requestBrowserNotifications = async () => {
      const granted = await requestNotificationPermission()
      notificationPermissionGranted.value = granted
      if (granted) {
        showSuccess('Success', 'Browser notifications enabled!')
      } else {
        showError('Permission Denied', 'Please enable notifications in your browser settings')
      }
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
      formatDate,
      isConnected,
      notifications,
      notificationPermissionGranted,
      requestBrowserNotifications,
      marketStatus,
      getConnectionStatusColor,
      getConnectionStatusText,
      mdiBell,
      mdiRepeat
    }
  }
}
</script>