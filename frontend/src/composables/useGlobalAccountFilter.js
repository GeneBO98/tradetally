import { ref, computed, watch } from 'vue'
import api from '@/services/api'

export const STORAGE_KEY = 'tradetally_global_account'

// Special filter value for trades without an account
export const UNSORTED_ACCOUNT = '__unsorted__'

// Shared state (singleton pattern - state persists across all component instances)
const selectedAccount = ref(null)
const accounts = ref([])
const loading = ref(false)
const initialized = ref(false)

function normalizeStoredAccount(value) {
  if (value == null) return null

  const normalized = String(value).trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') {
    return null
  }

  return normalized
}

function redactAccountId(accountId) {
  if (!accountId) return null

  const str = String(accountId).trim()
  if (str.length <= 4) return str

  const withoutSeparators = str.replace(/[-.\s]/g, '')
  const digitCount = (withoutSeparators.match(/\d/g) || []).length
  const letterCount = (withoutSeparators.match(/[a-zA-Z]/g) || []).length
  const totalAlphanumeric = digitCount + letterCount

  const isAccountNumber = totalAlphanumeric > 0 && (
    (digitCount / totalAlphanumeric) > 0.5 ||
    /^[A-Za-z]{1,2}\d{4,}/.test(withoutSeparators)
  )

  if (isAccountNumber) {
    return `****${str.slice(-4)}`
  }

  return str
}

export function useGlobalAccountFilter() {
  // Initialize from localStorage on first use
  if (!initialized.value) {
    const stored = normalizeStoredAccount(localStorage.getItem(STORAGE_KEY))
    if (stored) {
      selectedAccount.value = stored
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    initialized.value = true
  }

  const selectedAccountLabel = computed(() => {
    if (selectedAccount.value === UNSORTED_ACCOUNT) {
      return 'Unsorted'
    }

    if (!selectedAccount.value) {
      return 'All Accounts'
    }

    const matchingAccount = accounts.value.find(account => account.value === selectedAccount.value)
    return matchingAccount?.label || redactAccountId(selectedAccount.value) || selectedAccount.value
  })

  const isFiltered = computed(() => {
    return selectedAccount.value !== null && selectedAccount.value !== ''
  })

  async function fetchAccounts() {
    if (loading.value) return
    loading.value = true
    try {
      const [tradeAccountsResult, managedAccountsResult] = await Promise.allSettled([
        api.get('/trades/accounts'),
        api.get('/accounts')
      ])

      const tradeAccounts = tradeAccountsResult.status === 'fulfilled'
        ? (tradeAccountsResult.value.data.accounts || [])
        : []
      const managedAccounts = managedAccountsResult.status === 'fulfilled'
        ? (managedAccountsResult.value.data.data || [])
        : []

      const managedAccountMap = new Map(
        managedAccounts
          .filter(account => account.accountIdentifier)
          .map(account => [account.accountIdentifier, account])
      )

      const accountIdentifiers = tradeAccounts.length > 0
        ? tradeAccounts
        : managedAccounts
          .map(account => account.accountIdentifier)
          .filter(Boolean)

      accounts.value = accountIdentifiers.map(identifier => {
        const managedAccount = managedAccountMap.get(identifier)
        const redactedIdentifier = redactAccountId(identifier)

        return {
          value: identifier,
          label: managedAccount?.accountName || redactedIdentifier || identifier,
          secondaryLabel: managedAccount?.accountName && managedAccount.accountName !== identifier
            ? redactedIdentifier
            : null,
          isPrimary: Boolean(managedAccount?.isPrimary)
        }
      })

      const hasAccountData = tradeAccountsResult.status === 'fulfilled' || managedAccountsResult.status === 'fulfilled'

      // Validate stored selection still exists (allow special UNSORTED_ACCOUNT value)
      if (hasAccountData && selectedAccount.value && selectedAccount.value !== UNSORTED_ACCOUNT && !accounts.value.some(account => account.value === selectedAccount.value)) {
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
    const normalized = normalizeStoredAccount(accountId)
    selectedAccount.value = normalized
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, normalized)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    console.log('[GLOBAL ACCOUNT] Set to:', normalized || 'All Accounts')
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
    clearAccount,
    UNSORTED_ACCOUNT
  }
}
