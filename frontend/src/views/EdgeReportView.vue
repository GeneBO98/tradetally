<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="heading-page">Edge Report</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          A weekly read on what's working and what's costing you.
        </p>
      </div>
      <button class="btn-primary" :disabled="generating" @click="generateNow">
        {{ generating ? 'Generating...' : 'Generate for this week' }}
      </button>
    </div>

    <!-- Loading (initial only) -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="reports.length === 0" class="text-center py-16">
      <DocumentChartBarIcon class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No edge reports yet</h3>
      <p class="mt-1 mx-auto max-w-md text-sm text-gray-500 dark:text-gray-400">
        Reports are generated every Monday for the prior week when enabled in
        Settings, or you can generate one now for the most recent completed week.
      </p>
      <div class="mt-6 flex items-center justify-center gap-3">
        <button class="btn-primary" :disabled="generating" @click="generateNow">
          {{ generating ? 'Generating...' : 'Generate now' }}
        </button>
        <router-link to="/settings" class="btn-secondary">
          Enable weekly emails
        </router-link>
      </div>
      <p v-if="generateMessage" class="mt-4 text-sm text-gray-500 dark:text-gray-400">{{ generateMessage }}</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Report picker -->
      <div v-if="reports.length > 1" class="flex flex-wrap gap-2">
        <button
          v-for="r in reports"
          :key="r.id"
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          :class="selectedId === r.id
            ? 'border-primary-600 bg-primary-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
          @click="selectedId = r.id"
        >
          {{ formatTradeDate(r.period_start, 'MMM dd') }} – {{ formatTradeDate(r.period_end, 'MMM dd') }}
        </button>
      </div>

      <template v-if="selected">
        <!-- Week summary -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-baseline justify-between gap-4">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                Week of {{ formatTradeDate(selected.period_start, 'MMM dd') }} – {{ formatTradeDate(selected.period_end, 'MMM dd, yyyy') }}
              </h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">Generated {{ formatTradeDate(selected.created_at, 'MMM dd, yyyy') }}</span>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Net P&L</div>
                <div class="mt-1 text-xl font-semibold" :class="pnlClass(week.total_pnl)">
                  {{ formatSignedMoney(week.total_pnl) }}
                </div>
                <div v-if="deltas" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatSignedMoney(deltas.total_pnl) }} vs prior week
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Win Rate</div>
                <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                  {{ formatPercent(week.win_rate) }}
                </div>
                <div v-if="deltas" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatSignedPercent(deltas.win_rate) }} vs prior week
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Trades</div>
                <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                  {{ week.total_trades }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ week.winning_trades }}W · {{ week.losing_trades }}L
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Profit Factor</div>
                <div class="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                  {{ week.profit_factor != null ? Number(week.profit_factor).toFixed(2) : '-' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Edge and Leak -->
        <div class="grid gap-6 lg:grid-cols-2">
          <div class="card">
            <div class="card-body">
              <h3 class="text-sm font-semibold uppercase tracking-wider text-success">Your edge</h3>
              <template v-if="report.edge">
                <p class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ edgeLabel(report.edge) }}
                </p>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {{ report.edge.trades }} {{ report.edge.trades === 1 ? 'trade' : 'trades' }} · {{ formatPercent(report.edge.win_rate) }} win rate ·
                  <span :class="pnlClass(report.edge.total_pnl)">{{ formatSignedMoney(report.edge.total_pnl) }}</span>
                </p>
              </template>
              <p v-else class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                No repeatable edge stood out this week (needs at least 2 trades in a group).
              </p>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <h3 class="text-sm font-semibold uppercase tracking-wider text-danger">Your leak</h3>
              <template v-if="report.leak">
                <p class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ leakLabel(report.leak) }}
                </p>
                <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {{ report.leak.description || `${report.leak.trades} ${report.leak.trades === 1 ? 'trade' : 'trades'}` }}
                  <span v-if="report.leak.total_pnl != null" :class="pnlClass(report.leak.total_pnl)">
                    · {{ formatSignedMoney(report.leak.total_pnl) }}
                  </span>
                </p>
              </template>
              <p v-else class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                No significant leak detected this week.
              </p>
            </div>
          </div>
        </div>

        <!-- Action item -->
        <div v-if="report.action_item" class="card border-primary-200 bg-primary-50/60 dark:border-primary-900/50 dark:bg-primary-900/10">
          <div class="card-body">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">This week's action item</h3>
            <p class="mt-2 text-sm text-gray-900 dark:text-gray-100">{{ report.action_item }}</p>
          </div>
        </div>

        <!-- Narrative -->
        <div v-if="selected.narrative" class="card">
          <div class="card-body">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Coach's notes</h3>
            <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">{{ selected.narrative }}</p>
          </div>
        </div>

        <!-- Playbook adherence -->
        <div v-if="report.playbook" class="card">
          <div class="card-body">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Playbook adherence</h3>
            <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400">Reviewed trades</div>
                <div class="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white">{{ report.playbook.reviewed_trade_count }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400">Followed plan</div>
                <div class="mt-0.5 text-lg font-semibold text-success">{{ report.playbook.followed_trade_count }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400">Broke plan</div>
                <div class="mt-0.5 text-lg font-semibold text-danger">{{ report.playbook.broken_trade_count }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400">Avg adherence</div>
                <div class="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white">{{ report.playbook.adherence_average }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <p v-if="generateMessage" class="text-sm text-gray-500 dark:text-gray-400">{{ generateMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { DocumentChartBarIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { formatTradeDate } from '@/utils/date'
import { useNotification } from '@/composables/useNotification'

const { showError, showSuccess } = useNotification()

const reports = ref([])
const selectedId = ref(null)
const loading = ref(true)
const initialLoading = ref(true)
const generating = ref(false)
const generateMessage = ref('')

const selected = computed(() => reports.value.find(r => r.id === selectedId.value) || reports.value[0] || null)
const report = computed(() => selected.value?.report || {})
const week = computed(() => report.value.week || {})
const deltas = computed(() => report.value.deltas || null)

function pnlClass(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed) || parsed === 0) return 'text-gray-900 dark:text-white'
  return parsed > 0 ? 'text-success' : 'text-danger'
}

function formatSignedMoney(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return '-'
  const abs = Math.abs(parsed).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${parsed < 0 ? '-' : '+'}$${abs}`
}

function formatPercent(value) {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : '-'
}

function formatSignedPercent(value) {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return '-'
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(1)}pp`
}

const TYPE_LABELS = {
  strategy: 'strategy',
  symbol: '',
  time_of_day: '',
  oversized_losses: 'Oversized losing trades',
  loss_streak: 'Consecutive losses'
}

function edgeLabel(edge) {
  if (edge.type === 'time_of_day') return `Trading around ${edge.name}`
  const suffix = TYPE_LABELS[edge.type]
  return suffix ? `${edge.name} ${suffix}` : edge.name
}

function leakLabel(leak) {
  if (leak.type === 'oversized_losses' || leak.type === 'loss_streak') {
    return TYPE_LABELS[leak.type]
  }
  const suffix = TYPE_LABELS[leak.type]
  return suffix ? `${leak.name} ${suffix}` : leak.name
}

async function fetchReports() {
  loading.value = true
  try {
    const response = await api.get('/edge-reports')
    reports.value = response.data.reports || []
    if (!selectedId.value && reports.value.length > 0) {
      selectedId.value = reports.value[0].id
    }
  } catch (error) {
    console.error('[EDGE-REPORT] Failed to load reports:', error)
    showError('Error', error.response?.data?.error || 'Failed to load edge reports')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

async function generateNow() {
  generating.value = true
  generateMessage.value = ''
  try {
    const response = await api.post('/edge-reports/generate')
    if (response.data.report) {
      showSuccess('Edge report ready', 'Generated for the most recent completed week.')
      await fetchReports()
      selectedId.value = response.data.report.id || selectedId.value
    } else {
      generateMessage.value = response.data.message || 'No completed trades in the report period.'
    }
  } catch (error) {
    console.error('[EDGE-REPORT] Generate failed:', error)
    showError('Error', error.response?.data?.error || 'Failed to generate the report')
  } finally {
    generating.value = false
  }
}

onMounted(fetchReports)
</script>
