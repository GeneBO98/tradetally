<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="heading-page">Account & Cashflow</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Track your brokerage accounts and daily cash movement
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !hasAccounts" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Main Content -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Side: Cashflow Table (2/3 width on large screens) -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Cashflow Summary Cards -->
        <div v-if="cashflow" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="card">
            <div class="card-body">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Initial Balance
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                ${{ formatNumber(cashflow.summary.initialBalance) }}
              </dd>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Current Balance
              </dt>
              <dd class="mt-1 text-lg font-semibold" :class="balanceClass">
                ${{ formatNumber(cashflow.summary.currentBalance) }}
              </dd>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Inflow
              </dt>
              <dd class="mt-1 text-lg font-semibold text-green-600 dark:text-green-400">
                +${{ formatNumber(cashflow.summary.totalInflow) }}
              </dd>
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Outflow
              </dt>
              <dd class="mt-1 text-lg font-semibold text-red-600 dark:text-red-400">
                -${{ formatNumber(cashflow.summary.totalOutflow) }}
              </dd>
            </div>
          </div>
        </div>

        <!-- Cashflow Table -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h3 class="heading-card">Daily Cashflow</h3>
              <div v-if="cashflow" class="text-sm text-gray-500 dark:text-gray-400">
                {{ cashflow.cashflow.length }} trading days
              </div>
            </div>

            <div v-if="!cashflow || cashflow.cashflow.length === 0" class="text-center py-8">
              <p class="text-gray-500 dark:text-gray-400">
                {{ selectedAccountId ? 'No cashflow data available for this date range' : 'Select an account to view cashflow' }}
              </p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Inflow</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outflow</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="row in reversedCashflow" :key="row.date" class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {{ formatDate(row.date) }}
                    </td>
                    <td class="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                      <span v-if="row.inflow > 0">+${{ formatNumber(row.inflow) }}</span>
                      <span v-else class="text-gray-400">-</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400 whitespace-nowrap">
                      <span v-if="row.outflow > 0">-${{ formatNumber(row.outflow) }}</span>
                      <span v-else class="text-gray-400">-</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-right font-medium whitespace-nowrap" :class="row.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                      {{ row.net >= 0 ? '+' : '' }}${{ formatNumber(row.net) }}
                    </td>
                    <td class="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      ${{ formatNumber(row.balance) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Side: Account Setup Panel (1/3 width on large screens) -->
      <div class="space-y-6">
        <!-- Accounts List -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h3 class="heading-card">Accounts</h3>
              <button @click="openAddAccountModal" class="btn-primary text-sm">
                Add Account
              </button>
            </div>

            <div v-if="accounts.length === 0" class="text-center py-4">
              <p class="text-gray-500 dark:text-gray-400">No accounts configured</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Create an account to start tracking cashflow
              </p>
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="account in accounts"
                :key="account.id"
                class="p-3 border rounded-lg cursor-pointer transition-colors"
                :class="[
                  account.isPrimary ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700',
                  selectedAccountId === account.id ? 'ring-2 ring-primary-500' : ''
                ]"
                @click="selectAccount(account.id)"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 dark:text-white truncate">
                      {{ account.accountName }}
                      <span v-if="account.isPrimary" class="ml-2 text-xs text-primary-600 dark:text-primary-400">Primary</span>
                    </div>
                    <div v-if="account.broker" class="text-sm text-gray-500 dark:text-gray-400">
                      {{ account.broker }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      Initial: ${{ formatNumber(account.initialBalance) }}
                    </div>
                    <div v-if="account.tradeCount > 0" class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {{ account.tradeCount }} linked trade{{ account.tradeCount !== 1 ? 's' : '' }}
                    </div>
                  </div>
                  <div class="flex items-center space-x-2 ml-2">
                    <button
                      @click.stop="editAccount(account)"
                      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Edit account"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      @click.stop="confirmDeleteAccount(account)"
                      class="text-red-400 hover:text-red-600"
                      title="Delete account"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Transaction Entry -->
        <div class="card">
          <div class="card-body">
            <h3 class="heading-card mb-4">Add Transaction</h3>

            <form @submit.prevent="submitTransaction" class="space-y-4">
              <div>
                <label class="label">Account</label>
                <select v-model="transactionForm.accountId" class="input w-full" required>
                  <option value="" disabled>Select account</option>
                  <option v-for="account in accounts" :key="account.id" :value="account.id">
                    {{ account.accountName }}
                  </option>
                </select>
              </div>

              <div>
                <label class="label">Type</label>
                <select v-model="transactionForm.type" class="input w-full" required>
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>
              </div>

              <div>
                <label class="label">Amount</label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span class="text-gray-500 dark:text-gray-400">$</span>
                  </div>
                  <input
                    v-model="transactionForm.amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    class="input w-full pl-8"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label class="label">Date</label>
                <input v-model="transactionForm.date" type="date" class="input w-full" required />
              </div>

              <div>
                <label class="label">Description (Optional)</label>
                <input
                  v-model="transactionForm.description"
                  type="text"
                  class="input w-full"
                  placeholder="e.g., Monthly deposit"
                />
              </div>

              <button
                type="submit"
                class="btn-primary w-full"
                :disabled="submitting || !transactionForm.accountId"
              >
                {{ submitting ? 'Adding...' : 'Add Transaction' }}
              </button>
            </form>
          </div>
        </div>

        <!-- Recent Transactions -->
        <div v-if="transactions.length > 0" class="card">
          <div class="card-body">
            <h3 class="heading-card mb-4">Recent Transactions</h3>
            <div class="space-y-2">
              <div
                v-for="tx in transactions.slice(0, 5)"
                :key="tx.id"
                class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800"
              >
                <div>
                  <div class="text-sm font-medium" :class="tx.transactionType === 'deposit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                    {{ tx.transactionType === 'deposit' ? '+' : '-' }}${{ formatNumber(tx.amount) }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(tx.transactionDate) }}
                    <span v-if="tx.description" class="ml-1">- {{ tx.description }}</span>
                  </div>
                </div>
                <button
                  @click="removeTransaction(tx.id)"
                  class="text-gray-400 hover:text-red-600"
                  title="Delete transaction"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Account Modal -->
    <AccountModal
      v-if="showAccountModal"
      :account="editingAccount"
      @close="closeAccountModal"
      @save="saveAccount"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useNotification } from '@/composables/useNotification'
import AccountModal from '@/components/accounts/AccountModal.vue'

const store = useAccountsStore()
const { showSuccess, showError, showDangerConfirmation } = useNotification()

// State
const selectedAccountId = ref('')
const showAccountModal = ref(false)
const editingAccount = ref(null)
const submitting = ref(false)

const transactionForm = ref({
  accountId: '',
  type: 'deposit',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: ''
})

// Computed
const loading = computed(() => store.loading)
const accounts = computed(() => store.accounts)
const hasAccounts = computed(() => store.hasAccounts)
const cashflow = computed(() => store.cashflow)
const transactions = computed(() => store.transactions)

const reversedCashflow = computed(() =>
  cashflow.value?.cashflow ? [...cashflow.value.cashflow].reverse() : []
)

const balanceClass = computed(() => {
  if (!cashflow.value) return 'text-gray-900 dark:text-white'
  const diff = cashflow.value.summary.currentBalance - cashflow.value.summary.initialBalance
  return diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
})

// Methods
function formatNumber(num) {
  return parseFloat(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  // Handle various date formats
  let date
  if (typeof dateStr === 'string') {
    // If it's already a full ISO string, parse directly
    if (dateStr.includes('T')) {
      date = new Date(dateStr)
    } else {
      // Assume YYYY-MM-DD format
      date = new Date(dateStr + 'T00:00:00')
    }
  } else if (dateStr instanceof Date) {
    date = dateStr
  } else {
    return String(dateStr)
  }

  if (isNaN(date.getTime())) {
    return String(dateStr) // Return original if parsing failed
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function redactAccountId(accountId) {
  if (!accountId) return null
  const str = String(accountId).trim()
  if (str.length <= 4) return str
  return '****' + str.slice(-4)
}

function selectAccount(accountId) {
  selectedAccountId.value = accountId
  loadCashflow()
}

async function loadCashflow() {
  if (!selectedAccountId.value) return

  try {
    await store.fetchCashflow(selectedAccountId.value)
    await store.fetchTransactions(selectedAccountId.value)
    // Update transaction form to use selected account
    transactionForm.value.accountId = selectedAccountId.value
  } catch (error) {
    showError('Error', 'Failed to load cashflow data')
  }
}

function openAddAccountModal() {
  editingAccount.value = null
  showAccountModal.value = true
}

function editAccount(account) {
  editingAccount.value = account
  showAccountModal.value = true
}

function closeAccountModal() {
  showAccountModal.value = false
  editingAccount.value = null
}

async function saveAccount(accountData) {
  try {
    if (editingAccount.value) {
      await store.updateAccount(editingAccount.value.id, accountData)
      showSuccess('Success', 'Account updated successfully')
    } else {
      await store.createAccount(accountData)
      showSuccess('Success', 'Account created successfully')
    }
    closeAccountModal()

    // If this is the first account, auto-select it
    if (accounts.value.length === 1) {
      selectedAccountId.value = accounts.value[0].id
      await loadCashflow()
    }
  } catch (error) {
    showError('Error', error.message || 'Failed to save account')
  }
}

function confirmDeleteAccount(account) {
  showDangerConfirmation(
    'Delete Account',
    `Are you sure you want to delete "${account.accountName}"? This will not delete associated trades, only the account configuration and any deposit/withdrawal transactions.`,
    async () => {
      try {
        await store.deleteAccount(account.id)
        showSuccess('Success', 'Account deleted successfully')
        if (selectedAccountId.value === account.id) {
          selectedAccountId.value = ''
          store.clearCashflow()
        }
      } catch (error) {
        showError('Error', 'Failed to delete account')
      }
    }
  )
}

async function submitTransaction() {
  if (!transactionForm.value.accountId || !transactionForm.value.amount) return

  submitting.value = true

  try {
    await store.addTransaction(transactionForm.value.accountId, {
      transactionType: transactionForm.value.type,
      amount: parseFloat(transactionForm.value.amount),
      transactionDate: transactionForm.value.date,
      description: transactionForm.value.description
    })

    showSuccess('Success', 'Transaction added successfully')

    // Reset form (keep account selected)
    transactionForm.value = {
      accountId: transactionForm.value.accountId,
      type: 'deposit',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: ''
    }

    // Reload cashflow if same account is selected
    if (transactionForm.value.accountId === selectedAccountId.value) {
      await loadCashflow()
    }
  } catch (error) {
    showError('Error', 'Failed to add transaction')
  } finally {
    submitting.value = false
  }
}

async function removeTransaction(transactionId) {
  try {
    await store.deleteTransaction(transactionId)
    showSuccess('Success', 'Transaction deleted')
    await loadCashflow()
  } catch (error) {
    showError('Error', 'Failed to delete transaction')
  }
}

// Lifecycle
onMounted(async () => {
  await store.fetchAccounts()

  // Auto-select primary account
  if (store.primaryAccount) {
    selectedAccountId.value = store.primaryAccount.id
    transactionForm.value.accountId = store.primaryAccount.id
    await loadCashflow()
  } else if (accounts.value.length > 0) {
    // Or first account if no primary
    selectedAccountId.value = accounts.value[0].id
    transactionForm.value.accountId = accounts.value[0].id
    await loadCashflow()
  }
})
</script>
