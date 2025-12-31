<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">Broker Sync</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Connect your brokerage accounts to automatically sync trades.
      </p>
    </div>

    <!-- Success/Error Messages -->
    <div v-if="successMessage" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <p class="ml-3 text-sm text-green-700 dark:text-green-300">{{ successMessage }}</p>
      </div>
    </div>

    <div v-if="store.error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <p class="ml-3 text-sm text-red-700 dark:text-red-300">{{ store.error }}</p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading && !store.hasConnections" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-8">
      <!-- Connected Brokers -->
      <div v-if="store.hasConnections" class="space-y-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Connected Brokers</h2>

        <div class="grid gap-4 md:grid-cols-2">
          <BrokerConnectionCard
            v-for="connection in store.connections"
            :key="connection.id"
            :connection="connection"
            @sync="handleSync"
            @test="handleTest"
            @settings="openSettingsModal"
            @delete="handleDelete"
            @deleteTrades="handleDeleteTrades"
          />
        </div>
      </div>

      <!-- Add New Connection -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Add Broker Connection</h3>

          <div class="grid gap-6 md:grid-cols-2">
            <!-- IBKR Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors cursor-pointer"
              :class="[
                store.ibkrConnection
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                  : 'border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'
              ]"
              @click="!store.ibkrConnection && openIBKRModal()"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-red-600 dark:text-red-400 font-bold text-lg">IB</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Interactive Brokers</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ store.ibkrConnection ? 'Already connected' : 'Connect via Flex Query' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Schwab Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors cursor-pointer"
              :class="[
                store.schwabConnection
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                  : 'border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'
              ]"
              @click="!store.schwabConnection && handleSchwabConnect()"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-blue-600 dark:text-blue-400 font-bold text-lg">CS</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Charles Schwab</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ store.schwabConnection ? 'Already connected' : 'Connect via OAuth' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sync History -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Sync History</h3>
            <button
              @click="refreshLogs"
              class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Refresh
            </button>
          </div>

          <div v-if="store.syncLogs.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No sync history yet. Connect a broker and sync to see history here.
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Broker</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Imported</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duplicates</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="log in store.syncLogs" :key="log.id">
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="font-medium text-gray-900 dark:text-white uppercase">{{ log.brokerType }}</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400 capitalize">
                    {{ log.syncType }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span
                      class="px-2 py-1 text-xs rounded-full"
                      :class="getStatusClass(log.status)"
                    >
                      {{ log.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-900 dark:text-white">
                    {{ log.tradesImported || 0 }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {{ log.duplicatesDetected || 0 }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {{ formatDate(log.startedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- IBKR Connection Modal -->
    <IBKRConnectionModal
      v-if="showIBKRModal"
      @close="showIBKRModal = false"
      @save="handleIBKRSave"
      :loading="store.loading"
    />

    <!-- Settings Modal -->
    <ConnectionSettingsModal
      v-if="showSettingsModal"
      :connection="selectedConnection"
      @close="showSettingsModal = false"
      @save="handleSettingsSave"
      :loading="store.loading"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useBrokerSyncStore } from '@/stores/brokerSync'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import BrokerConnectionCard from '@/components/broker-sync/BrokerConnectionCard.vue'
import IBKRConnectionModal from '@/components/broker-sync/IBKRConnectionModal.vue'
import ConnectionSettingsModal from '@/components/broker-sync/ConnectionSettingsModal.vue'

const store = useBrokerSyncStore()
const tradesStore = useTradesStore()
const route = useRoute()
const { showConfirmation, showDangerConfirmation } = useNotification()

const showIBKRModal = ref(false)
const showSettingsModal = ref(false)
const selectedConnection = ref(null)
const successMessage = ref('')

onMounted(async () => {
  await store.fetchConnections()
  await store.fetchSyncLogs()

  // Check for OAuth callback success
  if (route.query.success === 'schwab') {
    successMessage.value = 'Schwab account connected successfully!'
    setTimeout(() => { successMessage.value = '' }, 5000)
  }

  if (route.query.error) {
    store.error = `Connection failed: ${route.query.error}`
  }
})

// Watch for route changes (OAuth callback)
watch(() => route.query, async (newQuery) => {
  if (newQuery.success === 'schwab') {
    await store.fetchConnections()
    successMessage.value = 'Schwab account connected successfully!'
    setTimeout(() => { successMessage.value = '' }, 5000)
  }
})

function openIBKRModal() {
  store.clearError()
  showIBKRModal.value = true
}

function openSettingsModal(connection) {
  selectedConnection.value = connection
  showSettingsModal.value = true
}

async function handleIBKRSave(credentials) {
  try {
    await store.addIBKRConnection(credentials)
    showIBKRModal.value = false
    successMessage.value = 'IBKR connection added successfully!'
    setTimeout(() => { successMessage.value = '' }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleSchwabConnect() {
  try {
    const authUrl = await store.initSchwabOAuth()
    // Redirect to Schwab OAuth
    window.location.href = authUrl
  } catch (error) {
    // Error is handled by store
  }
}

async function handleSync(connection) {
  try {
    await store.triggerSync(connection.id)
    successMessage.value = 'Sync started! Check the history below for results.'
    setTimeout(() => { successMessage.value = '' }, 5000)

    // Poll for updates and refresh trades data
    setTimeout(async () => {
      await store.fetchConnections()
      await store.fetchSyncLogs()
      // Refresh trades data to update P&L and counts after sync
      await tradesStore.fetchTrades()
      await tradesStore.fetchAnalytics()
    }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleTest(connection) {
  try {
    const result = await store.testConnection(connection.id)
    if (result.success) {
      successMessage.value = 'Connection test successful!'
    } else {
      store.error = result.message || 'Connection test failed'
    }
    setTimeout(() => { successMessage.value = '' }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleSettingsSave(updates) {
  try {
    await store.updateConnection(selectedConnection.value.id, updates)
    showSettingsModal.value = false
    successMessage.value = 'Settings updated successfully!'
    setTimeout(() => { successMessage.value = '' }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleDelete(connection) {
  const brokerName = connection.brokerType.toUpperCase()

  showConfirmation(
    `Disconnect ${brokerName}?`,
    'This will remove the broker connection. Your imported trades will not be deleted.',
    async () => {
      try {
        await store.deleteConnection(connection.id)
        successMessage.value = 'Connection removed successfully!'
        setTimeout(() => { successMessage.value = '' }, 5000)
      } catch (error) {
        // Error is handled by store
      }
    }
  )
}

async function handleDeleteTrades(connection) {
  const brokerName = connection.brokerType.toUpperCase()

  showDangerConfirmation(
    `Delete All ${brokerName} Trades?`,
    `This will permanently delete ALL trades that were imported via broker sync from ${brokerName}. This action cannot be undone.`,
    async () => {
      try {
        const result = await store.deleteBrokerTrades(connection.id)
        successMessage.value = result.message || `Deleted trades from ${brokerName}`
        setTimeout(() => { successMessage.value = '' }, 5000)

        // Refresh trades data to update P&L and counts
        console.log('[BROKER-SYNC] Refreshing trades store after delete...')
        await tradesStore.fetchTrades()
        await tradesStore.fetchAnalytics()
        console.log('[BROKER-SYNC] Trades store refreshed. Total P&L:', tradesStore.totalPnL, 'Total trades:', tradesStore.totalTrades)
      } catch (error) {
        console.error('[BROKER-SYNC] Error refreshing trades:', error)
        // Error is handled by store
      }
    },
    { confirmText: 'Delete All Trades' }
  )
}

async function refreshLogs() {
  await store.fetchSyncLogs()
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

function getStatusClass(status) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
    case 'started':
    case 'fetching':
    case 'parsing':
    case 'importing':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
    default:
      return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300'
  }
}
</script>
