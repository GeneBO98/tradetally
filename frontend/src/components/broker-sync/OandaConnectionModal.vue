<template>
  <dialog ref="dialog" class="w-full max-w-lg rounded-xl bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50 dark:bg-gray-800 dark:text-white" aria-labelledby="oanda-title" @cancel.prevent="close" @click="handle_backdrop">
    <form class="space-y-5 p-6" @submit.prevent="save">
      <div class="flex items-center justify-between">
        <h2 id="oanda-title" class="text-lg font-semibold">Connect OANDA</h2>
        <button type="button" class="text-sm text-primary-600 dark:text-primary-400" @click="close">Close</button>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Generate a personal access token under Manage API Access in your OANDA account.
        Connect an eligible v20 account to import forex, metals, and CFDs available in your region.
        <a href="https://developer.oanda.com/rest-live-v20/introduction/" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline dark:text-primary-400">OANDA setup guide</a>
      </p>
      <p class="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-600">
        TradeTally only reads your account. OANDA personal tokens also permit trading and access to your other subaccounts.
        Your token is encrypted when saved. You can revoke it in OANDA at any time.
      </p>
      <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <div>
        <label for="oanda-environment" class="label">Environment</label>
        <select id="oanda-environment" v-model="form.broker_environment" class="input" :disabled="loading || Boolean(reconnecting)" @change="reset_accounts">
          <option value="practice">Practice account</option>
          <option value="live">Live account</option>
        </select>
      </div>
      <div>
        <label for="oanda-token" class="label">Personal access token</label>
        <input id="oanda-token" v-model="form.api_token" class="input" type="password" autocomplete="off" required :disabled="loading" @input="reset_accounts" />
      </div>
      <button type="button" class="btn-secondary" :disabled="loading || !form.api_token.trim()" @click="load_accounts">
        {{ loading ? 'Checking...' : 'Load accounts' }}
      </button>
      <div v-if="accounts.length">
        <label for="oanda-account" class="label">Account</label>
        <select id="oanda-account" v-model="form.account_id" class="input" required :disabled="loading || Boolean(reconnecting)">
          <option v-for="account in accounts" :key="account.account_id" :value="account.account_id">{{ account.account_id }}</option>
        </select>
      </div>
      <div>
        <label for="oanda-label" class="label">Account label (optional)</label>
        <input id="oanda-label" v-model="form.account_label" class="input" maxlength="100" :disabled="loading" />
      </div>
      <div>
        <label for="oanda-start" class="label">Sync trades closed from (optional)</label>
        <input id="oanda-start" v-model="form.sync_start_date" type="date" class="input" :max="today" :disabled="loading" />
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Open trades are included with their full execution history. Leave blank for all history.</p>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.auto_sync_enabled" type="checkbox" class="rounded text-primary-600 focus:ring-primary-500" :disabled="loading" />
        Sync automatically each day
      </label>
      <div v-if="form.auto_sync_enabled">
        <label for="oanda-time" class="label">Daily sync time</label>
        <input id="oanda-time" v-model="form.sync_time" type="time" class="input" required :disabled="loading" />
      </div>
      <div class="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button type="button" class="btn-secondary" :disabled="loading" @click="close">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="loading || !accounts.length || !form.account_id">{{ loading ? 'Connecting...' : 'Connect account' }}</button>
      </div>
    </form>
  </dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '@/services/api'

const props = defineProps({ reconnecting: { type: Object, default: null } })
const emit = defineEmits(['close', 'connected'])
const dialog = ref(null)
const loading = ref(false)
const error = ref('')
const accounts = ref([])
const today = new Date().toISOString().slice(0, 10)
const form = ref({
  api_token: '', broker_environment: props.reconnecting?.brokerEnvironment || 'practice',
  account_id: props.reconnecting?.externalAccountId || '',
  account_label: props.reconnecting?.accountLabel || '',
  sync_start_date: props.reconnecting?.syncStartDate || '',
  auto_sync_enabled: props.reconnecting?.autoSyncEnabled ?? false,
  sync_time: props.reconnecting?.syncTime?.slice(0, 5) || '06:00'
})

onMounted(() => dialog.value.showModal())
function close() {
  if (!loading.value) emit('close')
}
function handle_backdrop(event) {
  if (event.target === dialog.value) close()
}
function reset_accounts() {
  accounts.value = []
  form.value.account_id = props.reconnecting?.externalAccountId || ''
  error.value = ''
}
async function load_accounts() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.post('/broker-sync/connections/oanda/accounts', {
      api_token: form.value.api_token.trim(), broker_environment: form.value.broker_environment
    })
    accounts.value = response.data.data || []
    if (props.reconnecting) {
      accounts.value = accounts.value.filter(account => account.account_id === props.reconnecting.externalAccountId)
    }
    form.value.account_id = accounts.value[0]?.account_id || ''
    if (!accounts.value.length) error.value = 'No eligible OANDA v20 accounts were found for this token and environment.'
  } catch (err) {
    error.value = err.response?.data?.error || 'Unable to load OANDA accounts. Check your token and environment.'
  } finally { loading.value = false }
}
async function save() {
  if (loading.value || !accounts.value.some(account => account.account_id === form.value.account_id)) return
  loading.value = true
  error.value = ''
  try {
    await api.post('/broker-sync/connections/oanda', {
      ...form.value, api_token: form.value.api_token.trim(),
      sync_start_date: form.value.sync_start_date || null,
      sync_frequency: props.reconnecting?.syncFrequency || 'daily',
      sync_time: `${form.value.sync_time}:00`
    })
    form.value.api_token = ''
    emit('connected')
  } catch (err) {
    error.value = err.response?.data?.error || 'Unable to connect OANDA. Check your token and account.'
  } finally { loading.value = false }
}
</script>
