<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <!-- Backdrop -->
      <div class="modal-backdrop" @click="emit('close')"></div>

      <!-- Modal -->
      <div role="dialog" aria-modal="true" class="modal-panel w-full max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="modal-title">
            {{ props.reconnecting ? 'Reconnect Interactive Brokers' : 'Connect Interactive Brokers' }}
          </h3>
          <button
            @click="emit('close')"
            class="btn-ghost btn-sm"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6">
          <!-- Instructions -->
          <div class="callout-info mb-6">
            <h4 class="heading-sub text-primary-800 dark:text-primary-300 mb-2">Setup Instructions</h4>
            <ol class="text-sm text-primary-700 dark:text-primary-400 space-y-2 list-decimal list-inside">
              <li>Log in to <a href="https://www.interactivebrokers.com/sso/Login" target="_blank" class="underline font-medium">IBKR Client Portal</a></li>
              <li>Navigate to <strong>Performance & Reports > Flex Queries</strong> (labeled <strong>Reporting</strong> in some accounts)</li>
              <li>Under "Activity Flex Query", click the <strong>+</strong> button to create a new query</li>
              <li>Name your query, set its period to <strong>Last N Calendar Days: 365</strong>, select <strong>Trades</strong> and <strong>Open Positions</strong>, and choose <strong>CSV or XML</strong></li>
              <li>In the Trades section options, make sure <strong>Executions</strong> is selected — order-only or summary data cannot be imported</li>
              <li>For multi-leg options, include <strong>BrokerageOrderID</strong> in the Trades fields so TradeTally can identify legs from the same order</li>
              <li>Save the query and note the <strong>Query ID</strong> shown next to it</li>
              <li>Open <strong>Flex Web Service Configuration</strong> (gear icon), enable <strong>Flex Web Service Status</strong>, and save</li>
              <li>Set <strong>Should Expire After</strong> to <strong>1 Year</strong> — IBKR tokens expire after 6 hours by default, which breaks sync the same day</li>
              <li>Generate or copy your <strong>Current Token</strong></li>
              <li>For same-day fills, create a separate <strong>Trade Confirmation Flex Query</strong> with <strong>Executions</strong> detail and intraday coverage. Include Account ID, Symbol, Asset Class, Conid, Exec ID, Trade ID, Date/Time, Buy/Sell, Quantity, Price, Commission, Currency and Multiplier. For options include Underlying Symbol, Strike, Expiry and Put/Call; include Brokerage Order ID for spreads.</li>
              <li>Use matching date/time formats and reporting timezone for both queries. Keep the Activity Query ID and enter the second ID in its own field below.</li>
            </ol>
            <p class="mt-3 text-xs text-primary-700 dark:text-primary-400">
              Activity reports contain finalized data after overnight processing. An optional Trade Confirmation query imports same-day fills; commissions and P&amp;L remain preliminary until Activity reconciliation. Availability depends on IBKR. For linked accounts, obtain the token from the master account.
            </p>
            <p class="mt-2 text-xs text-primary-700 dark:text-primary-400">
              <a href="https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report" target="_blank" class="underline">View IBKR's official Flex Web Service documentation</a> · <a href="https://www.ibkrguides.com/clientportal/performanceandstatements/tradeflex.htm" target="_blank" rel="noopener noreferrer" class="underline">Trade Confirmation query setup</a> </p> </div> <!-- Error Message --> <div v-if="props.reconnecting" class="callout-warning mb-6"> Your Flex token no longer works. Generate a new token in IBKR (Performance &amp; Reports &gt; Flex Queries &gt; Flex Web Service Configuration), set "Should Expire After" to 1 Year, and paste it below. Your query ID, trades and sync settings are kept. </div> <div v-if="props.error" class="callout-danger mb-6"> <div class="flex"> <svg class="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /> </svg> <p class="ml-3 text-sm text-red-600 dark:text-red-300">{{ props.error }}</p> </div> </div> <form @submit.prevent="handleSubmit" class="space-y-4"> <div> <label for="accountLabel" class="label">Account Label</label> <input id="accountLabel" v-model="form.accountLabel" type="text" class="input" placeholder="e.g., Main Account, Paper Trading" /> <p class="mt-1 text-sm text-gray-500 dark:text-gray-400"> Optional name to identify this account </p> </div> <div> <label for="flexToken" class="label">Flex Token</label> <input id="flexToken" v-model="form.flexToken" type="password" class="input" placeholder="Enter your Flex Token" required /> </div> <div> <label for="flexQueryId" class="label">Activity Flex Query ID</label> <input id="flexQueryId" v-model="form.flexQueryId" type="text" class="input" placeholder="e.g., 123456" :readonly="Boolean(props.reconnecting)" :class="{'opacity-70 cursor-not-allowed': props.reconnecting }"
                required
              />
            </div>

            <div>
              <label for="confirmationQueryId" class="label">Trade Confirmation Flex Query ID (optional)</label>
              <input id="confirmationQueryId" v-model="form.ibkr_trade_confirmation_query_id" type="text" class="input" placeholder="For same-day fills" />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Uses the same Flex token. With Auto-Sync enabled, confirmations are checked every 15 minutes.</p>
            </div>
            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <label class="block text-sm font-medium text-gray-900 dark:text-white">
                  Auto-Sync
                </label>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Sync Activity on schedule and same-day fills every 15 minutes
                </p>
              </div>
              <button                 type="button"
                @click="form.autoSyncEnabled = !form.autoSyncEnabled"
                :class="[ form.autoSyncEnabled ? 'switch-on' : '', 'switch' ]"
              >
                <span
                  :class="[ form.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0', 'switch-knob' ]"
                />
              </button>
            </div>

            <div v-if="form.autoSyncEnabled">
              <label for="syncTime" class="label">Sync Time</label>
              <input
                id="syncTime"
                v-model="form.syncTime"
                type="time"
                class="input"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Time to automatically sync each day (in your local timezone)
              </p>
            </div>

            <div>
              <label class="label">Sync Trades From</label>
              <div class="flex flex-wrap gap-2 mb-2">
                <button
                  v-for="preset in syncRangePresets"
                  :key="preset.id"
                  type="button"
                  @click="applySyncRangePreset(preset.id)"
                  :class="[ 'px-3 py-1 text-sm rounded-full border transition-colors', activePreset === preset.id ? 'bg-primary-700 border-primary-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600' ]"
                >
                  {{ preset.label }}
                </button>
              </div>
              <input
                v-if="activePreset === 'custom'"
                v-model="form.syncStartDate"
                type="date"
                class="input"
                :max="todayIso"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Only sync trades on or after this date. For IBKR, "All Time" imports up to the latest 10 years in paced 365-day windows.
              </p>
            </div>
          </form>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            @click="emit('close')"
            class="btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="handleSubmit"
            :disabled="loading || !isValid"
            class="btn-primary"
          >
            <span v-if="loading" class="flex items-center">
              <div class="spinner spinner-xs spinner-light mr-2"></div>
              Connecting...
            </span>
            <span v-else>Connect</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { syncRangePresets, applyPresetToForm, resolveActivePreset, todayIso } from '@/utils/syncRangePresets'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  // Existing connection whose Flex token must be replaced. The query ID is
  // the upsert key on the backend, so it is shown read-only.
  reconnecting: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

const existing = props.reconnecting || null
const form = ref({
  accountLabel: existing?.accountLabel || '',
  flexToken: '',
  flexQueryId: existing?.ibkrFlexQueryId || '',
  ibkr_trade_confirmation_query_id: existing?.ibkr_trade_confirmation_query_id || '',
  autoSyncEnabled: existing ? existing.autoSyncEnabled !== false : true,
  syncFrequency: existing?.syncFrequency || 'daily',
  syncTime: existing?.syncTime ? String(existing.syncTime).slice(0, 5) : '06:00',
  syncStartDate: existing?.syncStartDate || null
})

const activePreset = ref(existing ? resolveActivePreset(form.value.syncStartDate) : 'all')

function applySyncRangePreset(presetId) {
  activePreset.value = presetId
  applyPresetToForm(form.value, presetId)
}

const isValid = computed(() => {
  return form.value.flexToken.length > 0 && form.value.flexQueryId.length > 0
})

function handleSubmit() {
  if (!isValid.value) return

  emit('save', {
    accountLabel: form.value.accountLabel,
    flexToken: form.value.flexToken,
    flexQueryId: form.value.flexQueryId,
    ibkr_trade_confirmation_query_id: form.value.ibkr_trade_confirmation_query_id.trim() || null,
    autoSyncEnabled: form.value.autoSyncEnabled,
    syncFrequency: form.value.syncFrequency,
    syncTime: form.value.syncTime + ':00',
    syncStartDate: form.value.syncStartDate
  })
}
</script>
