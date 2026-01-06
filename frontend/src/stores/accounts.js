/**
 * Accounts Store
 * State management for brokerage accounts and cashflow
 * GitHub Issue: #135
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useAccountsStore = defineStore('accounts', () => {
  // State
  const accounts = ref([])
  const currentAccount = ref(null)
  const cashflow = ref(null)
  const transactions = ref([])
  const unlinkedIdentifiers = ref([])
  const loading = ref(false)
  const cashflowLoading = ref(false)
  const error = ref(null)

  // Getters
  const primaryAccount = computed(() =>
    accounts.value.find(a => a.isPrimary)
  )

  const hasAccounts = computed(() => accounts.value.length > 0)

  const accountCount = computed(() => accounts.value.length)

  const currentBalance = computed(() =>
    cashflow.value?.summary?.currentBalance || 0
  )

  const totalInflow = computed(() =>
    cashflow.value?.summary?.totalInflow || 0
  )

  const totalOutflow = computed(() =>
    cashflow.value?.summary?.totalOutflow || 0
  )

  // ========================================
  // ACCOUNTS
  // ========================================

  async function fetchAccounts() {
    loading.value = true
    error.value = null

    try {
      const response = await api.get('/accounts')
      accounts.value = response.data.data || []
      return accounts.value
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch accounts'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchAccount(accountId) {
    try {
      const response = await api.get(`/accounts/${accountId}`)
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch account'
      throw err
    }
  }

  async function fetchPrimaryAccount() {
    try {
      const response = await api.get('/accounts/primary')
      return response.data.data
    } catch (err) {
      console.error('Failed to fetch primary account:', err)
      return null
    }
  }

  async function fetchUnlinkedIdentifiers() {
    try {
      const response = await api.get('/accounts/unlinked-identifiers')
      unlinkedIdentifiers.value = response.data.data || []
      return unlinkedIdentifiers.value
    } catch (err) {
      console.error('Failed to fetch unlinked identifiers:', err)
      return []
    }
  }

  async function createAccount(accountData) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/accounts', accountData)
      await fetchAccounts()
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to create account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateAccount(accountId, updates) {
    loading.value = true
    error.value = null

    try {
      const response = await api.put(`/accounts/${accountId}`, updates)
      await fetchAccounts()
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to update account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteAccount(accountId) {
    loading.value = true
    error.value = null

    try {
      await api.delete(`/accounts/${accountId}`)
      await fetchAccounts()
      // Clear cashflow if we deleted the current account
      if (currentAccount.value?.id === accountId) {
        currentAccount.value = null
        cashflow.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to delete account'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // CASHFLOW
  // ========================================

  async function fetchCashflow(accountId, options = {}) {
    cashflowLoading.value = true
    error.value = null

    try {
      const response = await api.get(`/accounts/${accountId}/cashflow`, {
        params: options
      })
      cashflow.value = response.data.data
      currentAccount.value = response.data.data?.account
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch cashflow'
      throw err
    } finally {
      cashflowLoading.value = false
    }
  }

  function clearCashflow() {
    cashflow.value = null
    currentAccount.value = null
  }

  // ========================================
  // TRANSACTIONS
  // ========================================

  async function fetchTransactions(accountId, options = {}) {
    try {
      const response = await api.get(`/accounts/${accountId}/transactions`, {
        params: options
      })
      transactions.value = response.data.data || []
      return transactions.value
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
      throw err
    }
  }

  async function addTransaction(accountId, transactionData) {
    try {
      const response = await api.post(`/accounts/${accountId}/transactions`, transactionData)
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to add transaction'
      throw err
    }
  }

  async function updateTransaction(transactionId, updates) {
    try {
      const response = await api.put(`/accounts/transactions/${transactionId}`, updates)
      return response.data.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to update transaction'
      throw err
    }
  }

  async function deleteTransaction(transactionId) {
    try {
      await api.delete(`/accounts/transactions/${transactionId}`)
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to delete transaction'
      throw err
    }
  }

  // ========================================
  // RESET
  // ========================================

  function $reset() {
    accounts.value = []
    currentAccount.value = null
    cashflow.value = null
    transactions.value = []
    unlinkedIdentifiers.value = []
    loading.value = false
    cashflowLoading.value = false
    error.value = null
  }

  return {
    // State
    accounts,
    currentAccount,
    cashflow,
    transactions,
    unlinkedIdentifiers,
    loading,
    cashflowLoading,
    error,

    // Getters
    primaryAccount,
    hasAccounts,
    accountCount,
    currentBalance,
    totalInflow,
    totalOutflow,

    // Actions - Accounts
    fetchAccounts,
    fetchAccount,
    fetchPrimaryAccount,
    fetchUnlinkedIdentifiers,
    createAccount,
    updateAccount,
    deleteAccount,

    // Actions - Cashflow
    fetchCashflow,
    clearCashflow,

    // Actions - Transactions
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,

    // Reset
    $reset
  }
})
