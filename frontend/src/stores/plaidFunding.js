import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export const usePlaidFundingStore = defineStore('plaidFunding', () => {
  const connections = ref([])
  const reviewQueue = ref([])
  const reviewHistory = ref([])
  const syncedActivity = ref([])
  const reviewSummary = ref(null)
  const loading = ref(false)
  const reviewLoading = ref(false)
  const syncing = ref({})
  const error = ref(null)

  async function createLinkToken(targetType = 'bank') {
    const response = await api.post('/accounts/plaid/link-token', { targetType })
    return response.data.data
  }

  async function exchangePublicToken(payload) {
    const response = await api.post('/accounts/plaid/exchange', payload)
    return response.data.data
  }

  async function fetchConnections() {
    loading.value = true
    error.value = null

    try {
      const response = await api.get('/accounts/plaid/connections')
      connections.value = response.data.data || []
      return connections.value
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch Plaid connections'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateConnection(connectionId, updates) {
    const response = await api.put(`/accounts/plaid/connections/${connectionId}`, updates)
    await fetchConnections()
    return response.data.data
  }

  async function deleteConnection(connectionId) {
    await api.delete(`/accounts/plaid/connections/${connectionId}`)
    connections.value = connections.value.filter(connection => connection.id !== connectionId)
  }

  async function syncConnection(connectionId) {
    syncing.value[connectionId] = true
    error.value = null

    try {
      const response = await api.post(`/accounts/plaid/connections/${connectionId}/sync`)
      await fetchConnections()
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to sync Plaid connection'
      throw err
    } finally {
      syncing.value[connectionId] = false
    }
  }

  async function linkPlaidAccount(plaidAccountId, payload) {
    const response = await api.put(`/accounts/plaid/accounts/${plaidAccountId}/link`, payload)
    await fetchConnections()
    return response.data.data
  }

  async function unlinkPlaidAccount(plaidAccountId) {
    const response = await api.delete(`/accounts/plaid/accounts/${plaidAccountId}/link`)
    await fetchConnections()
    return response.data.data
  }

  async function fetchReviewQueue(accountId) {
    if (!accountId) {
      reviewQueue.value = []
      reviewHistory.value = []
      syncedActivity.value = []
      reviewSummary.value = null
      return { pending: [], history: [] }
    }

    reviewLoading.value = true
    error.value = null

    try {
      const response = await api.get(`/accounts/${accountId}/plaid/review`)
      reviewQueue.value = response.data.data?.pending || []
      reviewHistory.value = response.data.data?.history || []
      syncedActivity.value = response.data.data?.synced || []
      reviewSummary.value = response.data.data?.summary || null
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch Plaid review queue'
      throw err
    } finally {
      reviewLoading.value = false
    }
  }

  async function approveTransaction(accountId, transactionId, payload) {
    const response = await api.post(`/accounts/${accountId}/plaid/review/${transactionId}/approve`, payload)
    await fetchReviewQueue(accountId)
    return response.data.data
  }

  async function rejectTransaction(accountId, transactionId) {
    await api.post(`/accounts/${accountId}/plaid/review/${transactionId}/reject`)
    await fetchReviewQueue(accountId)
  }

  async function bulkApproveTransactions(accountId, transactionIds, transactionType) {
    const response = await api.post(`/accounts/${accountId}/plaid/review/bulk-approve`, {
      transactionIds,
      transactionType
    })
    await fetchReviewQueue(accountId)
    return response.data.data
  }

  async function bulkRejectTransactions(accountId, transactionIds) {
    const response = await api.post(`/accounts/${accountId}/plaid/review/bulk-reject`, {
      transactionIds
    })
    await fetchReviewQueue(accountId)
    return response.data.data
  }

  async function revertTransaction(accountId, transactionId) {
    const response = await api.post(`/accounts/${accountId}/plaid/review/${transactionId}/revert`)
    await fetchReviewQueue(accountId)
    return response.data.data
  }

  async function bulkRevertTransactions(accountId, transactionIds) {
    const response = await api.post(`/accounts/${accountId}/plaid/review/bulk-revert`, {
      transactionIds
    })
    await fetchReviewQueue(accountId)
    return response.data.data
  }

  function clearError() {
    error.value = null
  }

  return {
    connections,
    reviewQueue,
    reviewHistory,
    syncedActivity,
    reviewSummary,
    loading,
    reviewLoading,
    syncing,
    error,
    createLinkToken,
    exchangePublicToken,
    fetchConnections,
    updateConnection,
    deleteConnection,
    syncConnection,
    linkPlaidAccount,
    unlinkPlaidAccount,
    fetchReviewQueue,
    approveTransaction,
    rejectTransaction,
    bulkApproveTransactions,
    bulkRejectTransactions,
    revertTransaction,
    bulkRevertTransactions,
    clearError
  }
})
