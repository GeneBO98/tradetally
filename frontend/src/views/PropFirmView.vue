<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="heading-page">Prop Firm</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Track evaluation rules per account: daily loss, drawdown, profit target, and minimum days.
        </p>
      </div>
      <button class="btn-primary" @click="openCreate">
        Add rule profile
      </button>
    </div>

    <!-- Loading (initial only) -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="profiles.length === 0" class="text-center py-16">
      <ShieldCheckIcon class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No rule profiles yet</h3>
      <p class="mt-1 mx-auto max-w-md text-sm text-gray-500 dark:text-gray-400">
        Attach your prop firm's rules to a trading account and TradeTally will track
        your headroom against daily loss limits, drawdown, and profit targets.
      </p>
      <div class="mt-6">
        <button class="btn-primary" @click="openCreate">Add rule profile</button>
      </div>
    </div>

    <!-- Profiles -->
    <div v-else class="space-y-6">
      <div v-for="profile in profiles" :key="profile.id" class="card">
        <div class="card-body">
          <!-- Card header -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ profile.label || profile.account_identifier }}
                </h2>
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase"
                  :class="stateBadgeClass(profile.status?.state)"
                >{{ stateLabel(profile.status?.state) }}</span>
              </div>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Account {{ profile.account_identifier }} · since {{ formatTradeDate(profile.start_date, 'MMM dd, yyyy') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn-secondary text-sm" @click="openEdit(profile)">Edit</button>
              <button
                class="btn-secondary text-sm text-danger"
                aria-label="Delete rule profile"
                @click="confirmDelete(profile)"
              >Delete</button>
            </div>
          </div>

          <!-- Breach banner -->
          <div
            v-if="profile.status?.breaches?.length"
            class="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3"
          >
            <p class="text-sm font-medium text-danger">
              {{ profile.status.breaches.length }} rule breach{{ profile.status.breaches.length === 1 ? '' : 'es' }}
            </p>
            <ul class="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
              <li v-for="(breach, idx) in profile.status.breaches.slice(0, 5)" :key="idx">
                {{ formatTradeDate(breach.trade_date, 'MMM dd') }} ·
                {{ breach.type === 'daily_loss' ? 'Daily loss limit' : 'Drawdown floor' }} ·
                {{ formatSignedMoney(breach.amount) }}
              </li>
              <li v-if="profile.status.breaches.length > 5">
                and {{ profile.status.breaches.length - 5 }} more
              </li>
            </ul>
          </div>

          <!-- Equity headline -->
          <div class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Equity</div>
              <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {{ formatMoney(profile.status?.current_equity) }}
              </div>
              <div class="text-xs" :class="pnlClass(profile.status?.total_pnl)">
                {{ formatSignedMoney(profile.status?.total_pnl) }} total
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Today</div>
              <div class="mt-1 text-xl font-semibold" :class="pnlClass(profile.status?.today_pnl)">
                {{ formatSignedMoney(profile.status?.today_pnl) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">High Water</div>
              <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {{ formatMoney(profile.status?.high_water_equity) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Trading Days</div>
              <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {{ profile.status?.trading_days ?? 0 }}<span v-if="profile.min_trading_days" class="text-sm text-gray-500 dark:text-gray-400"> / {{ profile.min_trading_days }}</span>
              </div>
            </div>
          </div>

          <!-- Meters -->
          <div class="mt-5 space-y-4">
            <!-- Profit target -->
            <div v-if="profile.profit_target">
              <div class="flex items-baseline justify-between text-sm">
                <span class="font-medium text-gray-700 dark:text-gray-300">Profit target</span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ formatSignedMoney(profile.status?.total_pnl) }} of {{ formatMoney(profile.profit_target) }}
                  ({{ clampPercent(profile.status?.profit_target_progress) }}%)
                </span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-full rounded-full transition-all"
                  :class="profile.status?.state === 'passed' ? 'bg-primary-500' : 'bg-success'"
                  :style="{ width: `${clampPercent(profile.status?.profit_target_progress)}%` }"
                ></div>
              </div>
            </div>

            <!-- Drawdown buffer -->
            <div v-if="profile.max_drawdown">
              <div class="flex items-baseline justify-between text-sm">
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  Drawdown buffer
                  <span class="text-xs text-gray-500 dark:text-gray-400">({{ profile.drawdown_mode === 'trailing' ? 'trailing' : 'static' }} · floor {{ formatMoney(profile.status?.drawdown_floor) }})</span>
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ formatMoney(profile.status?.distance_to_floor) }} left
                </span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-full rounded-full transition-all"
                  :class="bufferBarClass(profile.status?.distance_to_floor, profile.max_drawdown)"
                  :style="{ width: `${bufferPercent(profile.status?.distance_to_floor, profile.max_drawdown)}%` }"
                ></div>
              </div>
            </div>

            <!-- Daily loss headroom -->
            <div v-if="profile.max_daily_loss">
              <div class="flex items-baseline justify-between text-sm">
                <span class="font-medium text-gray-700 dark:text-gray-300">Daily loss headroom</span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ formatMoney(profile.status?.daily_loss_remaining) }} of {{ formatMoney(profile.max_daily_loss) }} left today
                </span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  class="h-full rounded-full transition-all"
                  :class="bufferBarClass(profile.status?.daily_loss_remaining, profile.max_daily_loss)"
                  :style="{ width: `${bufferPercent(profile.status?.daily_loss_remaining, profile.max_daily_loss)}%` }"
                ></div>
              </div>
            </div>
          </div>

          <p class="mt-4 text-xs text-gray-400 dark:text-gray-500">
            Computed from journaled daily closes. Intraday excursions between fills are not visible to the journal,
            so treat the meters as end-of-day accounting, not a live risk engine.
          </p>
        </div>
      </div>
    </div>

    <!-- Create/Edit modal -->
    <BaseModal v-model="showFormModal" :title="editingProfile ? 'Edit rule profile' : 'Add rule profile'" size="lg">
      <form class="space-y-4" @submit.prevent="saveProfile">
        <div>
          <label class="label">Trading account</label>
          <BaseSelect
            v-model="form.account_identifier"
            :options="accountOptions"
            :disabled="Boolean(editingProfile)"
            placeholder="Select an account"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="label">Label</label>
            <input v-model="form.label" type="text" class="input" placeholder="e.g. Topstep 50K eval" maxlength="100" />
          </div>
          <div>
            <label class="label">Account size</label>
            <input v-model.number="form.account_size" type="number" min="1" step="0.01" class="input" placeholder="50000" required />
          </div>
          <div>
            <label class="label">Evaluation start date</label>
            <input v-model="form.start_date" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Minimum trading days</label>
            <input v-model.number="form.min_trading_days" type="number" min="0" step="1" class="input" placeholder="Optional" />
          </div>
          <div>
            <label class="label">Max daily loss</label>
            <input v-model.number="form.max_daily_loss" type="number" min="0" step="0.01" class="input" placeholder="Optional, e.g. 1000" />
          </div>
          <div>
            <label class="label">Profit target</label>
            <input v-model.number="form.profit_target" type="number" min="0" step="0.01" class="input" placeholder="Optional, e.g. 3000" />
          </div>
          <div>
            <label class="label">Max drawdown</label>
            <input v-model.number="form.max_drawdown" type="number" min="0" step="0.01" class="input" placeholder="Optional, e.g. 2000" />
          </div>
          <div>
            <label class="label">Drawdown mode</label>
            <BaseSelect
              v-model="form.drawdown_mode"
              :options="[
                { value: 'static', label: 'Static (fixed floor below start)' },
                { value: 'trailing', label: 'Trailing (floor follows high water)' }
              ]"
            />
          </div>
        </div>
        <p v-if="formError" class="text-sm text-danger">{{ formError }}</p>
      </form>

      <template #footer>
        <button type="button" class="btn-secondary" @click="showFormModal = false">Cancel</button>
        <button type="button" class="btn-primary" :disabled="saving" @click="saveProfile">
          {{ saving ? 'Saving...' : (editingProfile ? 'Save changes' : 'Add profile') }}
        </button>
      </template>
    </BaseModal>

    <!-- Delete confirm -->
    <BaseModal v-model="showDeleteModal" title="Delete rule profile" size="md">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Delete the rule profile for
        <span class="font-medium text-gray-900 dark:text-white">{{ profileToDelete?.label || profileToDelete?.account_identifier }}</span>?
        Your trades are not affected.
      </p>
      <template #footer>
        <button type="button" class="btn-secondary" @click="showDeleteModal = false">Cancel</button>
        <button type="button" class="btn-danger" :disabled="deleting" @click="deleteProfile">
          {{ deleting ? 'Deleting...' : 'Delete' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ShieldCheckIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import BaseModal from '@/components/common/BaseModal.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { formatTradeDate } from '@/utils/date'
import { useNotification } from '@/composables/useNotification'

const { showSuccess, showError } = useNotification()

const profiles = ref([])
const accounts = ref([])
const loading = ref(true)
const initialLoading = ref(true)
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const editingProfile = ref(null)
const profileToDelete = ref(null)
const saving = ref(false)
const deleting = ref(false)
const formError = ref('')

const emptyForm = () => ({
  account_identifier: '',
  label: '',
  account_size: null,
  start_date: '',
  max_daily_loss: null,
  max_drawdown: null,
  drawdown_mode: 'static',
  profit_target: null,
  min_trading_days: null
})
const form = ref(emptyForm())

const accountOptions = computed(() =>
  accounts.value
    .filter(account => account.accountIdentifier)
    .map(account => ({
      value: account.accountIdentifier,
      label: `${account.accountName || account.accountIdentifier} (${account.accountIdentifier})`
    }))
)

function stateLabel(state) {
  return {
    on_track: 'On track',
    warning: 'Warning',
    breached: 'Breached',
    passed: 'Passed'
  }[state] || 'No data'
}

function stateBadgeClass(state) {
  return {
    on_track: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    breached: 'bg-danger/15 text-danger',
    passed: 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
  }[state] || 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

function pnlClass(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed) || parsed === 0) return 'text-gray-500 dark:text-gray-400'
  return parsed > 0 ? 'text-success' : 'text-danger'
}

function formatMoney(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return '-'
  return `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatSignedMoney(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return '-'
  const abs = Math.abs(parsed).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${parsed < 0 ? '-' : '+'}$${abs}`
}

function clampPercent(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, parsed)).toFixed(0)
}

function bufferPercent(remaining, limit) {
  const r = parseFloat(remaining)
  const l = parseFloat(limit)
  if (!Number.isFinite(r) || !Number.isFinite(l) || l <= 0) return 0
  return Math.min(100, Math.max(0, (r / l) * 100)).toFixed(0)
}

function bufferBarClass(remaining, limit) {
  const pct = parseFloat(bufferPercent(remaining, limit))
  if (pct <= 0) return 'bg-danger'
  if (pct <= 25) return 'bg-warning'
  return 'bg-success'
}

async function fetchData() {
  loading.value = true
  try {
    const [profilesResponse, accountsResponse] = await Promise.all([
      api.get('/prop-firm/profiles'),
      api.get('/accounts').catch(() => ({ data: { data: [] } }))
    ])
    profiles.value = profilesResponse.data.profiles || []
    accounts.value = accountsResponse.data.data || []
  } catch (error) {
    console.error('[PROP-FIRM] Failed to load profiles:', error)
    showError('Error', error.response?.data?.error || 'Failed to load rule profiles')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function openCreate() {
  editingProfile.value = null
  form.value = emptyForm()
  formError.value = ''
  showFormModal.value = true
}

function openEdit(profile) {
  editingProfile.value = profile
  form.value = {
    account_identifier: profile.account_identifier,
    label: profile.label || '',
    account_size: parseFloat(profile.account_size),
    start_date: String(profile.start_date || '').slice(0, 10),
    max_daily_loss: profile.max_daily_loss != null ? parseFloat(profile.max_daily_loss) : null,
    max_drawdown: profile.max_drawdown != null ? parseFloat(profile.max_drawdown) : null,
    drawdown_mode: profile.drawdown_mode || 'static',
    profit_target: profile.profit_target != null ? parseFloat(profile.profit_target) : null,
    min_trading_days: profile.min_trading_days != null ? parseInt(profile.min_trading_days) : null
  }
  formError.value = ''
  showFormModal.value = true
}

async function saveProfile() {
  formError.value = ''
  if (!form.value.account_identifier) {
    formError.value = 'Select a trading account.'
    return
  }
  if (!form.value.account_size || form.value.account_size <= 0) {
    formError.value = 'Account size must be greater than zero.'
    return
  }
  if (!form.value.start_date) {
    formError.value = 'Set the evaluation start date.'
    return
  }

  saving.value = true
  try {
    const payload = {
      account_identifier: form.value.account_identifier,
      label: form.value.label || null,
      account_size: form.value.account_size,
      start_date: form.value.start_date,
      max_daily_loss: form.value.max_daily_loss || null,
      max_drawdown: form.value.max_drawdown || null,
      drawdown_mode: form.value.drawdown_mode,
      profit_target: form.value.profit_target || null,
      min_trading_days: form.value.min_trading_days || null
    }

    if (editingProfile.value) {
      await api.put(`/prop-firm/profiles/${editingProfile.value.id}`, payload)
      showSuccess('Saved', 'Rule profile updated.')
    } else {
      await api.post('/prop-firm/profiles', payload)
      showSuccess('Added', 'Rule profile created.')
    }
    showFormModal.value = false
    await fetchData()
  } catch (error) {
    formError.value = error.response?.data?.error || 'Failed to save the rule profile.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(profile) {
  profileToDelete.value = profile
  showDeleteModal.value = true
}

async function deleteProfile() {
  if (!profileToDelete.value) return
  deleting.value = true
  try {
    await api.delete(`/prop-firm/profiles/${profileToDelete.value.id}`)
    showDeleteModal.value = false
    showSuccess('Deleted', 'Rule profile removed.')
    await fetchData()
  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to delete the rule profile.')
  } finally {
    deleting.value = false
  }
}

onMounted(fetchData)
</script>
