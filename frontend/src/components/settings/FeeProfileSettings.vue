<template>
  <section class="card" aria-labelledby="fee-profiles-heading">
    <div class="card-body">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">Trading costs</p>
          <h3 id="fee-profiles-heading" class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Named fee profiles</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            Save each commission schedule once, then assign it to every account that uses it. Imports use the assigned account profile before any legacy broker defaults.
          </p>
        </div>
        <button type="button" class="btn-primary shrink-0" @click="startCreate">New fee profile</button>
      </div>

      <div v-if="profiles.length" class="mt-6 grid gap-4 xl:grid-cols-2">
        <article
          v-for="profile in profiles"
          :key="profile.id"
          class="rounded-xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-700 dark:bg-gray-800/60"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="truncate text-base font-semibold text-gray-900 dark:text-white">{{ profile.name }}</h4>
                <span
                  v-if="profile.isZeroFee"
                  class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  Zero fee
                </span>
              </div>
              <p v-if="profile.notes" class="mt-1 text-sm text-gray-600 dark:text-gray-400">{{ profile.notes }}</p>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {{ profile.rates.length }} rate{{ profile.rates.length === 1 ? '' : 's' }} · {{ profile.accounts.length }} account{{ profile.accounts.length === 1 ? '' : 's' }} assigned
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <button type="button" class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300" @click="startEdit(profile)">Edit</button>
              <button type="button" class="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" @click="$emit('delete', profile)">Delete</button>
            </div>
          </div>

          <div v-if="profile.rates.length" class="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/30">
            <table class="min-w-full text-left text-xs">
              <thead class="border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <tr>
                  <th class="px-3 py-2 font-medium">Broker</th>
                  <th class="px-3 py-2 font-medium">Instrument</th>
                  <th class="px-3 py-2 text-right font-medium">Commission</th>
                  <th class="px-3 py-2 text-right font-medium">Fees</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="rate in profile.rates" :key="rate.id || `${rate.broker}-${rate.instrument}`">
                  <td class="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200">{{ brokerLabel(rate.broker) }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400">{{ rate.instrument || 'All instruments' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-gray-600 dark:text-gray-400">${{ money(rate.commissionPerContract + rate.commissionPerSide) }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-gray-600 dark:text-gray-400">${{ money(rate.exchangeFeePerContract + rate.nfaFeePerContract + rate.clearingFeePerContract + rate.platformFeePerContract) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <label :for="`profile-accounts-${profile.id}`" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Assigned accounts</label>
            <select
              :id="`profile-accounts-${profile.id}`"
              v-model="accountSelections[profile.id]"
              multiple
              class="input mt-2 min-h-24 w-full"
              :disabled="assigningId === profile.id"
              @change="saveAssignments(profile)"
            >
              <option v-for="account in availableAccounts" :key="account.id" :value="account.id">
                {{ account.accountName }}{{ account.accountIdentifier ? ` (${account.accountIdentifier})` : '' }}
              </option>
            </select>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Select one or more accounts. Saving here removes this profile from accounts you deselect.</p>
            <p v-if="assigningId === profile.id" class="mt-1 text-xs text-primary-600 dark:text-primary-400">Saving assignments...</p>
          </div>
        </article>
      </div>

      <div v-else class="mt-6 rounded-xl border border-dashed border-gray-300 px-5 py-8 text-center dark:border-gray-600">
        <h4 class="text-base font-medium text-gray-900 dark:text-white">No fee profiles yet</h4>
        <p class="mx-auto mt-1 max-w-xl text-sm text-gray-600 dark:text-gray-400">Create a profile for a broker schedule or a zero-fee simulated account. Accounts without a profile continue using the legacy broker defaults during the transition.</p>
      </div>

      <form v-if="formVisible" class="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700" @submit.prevent="submitForm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h4 class="text-base font-semibold text-gray-900 dark:text-white">{{ editingId ? 'Edit fee profile' : 'Create fee profile' }}</h4>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Use one row for a broker-wide default, or add instrument-specific rows for exceptions.</p>
          </div>
          <button type="button" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" @click="cancelForm">Cancel</button>
        </div>

        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label for="fee-profile-name" class="label">Profile name</label>
            <input id="fee-profile-name" v-model="form.name" class="input" maxlength="100" required placeholder="e.g. Tradeify Rithmic" />
          </div>
          <div>
            <label for="fee-profile-notes" class="label">Notes</label>
            <input id="fee-profile-notes" v-model="form.notes" class="input" maxlength="1000" placeholder="Optional rate or account notes" />
          </div>
        </div>

        <label class="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <input v-model="form.isZeroFee" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
          <span>
            <span class="block text-sm font-medium text-amber-900 dark:text-amber-100">Zero-fee profile</span>
            <span class="mt-0.5 block text-xs text-amber-800 dark:text-amber-200">Use for simulated accounts. This explicitly overrides legacy broker settings.</span>
          </span>
        </label>

        <div v-if="!form.isZeroFee" class="mt-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h5 class="text-sm font-semibold text-gray-900 dark:text-white">Rate rows</h5>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">All amounts are per contract or per side, matching the existing fee settings.</p>
            </div>
            <button type="button" class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300" @click="addRate">Add rate row</button>
          </div>

          <div v-for="(rate, index) in form.rates" :key="rate.key" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label :for="`rate-broker-${index}`" class="label">Broker</label>
                <select :id="`rate-broker-${index}`" v-model="rate.broker" class="input">
                  <option value="" disabled>Select broker</option>
                  <option v-for="option in brokerOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <div>
                <label :for="`rate-instrument-${index}`" class="label">Instrument</label>
                <input :id="`rate-instrument-${index}`" v-model="rate.instrument" class="input uppercase" maxlength="50" placeholder="Blank = all" />
              </div>
              <div>
                <label :for="`rate-commission-${index}`" class="label">Commission / contract</label>
                <input :id="`rate-commission-${index}`" v-model.number="rate.commissionPerContract" type="number" step="0.000001" class="input" />
              </div>
              <div>
                <label :for="`rate-side-${index}`" class="label">Commission / side</label>
                <input :id="`rate-side-${index}`" v-model.number="rate.commissionPerSide" type="number" step="0.000001" class="input" />
              </div>
              <div>
                <label :for="`rate-exchange-${index}`" class="label">Exchange / contract</label>
                <input :id="`rate-exchange-${index}`" v-model.number="rate.exchangeFeePerContract" type="number" step="0.000001" class="input" />
              </div>
              <div>
                <label :for="`rate-nfa-${index}`" class="label">NFA / contract</label>
                <input :id="`rate-nfa-${index}`" v-model.number="rate.nfaFeePerContract" type="number" step="0.000001" class="input" />
              </div>
              <div>
                <label :for="`rate-clearing-${index}`" class="label">Clearing / contract</label>
                <input :id="`rate-clearing-${index}`" v-model.number="rate.clearingFeePerContract" type="number" step="0.000001" class="input" />
              </div>
              <div>
                <label :for="`rate-platform-${index}`" class="label">Platform / contract</label>
                <input :id="`rate-platform-${index}`" v-model.number="rate.platformFeePerContract" type="number" step="0.000001" class="input" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <input v-model="rate.notes" class="input" maxlength="1000" placeholder="Optional row note" />
              <button v-if="form.rates.length > 1" type="button" class="shrink-0 text-sm text-red-600 hover:text-red-700 dark:text-red-400" @click="removeRate(index)">Remove</button>
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button type="submit" class="btn-primary" :disabled="loading || !canSubmit">{{ loading ? 'Saving...' : (editingId ? 'Save profile' : 'Create profile') }}</button>
          <p v-if="invalidRate" class="self-center text-xs text-red-600 dark:text-red-400">Choose a broker for each rate row or remove the blank row.</p>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  profiles: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['save', 'delete', 'assign'])

const brokerOptions = [
  { value: 'tradovate', label: 'Tradovate' },
  { value: 'sierrachart', label: 'Sierra Chart' },
  { value: 'ninjatrader', label: 'NinjaTrader' },
  { value: 'thinkorswim', label: 'ThinkOrSwim' },
  { value: 'ibkr', label: 'Interactive Brokers' },
  { value: 'schwab', label: 'Charles Schwab' },
  { value: 'tdameritrade', label: 'TD Ameritrade' },
  { value: 'lightspeed', label: 'Lightspeed' },
  { value: 'webull', label: 'Webull' },
  { value: 'etrade', label: 'E*TRADE' },
  { value: 'tradestation', label: 'TradeStation' },
  { value: 'tastytrade', label: 'Tastytrade' },
  { value: 'fidelity', label: 'Fidelity' },
  { value: 'other', label: 'Other' }
]

const formVisible = ref(false)
const editingId = ref(null)
const assigningId = ref(null)
const accountSelections = reactive({})
const form = reactive({ name: '', notes: '', isZeroFee: false, rates: [] })

const availableAccounts = computed(() => props.accounts.filter(account => !account.isArchived && account.accountIdentifier))
const invalidRate = computed(() => !form.isZeroFee && form.rates.some(rate => !String(rate.broker || '').trim()))
const canSubmit = computed(() => Boolean(form.name.trim()) && !invalidRate.value)

function emptyRate() {
  return {
    key: `${Date.now()}-${Math.random()}`,
    broker: '',
    instrument: '',
    commissionPerContract: 0,
    commissionPerSide: 0,
    exchangeFeePerContract: 0,
    nfaFeePerContract: 0,
    clearingFeePerContract: 0,
    platformFeePerContract: 0,
    notes: ''
  }
}

function startCreate() {
  editingId.value = null
  form.name = ''
  form.notes = ''
  form.isZeroFee = false
  form.rates = []
  formVisible.value = true
}

function startEdit(profile) {
  editingId.value = profile.id
  form.name = profile.name || ''
  form.notes = profile.notes || ''
  form.isZeroFee = profile.isZeroFee === true
  form.rates = (profile.rates || []).map(rate => ({ ...rate, key: `${rate.id || 'rate'}-${Math.random()}` }))
  formVisible.value = true
}

function cancelForm() {
  formVisible.value = false
  editingId.value = null
}

function addRate() {
  form.rates.push(emptyRate())
}

function removeRate(index) {
  form.rates.splice(index, 1)
}

function submitForm() {
  const rates = form.isZeroFee
    ? []
    : form.rates.map(({ key, ...rate }) => ({ ...rate, instrument: String(rate.instrument || '').trim().toUpperCase() }))
  emit('save', {
    id: editingId.value,
    name: form.name.trim(),
    notes: form.notes.trim() || null,
    is_zero_fee: form.isZeroFee,
    rates
  }, cancelForm)
}

function saveAssignments(profile) {
  assigningId.value = profile.id
  emit('assign', { profileId: profile.id, accountIds: accountSelections[profile.id] || [] })
}

function brokerLabel(value) {
  return brokerOptions.find(option => option.value === value)?.label || value
}

function money(value) {
  return Number(value || 0).toFixed(4)
}

watch(() => props.profiles, profiles => {
  const activeIds = new Set(profiles.map(profile => profile.id))
  Object.keys(accountSelections).forEach(id => {
    if (!activeIds.has(id)) delete accountSelections[id]
  })
  profiles.forEach(profile => {
    accountSelections[profile.id] = [...(profile.accountIds || [])]
  })
}, { immediate: true, deep: true })

watch(() => props.loading, loading => {
  if (!loading) assigningId.value = null
})
</script>
