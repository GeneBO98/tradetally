import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useBrokerSyncStore = defineStore('brokerSync', () => {
  // State
  const connections = ref([])
  const syncLogs = ref([])
  const loading = ref(false)
  const syncing = ref({}) // Track syncing state per connection ID
  const error = ref(null)

  // Getters
  const hasConnections = computed(() => connections.value.length > 0)

  const activeConnections = computed(() =>
    connections.value.filter(c => c.connectionStatus === 'active')
  )

  const ibkrConnection = computed(() =>
    connections.value.find(c => c.brokerType === 'ibkr')
  )

  const schwabConnection = computed(() =>
    connections.value.find(c => c.brokerType === 'schwab')
  )

  const isConnectionSyncing = (connectionId) => {
    return syncing.value[connectionId] === true
  }

  // Actions
  async function fetchConnections() {
    loading.value = true
    error.value = null

    try {
      const response = await api.get('/broker-sync/connections')
      connections.value = response.data.data || []
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to fetch connections:', err)
      error.value = err.response?.data?.error || 'Failed to fetch connections'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function addIBKRConnection(credentials) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/broker-sync/connections/ibkr', {
        flexToken: credentials.flexToken,
        flexQueryId: credentials.flexQueryId,
        autoSyncEnabled: credentials.autoSyncEnabled || false,
        syncFrequency: credentials.syncFrequency || 'daily',
        syncTime: credentials.syncTime || '06:00:00'
      })

      // Refresh connections list
      await fetchConnections()

      return response.data.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to add IBKR connection:', err)
      error.value = err.response?.data?.error || 'Failed to add IBKR connection'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function initSchwabOAuth() {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/broker-sync/connections/schwab/init')

      // Return the auth URL to redirect the user
      return response.data.authUrl
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to init Schwab OAuth:', err)
      error.value = err.response?.data?.error || 'Failed to initiate Schwab connection'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateConnection(connectionId, updates) {
    loading.value = true
    error.value = null

    try {
      const response = await api.put(`/broker-sync/connections/${connectionId}`, updates)

      // Update local state
      const index = connections.value.findIndex(c => c.id === connectionId)
      if (index !== -1) {
        connections.value[index] = response.data.data
      }

      return response.data.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to update connection:', err)
      error.value = err.response?.data?.error || 'Failed to update connection'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteConnection(connectionId) {
    loading.value = true
    error.value = null

    try {
      await api.delete(`/broker-sync/connections/${connectionId}`)

      // Remove from local state
      connections.value = connections.value.filter(c => c.id !== connectionId)
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to delete connection:', err)
      error.value = err.response?.data?.error || 'Failed to delete connection'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function triggerSync(connectionId, options = {}) {
    syncing.value[connectionId] = true
    error.value = null

    try {
      const response = await api.post(`/broker-sync/connections/${connectionId}/sync`, {
        startDate: options.startDate,
        endDate: options.endDate
      })

      return response.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to trigger sync:', err)
      error.value = err.response?.data?.error || 'Failed to start sync'
      throw err
    } finally {
      syncing.value[connectionId] = false
    }
  }

  async function testConnection(connectionId) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post(`/broker-sync/connections/${connectionId}/test`)

      // Refresh connection to get updated status
      await fetchConnections()

      return response.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to test connection:', err)
      error.value = err.response?.data?.error || 'Connection test failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchSyncLogs(connectionId = null, limit = 20) {
    loading.value = true
    error.value = null

    try {
      let response
      if (connectionId) {
        response = await api.get(`/broker-sync/connections/${connectionId}/logs`, {
          params: { limit }
        })
      } else {
        response = await api.get('/broker-sync/logs', {
          params: { limit }
        })
      }

      syncLogs.value = response.data.data || []
      return syncLogs.value
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to fetch sync logs:', err)
      error.value = err.response?.data?.error || 'Failed to fetch sync logs'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getSyncStatus(syncId) {
    try {
      const response = await api.get(`/broker-sync/sync/${syncId}/status`)
      return response.data.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to get sync status:', err)
      throw err
    }
  }

  async function deleteBrokerTrades(connectionId) {
    loading.value = true
    error.value = null

    try {
      const response = await api.delete(`/broker-sync/connections/${connectionId}/trades`)
      return response.data
    } catch (err) {
      console.error('[BROKER-SYNC] Failed to delete broker trades:', err)
      error.value = err.response?.data?.error || 'Failed to delete trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function reset() {
    connections.value = []
    syncLogs.value = []
    loading.value = false
    syncing.value = {}
    error.value = null
  }

  return {
    // State
    connections,
    syncLogs,
    loading,
    syncing,
    error,

    // Getters
    hasConnections,
    activeConnections,
    ibkrConnection,
    schwabConnection,
    isConnectionSyncing,

    // Actions
    fetchConnections,
    addIBKRConnection,
    initSchwabOAuth,
    updateConnection,
    deleteConnection,
    deleteBrokerTrades,
    triggerSync,
    testConnection,
    fetchSyncLogs,
    getSyncStatus,
    clearError,
    reset
  }
})
