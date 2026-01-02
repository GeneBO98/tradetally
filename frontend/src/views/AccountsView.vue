<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">Trading Accounts</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your brokerage accounts for trade imports and cashflow tracking.
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="card">
      <div class="card-body">
        <div class="text-red-600 dark:text-red-400">{{ error }}</div>
        <button @click="fetchAccounts" class="btn-secondary mt-4">Retry</button>
      </div>
    </div>

    <template v-else>
      <!-- Add Account Form -->
      <div class="card mb-8">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">
            {{ editingAccount ? 'Edit Account' : 'Add New Account' }}
          </h3>

          <form @submit.prevent="saveAccount" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="accountName" class="label">Account Name <span class="text-red-500">*</span></label>
                <input
                  id="accountName"
                  v-model="form.accountName"
                  type="text"
                  required
                  class="input"
                  placeholder="e.g., Main Trading Account"
                />
              </div>

              <div>
                <label for="accountIdentifier" class="label">Account Identifier</label>
                <input
                  id="accountIdentifier"
                  v-model="form.accountIdentifier"
                  type="text"
                  class="input"
                  placeholder="e.g., ****1234 (last 4 digits)"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For privacy, only store the last 4 characters
                </p>
              </div>

              <div>
                <label for="broker" class="label">Broker</label>
                <select id="broker" v-model="form.broker" class="input">
                  <option value="">Select broker...</option>
                  <option value="schwab">Charles Schwab</option>
                  <option value="thinkorswim">thinkorswim</option>
                  <option value="ibkr">Interactive Brokers</option>
                  <option value="lightspeed">Lightspeed</option>
                  <option value="webull">Webull</option>
                  <option value="etrade">E*TRADE</option>
                  <option value="tradingview">TradingView</option>
                  <option value="tradovate">Tradovate</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label for="initialBalance" class="label">Initial Balance</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    id="initialBalance"
                    v-model.number="form.initialBalance"
                    type="number"
                    step="0.01"
                    min="0"
                    class="input pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label for="initialBalanceDate" class="label">Balance Start Date</label>
                <input
                  id="initialBalanceDate"
                  v-model="form.initialBalanceDate"
                  type="date"
                  class="input"
                />
              </div>

              <div class="flex items-center">
                <label class="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="form.isPrimary"
                    class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Set as primary account</span>
                </label>
              </div>
            </div>

            <div>
              <label for="notes" class="label">Notes</label>
              <textarea
                id="notes"
                v-model="form.notes"
                rows="2"
                class="input"
                placeholder="Optional notes about this account..."
              ></textarea>
            </div>

            <div class="flex gap-3">
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : (editingAccount ? 'Update Account' : 'Add Account') }}
              </button>
              <button v-if="editingAccount" type="button" @click="cancelEdit" class="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Accounts List -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Your Accounts</h3>

          <div v-if="accounts.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No accounts yet. Add your first trading account above.</p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="account in accounts"
              :key="account.id"
              class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900 dark:text-white">{{ account.accountName }}</span>
                  <span v-if="account.isPrimary" class="px-2 py-0.5 text-xs font-medium rounded bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                    Primary
                  </span>
                  <span v-if="account.broker" class="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {{ formatBroker(account.broker) }}
                  </span>
                </div>
                <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  <span v-if="account.accountIdentifier">ID: {{ redactAccountId(account.accountIdentifier) }}</span>
                  <span v-if="account.accountIdentifier && account.tradeCount"> | </span>
                  <span v-if="account.tradeCount">{{ account.tradeCount }} trades</span>
                  <span v-if="!account.accountIdentifier && !account.tradeCount">No identifier set</span>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="editAccount(account)"
                  class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                  title="Edit"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  @click="confirmDelete(account)"
                  class="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                  title="Delete"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showDeleteModal = false"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        <div class="inline-block align-bottom bg-white dark:bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white dark:bg-gray-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 sm:mx-0 sm:h-10 sm:w-10">
                <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                  Delete Account
                </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Are you sure you want to delete "{{ accountToDelete?.accountName }}"? This will not delete any trades associated with this account.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              @click="deleteAccount"
              :disabled="deleting"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
            <button
              type="button"
              @click="showDeleteModal = false"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const error = ref(null)
const accounts = ref([])
const editingAccount = ref(null)
const showDeleteModal = ref(false)
const accountToDelete = ref(null)

const form = ref({
  accountName: '',
  accountIdentifier: '',
  broker: '',
  initialBalance: 0,
  initialBalanceDate: new Date().toISOString().split('T')[0],
  isPrimary: false,
  notes: ''
})

const brokerLabels = {
  schwab: 'Charles Schwab',
  thinkorswim: 'thinkorswim',
  ibkr: 'Interactive Brokers',
  lightspeed: 'Lightspeed',
  webull: 'Webull',
  etrade: 'E*TRADE',
  tradingview: 'TradingView',
  tradovate: 'Tradovate',
  other: 'Other'
}

function formatBroker(broker) {
  return brokerLabels[broker] || broker
}

function redactAccountId(accountId) {
  if (!accountId) return null
  const str = String(accountId).trim()
  if (str.length <= 4) return str
  return '****' + str.slice(-4)
}

async function fetchAccounts() {
  loading.value = true
  error.value = null
  try {
    const response = await api.get('/accounts')
    accounts.value = response.data.data || []
  } catch (err) {
    console.error('Failed to fetch accounts:', err)
    error.value = err.response?.data?.error || err.response?.data?.message || 'Failed to load accounts'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    accountName: '',
    accountIdentifier: '',
    broker: '',
    initialBalance: 0,
    initialBalanceDate: new Date().toISOString().split('T')[0],
    isPrimary: false,
    notes: ''
  }
  editingAccount.value = null
}

function editAccount(account) {
  editingAccount.value = account
  form.value = {
    accountName: account.accountName,
    accountIdentifier: account.accountIdentifier || '',
    broker: account.broker || '',
    initialBalance: parseFloat(account.initialBalance) || 0,
    initialBalanceDate: account.initialBalanceDate?.split('T')[0] || new Date().toISOString().split('T')[0],
    isPrimary: account.isPrimary || false,
    notes: account.notes || ''
  }
  // Scroll to form
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  resetForm()
}

async function saveAccount() {
  saving.value = true
  error.value = null

  try {
    const payload = {
      accountName: form.value.accountName,
      accountIdentifier: form.value.accountIdentifier || null,
      broker: form.value.broker || null,
      initialBalance: form.value.initialBalance || 0,
      initialBalanceDate: form.value.initialBalanceDate,
      isPrimary: form.value.isPrimary,
      notes: form.value.notes || null
    }

    if (editingAccount.value) {
      await api.put(`/accounts/${editingAccount.value.id}`, payload)
    } else {
      await api.post('/accounts', payload)
    }

    resetForm()
    await fetchAccounts()
  } catch (err) {
    console.error('Failed to save account:', err)
    error.value = err.response?.data?.error || 'Failed to save account'
  } finally {
    saving.value = false
  }
}

function confirmDelete(account) {
  accountToDelete.value = account
  showDeleteModal.value = true
}

async function deleteAccount() {
  if (!accountToDelete.value) return

  deleting.value = true
  try {
    await api.delete(`/accounts/${accountToDelete.value.id}`)

    // If we were editing the deleted account, reset the form
    if (editingAccount.value?.id === accountToDelete.value.id) {
      resetForm()
    }

    showDeleteModal.value = false
    accountToDelete.value = null
    await fetchAccounts()
  } catch (err) {
    console.error('Failed to delete account:', err)
    error.value = err.response?.data?.error || 'Failed to delete account'
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  fetchAccounts()
})
</script>
