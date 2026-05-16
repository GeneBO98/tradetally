<template>
  <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 mb-8" data-testid="execution-run-panel">
    <div class="p-4 sm:p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Execution Runs</h2>
          <span
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
            :class="statusClasses"
            data-testid="execution-run-status"
          >
            <MdiIcon :icon="statusIcon" :size="14" />
            {{ statusLabel }}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <span data-testid="execution-run-mode-label">{{ currentModeLabel }}</span>
          <span v-if="latestRun">{{ latestRun.name || 'Unnamed run' }}</span>
          <span v-if="latestRun?.startedAt">{{ formatDateTime(latestRun.startedAt) }}</span>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="inline-grid grid-cols-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-1">
          <button
            v-for="item in modes"
            :key="item.value"
            type="button"
            class="min-h-[36px] px-3 text-sm font-medium rounded-md transition-colors"
            :class="mode === item.value ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'"
            :data-testid="`execution-run-mode-${item.value}`"
            @click="setMode(item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="loading"
            data-testid="execution-run-refresh"
            @click="loadRuns(mode)"
          >
            <MdiIcon :icon="mdiRefresh" :size="16" :class="{ 'animate-spin': loading }" />
          </button>
          <button
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="!selectedRun || reporting"
            data-testid="execution-run-report"
            @click="downloadReport('json')"
          >
            <MdiIcon :icon="mdiDownload" :size="16" class="mr-1" />
            Report
          </button>
          <button
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="!selectedRun || reporting"
            data-testid="execution-run-report-pdf"
            @click="downloadReport('pdf')"
          >
            PDF
          </button>
          <button
            v-if="selectedRun?.shareToken"
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="sharing || !shareRevocationReason.trim()"
            data-testid="execution-run-unshare"
            @click="unshareSelectedRun"
          >
            <MdiIcon :icon="mdiLinkOff" :size="16" class="mr-1" />
            Unshare
          </button>
          <button
            v-if="selectedRun?.shareToken"
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="sharing"
            data-testid="execution-run-share-rotate"
            @click="rotateSelectedRun"
          >
            Rotate
          </button>
          <button
            v-else
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="!selectedRun || sharing"
            data-testid="execution-run-share"
            @click="shareSelectedRun"
          >
            <MdiIcon :icon="mdiShareVariant" :size="16" class="mr-1" />
            Share
          </button>
          <button
            v-if="activeRun"
            type="button"
            class="btn-secondary min-h-[36px] px-3 py-1.5"
            :disabled="saving"
            data-testid="execution-run-complete"
            @click="completeActiveRun"
          >
            <MdiIcon :icon="mdiCheckCircle" :size="16" class="mr-1 text-emerald-600 dark:text-emerald-400" />
            Complete
          </button>
          <button
            v-else
            type="button"
            class="btn-primary min-h-[36px] px-3 py-1.5"
            :disabled="saving"
            data-testid="execution-run-start"
            @click="startNewRun"
          >
            <MdiIcon :icon="mdiPlay" :size="16" class="mr-1" />
            Start
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="error"
      class="border-t border-red-200 dark:border-red-900/70 px-5 py-3 text-sm text-red-700 dark:text-red-300"
      data-testid="execution-run-error"
    >
      <div>{{ error }}</div>
      <div v-if="traceId" class="mt-1 font-mono text-xs" data-testid="execution-run-trace-id">Trace {{ traceId }}</div>
    </div>

    <div
      v-if="actionMessage || selectedShareUrl"
      class="border-t border-gray-200 dark:border-gray-700 px-5 py-3 text-sm text-gray-600 dark:text-gray-300"
    >
      <div v-if="actionMessage" data-testid="execution-run-action-message">{{ actionMessage }}</div>
      <button
        v-if="selectedShareUrl"
        type="button"
        class="mt-1 max-w-full truncate font-mono text-xs text-primary-700 dark:text-primary-300 hover:underline"
        data-testid="execution-run-share-url"
        @click="copyShareUrl"
      >
        {{ selectedShareUrl }}
      </button>
    </div>

    <div
      v-if="selectedRun"
      class="border-t border-gray-200 dark:border-gray-700 px-5 py-3"
      data-testid="execution-run-share-controls"
    >
      <div v-if="selectedRun.shareToken" class="grid gap-3 text-sm lg:grid-cols-[1fr_260px] lg:items-end">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>Expires {{ formatDateTime(selectedRun.shareExpiresAt) || '-' }}</span>
          <span>Formats {{ selectedRun.shareScope?.formats?.join(', ') || '-' }}</span>
          <span>Template {{ shareTemplateLabel(selectedRun.shareScope?.template) }}</span>
          <span v-if="selectedRun.shareScope?.recipient">Recipient {{ selectedRun.shareScope.recipient }}</span>
          <span v-if="selectedRun.shareScope?.accountIds?.length">Accounts {{ selectedRun.shareScope.accountIds.join(', ') }}</span>
        </div>
        <label class="text-gray-700 dark:text-gray-300">
          Revocation reason
          <input v-model="shareRevocationReason" class="input mt-1" placeholder="Required" data-testid="execution-run-unshare-reason" />
        </label>
      </div>
      <div v-else class="grid gap-3 text-sm lg:grid-cols-[120px_190px_1fr] lg:items-center">
        <label class="text-gray-700 dark:text-gray-300">
          Expires hours
          <input v-model.number="shareForm.expiresInHours" type="number" min="1" max="2160" class="input mt-1" data-testid="execution-run-share-expiry" />
        </label>
        <label class="text-gray-700 dark:text-gray-300">
          Template
          <select v-model="shareForm.template" class="input mt-1" data-testid="execution-run-share-template">
            <option value="trader">Trader</option>
            <option value="prop_firm">Prop firm</option>
            <option value="investor">Investor</option>
            <option value="tax_accounting">Tax/accounting</option>
          </select>
        </label>
        <div class="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.formats" type="checkbox" value="json" data-testid="execution-run-share-json" />
            JSON
          </label>
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.formats" type="checkbox" value="pdf" data-testid="execution-run-share-pdf" />
            PDF
          </label>
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.formats" type="checkbox" value="csv" data-testid="execution-run-share-csv" />
            CSV
          </label>
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.includeEvents" type="checkbox" />
            Events
          </label>
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.includeMetrics" type="checkbox" />
            Metrics
          </label>
          <label class="inline-flex items-center gap-1">
            <input v-model="shareForm.includeReportAccesses" type="checkbox" />
            Access audit
          </label>
        </div>
        <label class="text-gray-700 dark:text-gray-300 lg:col-span-1">
          Recipient scope
          <input v-model="shareForm.recipient" class="input mt-1" placeholder="Investor A" data-testid="execution-run-share-recipient" />
        </label>
        <label class="text-gray-700 dark:text-gray-300 lg:col-span-2">
          Watermark
          <input v-model="shareForm.watermark" class="input mt-1" placeholder="Confidential - recipient only" data-testid="execution-run-share-watermark" />
        </label>
        <div class="text-gray-700 dark:text-gray-300 lg:col-span-3" data-testid="execution-run-share-accounts">
          <p class="mb-2 text-sm">Account scope</p>
          <div v-if="availableShareAccounts.length" class="flex flex-wrap gap-2">
            <label
              v-for="account in availableShareAccounts"
              :key="account.scopeId"
              class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700"
            >
              <input
                v-model="shareForm.accountIds"
                type="checkbox"
                :value="account.scopeId"
                :data-testid="`execution-run-share-account-${account.scopeId}`"
              />
              {{ account.label }}
            </label>
          </div>
          <p v-if="shareUnresolvedAccountIds.length" class="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {{ shareUnresolvedAccountIds.length }} run account IDs are not linked to account records.
          </p>
          <p v-if="!availableShareAccounts.length" class="text-xs text-gray-500 dark:text-gray-400">All accounts for this run are allowed.</p>
        </div>
      </div>
      <div v-if="shareAudits.length" class="mt-3 border-t border-gray-100 pt-3 text-xs dark:border-gray-700" data-testid="execution-run-share-audits">
        <p class="mb-2 font-medium text-gray-900 dark:text-white">Share rotation history</p>
        <div v-for="audit in shareAudits.slice(0, 4)" :key="audit.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500 dark:text-gray-400">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ audit.action }}</span>
          <span>{{ audit.recipient || audit.scope?.recipient || 'unscoped recipient' }}</span>
          <span class="font-mono">{{ shortId(audit.tokenHash || audit.previousTokenHash) }}</span>
          <span>{{ formatDateTime(audit.createdAt) }}</span>
        </div>
      </div>
    </div>

    <div
      class="border-t border-gray-200 dark:border-gray-700 px-5 py-4"
      data-testid="execution-run-comparison"
    >
      <div
        v-if="lineageSummary"
        class="mb-3 grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-3"
        data-testid="execution-run-lineage"
      >
        <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
          <span class="font-medium text-gray-900 dark:text-white">Lineage</span>
          <div>{{ lineageSummary }}</div>
        </div>
        <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
          <span class="font-medium text-gray-900 dark:text-white">Snapshot</span>
          <div class="truncate font-mono">{{ selectedRun?.marketDataSnapshotId || plannedSnapshotId }}</div>
        </div>
        <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
          <span class="font-medium text-gray-900 dark:text-white">Confidence</span>
          <div>{{ confidenceSummary }}</div>
        </div>
      </div>
      <div class="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Live, Replay, Backtest Sync</h3>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-grid grid-cols-3 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/40" data-testid="execution-run-confidence-levels">
            <button
              v-for="option in confidenceOptions"
              :key="option.key"
              type="button"
              class="min-h-[30px] px-2 text-xs font-medium rounded-md transition-colors"
              :class="selectedConfidenceKey === option.key ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
              @click="selectedConfidenceKey = option.key"
            >
              {{ option.label }}
            </button>
          </div>
          <button
            type="button"
            class="btn-secondary min-h-[32px] px-3 py-1 text-xs"
            :disabled="comparisonLoading"
            @click="loadComparison"
          >
            <MdiIcon :icon="mdiChartTimelineVariant" :size="15" :class="{ 'animate-spin': comparisonLoading }" class="mr-1" />
            Compare
          </button>
        </div>
      </div>
      <div class="mb-4 grid gap-3 md:grid-cols-3" data-testid="execution-run-lineage-graph">
        <div
          v-for="run in comparisonRuns"
          :key="run.id"
          class="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{{ run.mode }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatMetric(run.metrics?.totalR) }} R</span>
          </div>
          <p class="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">{{ run.name || 'Unnamed run' }}</p>
          <p class="mt-2 truncate font-mono text-xs text-gray-500 dark:text-gray-400">{{ run.marketDataSnapshotId || '-' }}</p>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ run.lineageType ? `${run.lineageType.replace(/_/g, ' ')} ${shortId(run.parentRunId)}` : 'root' }}</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-xs">
          <thead class="text-gray-500 dark:text-gray-400">
            <tr>
              <th class="py-2 pr-4 font-medium">Metric</th>
              <th class="py-2 pr-4 font-medium">Live</th>
              <th class="py-2 pr-4 font-medium">Replay</th>
              <th class="py-2 pr-4 font-medium">Backtest</th>
              <th class="py-2 font-medium">Replay / Backtest delta</th>
              <th class="py-2 pl-4 font-medium">Backtest {{ selectedConfidenceLabel }} CI</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700 text-gray-800 dark:text-gray-200">
            <tr v-for="row in metricRows" :key="row.key">
              <td class="py-2 pr-4 font-medium">{{ humanizeMetric(row.key) }}</td>
              <td class="py-2 pr-4">{{ formatMetric(row.byMode.live) }}</td>
              <td class="py-2 pr-4">{{ formatMetric(row.byMode.replay) }}</td>
              <td class="py-2 pr-4">{{ formatMetric(row.byMode.backtest) }}</td>
              <td class="py-2">{{ formatMetric(row.deltasFromLive.replay) }} / {{ formatMetric(row.deltasFromLive.backtest) }}</td>
              <td class="py-2 pl-4">{{ formatConfidence(row.confidenceByMode?.backtest) }}</td>
            </tr>
            <tr v-if="metricRows.length === 0">
              <td colspan="6" class="py-3 text-gray-500 dark:text-gray-400">No comparable run metrics yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  mdiAlertCircle,
  mdiChartTimelineVariant,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiDownload,
  mdiLinkOff,
  mdiPlay,
  mdiRefresh,
  mdiShareVariant
} from '@mdi/js'
import MdiIcon from '@/components/MdiIcon.vue'
import { useExecutionRuns } from '@/composables/useExecutionRuns'
import {
  compareExecutionRuns,
  downloadExecutionRunReport,
  getExecutionRunReport,
  listExecutionRunShareAudits,
  listExecutionRunShareAccounts,
  shareExecutionRun,
  unshareExecutionRun
} from '@/services/executionRuns'

const props = defineProps({
  filters: {
    type: Object,
    default: () => ({})
  },
  tradeCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['run-started', 'run-updated'])

const modes = [
  { value: 'live', label: 'Live' },
  { value: 'replay', label: 'Replay' },
  { value: 'backtest', label: 'Backtest' }
]
const confidenceOptions = [
  { key: 'p90', label: '90%', value: 0.9 },
  { key: 'p95', label: '95%', value: 0.95 },
  { key: 'p99', label: '99%', value: 0.99 }
]

const {
  mode,
  runs,
  loading,
  saving,
  error,
  traceId,
  activeRun,
  latestRun,
  loadRuns,
  startRun,
  finishRun,
  recordRunEvent
} = useExecutionRuns('live')

const lastFilterSignature = ref('')
const comparison = ref({ runs: [], metrics: [] })
const comparisonLoading = ref(false)
const actionMessage = ref('')
const reporting = ref(false)
const sharing = ref(false)
const shareAudits = ref([])
const shareAccounts = ref([])
const shareUnresolvedAccountIds = ref([])
const shareRevocationReason = ref('')
const selectedConfidenceKey = ref('p95')
const shareForm = ref({
  expiresInHours: 168,
  formats: ['json', 'pdf'],
  includeEvents: true,
  includeMetrics: true,
  includeReportAccesses: false,
  template: 'trader',
  recipient: '',
  watermark: 'Confidential',
  accountIds: []
})

const currentModeLabel = computed(() => modes.find(item => item.value === mode.value)?.label || 'Live')
const selectedRun = computed(() => activeRun.value || latestRun.value || null)
const metricRows = computed(() => (comparison.value.metrics || []).slice(0, 6))
const comparisonRuns = computed(() => (comparison.value.runs || []).slice(0, 3))
const selectedConfidenceLabel = computed(() => confidenceOptions.find(option => option.key === selectedConfidenceKey.value)?.label || '95%')
const confidenceLevelsParam = computed(() => confidenceOptions.map(option => option.value).join(','))
const plannedSnapshotId = computed(() => buildSnapshotId(mode.value))
const lineageSummary = computed(() => {
  if (selectedRun.value?.lineageType) return `${selectedRun.value.lineageType.replace(/_/g, ' ')} ${shortId(selectedRun.value.parentRunId)}`
  const parent = getPlannedParent()
  if (!parent) return 'Root run'
  return `${mode.value === 'backtest' ? 'backtest of' : 'replay of'} ${shortId(parent.id)}`
})
const confidenceSummary = computed(() => {
  const totalR = metricRows.value.find(row => row.key === 'totalR')?.confidenceByMode?.[mode.value]
  return formatConfidence(totalR)
})
const selectedShareUrl = computed(() => {
  if (!selectedRun.value?.shareToken) return ''
  return `${window.location.origin}/api/execution-runs/shared/${selectedRun.value.shareToken}`
})
const availableAccountIds = computed(() => {
  const values = new Set()
  ;[selectedRun.value, ...comparisonRuns.value].filter(Boolean).forEach(run => {
    appendAccountValue(values, run.config?.accountId)
    appendAccountValue(values, run.config?.accountIds)
    appendAccountValue(values, run.config?.filters?.account)
    appendAccountValue(values, run.config?.filters?.accountId)
    appendAccountValue(values, run.marketDataSnapshot?.accountId)
    appendAccountValue(values, run.marketDataSnapshot?.accountIds)
    appendAccountValue(values, run.marketDataSnapshot?.account)
    appendAccountValue(values, run.shareScope?.accountIds)
  })
  return Array.from(values).sort()
})
const availableShareAccounts = computed(() => {
  const realAccounts = shareAccounts.value
    .map(account => ({
      scopeId: account.scopeId || account.accountIdentifier || account.id,
      label: [
        account.accountName || account.accountIdentifier || account.id,
        account.accountIdentifier && account.accountName ? account.accountIdentifier : null,
        account.broker
      ].filter(Boolean).join(' | ')
    }))
    .filter(account => account.scopeId)
  if (realAccounts.length > 0) return realAccounts
  return availableAccountIds.value.map(accountId => ({ scopeId: accountId, label: accountId }))
})

const statusLabel = computed(() => {
  if (activeRun.value) return activeRun.value.status
  if (latestRun.value) return latestRun.value.status
  return 'ready'
})

const statusIcon = computed(() => {
  if (statusLabel.value === 'failed' || statusLabel.value === 'cancelled') return mdiCloseCircle
  if (statusLabel.value === 'completed') return mdiCheckCircle
  if (statusLabel.value === 'ready') return mdiAlertCircle
  return mdiPlay
})

const statusClasses = computed(() => {
  if (statusLabel.value === 'completed') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
  if (statusLabel.value === 'failed' || statusLabel.value === 'cancelled') return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
  if (activeRun.value) return 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
})

function buildRunConfig() {
  return {
    filters: { ...props.filters },
    route: window.location.pathname,
    tradeCount: props.tradeCount
  }
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function humanizeMetric(key) {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const number = Number(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

function formatConfidence(stats) {
  if (!stats || !stats.count) return 'Not enough history'
  const interval = stats.intervals?.[selectedConfidenceKey.value] || {
    lower: stats.lower95,
    upper: stats.upper95
  }
  return `${formatMetric(interval.lower)} to ${formatMetric(interval.upper)} (${stats.count})`
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : '-'
}

function shareTemplateLabel(value) {
  const labels = {
    trader: 'Trader',
    prop_firm: 'Prop firm',
    investor: 'Investor',
    tax_accounting: 'Tax/accounting'
  }
  return labels[value] || labels.trader
}

function appendAccountValue(values, value) {
  if (Array.isArray(value)) {
    value.forEach(item => appendAccountValue(values, item))
    return
  }
  if (value && typeof value === 'object') {
    appendAccountValue(values, value.id || value.accountId || value.account || value.label)
    return
  }
  const cleaned = String(value || '').trim()
  if (cleaned) values.add(cleaned)
}

function stableHash(value) {
  const text = JSON.stringify(value || {})
  let hash = 0
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function buildSnapshotId(nextMode = mode.value) {
  return `tm-${nextMode}-${stableHash({ filters: props.filters, tradeCount: props.tradeCount })}`
}

function getPlannedParent() {
  if (mode.value === 'replay') return comparison.value.runs?.find(run => run.mode === 'live') || null
  if (mode.value === 'backtest') return comparison.value.runs?.find(run => run.mode === 'replay') || null
  return null
}

function replaceRun(run) {
  runs.value = runs.value.map(existing => existing.id === run.id ? run : existing)
}

function shareScopePayload(overrides = {}) {
  const activeScope = selectedRun.value?.shareScope || {}
  const formats = Array.isArray(overrides.formats || shareForm.value.formats)
    ? (overrides.formats || shareForm.value.formats)
    : activeScope.formats || ['json']
  return {
    formats: formats.length > 0 ? formats : ['json'],
    includeEvents: overrides.includeEvents ?? activeScope.includeEvents ?? shareForm.value.includeEvents,
    includeMetrics: overrides.includeMetrics ?? activeScope.includeMetrics ?? shareForm.value.includeMetrics,
    includeReportAccesses: overrides.includeReportAccesses ?? activeScope.includeReportAccesses ?? shareForm.value.includeReportAccesses,
    template: overrides.template || activeScope.template || shareForm.value.template,
    recipient: overrides.recipient || activeScope.recipient || shareForm.value.recipient || undefined,
    watermark: overrides.watermark || activeScope.watermark || shareForm.value.watermark || undefined,
    accountIds: Array.isArray(overrides.accountIds)
      ? overrides.accountIds
      : Array.isArray(activeScope.accountIds) && activeScope.accountIds.length
        ? activeScope.accountIds
        : shareForm.value.accountIds
  }
}

async function loadShareAudits() {
  if (!selectedRun.value?.id) {
    shareAudits.value = []
    return
  }
  shareAudits.value = await listExecutionRunShareAudits(selectedRun.value.id, { limit: 10 })
}

async function loadShareScopeAccounts() {
  if (!selectedRun.value?.id) {
    shareAccounts.value = []
    shareUnresolvedAccountIds.value = []
    return
  }
  try {
    const accountScope = await listExecutionRunShareAccounts(selectedRun.value.id)
    shareAccounts.value = accountScope.accounts || []
    shareUnresolvedAccountIds.value = accountScope.unresolvedAccountIds || []
  } catch {
    shareAccounts.value = []
    shareUnresolvedAccountIds.value = []
  }
}

async function loadComparison() {
  comparisonLoading.value = true
  try {
    comparison.value = await compareExecutionRuns({
      source: 'trade-management',
      confidenceLevels: confidenceLevelsParam.value
    })
  } finally {
    comparisonLoading.value = false
  }
}

async function setMode(nextMode) {
  if (mode.value === nextMode) return
  await loadRuns(nextMode)
  await loadComparison()
}

async function startNewRun() {
  const parentRun = getPlannedParent()
  const run = await startRun({
    name: `${currentModeLabel.value} analysis`,
    source: 'trade-management',
    config: buildRunConfig(),
    parentRunId: parentRun?.id || null,
    lineageType: parentRun ? (mode.value === 'backtest' ? 'backtest_of' : 'replay_of') : null,
    marketDataSnapshotId: buildSnapshotId(),
    marketDataSnapshot: {
      filters: { ...props.filters },
      capturedAt: new Date().toISOString(),
      tradeCount: props.tradeCount
    }
  })
  emit('run-started', run)
  await loadComparison()
}

async function completeActiveRun() {
  const run = await finishRun('completed', {
    metrics: {
      tradeCount: props.tradeCount,
      completedFrom: 'trade-management'
    }
  })
  emit('run-updated', run)
  await loadComparison()
}

async function downloadReport(format = 'json') {
  if (!selectedRun.value) return
  reporting.value = true
  actionMessage.value = ''

  try {
    const report = format === 'json'
      ? await getExecutionRunReport(selectedRun.value.id, {
        template: shareForm.value.template,
        recipient: shareForm.value.recipient || undefined,
        watermark: shareForm.value.watermark || undefined
      })
      : await downloadExecutionRunReport(selectedRun.value.id, 'pdf', {
        template: shareForm.value.template,
        recipient: shareForm.value.recipient || undefined,
        watermark: shareForm.value.watermark || undefined
      })
    const blob = format === 'json'
      ? new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      : report
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `execution-run-${selectedRun.value.id}.${format}`
    link.click()
    URL.revokeObjectURL(url)
    actionMessage.value = `${format.toUpperCase()} report generated for ${selectedRun.value.name || selectedRun.value.mode}.`
  } finally {
    reporting.value = false
  }
}

async function shareSelectedRun() {
  if (!selectedRun.value) return
  sharing.value = true
  actionMessage.value = ''

  try {
    const formats = shareForm.value.formats.length > 0 ? shareForm.value.formats : ['json']
    const result = await shareExecutionRun(selectedRun.value.id, {
      expiresInHours: shareForm.value.expiresInHours,
      scope: shareScopePayload({ formats, accountIds: shareForm.value.accountIds })
    })
    replaceRun(result.run)
    shareRevocationReason.value = ''
    actionMessage.value = 'Share link is active.'
    await loadShareAudits()
  } finally {
    sharing.value = false
  }
}

async function rotateSelectedRun() {
  if (!selectedRun.value) return
  sharing.value = true
  actionMessage.value = ''

  try {
    const result = await shareExecutionRun(selectedRun.value.id, {
      expiresInHours: shareForm.value.expiresInHours,
      scope: shareScopePayload()
    })
    replaceRun(result.run)
    actionMessage.value = 'Share link rotated.'
    await loadShareAudits()
  } finally {
    sharing.value = false
  }
}

async function unshareSelectedRun() {
  if (!selectedRun.value) return
  sharing.value = true
  actionMessage.value = ''

  try {
    const run = await unshareExecutionRun(selectedRun.value.id, {
      reason: shareRevocationReason.value
    })
    replaceRun(run)
    shareRevocationReason.value = ''
    actionMessage.value = 'Share link revoked.'
    await loadShareAudits()
  } finally {
    sharing.value = false
  }
}

async function copyShareUrl() {
  if (!selectedShareUrl.value || !navigator.clipboard) return
  await navigator.clipboard.writeText(selectedShareUrl.value)
  actionMessage.value = 'Share link copied.'
}

watch(
  () => JSON.stringify(props.filters || {}),
  async (signature) => {
    if (!signature || signature === lastFilterSignature.value) return
    lastFilterSignature.value = signature
    await recordRunEvent('analysis.filters_changed', {
      filters: { ...props.filters },
      tradeCount: props.tradeCount
    })
  }
)

watch(
  () => selectedRun.value?.id,
  async () => {
    await loadShareAudits()
    await loadShareScopeAccounts()
  }
)

onMounted(async () => {
  lastFilterSignature.value = JSON.stringify(props.filters || {})
  await loadRuns(mode.value)
  await loadComparison()
  await loadShareAudits()
  await loadShareScopeAccounts()
})
</script>
