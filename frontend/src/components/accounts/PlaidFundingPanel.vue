<template>
  <div class="card overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5">
      <h3 class="heading-card">Plaid Connections</h3>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Link a bank or investment account to sync transfers.
      </p>
    </div>

    <div class="space-y-3 p-4 sm:p-5">
      <!-- Connect buttons -->
      <div class="grid grid-cols-2 gap-2">
        <button
          class="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          :disabled="busyTarget === 'bank'"
          @click="openPlaidLink('bank')"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>
          </svg>
          {{ busyTarget === 'bank' ? 'Connecting…' : 'Bank' }}
        </button>
        <button
          class="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          :disabled="busyTarget === 'investment'"
          @click="openPlaidLink('investment')"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-5"/>
          </svg>
          {{ busyTarget === 'investment' ? 'Connecting…' : 'Investment' }}
        </button>
      </div>

      <!-- Error -->
      <div v-if="store.error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {{ store.error }}
      </div>

      <!-- Empty state -->
      <div
        v-if="connections.length === 0"
        class="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400"
      >
        No Plaid connections yet.
      </div>

      <!-- Connections -->
      <div v-else class="space-y-2">
        <div
          v-for="connection in connections"
          :key="connection.id"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <!-- Connection header -->
          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
            @click="toggleConnection(connection.id)"
          >
            <div
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase"
              :class="connection.targetType === 'investment'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'"
            >
              {{ (connection.institutionName || 'P').slice(0, 2) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <div class="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {{ connection.institutionName || 'Plaid Connection' }}
                </div>
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {{ connection.targetType }}
                </span>
                <span
                  v-if="connection.autoSyncEnabled"
                  class="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/30 dark:text-green-300"
                >
                  <span class="h-1 w-1 rounded-full bg-green-500"></span> Auto
                </span>
              </div>
              <div class="truncate text-[11px] text-gray-500 dark:text-gray-400">
                {{ connection.lastSyncAt ? `Last sync ${formatRelative(connection.lastSyncAt)}` : 'Never synced' }}
                <span v-if="(connection.accounts || []).length"> · {{ (connection.accounts || []).length }} account{{ (connection.accounts || []).length === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <svg
              class="h-4 w-4 shrink-0 text-gray-400 transition-transform"
              :class="{ 'rotate-180': openConnections[connection.id] }"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          <!-- Expanded body -->
          <div v-if="openConnections[connection.id]" class="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40">
            <!-- Action bar -->
            <div class="flex flex-wrap items-center gap-1.5 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <button
                class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                :disabled="isSyncing(connection.id)"
                @click="triggerSync(connection.id)"
              >
                <svg class="h-3 w-3" :class="{ 'animate-spin': isSyncing(connection.id) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.2-4.5L20 7M20 15a9 9 0 01-14.2 4.5L4 17"/>
                </svg>
                {{ isSyncing(connection.id) ? 'Syncing…' : 'Sync now' }}
              </button>
              <button
                class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                @click="toggleAutoSync(connection)"
              >
                {{ connection.autoSyncEnabled ? 'Disable auto-sync' : 'Enable auto-sync' }}
              </button>
              <button
                class="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                @click="removeConnection(connection)"
              >
                Disconnect
              </button>
            </div>

            <!-- Sync message (if any) -->
            <div v-if="connection.lastSyncMessage" class="border-b border-gray-200 px-3 py-1.5 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {{ connection.lastSyncMessage }}
            </div>

            <!-- Account list -->
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              <div
                v-for="plaidAccount in connection.accounts || []"
                :key="plaidAccount.id"
                class="px-3 py-2.5"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <div class="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {{ plaidAccount.accountName }}
                      </div>
                      <span v-if="plaidAccount.mask" class="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                        ••{{ plaidAccount.mask }}
                      </span>
                    </div>
                    <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      <span class="capitalize">{{ plaidAccount.accountType || 'account' }}<span v-if="plaidAccount.accountSubtype"> · {{ plaidAccount.accountSubtype }}</span></span>
                      <span v-if="plaidAccount.currentBalance !== null" class="tabular-nums">
                        {{ formatCurrency(plaidAccount.currentBalance) }}
                      </span>
                    </div>
                    <div class="mt-1">
                      <span
                        v-if="plaidAccount.linkedAccountId"
                        class="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      >
                        <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        Linked to {{ plaidAccount.linkedAccountName }}
                      </span>
                      <span
                        v-else
                        class="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        Needs linking
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Linking controls -->
                <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <select
                    v-model="selectedAccountIds[plaidAccount.id]"
                    class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    style="min-height: 0; font-size: 12px;"
                  >
                    <option value="">Select TradeTally account</option>
                    <option
                      v-for="account in accounts"
                      :key="account.id"
                      :value="account.id"
                    >
                      {{ account.accountName }}
                    </option>
                  </select>

                  <div class="flex items-center gap-1">
                    <select
                      v-model="trackingModes[plaidAccount.id]"
                      class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      style="min-height: 0; font-size: 12px;"
                    >
                      <option value="tracked_account">Track directly</option>
                      <option value="funding_source">Funding source</option>
                    </select>
                    <div class="group relative shrink-0">
                      <button
                        type="button"
                        class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:text-gray-200"
                        :aria-label="getTrackingModeHelp(trackingModes[plaidAccount.id]).title"
                      >
                        ?
                      </button>
                      <div class="pointer-events-none absolute right-0 top-7 z-20 hidden w-64 rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-lg group-hover:block dark:border-gray-700 dark:bg-gray-900">
                        <div class="text-xs font-medium text-gray-900 dark:text-white">
                          {{ getTrackingModeHelp(trackingModes[plaidAccount.id]).title }}
                        </div>
                        <p class="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                          {{ getTrackingModeHelp(trackingModes[plaidAccount.id]).description }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button
                    class="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
                    :disabled="!selectedAccountIds[plaidAccount.id] || linkingAccountId === plaidAccount.id"
                    @click="linkExistingAccount(plaidAccount)"
                  >
                    {{ linkingAccountId === plaidAccount.id ? 'Linking…' : (plaidAccount.linkedAccountId ? 'Update link' : 'Link existing') }}
                  </button>
                  <button
                    v-if="!plaidAccount.linkedAccountId"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                    :disabled="linkingAccountId === plaidAccount.id"
                    @click="createAndLinkAccount(plaidAccount)"
                  >
                    Create new
                  </button>
                  <button
                    v-else
                    class="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/20"
                    :disabled="linkingAccountId === plaidAccount.id"
                    @click="confirmUnlink(plaidAccount)"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { usePlaidFundingStore } from '@/stores/plaidFunding'
import { useNotification } from '@/composables/useNotification'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  accounts: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['refresh'])

const store = usePlaidFundingStore()
const { showSuccess, showError, showDangerConfirmation } = useNotification()
const { formatCurrency } = useCurrencyFormatter()

const busyTarget = ref('')
const linkingAccountId = ref('')
const selectedAccountIds = reactive({})
const trackingModes = reactive({})
const openConnections = reactive({})

let plaidLoaderPromise

const connections = computed(() => store.connections)

watch(
  connections,
  (value) => {
    value.forEach(connection => {
      if (!(connection.id in openConnections)) {
        const hasUnlinked = (connection.accounts || []).some(a => !a.linkedAccountId)
        openConnections[connection.id] = hasUnlinked
      }
      ;(connection.accounts || []).forEach(account => {
        if (!(account.id in trackingModes)) {
          trackingModes[account.id] = account.trackingMode || (account.accountType === 'investment' ? 'tracked_account' : 'funding_source')
        }
        if (!(account.id in selectedAccountIds)) {
          selectedAccountIds[account.id] = account.linkedAccountId || ''
        }
      })
    })
  },
  { immediate: true }
)

function toggleConnection(id) {
  openConnections[id] = !openConnections[id]
}

function loadPlaidScript() {
  if (typeof window !== 'undefined' && window.Plaid) {
    return Promise.resolve(window.Plaid)
  }

  if (!plaidLoaderPromise) {
    plaidLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
      script.async = true
      script.onload = () => resolve(window.Plaid)
      script.onerror = () => reject(new Error('Failed to load Plaid Link'))
      document.head.appendChild(script)
    })
  }

  return plaidLoaderPromise
}

function isSyncing(connectionId) {
  return store.syncing[connectionId] === true
}

function getTrackingModeHelp(mode) {
  if (mode === 'funding_source') {
    return {
      title: 'Use this as a funding source',
      description: 'Money leaving this Plaid account into the linked TradeTally account should be treated as a deposit. Money coming back into this Plaid account from the linked TradeTally account should be treated as a withdrawal.'
    }
  }

  return {
    title: 'Track this account directly',
    description: 'Money entering this Plaid account should be treated as a deposit on the linked TradeTally account. Money leaving this Plaid account should be treated as a withdrawal.'
  }
}

function formatRelative(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function openPlaidLink(targetType) {
  busyTarget.value = targetType
  store.clearError()

  try {
    const [{ linkToken }, Plaid] = await Promise.all([
      store.createLinkToken(targetType),
      loadPlaidScript()
    ])

    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          await store.exchangePublicToken({
            publicToken,
            institution: metadata?.institution || null,
            targetType
          })
          await store.fetchConnections()
          showSuccess('Plaid connected', 'Connection saved. Link the returned account to a TradeTally account to start reviewing transfers.')
          emit('refresh')
        } catch (error) {
          showError('Plaid connection failed', error.response?.data?.message || error.message || 'Unable to finish Plaid connection')
        }
      },
      onExit: (_, metadata) => {
        if (metadata?.status === 'requires_questions') {
          showError('Plaid connection incomplete', 'Additional Plaid steps are required before the account can be connected.')
        }
      }
    })

    handler.open()
  } catch (error) {
    showError('Plaid unavailable', error.response?.data?.message || error.message || 'Unable to initialize Plaid Link')
  } finally {
    busyTarget.value = ''
  }
}

async function triggerSync(connectionId) {
  try {
    await store.syncConnection(connectionId)
    showSuccess('Plaid synced', 'Latest Plaid activity was fetched successfully.')
    emit('refresh')
  } catch (error) {
    showError('Sync failed', error.response?.data?.message || error.message || 'Unable to sync Plaid connection')
  }
}

async function toggleAutoSync(connection) {
  try {
    await store.updateConnection(connection.id, {
      autoSyncEnabled: !connection.autoSyncEnabled,
      syncFrequency: !connection.autoSyncEnabled ? 'daily' : 'manual',
      syncTime: '06:00:00'
    })
    showSuccess('Connection updated', !connection.autoSyncEnabled ? 'Daily Plaid sync enabled.' : 'Daily Plaid sync disabled.')
  } catch (error) {
    showError('Update failed', error.response?.data?.message || error.message || 'Unable to update sync settings')
  }
}

function removeConnection(connection) {
  showDangerConfirmation(
    'Disconnect Plaid',
    `Disconnect ${connection.institutionName || 'this Plaid connection'}? Existing approved cashflow entries will remain.`,
    async () => {
      try {
        await store.deleteConnection(connection.id)
        showSuccess('Plaid disconnected', 'Connection removed successfully.')
        emit('refresh')
      } catch (error) {
        showError('Disconnect failed', error.response?.data?.message || error.message || 'Unable to disconnect Plaid connection')
      }
    }
  )
}

async function linkExistingAccount(plaidAccount) {
  linkingAccountId.value = plaidAccount.id

  try {
    await store.linkPlaidAccount(plaidAccount.id, {
      linkedAccountId: selectedAccountIds[plaidAccount.id],
      trackingMode: trackingModes[plaidAccount.id]
    })
    showSuccess('Account linked', 'Plaid account linked. Matching transfers will now appear in the review queue.')
    emit('refresh')
  } catch (error) {
    showError('Link failed', error.response?.data?.message || error.message || 'Unable to link Plaid account')
  } finally {
    linkingAccountId.value = ''
  }
}

function confirmUnlink(plaidAccount) {
  showDangerConfirmation(
    'Unlink Plaid account',
    `Unlink ${plaidAccount.accountName || 'this Plaid account'} from ${plaidAccount.linkedAccountName || 'the TradeTally account'}? Already-approved cashflow entries will remain. New Plaid activity won't be tracked until you link it again.`,
    async () => {
      linkingAccountId.value = plaidAccount.id
      try {
        await store.unlinkPlaidAccount(plaidAccount.id)
        selectedAccountIds[plaidAccount.id] = ''
        showSuccess('Plaid account unlinked', 'This account no longer feeds into a TradeTally account.')
        emit('refresh')
      } catch (error) {
        showError('Unlink failed', error.response?.data?.message || error.message || 'Unable to unlink Plaid account')
      } finally {
        linkingAccountId.value = ''
      }
    }
  )
}

async function createAndLinkAccount(plaidAccount) {
  linkingAccountId.value = plaidAccount.id

  try {
    const startingBalance = plaidAccount.currentBalance ?? plaidAccount.availableBalance ?? 0

    await store.linkPlaidAccount(plaidAccount.id, {
      trackingMode: trackingModes[plaidAccount.id],
      newAccount: {
        accountName: plaidAccount.accountName,
        broker: plaidAccount.accountType === 'investment' ? 'other' : 'other',
        initialBalance: startingBalance,
        initialBalanceDate: new Date().toISOString().slice(0, 10),
        notes: `Created from Plaid ${plaidAccount.accountType || 'account'} connection`
      }
    })
    showSuccess('Account created', 'TradeTally account created and linked to Plaid.')
    emit('refresh')
  } catch (error) {
    showError('Create failed', error.response?.data?.message || error.message || 'Unable to create and link account')
  } finally {
    linkingAccountId.value = ''
  }
}
</script>
