<template>
  <div v-if="attentionConnections.length > 0" class="content-wrapper pt-4">
    <section
      class="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-900/20"
      :role="hasExpiredConnections ? 'alert' : 'status'"
      :aria-live="hasExpiredConnections ? 'assertive' : 'polite'"
    >
      <div class="flex min-w-0 items-start gap-3">
        <ExclamationTriangleIcon class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h2 class="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {{ alertTitle }}
          </h2>
          <p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
            {{ alertMessage }}
          </p>
        </div>
      </div>
      <button
        v-if="schwabConnectionNeedingAttention"
        type="button"
        class="btn-primary flex-shrink-0 self-start sm:self-auto"
        :disabled="reconnecting"
        @click="reconnectSchwab"
      >
        {{ reconnecting ? 'Opening Schwab...' : schwabActionLabel }}
      </button>
      <router-link v-else to="/broker-sync" class="btn-primary flex-shrink-0 self-start sm:self-auto">
        Review connection
      </router-link>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { useBrokerSyncStore } from '@/stores/brokerSync'

const store = useBrokerSyncStore()
const reconnecting = ref(false)
const SCHWAB_PENDING_STORAGE_KEY = 'broker_sync_schwab_pending'

const expiredConnections = computed(() =>
  store.connections.filter(connection => connection.connectionStatus === 'expired')
)

const expiringConnections = computed(() => {
  const now = Date.now()
  const reminderWindowEnds = now + (24 * 60 * 60 * 1000)

  return store.connections.filter(connection => {
    if (connection.brokerType !== 'schwab' || connection.connectionStatus !== 'active') return false
    const expiresAt = new Date(connection.schwab_refresh_token_expires_at).getTime()
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= reminderWindowEnds
  })
})

const attentionConnections = computed(() => [
  ...expiredConnections.value,
  ...expiringConnections.value
])

const hasExpiredConnections = computed(() => expiredConnections.value.length > 0)

const schwabConnectionNeedingAttention = computed(() =>
  attentionConnections.value.find(connection => connection.brokerType === 'schwab') || null
)

const alertTitle = computed(() => hasExpiredConnections.value
  ? 'Broker reconnect required'
  : 'Schwab authorization expires soon'
)

const alertMessage = computed(() => {
  if (!hasExpiredConnections.value) {
    return 'Reauthorize within 24 hours to keep automatic trade syncing uninterrupted. Existing trades and sync settings will remain unchanged.'
  }
  if (expiredConnections.value.length === 1) {
    return `${brokerName(expiredConnections.value[0])} authorization has expired. New trades will not sync until the connection is restored. Existing trades are safe.`
  }
  return `${expiredConnections.value.length} broker connections require authorization. New trades will not sync until they are restored. Existing trades are safe.`
})

const schwabActionLabel = computed(() => hasExpiredConnections.value
  ? 'Reconnect Schwab'
  : 'Reauthorize Schwab'
)

function brokerName(connection) {
  if (connection.brokerType === 'schwab') return 'Charles Schwab'
  if (connection.brokerType === 'tradestation') return 'TradeStation'
  if (connection.brokerType === 'alpaca') return 'Alpaca'
  return connection.brokerType || 'Broker'
}

async function refreshConnections() {
  try {
    await store.fetchConnections()
  } catch (_) {
    // The rest of the app remains usable if this non-blocking status check fails.
  }
}

async function reconnectSchwab() {
  if (reconnecting.value) return
  reconnecting.value = true
  try {
    window.sessionStorage.setItem(SCHWAB_PENDING_STORAGE_KEY, 'true')
    const authUrl = await store.initSchwabOAuth()
    window.location.assign(authUrl)
  } catch (_) {
    window.sessionStorage.removeItem(SCHWAB_PENDING_STORAGE_KEY)
    reconnecting.value = false
  }
}

onMounted(() => {
  refreshConnections()
  window.addEventListener('broker-reauth-required', refreshConnections)
  window.addEventListener('broker-reauth-expiring', refreshConnections)
})

onUnmounted(() => {
  window.removeEventListener('broker-reauth-required', refreshConnections)
  window.removeEventListener('broker-reauth-expiring', refreshConnections)
})
</script>
