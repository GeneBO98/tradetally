<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">Broker Sync</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Connect your brokerage accounts to automatically sync trades.
      </p>
    </div>

    <!-- IBKR Maintenance Notice -->
    <IBKRNoticeBanner />

    <!-- Broker sync is becoming a Pro feature: grace-period notice for existing free connections -->
    <div v-if="showGraceBanner" class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div class="ml-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>Broker sync is becoming a Pro feature.</strong>
          Your connected brokers will keep syncing until <strong>{{ graceEndsAtFormatted }}</strong>.
          <router-link :to="pricingLink" class="font-medium underline">Upgrade to Pro</router-link>
          to keep automatic syncing after that.
        </div>
      </div>
    </div>

    <!-- Grace window ended: sync paused for free users -->
    <div v-else-if="showSyncPausedBanner" class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div class="ml-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>Broker sync is paused.</strong>
          Automatic syncing is now a Pro feature.
          <router-link :to="pricingLink" class="font-medium underline">Upgrade to Pro</router-link>
          to resume, or use CSV import. Your existing connections and trades are unchanged.
        </div>
      </div>
    </div>

    <!-- Success/Error Messages -->
    <div v-if="successMessage" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <p class="ml-3 text-sm text-green-700 dark:text-green-300">{{ successMessage }}</p>
      </div>
    </div>

    <div v-if="store.error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <p class="ml-3 text-sm text-red-700 dark:text-red-300">{{ store.error }}</p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading && !store.hasConnections" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Main Content -->
    <div v-else class="space-y-8">
      <!-- Connected Brokers -->
      <div v-if="store.hasConnections" class="space-y-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Connected Brokers</h2>

        <div class="grid gap-4 md:grid-cols-2">
          <BrokerConnectionCard
            v-for="connection in store.connections"
            :key="connection.id"
            :connection="connection"
            :sync-disabled="!canSync"
            @sync="handleSync"
            @test="handleTest"
            @settings="openSettingsModal"
            @delete="handleDelete"
            @deleteTrades="handleDeleteTrades"
          />
        </div>
      </div>

      <!-- Add New Connection (Pro only) -->
      <div v-if="canCreate" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Add Broker Connection</h3>

          <div class="grid gap-6 md:grid-cols-2">
            <!-- IBKR Card -->
            <div
              class="p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 rounded-lg transition-colors cursor-pointer"
              @click="openIBKRModal()"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-red-600 dark:text-red-400 font-bold text-lg">IB</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Interactive Brokers</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ store.ibkrConnections.length > 0 ? 'Add another IBKR account' : 'Connect via Flex Query' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Schwab Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors"
              :class="[
                store.schwabConnection
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                  : schwabConnecting
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10 cursor-wait'
                    : 'border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 cursor-pointer'
              ]"
              @click="!store.schwabConnection && !schwabConnecting && handleSchwabConnect()"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                  <div v-if="schwabConnecting" class="animate-spin h-6 w-6 rounded-full border-2 border-primary-200 border-t-primary-600"></div>
                  <span v-else class="text-primary-600 dark:text-primary-400 font-bold text-lg">CS</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Charles Schwab</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ store.schwabConnection ? 'Already connected' : schwabConnecting ? 'Connecting...' : 'Connect via OAuth' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Trading 212 Card -->
            <div
              class="rounded-lg border-2 p-6 transition-colors"
              :class="canAddTrading212
                ? 'cursor-pointer border-dashed border-gray-300 hover:border-primary-500 dark:border-gray-600 dark:hover:border-primary-400'
                : 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-50 dark:border-gray-700 dark:bg-gray-800'"
              @click="canAddTrading212 && openTrading212Modal()"
            >
              <div class="flex items-center space-x-4">
                <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                  <span class="text-lg font-bold text-primary-600 dark:text-primary-400">T2</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Trading 212</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ store.trading212Connections.length > 0 ? 'Add another environment' : 'Connect with an API key' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- TradeStation Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors"
              :class="brokerCardClass('tradestation')"
              @click="canConnectBroker('tradestation') && handleBrokerOAuthConnect('tradestation')"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                  <div v-if="brokerConnecting.tradestation" class="animate-spin h-6 w-6 rounded-full border-2 border-emerald-200 border-t-emerald-600"></div>
                  <span v-else class="text-emerald-600 dark:text-emerald-400 font-bold text-lg">TS</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">TradeStation</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ brokerConnection('tradestation') ? 'Already connected' : brokerConnecting.tradestation ? 'Connecting...' : 'Connect via OAuth' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Alpaca Live Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors"
              :class="brokerCardClass('alpaca', 'live')"
              @click="canConnectBroker('alpaca', 'live') && handleBrokerOAuthConnect('alpaca', { environment: 'live' })"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
                  <div v-if="brokerConnecting.alpacaLive" class="animate-spin h-6 w-6 rounded-full border-2 border-cyan-200 border-t-cyan-600"></div>
                  <span v-else class="text-cyan-600 dark:text-cyan-400 font-bold text-lg">AL</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Alpaca Live</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ brokerConnection('alpaca', 'live') ? 'Already connected' : brokerConnecting.alpacaLive ? 'Connecting...' : 'Connect via OAuth' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Alpaca Paper Card -->
            <div
              class="p-6 border-2 rounded-lg transition-colors"
              :class="brokerCardClass('alpaca', 'paper')"
              @click="canConnectBroker('alpaca', 'paper') && handleBrokerOAuthConnect('alpaca', { environment: 'paper' })"
            >
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0 w-12 h-12 bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center">
                  <div v-if="brokerConnecting.alpacaPaper" class="animate-spin h-6 w-6 rounded-full border-2 border-sky-200 border-t-sky-600"></div>
                  <span v-else class="text-sky-600 dark:text-sky-400 font-bold text-lg">AP</span>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">Alpaca Paper</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ brokerConnection('alpaca', 'paper') ? 'Already connected' : brokerConnecting.alpacaPaper ? 'Connecting...' : 'Connect via OAuth' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Schwab Note -->
          <div class="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p class="text-xs text-amber-700 dark:text-amber-300">
              <strong>Note for former TD Ameritrade users:</strong> The Schwab API only returns trades made natively on Schwab. Historical TD Ameritrade trades are not available via API sync. Use CSV import for complete trade history.
            </p>
          </div>
        </div>
      </div>

      <!-- Pro gate for free users (shown instead of the add-connection card) -->
      <ProUpgradePrompt
        v-else-if="showUpgradeGate"
        variant="card"
        description="Broker sync is a Pro feature. Connect Interactive Brokers, Schwab, Trading 212, TradeStation, or Alpaca to import your trades automatically. Free accounts can still import via CSV (up to 100 trades per import)."
      />

      <!-- Sync History -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Sync History</h3>
            <button
              @click="refreshLogs"
              class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              Refresh
            </button>
          </div>

          <div v-if="store.syncLogs.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No sync history yet. Connect a broker and sync to see history here.
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Broker</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Imported</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duplicates</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Review</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="log in store.syncLogs" :key="log.id">
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="font-medium text-gray-900 dark:text-white uppercase">{{ log.brokerType }}</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400 capitalize">
                    {{ log.syncType }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span
                      class="px-2 py-1 text-xs rounded-full"
                      :class="getStatusClass(log)"
                    >
                      {{ getStatusLabel(log) }}
                    </span>
                    <details
                      v-if="warningsFromSyncLog(log).length > 0"
                      class="mt-2 max-w-xs text-xs text-amber-800 dark:text-amber-300"
                    >
                      <summary class="cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 rounded">
                        View {{ warningsFromSyncLog(log).length }} warning{{ warningsFromSyncLog(log).length === 1 ? '' : 's' }}
                      </summary>
                      <ul class="mt-2 space-y-1 list-disc pl-4 whitespace-normal">
                        <li v-for="(warning, warningIndex) in warningsFromSyncLog(log)" :key="warningIndex">
                          {{ warning }}
                        </li>
                      </ul>
                    </details>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-900 dark:text-white">
                    {{ log.tradesImported || 0 }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {{ log.duplicatesDetected || 0 }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <button
                      v-if="manualReviewItemsFromSyncLog(log).length > 0"
                      type="button"
                      class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      @click="openManualReviewFromSyncLog(log, true)"
                    >
                      Review {{ manualReviewItemsFromSyncLog(log).length }}
                    </button>
                    <span v-else class="text-sm text-gray-500 dark:text-gray-400">-</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {{ formatDate(log.startedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- IBKR Connection Modal -->
    <IBKRConnectionModal
      v-if="showIBKRModal"
      @close="closeIBKRModal"
      @save="handleIBKRSave"
      :loading="store.loading"
      :error="store.error"
    />

    <Trading212ConnectionModal
      v-if="showTrading212Modal"
      :loading="store.loading"
      :error="store.error"
      :existing-environments="trading212Environments"
      @close="closeTrading212Modal"
      @save="handleTrading212Save"
    />

    <!-- Settings Modal -->
    <ConnectionSettingsModal
      v-if="showSettingsModal"
      :connection="selectedConnection"
      @close="showSettingsModal = false"
      @save="handleSettingsSave"
      :loading="store.loading"
    />

    <ManualTradeReviewModal
      v-if="showManualReviewModal"
      :is-open="showManualReviewModal"
      :items="manualReviewItems"
      :loading="manualReviewLoading"
      :error="manualReviewError"
      @close="showManualReviewModal = false"
      @submit="handleManualReviewSubmit"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBrokerSyncStore } from '@/stores/brokerSync'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import BrokerConnectionCard from '@/components/broker-sync/BrokerConnectionCard.vue'
import IBKRConnectionModal from '@/components/broker-sync/IBKRConnectionModal.vue'
import Trading212ConnectionModal from '@/components/broker-sync/Trading212ConnectionModal.vue'
import ConnectionSettingsModal from '@/components/broker-sync/ConnectionSettingsModal.vue'
import IBKRNoticeBanner from '@/components/broker-sync/IBKRNoticeBanner.vue'
import ManualTradeReviewModal from '@/components/import/ManualTradeReviewModal.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'

const store = useBrokerSyncStore()
const tradesStore = useTradesStore()
const route = useRoute()
const router = useRouter()
const { showConfirmation, showDangerConfirmation } = useNotification()

// Broker sync is a Pro feature. The backend returns the authoritative access
// status (gated only when billing is enabled, i.e. cloud). Until it loads we
// treat access as permissive to avoid flashing the upgrade prompt to Pro users.
const billingEnabled = computed(() => store.access?.billingEnabled === true)
const isPro = computed(() => store.access ? store.access.isPro : true)
const canCreate = computed(() => store.access ? store.access.canCreate : true)
const canSync = computed(() => store.access ? store.access.canSync : true)
const inGracePeriod = computed(() => store.access?.inGracePeriod === true)

// Show the Pro gate only for free users on a billing-enabled (cloud) instance.
const showUpgradeGate = computed(() => billingEnabled.value && !isPro.value)
// Grandfathered free users still syncing during the grace window.
const showGraceBanner = computed(() => showUpgradeGate.value && inGracePeriod.value && store.hasConnections)
// Grace window has ended for a free user who still has connections.
const showSyncPausedBanner = computed(() => showUpgradeGate.value && !canSync.value && store.hasConnections)

const graceEndsAtFormatted = computed(() => {
  if (!store.access?.graceEndsAt) return ''
  return new Date(store.access.graceEndsAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  })
})

const pricingLink = computed(() => `/pricing?redirect=${encodeURIComponent(route.fullPath)}`)

const showIBKRModal = ref(false)
const showTrading212Modal = ref(false)
const showSettingsModal = ref(false)
const selectedConnection = ref(null)
const successMessage = ref('')
const showManualReviewModal = ref(false)
const manualReviewItems = ref([])
const manualReviewLoading = ref(false)
const manualReviewError = ref('')
const reviewedSyncLogIds = ref(new Set())
const schwabConnecting = ref(false)
const brokerConnecting = ref({
  tradestation: false,
  alpacaLive: false,
  alpacaPaper: false
})
const SCHWAB_PENDING_STORAGE_KEY = 'broker_sync_schwab_pending'
const BROKER_PENDING_STORAGE_KEY = 'broker_sync_pending'

const trading212Environments = computed(() =>
  store.trading212Connections.map(connection => connection.brokerEnvironment || 'live')
)
const canAddTrading212 = computed(() => trading212Environments.value.length < 2)

function brokerConnection(broker, environment = null) {
  return store.connections.find(connection =>
    connection.brokerType === broker &&
    (!environment || (connection.brokerEnvironment || 'live') === environment)
  )
}

function pendingKeyFor(broker, options = {}) {
  if (broker === 'alpaca') {
    return options.environment === 'paper' ? 'alpacaPaper' : 'alpacaLive'
  }
  return broker
}

function canConnectBroker(broker, environment = null) {
  const key = pendingKeyFor(broker, { environment })
  return !brokerConnection(broker, environment) && !brokerConnecting.value[key]
}

function brokerCardClass(broker, environment = null) {
  return canConnectBroker(broker, environment)
    ? 'border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 cursor-pointer'
    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
}

function scheduleSuccessMessage(message) {
  successMessage.value = message
  setTimeout(() => { successMessage.value = '' }, 5000)
}

function parseSyncDetails(details) {
  if (!details) return {}
  if (typeof details === 'string') {
    try {
      return JSON.parse(details)
    } catch (_) {
      return {}
    }
  }
  return details
}

function manualReviewItemsFromSyncLog(log) {
  const syncDetails = parseSyncDetails(log?.syncDetails || log?.sync_details)
  const items = syncDetails.manual_review_items || syncDetails.manualReviewItems || []
  return Array.isArray(items) ? items : []
}

function warningsFromSyncLog(log) {
  const syncDetails = parseSyncDetails(log?.syncDetails || log?.sync_details)
  const warnings = syncDetails.warnings || []
  return Array.isArray(warnings) ? warnings.filter(Boolean).map(warning => String(warning)) : []
}

function syncCompletedWithWarnings(log) {
  if (log?.status !== 'completed') return false
  const syncDetails = parseSyncDetails(log?.syncDetails || log?.sync_details)
  return syncDetails.outcome === 'warning' || warningsFromSyncLog(log).length > 0
}

function openManualReviewFromSyncLog(log, force = false) {
  if (!log || (!force && reviewedSyncLogIds.value.has(log.id))) return

  const items = manualReviewItemsFromSyncLog(log)
  if (items.length === 0) return

  reviewedSyncLogIds.value = new Set([...reviewedSyncLogIds.value, log.id])
  manualReviewItems.value = items
  manualReviewError.value = ''
  showManualReviewModal.value = true
}

async function consumeOAuthCallbackState(query) {
  const supportedSuccess = ['schwab', 'tradestation', 'alpaca']
  const hasCallbackState = supportedSuccess.includes(query.success) || Boolean(query.error)

  if (!hasCallbackState) {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(SCHWAB_PENDING_STORAGE_KEY) === 'true') {
      schwabConnecting.value = true
    }
    if (typeof window !== 'undefined') {
      const pending = window.sessionStorage.getItem(BROKER_PENDING_STORAGE_KEY)
      if (pending && brokerConnecting.value[pending] !== undefined) {
        brokerConnecting.value[pending] = true
      }
    }
    return
  }

  schwabConnecting.value = false
  Object.keys(brokerConnecting.value).forEach(key => {
    brokerConnecting.value[key] = false
  })

  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(SCHWAB_PENDING_STORAGE_KEY)
    window.sessionStorage.removeItem(BROKER_PENDING_STORAGE_KEY)
  }

  await Promise.all([
    store.fetchConnections(),
    store.fetchSyncLogs()
  ])

  if (query.success === 'schwab') {
    scheduleSuccessMessage('Schwab account connected successfully. Ready to sync trades.')
  } else if (query.success === 'tradestation') {
    scheduleSuccessMessage('TradeStation account connected successfully. Ready to sync trades.')
  } else if (query.success === 'alpaca') {
    scheduleSuccessMessage('Alpaca account connected successfully. Ready to sync trades.')
  }

  if (query.error === 'pro_required') {
    store.error = 'Broker sync is a Pro feature. Upgrade to Pro to connect your brokerage.'
  } else if (query.error) {
    const detail = typeof query.details === 'string' ? decodeURIComponent(query.details) : ''
    store.error = detail
      ? `Connection failed: ${detail}`
      : `Connection failed: ${query.error}`
  }

  await router.replace({ query: {} })
}

onMounted(async () => {
  await Promise.all([
    store.fetchConnections(),
    store.fetchSyncLogs()
  ])
  await consumeOAuthCallbackState(route.query)
})

// Watch for route changes (OAuth callback)
watch(() => route.query, async (newQuery) => {
  await consumeOAuthCallbackState(newQuery)
})

function openIBKRModal() {
  store.clearError()
  showIBKRModal.value = true
}

function closeIBKRModal() {
  store.clearError()
  showIBKRModal.value = false
}

function openTrading212Modal() {
  if (trading212Environments.value.length >= 2) {
    store.error = 'Both Trading 212 live and demo environments are already connected.'
    return
  }
  store.clearError()
  showTrading212Modal.value = true
}

function closeTrading212Modal() {
  store.clearError()
  showTrading212Modal.value = false
}

function openSettingsModal(connection) {
  selectedConnection.value = connection
  showSettingsModal.value = true
}

async function handleIBKRSave(credentials) {
  try {
    await store.addIBKRConnection(credentials)
    showIBKRModal.value = false
    scheduleSuccessMessage('IBKR connection added successfully!')
  } catch (error) {
    // Error is handled by store
  }
}

async function handleTrading212Save(connection) {
  try {
    await store.addTrading212Connection(connection)
    showTrading212Modal.value = false
    scheduleSuccessMessage('Trading 212 connection added successfully. Ready to sync trades.')
  } catch (error) {
    // Error is handled by store
  }
}

async function handleSchwabConnect() {
  try {
    schwabConnecting.value = true
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SCHWAB_PENDING_STORAGE_KEY, 'true')
    }
    const authUrl = await store.initSchwabOAuth()
    // Redirect to Schwab OAuth
    window.location.href = authUrl
  } catch (error) {
    schwabConnecting.value = false
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SCHWAB_PENDING_STORAGE_KEY)
    }
    // Error is handled by store
  }
}

async function handleBrokerOAuthConnect(broker, options = {}) {
  const key = pendingKeyFor(broker, options)
  try {
    brokerConnecting.value[key] = true
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(BROKER_PENDING_STORAGE_KEY, key)
    }
    const authUrl = await store.initBrokerOAuth(broker, options)
    window.location.href = authUrl
  } catch (error) {
    brokerConnecting.value[key] = false
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(BROKER_PENDING_STORAGE_KEY)
    }
  }
}

async function handleSync(connection) {
  // Broker sync is a Pro feature; once the grace window ends, free users can't sync.
  if (!canSync.value) {
    store.error = 'Broker sync is a Pro feature. Upgrade to Pro to resume syncing, or use CSV import.'
    return
  }
  try {
    await store.triggerSync(connection.id)
    scheduleSuccessMessage('Sync started. Check the history below for results.')

    // Poll for updates until sync completes
    const pollInterval = 3000
    const maxAttempts = 200 // 10 minutes max for rate-limited broker history imports
    let attempts = 0

    const poll = async () => {
      attempts++
      await Promise.all([
        store.fetchConnections(),
        store.fetchSyncLogs()
      ])

      const inProgressStatuses = ['started', 'fetching', 'parsing', 'importing']
      const hasActiveSyncs = store.syncLogs.some(log =>
        log.connectionId === connection.id && inProgressStatuses.includes(log.status)
      )

      if (hasActiveSyncs && attempts < maxAttempts) {
        setTimeout(poll, pollInterval)
      } else {
        const latestCompletedLog = store.syncLogs.find(log =>
          log.connectionId === connection.id && log.status === 'completed'
        )
        openManualReviewFromSyncLog(latestCompletedLog)

        // Sync finished - refresh trades data to update P&L and counts
        await Promise.all([
          tradesStore.fetchTrades(),
          tradesStore.fetchAnalytics()
        ])
      }
    }

    setTimeout(poll, pollInterval)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleManualReviewSubmit(decisions) {
  manualReviewLoading.value = true
  manualReviewError.value = ''

  try {
    const result = await store.submitManualReviewDecisions(decisions)

    if (result.failed > 0) {
      manualReviewError.value = `Saved ${result.imported || 0} trade(s), but ${result.failed} decision(s) failed.`
      return
    }

    showManualReviewModal.value = false
    manualReviewItems.value = []

    if ((result.imported || 0) > 0) {
      await Promise.all([
        tradesStore.fetchTrades(),
        tradesStore.fetchAnalytics()
      ])
    }

    const duplicateText = result.duplicates > 0 ? `, ${result.duplicates} duplicate(s) skipped` : ''
    scheduleSuccessMessage(`Manual review saved: ${result.imported || 0} imported, ${result.ignored || 0} ignored${duplicateText}.`)
  } catch (error) {
    manualReviewError.value = store.error || error.response?.data?.error || 'Failed to save review decisions'
  } finally {
    manualReviewLoading.value = false
  }
}

async function handleTest(connection) {
  try {
    const result = await store.testConnection(connection.id)
    if (result.success) {
      successMessage.value = 'Connection test successful!'
    } else {
      store.error = result.message || 'Connection test failed'
    }
    setTimeout(() => { successMessage.value = '' }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleSettingsSave(updates) {
  try {
    await store.updateConnection(selectedConnection.value.id, updates)
    showSettingsModal.value = false
    successMessage.value = 'Settings updated successfully!'
    setTimeout(() => { successMessage.value = '' }, 5000)
  } catch (error) {
    // Error is handled by store
  }
}

async function handleDelete(connection) {
  const brokerName = connection.brokerType.toUpperCase()

  showConfirmation(
    `Disconnect ${brokerName}?`,
    'This will remove the broker connection. Your imported trades will not be deleted.',
    async () => {
      try {
        await store.deleteConnection(connection.id)
        successMessage.value = 'Connection removed successfully!'
        setTimeout(() => { successMessage.value = '' }, 5000)
      } catch (error) {
        // Error is handled by store
      }
    }
  )
}

async function handleDeleteTrades(connection) {
  const brokerName = connection.brokerType.toUpperCase()

  showDangerConfirmation(
    `Delete All ${brokerName} Trades?`,
    `This will permanently delete ALL trades that were imported via broker sync from ${brokerName}. This action cannot be undone.`,
    async () => {
      try {
        const result = await store.deleteBrokerTrades(connection.id)
        successMessage.value = result.message || `Deleted trades from ${brokerName}`
        setTimeout(() => { successMessage.value = '' }, 5000)

        // Refresh trades data to update P&L and counts
        console.log('[BROKER-SYNC] Refreshing trades store after delete...')
        await Promise.all([
          tradesStore.fetchTrades(),
          tradesStore.fetchAnalytics()
        ])
        console.log('[BROKER-SYNC] Trades store refreshed. Total P&L:', tradesStore.totalPnL, 'Total trades:', tradesStore.totalTrades)
      } catch (error) {
        console.error('[BROKER-SYNC] Error refreshing trades:', error)
        // Error is handled by store
      }
    },
    { confirmText: 'Delete All Trades' }
  )
}

async function refreshLogs() {
  await store.fetchSyncLogs()
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

function getStatusLabel(log) {
  if (syncCompletedWithWarnings(log)) return 'Completed with warnings'
  return log?.status || 'unknown'
}

function getStatusClass(log) {
  if (syncCompletedWithWarnings(log)) {
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
  }
  switch (log?.status) {
    case 'completed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
    case 'started':
    case 'fetching':
    case 'parsing':
    case 'importing':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
    default:
      return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300'
  }
}
</script>
