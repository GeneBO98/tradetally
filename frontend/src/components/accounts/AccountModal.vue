<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            {{ isEditing ? 'Edit Account' : 'Add Account' }}
          </h3>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Account Name -->
          <div>
            <label for="accountName" class="label">Account Name *</label>
            <input
              id="accountName"
              v-model="form.accountName"
              type="text"
              class="input w-full"
              placeholder="e.g., Main Trading Account"
              required
            />
          </div>

          <!-- Broker -->
          <div>
            <label for="broker" class="label">Broker</label>
            <select id="broker" v-model="form.broker" class="input w-full">
              <option value="">Select broker (optional)</option>
              <option v-for="broker in brokerOptions" :key="broker" :value="broker">
                {{ broker }}
              </option>
            </select>
          </div>

          <!-- Account Identifier -->
          <div>
            <label for="accountIdentifier" class="label">Account Identifier</label>
            <div class="space-y-2">
              <select
                v-if="unlinkedIdentifiers.length > 0"
                v-model="form.accountIdentifier"
                class="input w-full"
              >
                <option value="">Select from existing trades or enter manually</option>
                <option v-for="id in unlinkedIdentifiers" :key="id.accountIdentifier" :value="id.accountIdentifier">
                  {{ id.accountIdentifier }} {{ id.broker ? `(${id.broker})` : '' }}
                </option>
              </select>
              <input
                v-if="unlinkedIdentifiers.length === 0 || form.accountIdentifier === '' || !unlinkedIdentifiers.find(i => i.accountIdentifier === form.accountIdentifier)"
                v-model="form.accountIdentifier"
                type="text"
                class="input w-full"
                placeholder="e.g., ****1234"
              />
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Link to existing trades by matching account identifier from CSV imports
            </p>
          </div>

          <!-- Initial Balance -->
          <div>
            <label for="initialBalance" class="label">Initial Balance *</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="text-gray-500 dark:text-gray-400">$</span>
              </div>
              <input
                id="initialBalance"
                v-model="form.initialBalance"
                type="number"
                step="0.01"
                min="0"
                class="input w-full pl-8"
                placeholder="0.00"
                required
              />
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Starting cash balance for cashflow calculations
            </p>
          </div>

          <!-- Initial Balance Date -->
          <div>
            <label for="initialBalanceDate" class="label">Initial Balance Date *</label>
            <input
              id="initialBalanceDate"
              v-model="form.initialBalanceDate"
              type="date"
              class="input w-full"
              required
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Date when this balance was accurate - cashflow starts from this date
            </p>
          </div>

          <!-- Primary Account -->
          <div class="flex items-center">
            <input
              id="isPrimary"
              v-model="form.isPrimary"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label for="isPrimary" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Set as primary account
            </label>
          </div>
          <p v-if="form.isPrimary" class="text-xs text-gray-500 dark:text-gray-400 -mt-2 ml-6">
            Primary account is used as the default for imports and shown first in lists
          </p>

          <!-- Notes -->
          <div>
            <label for="notes" class="label">Notes (Optional)</label>
            <textarea
              id="notes"
              v-model="form.notes"
              rows="2"
              class="input w-full"
              placeholder="Any additional notes about this account"
            ></textarea>
          </div>

          <!-- Actions -->
          <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" @click="$emit('close')" class="btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn-primary" :disabled="loading">
              {{ loading ? 'Saving...' : 'Save Account' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps({
  account: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

const store = useAccountsStore()
const loading = ref(false)
const unlinkedIdentifiers = ref([])

const isEditing = computed(() => !!props.account)

const form = ref({
  accountName: '',
  broker: '',
  accountIdentifier: '',
  initialBalance: '',
  initialBalanceDate: new Date().toISOString().split('T')[0],
  isPrimary: false,
  notes: ''
})

const brokerOptions = [
  'Interactive Brokers',
  'Charles Schwab',
  'TD Ameritrade',
  'E*TRADE',
  'Fidelity',
  'Webull',
  'Robinhood',
  'Lightspeed',
  'TradeStation',
  'Tastytrade',
  'Coinbase',
  'Kraken',
  'Binance',
  'Other'
]

async function handleSubmit() {
  loading.value = true

  try {
    emit('save', {
      accountName: form.value.accountName,
      broker: form.value.broker || null,
      accountIdentifier: form.value.accountIdentifier || null,
      initialBalance: parseFloat(form.value.initialBalance) || 0,
      initialBalanceDate: form.value.initialBalanceDate,
      isPrimary: form.value.isPrimary,
      notes: form.value.notes || null
    })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Load unlinked identifiers
  unlinkedIdentifiers.value = await store.fetchUnlinkedIdentifiers()

  // Populate form if editing
  if (props.account) {
    form.value = {
      accountName: props.account.accountName || '',
      broker: props.account.broker || '',
      accountIdentifier: props.account.accountIdentifier || '',
      initialBalance: props.account.initialBalance || '',
      initialBalanceDate: props.account.initialBalanceDate?.split('T')[0] || new Date().toISOString().split('T')[0],
      isPrimary: props.account.isPrimary || false,
      notes: props.account.notes || ''
    }
  }
})
</script>
