import { ref, computed, watch } from 'vue'
import api from '@/services/api'

const STORAGE_KEY = 'tradetally_global_account'

// Shared state (singleton pattern - state persists across all component instances)
const selectedAccount = ref(null)
const accounts = ref([])
const loading = ref(false)
const initialized = ref(false)

export function useGlobalAccountFilter() {
  // Initialize from localStorage on first use
  if (!initialized.value) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      selectedAccount.value = stored
    }
    initialized.value = true
  }

  const selectedAccountLabel = computed(() => {
    return selectedAccount.value || 'All Accounts'
  })

  const isFiltered = computed(() => {
    return selectedAccount.value !== null && selectedAccount.value !== ''
  })

  async function fetchAccounts() {
    if (loading.value) return
    loading.value = true
    try {
      const response = await api.get('/trades/accounts')
      accounts.value = response.data.accounts || []

      // Validate stored selection still exists
      if (selectedAccount.value && !accounts.value.includes(selectedAccount.value)) {
        console.log('[GLOBAL ACCOUNT] Stored account no longer exists, clearing filter')
        clearAccount()
      }
    } catch (error) {
      console.error('[GLOBAL ACCOUNT] Failed to fetch accounts:', error)
      accounts.value = []
    } finally {
      loading.value = false
    }
  }

  function setAccount(accountId) {
    selectedAccount.value = accountId
    if (accountId) {
      localStorage.setItem(STORAGE_KEY, accountId)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    console.log('[GLOBAL ACCOUNT] Set to:', accountId || 'All Accounts')
  }

  function clearAccount() {
    selectedAccount.value = null
    localStorage.removeItem(STORAGE_KEY)
    console.log('[GLOBAL ACCOUNT] Cleared - showing all accounts')
  }

  return {
    selectedAccount,
    selectedAccountLabel,
    accounts,
    loading,
    isFiltered,
    fetchAccounts,
    setAccount,
    clearAccount
  }
}
