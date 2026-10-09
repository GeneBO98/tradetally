<template>
  <BaseModal
    :model-value="open"
    title="Edit selected trades"
    size="lg"
    :close-on-backdrop="!saving"
    :close-on-escape="!saving"
    :show-close="!saving"
    @update:model-value="!$event && close()"
  >
    <p class="mb-5 text-sm text-gray-600 dark:text-gray-300">
      Apply the same changes to {{ tradeCount }} selected trade{{ tradeCount === 1 ? '' : 's' }}.
      Fields set to Keep unchanged retain their current values.
    </p>

    <div class="space-y-5">
      <fieldset v-for="field in fields" :key="field.key" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <legend class="px-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{{ field.label }}</legend>
        <div class="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <select v-model="modes[field.key]" class="input" :aria-label="`${field.label} action`">
            <option value="keep">Keep unchanged</option>
            <option value="set">Set value</option>
            <option value="clear">{{ field.key === 'account_identifier' ? 'No account' : 'Clear value' }}</option>
          </select>

          <select
            v-if="field.key === 'account_identifier' && modes[field.key] === 'set'"
            v-model="values[field.key]"
            class="input"
            aria-label="Account value"
          >
            <option value="" disabled>Select an account</option>
            <option v-for="account in availableAccounts" :key="account.id" :value="account.accountIdentifier">
              {{ account.accountName }} ({{ account.accountIdentifier }})
            </option>
          </select>
          <div v-else-if="modes[field.key] === 'set'" class="relative">
            <input
              v-model="values[field.key]"
              class="input"
              type="text"
              :maxlength="field.key === 'account_identifier' ? 50 : 100"
              :list="`bulk-${field.key}-options`"
              :placeholder="`Enter or select ${field.label.toLowerCase()}`"
              :aria-label="`${field.label} value`"
            />
            <datalist :id="`bulk-${field.key}-options`">
              <option v-for="option in field.options" :key="option" :value="option" />
            </datalist>
          </div>
          <p v-else class="self-center text-sm text-gray-500 dark:text-gray-400">
            {{ modes[field.key] === 'clear' ? `${field.label} will be cleared.` : `Existing ${field.label.toLowerCase()} values will remain.` }}
          </p>
        </div>
      </fieldset>
    </div>

    <div v-if="changedFields.length" class="mt-5 rounded-md border border-primary-200 bg-primary-50 px-4 py-3 dark:border-primary-800 dark:bg-primary-900/20" aria-live="polite">
      <p class="text-sm font-medium text-primary-800 dark:text-primary-200">Changes to apply</p>
      <ul class="mt-1 space-y-1 text-sm text-primary-700 dark:text-primary-300">
        <li v-for="change in changedFields" :key="change.key">
          {{ change.label }}: {{ change.text }}
        </li>
      </ul>
    </div>

    <p v-if="loadingOptions" class="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading choices...</p>
    <div v-if="error" class="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300" role="alert">
      {{ error }}
    </div>

    <template #footer>
      <button type="button" class="btn-secondary" :disabled="saving" @click="close">Cancel</button>
      <button type="button" class="btn-primary" :disabled="!canSave || saving" @click="save">
        {{ saving ? 'Applying...' : `Apply to ${tradeCount} trade${tradeCount === 1 ? '' : 's'}` }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import api from '@/services/api'
import { useAccountsStore } from '@/stores/accounts'
import { useTradesStore } from '@/stores/trades'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import { useHiddenDropdownItems } from '@/composables/useHiddenDropdownItems'
import { useStrategyOrder } from '@/composables/useStrategyOrder'
import { useSetupOrder } from '@/composables/useSetupOrder'

const props = defineProps({
  open: { type: Boolean, default: false },
  tradeIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])
const accountsStore = useAccountsStore()
const tradesStore = useTradesStore()
const { fetchAccounts: fetchGlobalAccounts } = useGlobalAccountFilter()
const { refresh: refreshHiddenItems, isStrategyHidden, isSetupHidden } = useHiddenDropdownItems()
const { refresh: refreshStrategyOrder, orderNames: orderStrategyNames } = useStrategyOrder()
const { refresh: refreshSetupOrder, orderNames: orderSetupNames } = useSetupOrder()

const FIELD_LABELS = {
  account_identifier: 'Account',
  setup: 'Setup',
  strategy: 'Strategy'
}
const modes = reactive({ account_identifier: 'keep', setup: 'keep', strategy: 'keep' })
const values = reactive({ account_identifier: '', setup: '', strategy: '' })
const strategies = ref([])
const setups = ref([])
const saving = ref(false)
const loadingOptions = ref(false)
const error = ref('')

const tradeCount = computed(() => props.tradeIds.length)
const availableAccounts = computed(() => accountsStore.accounts.filter(account => !account.isArchived && account.accountIdentifier))
const fields = computed(() => [
  { key: 'account_identifier', label: 'Account', options: [] },
  { key: 'setup', label: 'Setup', options: setups.value },
  { key: 'strategy', label: 'Strategy', options: strategies.value }
])
const changedFields = computed(() => Object.keys(modes)
  .filter(key => modes[key] !== 'keep')
  .map(key => ({
    key,
    label: FIELD_LABELS[key],
    text: modes[key] === 'clear'
      ? (key === 'account_identifier' ? 'No account' : 'Cleared')
      : values[key].trim()
  }))
  .filter(change => modes[change.key] === 'clear' || change.text.length > 0))
const canSave = computed(() => {
  const changedKeys = Object.keys(modes).filter(key => modes[key] !== 'keep')
  return props.tradeIds.length > 0
    && changedKeys.length > 0
    && changedKeys.every(key => modes[key] === 'clear' || values[key].trim().length > 0)
})

function reset() {
  Object.keys(modes).forEach(key => {
    modes[key] = 'keep'
    values[key] = ''
  })
  error.value = ''
}

function close() {
  if (!saving.value) emit('close')
}

async function loadOptions() {
  loadingOptions.value = true
  try {
    const [, strategyResponse, setupResponse] = await Promise.all([
      accountsStore.fetchAccounts(),
      api.get('/trades/strategies'),
      api.get('/trades/setups')
    ])
    // Reuse the single-trade editor's choice lists: honor synced hidden-item
    // preferences and custom ordering so the dropdowns match the trade form.
    refreshHiddenItems()
    refreshStrategyOrder()
    refreshSetupOrder()
    strategies.value = orderStrategyNames(
      (strategyResponse.data?.strategies || []).filter(name => !isStrategyHidden(name))
    )
    setups.value = orderSetupNames(
      (setupResponse.data?.setups || []).filter(name => !isSetupHidden(name))
    )
  } catch (err) {
    error.value = 'Some choices could not be loaded. You can still edit setup and strategy by name.'
  } finally {
    loadingOptions.value = false
  }
}

async function save() {
  if (!canSave.value || saving.value) return
  const updates = {}
  for (const key of Object.keys(modes)) {
    if (modes[key] === 'clear') updates[key] = null
    if (modes[key] === 'set') updates[key] = values[key].trim()
  }
  saving.value = true
  error.value = ''
  try {
    const result = await tradesStore.bulkUpdateMetadata(props.tradeIds, updates)
    if (Object.prototype.hasOwnProperty.call(updates, 'account_identifier')) {
      // Account reassignment changes per-account trade counts and the
      // identifier list shared with the global account selector.
      accountsStore.invalidateAccounts()
      await accountsStore.fetchAccounts({ force: true })
      await fetchGlobalAccounts(true)
    }
    emit('saved', result)
  } catch (err) {
    error.value = err?.response?.data?.error || err?.response?.data?.message || 'Unable to update the selected trades'
  } finally {
    saving.value = false
  }
}

watch(() => props.open, open => {
  if (open) {
    reset()
    loadOptions()
  }
}, { immediate: true })
</script>
