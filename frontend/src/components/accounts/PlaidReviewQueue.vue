<template>
  <div class="card overflow-hidden">
    <!-- Header strip: title, inline stats, refresh -->
    <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h3 class="heading-card">Plaid Review</h3>
          <div v-if="accountId && reviewSummary" class="hidden items-center gap-3 text-xs font-medium sm:flex">
            <span class="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              <span class="tabular-nums">{{ reviewSummary.pending }}</span> pending
            </span>
            <span class="h-3 w-px bg-gray-200 dark:bg-gray-700"></span>
            <span class="tabular-nums text-gray-500 dark:text-gray-400">
              {{ reviewSummary.approved }} approved
            </span>
            <span class="tabular-nums text-gray-500 dark:text-gray-400">
              {{ reviewSummary.rejected }} rejected
            </span>
            <span class="tabular-nums text-gray-500 dark:text-gray-400">
              {{ reviewSummary.total }} total
            </span>
          </div>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 dark:text-primary-400 dark:hover:text-primary-300"
          :disabled="!accountId || store.reviewLoading"
          @click="refresh"
        >
          <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': store.reviewLoading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.2-4.5L20 7M20 15a9 9 0 01-14.2 4.5L4 17"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- Mobile stats (shown below title on narrow) -->
      <div v-if="accountId && reviewSummary" class="mt-2 flex items-center gap-3 text-xs font-medium sm:hidden">
        <span class="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
          <span class="tabular-nums">{{ reviewSummary.pending }}</span> pending
        </span>
        <span class="tabular-nums text-gray-500 dark:text-gray-400">
          {{ reviewSummary.approved }} approved / {{ reviewSummary.total }} total
        </span>
      </div>

      <!-- Tab filter -->
      <div v-if="accountId" class="mt-3 -mb-1 flex items-center gap-1 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="activeTab === tab.id
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span
            class="tabular-nums"
            :class="activeTab === tab.id ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>
    </div>

    <!-- No account selected -->
    <div v-if="!accountId" class="flex items-center justify-center px-6 py-10 text-center">
      <div>
        <svg class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Select an account to review Plaid activity
        </p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else-if="store.reviewLoading && visibleItems.length === 0" class="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
      <div class="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
      <p class="mt-2">Loading Plaid activity…</p>
    </div>

    <!-- Empty state for current tab -->
    <div v-else-if="visibleItems.length === 0" class="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
      {{ emptyMessage }}
    </div>

    <!-- Activity list -->
    <div v-else class="divide-y divide-gray-100 dark:divide-gray-700/60">
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="group transition-colors"
        :class="expanded[item.id] ? 'bg-gray-50 dark:bg-gray-800/40' : ''"
      >
        <!-- Primary row -->
        <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 sm:px-5">
          <!-- Direction color rail -->
          <span
            class="h-8 w-0.5 shrink-0 rounded-full"
            :class="railColor(item)"
            aria-hidden="true"
          ></span>

          <!-- Description + meta -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <div class="truncate text-sm font-medium text-gray-900 dark:text-white">
                {{ item.description }}
              </div>
              <span
                v-if="statusLabel(item)"
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="statusClass(item)"
              >
                {{ statusLabel(item) }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
              <span class="tabular-nums">{{ formatDateCompact(item.transactionDate) }}</span>
              <span v-if="item.institutionName" class="truncate">· {{ item.institutionName }}</span>
              <span v-if="item.plaidAccountName" class="hidden truncate sm:inline">· {{ item.plaidAccountName }}</span>
              <span v-if="item.confidence" class="hidden shrink-0 items-center gap-1 sm:inline-flex">
                <span class="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                <span class="tabular-nums">{{ item.confidence }}%</span>
              </span>
            </div>
          </div>

          <!-- Amount -->
          <div class="shrink-0 text-right">
            <div class="text-sm font-semibold tabular-nums" :class="amountColor(item)">
              {{ amountPrefix(item) }}{{ formatCurrency(Math.abs(item.amount)) }}
            </div>
          </div>

          <!-- Actions -->
          <div v-if="canAct(item)" class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-green-600 transition-colors hover:bg-green-100 disabled:opacity-40 dark:text-green-400 dark:hover:bg-green-900/30"
              :disabled="actingId === item.id"
              :title="`Approve as ${transactionTypes[item.id] || 'deposit'}`"
              @click="requestAction(item, 'approve')"
            >
              <svg v-if="actingId !== item.id" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              <svg v-else class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                <path stroke-linecap="round" d="M12 2a10 10 0 0110 10"/>
              </svg>
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              :disabled="actingId === item.id"
              title="Reject"
              @click="requestAction(item, 'reject')"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              :class="expanded[item.id] ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : ''"
              title="Customize"
              @click="toggleExpand(item.id)"
            >
              <svg
                class="h-4 w-4 transition-transform"
                :class="{ 'rotate-180': expanded[item.id] }"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>

          <!-- Untrack (for already-approved/rejected items) -->
          <button
            v-else-if="canRevert(item)"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-300"
            :disabled="actingId === item.id"
            title="Revert decision and return to pending"
            @click="requestAction(item, 'revert')"
          >
            <svg v-if="actingId !== item.id" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"/>
            </svg>
            <svg v-else class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path stroke-linecap="round" d="M12 2a10 10 0 0110 10"/>
            </svg>
            Untrack
          </button>
        </div>

        <!-- Expanded customize drawer -->
        <div
          v-if="canAct(item) && expanded[item.id]"
          class="border-t border-gray-100 px-4 py-3 dark:border-gray-700/60 sm:px-5"
        >
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <!-- Segmented direction toggle -->
            <div class="inline-flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                :class="transactionTypes[item.id] === 'deposit'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                @click="transactionTypes[item.id] = 'deposit'"
              >
                <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                </svg>
                Deposit
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                :class="transactionTypes[item.id] === 'withdrawal'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                @click="transactionTypes[item.id] = 'withdrawal'"
              >
                <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                </svg>
                Withdrawal
              </button>
            </div>

            <!-- Description override -->
            <input
              v-model="descriptions[item.id]"
              type="text"
              class="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="Override description (optional)"
              style="min-height: 0; font-size: 14px;"
            />
          </div>

          <!-- Hint about original suggestion -->
          <div v-if="item.directionGuess && item.directionGuess !== 'ambiguous'" class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Plaid suggested <span class="font-medium capitalize">{{ item.directionGuess }}</span>
            <span v-if="item.confidence">· <span class="tabular-nums">{{ item.confidence }}%</span> confidence</span>
          </div>
          <div v-else class="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Direction ambiguous — please choose deposit or withdrawal.
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bulk confirmation modal (teleported to body) -->
  <Teleport to="body">
    <div
      v-if="confirmState.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      @click.self="closeConfirm"
    >
      <div class="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800">
        <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ actionTitle }}
          </h3>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="truncate text-sm text-gray-700 dark:text-gray-300">
              {{ confirmState.item?.description }}
            </span>
            <span class="tabular-nums text-xs text-gray-500 dark:text-gray-400">
              {{ formatCurrency(Math.abs(confirmState.item?.amount || 0)) }}
            </span>
          </div>
        </div>

        <div class="space-y-1.5 px-5 py-4">
          <label
            class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
            :class="confirmState.scope === 'single'
              ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
              : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40'"
          >
            <input
              type="radio"
              value="single"
              v-model="confirmState.scope"
              class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-gray-900 dark:text-white">
                Just this transaction
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                Apply to this transaction only.
              </div>
            </div>
          </label>

          <label
            v-if="confirmState.matchingIds.length > 1"
            class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
            :class="confirmState.scope === 'matching'
              ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
              : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40'"
          >
            <input
              type="radio"
              value="matching"
              v-model="confirmState.scope"
              class="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-gray-900 dark:text-white">
                {{ actionVerb }}
                <span class="tabular-nums">{{ confirmState.matchingIds.length }}</span>
                matching "<span class="italic">{{ truncate(confirmState.item?.description, 28) }}</span>"
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                Pending transactions with the same description.
              </div>
            </div>
          </label>

        </div>

        <div class="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-700 dark:bg-gray-900/40">
          <button
            type="button"
            class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            :disabled="bulkBusy"
            @click="closeConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            :class="actionButtonClass"
            :disabled="bulkBusy"
            @click="executeConfirm"
          >
            <svg v-if="bulkBusy" class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path stroke-linecap="round" d="M12 2a10 10 0 0110 10"/>
            </svg>
            {{ bulkBusy ? 'Working…' : actionVerb }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { usePlaidFundingStore } from '@/stores/plaidFunding'
import { useNotification } from '@/composables/useNotification'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({
  accountId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['changed'])

const store = usePlaidFundingStore()
const { showSuccess, showError } = useNotification()
const { formatCurrency } = useCurrencyFormatter()

const actingId = ref('')
const activeTab = ref('pending')
const transactionTypes = reactive({})
const descriptions = reactive({})
const expanded = reactive({})
const bulkBusy = ref(false)
const confirmState = reactive({
  open: false,
  action: 'approve',
  scope: 'single',
  item: null,
  matchingIds: [],
  resolvedType: 'deposit'
})

const reviewQueue = computed(() => store.reviewQueue)
const reviewHistory = computed(() => store.reviewHistory)
const syncedActivity = computed(() => store.syncedActivity)
const reviewSummary = computed(() => store.reviewSummary)

const tabs = computed(() => [
  { id: 'pending', label: 'Pending', count: reviewQueue.value.length },
  { id: 'all', label: 'All Activity', count: syncedActivity.value.length },
  { id: 'decisions', label: 'Decisions', count: reviewHistory.value.length }
])

const visibleItems = computed(() => {
  if (activeTab.value === 'pending') return reviewQueue.value
  if (activeTab.value === 'decisions') return reviewHistory.value
  return syncedActivity.value
})

const emptyMessage = computed(() => {
  if (activeTab.value === 'pending') return 'No pending Plaid transfers for this account.'
  if (activeTab.value === 'decisions') return 'No approved or rejected Plaid activity yet.'
  return 'No Plaid transactions have been synced for this account yet.'
})

const actionTitle = computed(() => {
  if (confirmState.action === 'revert') return 'Untrack transaction'
  if (confirmState.action === 'reject') return 'Reject transaction'
  return 'Approve transaction'
})

const actionVerb = computed(() => {
  if (confirmState.action === 'revert') return 'Untrack'
  if (confirmState.action === 'reject') return 'Reject'
  return 'Approve'
})

const actionButtonClass = computed(() => {
  if (confirmState.action === 'approve') return 'bg-green-600 hover:bg-green-700'
  return 'bg-red-600 hover:bg-red-700'
})

watch(
  [reviewQueue, syncedActivity],
  () => {
    const seed = (items) => {
      items.forEach(item => {
        if (!(item.id in transactionTypes)) {
          transactionTypes[item.id] = item.directionGuess === 'withdrawal' ? 'withdrawal' : 'deposit'
        }
        if (!(item.id in descriptions)) {
          descriptions[item.id] = item.description || ''
        }
        if (!(item.id in expanded) && item.directionGuess === 'ambiguous' && item.reviewStatus === 'pending' && !item.pending) {
          expanded[item.id] = true
        }
      })
    }
    seed(reviewQueue.value)
    seed(syncedActivity.value)
  },
  { immediate: true }
)

watch(
  () => props.accountId,
  () => {
    refresh()
  },
  { immediate: true }
)

function canAct(item) {
  return item.reviewStatus === 'pending' && !item.pending
}

function canRevert(item) {
  return (item.reviewStatus === 'approved' || item.reviewStatus === 'rejected') && !item.pending
}

function toggleExpand(id) {
  expanded[id] = !expanded[id]
}

function railColor(item) {
  if (item.pending) return 'bg-amber-400/70'
  if (item.reviewStatus === 'approved') {
    return item.importedTransactionType === 'withdrawal' ? 'bg-red-500/70' : 'bg-green-500/70'
  }
  if (item.reviewStatus === 'rejected') return 'bg-gray-300 dark:bg-gray-600'
  if (item.directionGuess === 'withdrawal') return 'bg-red-400/50'
  if (item.directionGuess === 'deposit') return 'bg-green-400/50'
  return 'bg-amber-400/70'
}

function amountColor(item) {
  const resolved = item.importedTransactionType || item.directionGuess
  if (item.reviewStatus === 'rejected') return 'text-gray-400 dark:text-gray-500 line-through'
  if (resolved === 'withdrawal') return 'text-red-600 dark:text-red-400'
  if (resolved === 'deposit') return 'text-green-600 dark:text-green-400'
  return 'text-gray-900 dark:text-white'
}

function amountPrefix(item) {
  const resolved = item.importedTransactionType || item.directionGuess
  if (item.reviewStatus === 'rejected') return ''
  if (resolved === 'withdrawal') return '−'
  if (resolved === 'deposit') return '+'
  return ''
}

function statusLabel(item) {
  if (item.pending) return 'Bank pending'
  if (item.reviewStatus === 'approved') return 'Approved'
  if (item.reviewStatus === 'rejected') return 'Rejected'
  return null
}

function statusClass(item) {
  if (item.pending) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (item.reviewStatus === 'approved') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (item.reviewStatus === 'rejected') return 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  return ''
}

function formatDateCompact(value) {
  if (!value) return ''
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function refresh() {
  if (!props.accountId) {
    return
  }

  try {
    await store.fetchReviewQueue(props.accountId)
  } catch (error) {
    showError('Plaid review failed', error.response?.data?.message || error.message || 'Unable to load Plaid review items')
  }
}

function normalize(value) {
  return (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveType(item) {
  return transactionTypes[item.id] || item.directionGuess || 'deposit'
}

function truncate(value, max) {
  const str = (value || '').toString()
  if (str.length <= max) return str
  return `${str.slice(0, max - 1)}…`
}

function requestAction(item, action) {
  if (action === 'approve' && !['deposit', 'withdrawal'].includes(resolveType(item))) {
    showError('Choose a type', 'This transaction is ambiguous — open the customize panel and pick deposit or withdrawal first.')
    expanded[item.id] = true
    return
  }

  const pool = action === 'revert'
    ? syncedActivity.value.filter(candidate => canRevert(candidate))
    : reviewQueue.value

  const targetDescription = normalize(item.description)
  const matchingIds = pool
    .filter(candidate => candidate.id !== item.id && normalize(candidate.description) === targetDescription)
    .map(candidate => candidate.id)

  // No similar items — just act on the single item.
  if (matchingIds.length === 0) {
    runAction(action, [item.id])
    return
  }

  confirmState.open = true
  confirmState.action = action
  confirmState.scope = 'single'
  confirmState.item = item
  confirmState.matchingIds = [item.id, ...matchingIds]
  confirmState.resolvedType = resolveType(item)
}

function closeConfirm() {
  if (bulkBusy.value) return
  confirmState.open = false
  confirmState.item = null
  confirmState.matchingIds = []
}

async function executeConfirm() {
  if (!confirmState.item) return
  const ids = confirmState.scope === 'matching'
    ? confirmState.matchingIds
    : [confirmState.item.id]

  bulkBusy.value = true
  try {
    await runAction(confirmState.action, ids, confirmState.resolvedType)
    confirmState.open = false
    confirmState.item = null
    confirmState.matchingIds = []
  } finally {
    bulkBusy.value = false
  }
}

async function runAction(action, ids, sharedType) {
  const isBulk = ids.length > 1
  actingId.value = isBulk ? '' : ids[0]

  try {
    if (action === 'approve') {
      if (isBulk) {
        const result = await store.bulkApproveTransactions(
          props.accountId,
          ids,
          sharedType || resolveType(confirmState.item || { id: ids[0] })
        )
        const msg = `${result.approved} approved${result.skipped ? `, ${result.skipped} skipped` : ''}${result.errors?.length ? `, ${result.errors.length} failed` : ''}.`
        if (result.errors?.length && result.approved === 0) {
          showError('Bulk approval failed', msg)
        } else {
          showSuccess('Plaid approvals complete', msg)
        }
      } else {
        await store.approveTransaction(props.accountId, ids[0], {
          transactionType: transactionTypes[ids[0]],
          description: descriptions[ids[0]]
        })
        showSuccess('Plaid transaction approved', 'The approved transfer now affects account cashflow.')
      }
    } else if (action === 'reject') {
      if (isBulk) {
        const result = await store.bulkRejectTransactions(props.accountId, ids)
        const msg = `${result.rejected} rejected${result.errors?.length ? `, ${result.errors.length} failed` : ''}.`
        if (result.errors?.length && result.rejected === 0) {
          showError('Bulk rejection failed', msg)
        } else {
          showSuccess('Plaid rejections complete', msg)
        }
      } else {
        await store.rejectTransaction(props.accountId, ids[0])
        showSuccess('Plaid transaction rejected', 'The Plaid activity was excluded from cashflow.')
      }
    } else if (action === 'revert') {
      if (isBulk) {
        const result = await store.bulkRevertTransactions(props.accountId, ids)
        const msg = `${result.reverted} untracked${result.errors?.length ? `, ${result.errors.length} failed` : ''}.`
        if (result.errors?.length && result.reverted === 0) {
          showError('Untrack failed', msg)
        } else {
          showSuccess('Plaid transactions untracked', msg)
        }
      } else {
        await store.revertTransaction(props.accountId, ids[0])
        showSuccess('Plaid transaction untracked', 'The decision was reverted and the activity is back in the pending queue.')
      }
    }
    emit('changed')
  } catch (error) {
    const label = action === 'approve' ? 'Approval' : action === 'reject' ? 'Rejection' : 'Untrack'
    showError(`${label} failed`, error.response?.data?.message || error.message || 'Unable to complete the request')
  } finally {
    actingId.value = ''
  }
}
</script>
