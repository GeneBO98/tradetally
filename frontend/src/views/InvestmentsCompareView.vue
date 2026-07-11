<template>
  <div class="content-wrapper py-6">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-3">
        <button
          @click="goBack"
          class="text-sm text-primary-600 hover:text-primary-800"
        >
          ← Back to Investments
        </button>
        <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
          Compare Accounts
          <span v-if="selectedAccountLabels.length > 0" class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({{ selectedAccountLabels.length }})
          </span>
        </h1>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-xs text-gray-500 dark:text-gray-400">Period</label>
        <div class="w-28">
          <BaseSelect
            v-model="period"
            :options="['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL']"
          />
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">vs {{ benchmark }}</span>
      </div>
    </div>

    <!-- Empty / invalid state -->
    <div
      v-if="selectedAccountValues.length < 2"
      class="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-800 dark:text-yellow-200"
    >
      Select at least two accounts from the Account Comparison panel to compare.
      <button @click="goBack" class="ml-2 underline text-primary-600 hover:text-primary-800">
        Back to Investments
      </button>
    </div>

    <!-- Initial loading spinner -->
    <div
      v-else-if="initialLoading"
      class="flex justify-center py-16"
    >
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Comparison table: all metrics for every selected account in one place,
         with a Difference column when exactly two accounts are being compared. -->
    <div v-else class="space-y-4">
      <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Comparison</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-4 py-2 text-left text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Metric</th>
                <th
                  v-for="account in selectedAccountValues"
                  :key="account"
                  class="px-4 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  <div class="text-gray-900 dark:text-white normal-case font-medium">
                    {{ accountLabels[account] || account }}
                  </div>
                  <div v-if="leaderAccount === account" class="text-[10px] text-primary-600 dark:text-primary-400 normal-case font-normal">
                    leader
                  </div>
                </th>
                <th
                  v-if="isPairCompare"
                  class="px-4 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  Difference
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="metric in comparisonMetricRows" :key="metric.key">
                <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ metric.label }}</td>
                <td
                  v-for="account in selectedAccountValues"
                  :key="account"
                  class="px-4 py-2 text-right"
                >
                  <span
                    class="font-medium"
                    :class="metric.valueClass ? metric.valueClass(account) : 'text-gray-900 dark:text-white'"
                  >
                    {{ metric.formatValue(account) }}
                  </span>
                  <span
                    v-if="!isPairCompare && leaderAccount !== account && metric.formatDelta(account) !== ''"
                    :class="metric.deltaClass(account)"
                    class="block text-[10px]"
                  >
                    {{ metric.formatDelta(account) }}
                  </span>
                </td>
                <td
                  v-if="isPairCompare"
                  class="px-4 py-2 text-right font-medium"
                  :class="metric.pairDeltaClass()"
                >
                  {{ metric.formatPairDelta() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Per-account grid: chart + holdings only. Numeric comparison lives
           in the table above so columns can stay aligned. -->
      <div class="overflow-x-auto -mx-4 px-4">
        <div
          class="grid gap-4"
          :style="{ gridTemplateColumns: `repeat(${selectedAccountValues.length}, minmax(380px, 1fr))` }"
        >
          <section
            v-for="account in selectedAccountValues"
            :key="account"
            class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
          >
          <!-- Account header -->
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ accountLabels[account] || account }}
              </h2>
              <span
                v-if="leaderAccount === account"
                class="text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-full px-2 py-0.5 whitespace-nowrap"
              >
                Leader
              </span>
            </div>
          </div>

          <!-- Per-account loading state -->
          <div
            v-if="perAccountLoading[account]"
            class="flex justify-center py-12"
          >
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>

          <template v-else>
            <!-- Performance chart -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Performance vs {{ benchmark }}</h3>
              <div
                v-if="perAccountData[account]?.performance?.series?.length"
                class="h-64"
              >
                <PortfolioPerformanceChart
                  :data="perAccountData[account].performance.series"
                  :benchmark-label="benchmark"
                />
              </div>
              <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                Historical performance data is not available for this account.
              </p>
            </div>

            <!-- Holdings table (read-only) -->
            <div class="p-4">
              <h3 class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Holdings</h3>
              <div v-if="perAccountData[account]?.rebalance?.positions?.length" class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                  <thead class="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th class="px-2 py-1.5 text-left text-[10px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
                      <th class="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Value</th>
                      <th class="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actual</th>
                      <th class="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Target</th>
                      <th class="px-2 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Drift</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="position in perAccountData[account].rebalance.positions" :key="position.symbol">
                      <td class="px-2 py-1.5 font-medium text-gray-900 dark:text-white">{{ position.symbol }}</td>
                      <td class="px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">
                        {{ position.currentValue === null ? '—' : formatCurrency(position.currentValue) }}
                      </td>
                      <td class="px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">
                        {{ position.actualAllocationPercent === null || position.actualAllocationPercent === undefined ? '—' : formatPercent(position.actualAllocationPercent, false) }}
                      </td>
                      <td class="px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">
                        {{ position.targetAllocationPercent === null || position.targetAllocationPercent === undefined ? '—' : formatPercent(position.targetAllocationPercent, false) }}
                      </td>
                      <td
                        class="px-2 py-1.5 text-right"
                        :class="driftColorClass(position.driftPercent)"
                      >
                        {{ position.driftPercent === null || position.driftPercent === undefined ? '—' : formatPercent(position.driftPercent) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-xs text-gray-500 dark:text-gray-400">No holdings for this account.</p>
            </div>
          </template>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/services/api'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatPercent as formatPercentBase } from '@/utils/formatters'
import PortfolioPerformanceChart from '@/components/investments/PortfolioPerformanceChart.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'

const router = useRouter()
const route = useRoute()

const { accounts, fetchAccounts } = useGlobalAccountFilter()

const period = ref(route.query.period?.toString() || '1Y')
const benchmark = ref((route.query.benchmark?.toString() || 'SPY').toUpperCase())

const selectedAccountValues = computed(() => {
    const raw = route.query.accounts
    if (!raw) return []
    return String(raw)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
})

const accountLabels = computed(() => {
    const map = {}
    for (const account of accounts.value || []) {
        if (account.value) map[account.value] = account.label
    }
    return map
})

const selectedAccountLabels = computed(() =>
    selectedAccountValues.value.map((value) => accountLabels.value[value] || value),
)

// Map of accountValue → { overview, performance, rebalance, maxDriftPercent }
const perAccountData = ref({})
const perAccountLoading = ref({})
const initialLoading = ref(true)

// Identify the leader account (highest total return %) so we can show
// deltas vs leader for every other column. Returns null until enough
// data has loaded to make a fair comparison.
const leaderAccount = computed(() => {
    const candidates = selectedAccountValues.value
        .map((account) => ({
            account,
            returnPercent: Number(
                perAccountData.value[account]?.performance?.metrics?.totalReturnPercent ?? NaN,
            ),
        }))
        .filter((entry) => Number.isFinite(entry.returnPercent))
    if (candidates.length === 0) return null
    return candidates.reduce(
        (best, entry) => (entry.returnPercent > best.returnPercent ? entry : best),
    ).account
})

function metricValue(account, key) {
    const value = perAccountData.value[account]?.performance?.metrics?.[key]
    return value === null || value === undefined ? null : Number(value)
}

function summaryValue(account, key) {
    const data = perAccountData.value[account]
    if (!data) return null
    if (key === 'maxDriftPercent') {
        return data.maxDriftPercent === null || data.maxDriftPercent === undefined
            ? null
            : Number(data.maxDriftPercent)
    }
    const value = data.overview?.[key]
    return value === null || value === undefined ? null : Number(value)
}

// Δ vs leader for a metric. Returns null when this account IS the leader
// or when either side is missing. lowerIsBetter flips the color convention
// for metrics where smaller is better (volatility, max drawdown, drift).
function metricDelta(account, key, { source = 'metric', lowerIsBetter = false } = {}) {
    const leader = leaderAccount.value
    if (!leader || account === leader) return null
    const get = source === 'summary' ? summaryValue : metricValue
    const a = get(account, key)
    const b = get(leader, key)
    if (a === null || b === null) return null
    const delta = a - b
    return { delta, lowerIsBetter }
}

function deltaColorClass(delta) {
    if (!delta) return ''
    const improved = delta.lowerIsBetter ? delta.delta < 0 : delta.delta > 0
    if (delta.delta === 0) return 'text-gray-500 dark:text-gray-400'
    return improved ? 'text-green-600' : 'text-red-600'
}

function formatDeltaPercent(delta) {
    if (!delta) return ''
    const sign = delta.delta >= 0 ? '+' : ''
    return `${sign}${delta.delta.toFixed(2)}%`
}

function formatDeltaCurrency(delta) {
    if (!delta) return ''
    const sign = delta.delta >= 0 ? '+' : '-'
    return `${sign}${formatCurrency(Math.abs(delta.delta))}`
}

function formatDeltaNumber(delta, decimals = 2) {
    if (!delta) return ''
    const sign = delta.delta >= 0 ? '+' : ''
    return `${sign}${delta.delta.toFixed(decimals)}`
}

function formatDeltaInt(delta) {
    if (!delta) return ''
    const sign = delta.delta >= 0 ? '+' : ''
    return `${sign}${Math.round(delta.delta)}`
}

const isPairCompare = computed(() => selectedAccountValues.value.length === 2)
const nonLeaderAccount = computed(() => {
    if (!isPairCompare.value || !leaderAccount.value) return null
    return selectedAccountValues.value.find((account) => account !== leaderAccount.value) || null
})

// Single declarative list of every metric the Comparison table renders. Each
// entry knows how to read its value, format it, compute its delta vs leader,
// and color the delta cell. Building this once keeps the template flat.
const comparisonMetricRows = computed(() => [
    {
        key: 'totalValue',
        label: 'Total Value',
        formatValue: (account) => formatCurrency(summaryValue(account, 'totalValue')),
        formatDelta: (account) => {
            const delta = metricDelta(account, 'totalValue', { source: 'summary' })
            return delta ? formatDeltaCurrency(delta) : ''
        },
        deltaClass: () => 'text-gray-500 dark:text-gray-400',
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'totalValue', { source: 'summary' })
            return delta ? formatDeltaCurrency(delta) : '—'
        },
        pairDeltaClass: () => 'text-gray-700 dark:text-gray-300',
    },
    {
        key: 'positionCount',
        label: 'Positions',
        formatValue: (account) => {
            const value = summaryValue(account, 'positionCount')
            return value === null ? '—' : Math.round(value).toString()
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'positionCount', { source: 'summary' })
            return delta ? formatDeltaInt(delta) : ''
        },
        deltaClass: () => 'text-gray-500 dark:text-gray-400',
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'positionCount', { source: 'summary' })
            return delta ? formatDeltaInt(delta) : '—'
        },
        pairDeltaClass: () => 'text-gray-700 dark:text-gray-300',
    },
    {
        key: 'maxDriftPercent',
        label: 'Max Drift',
        formatValue: (account) => {
            const value = summaryValue(account, 'maxDriftPercent')
            return value === null ? '—' : formatPercent(value, false)
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'maxDriftPercent', { source: 'summary', lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'maxDriftPercent', { source: 'summary', lowerIsBetter: true })),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'maxDriftPercent', { source: 'summary', lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'maxDriftPercent', { source: 'summary', lowerIsBetter: true }))
        },
    },
    {
        key: 'totalReturnPercent',
        label: 'Return',
        formatValue: (account) => {
            const value = metricValue(account, 'totalReturnPercent')
            return value === null ? '—' : formatPercent(value)
        },
        valueClass: (account) => {
            const value = metricValue(account, 'totalReturnPercent')
            if (value === null) return 'text-gray-500 dark:text-gray-400'
            return value >= 0 ? 'text-green-600' : 'text-red-600'
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'totalReturnPercent')
            return delta ? formatDeltaPercent(delta) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'totalReturnPercent')),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'totalReturnPercent')
            return delta ? formatDeltaPercent(delta) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'totalReturnPercent'))
        },
    },
    {
        key: 'sharpeRatio',
        label: 'Sharpe',
        formatValue: (account) => {
            const value = metricValue(account, 'sharpeRatio')
            return value === null ? '—' : formatMetric(value, 3)
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'sharpeRatio')
            return delta ? formatDeltaNumber(delta, 3) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'sharpeRatio')),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'sharpeRatio')
            return delta ? formatDeltaNumber(delta, 3) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'sharpeRatio'))
        },
    },
    {
        key: 'beta',
        label: 'Beta',
        formatValue: (account) => {
            const value = metricValue(account, 'beta')
            return value === null ? '—' : formatMetric(value, 3)
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'beta')
            return delta ? formatDeltaNumber(delta, 3) : ''
        },
        deltaClass: () => 'text-gray-500 dark:text-gray-400',
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'beta')
            return delta ? formatDeltaNumber(delta, 3) : '—'
        },
        pairDeltaClass: () => 'text-gray-700 dark:text-gray-300',
    },
    {
        key: 'alphaPercent',
        label: 'Alpha',
        formatValue: (account) => {
            const value = metricValue(account, 'alphaPercent')
            return value === null ? '—' : formatPercent(value)
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'alphaPercent')
            return delta ? formatDeltaPercent(delta) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'alphaPercent')),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'alphaPercent')
            return delta ? formatDeltaPercent(delta) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'alphaPercent'))
        },
    },
    {
        key: 'volatilityPercent',
        label: 'Volatility',
        formatValue: (account) => {
            const value = metricValue(account, 'volatilityPercent')
            return value === null ? '—' : formatPercent(value, false)
        },
        formatDelta: (account) => {
            const delta = metricDelta(account, 'volatilityPercent', { lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'volatilityPercent', { lowerIsBetter: true })),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'volatilityPercent', { lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'volatilityPercent', { lowerIsBetter: true }))
        },
    },
    {
        key: 'maxDrawdownPercent',
        label: 'Max Drawdown',
        formatValue: (account) => {
            const value = metricValue(account, 'maxDrawdownPercent')
            if (value === null) return '—'
            return formatPercent(-Math.abs(value))
        },
        valueClass: () => 'text-red-600',
        formatDelta: (account) => {
            const delta = metricDelta(account, 'maxDrawdownPercent', { lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : ''
        },
        deltaClass: (account) => deltaColorClass(metricDelta(account, 'maxDrawdownPercent', { lowerIsBetter: true })),
        formatPairDelta: () => {
            if (!nonLeaderAccount.value) return ''
            const delta = metricDelta(nonLeaderAccount.value, 'maxDrawdownPercent', { lowerIsBetter: true })
            return delta ? formatDeltaPercent(delta) : '—'
        },
        pairDeltaClass: () => {
            if (!nonLeaderAccount.value) return 'text-gray-500 dark:text-gray-400'
            return deltaColorClass(metricDelta(nonLeaderAccount.value, 'maxDrawdownPercent', { lowerIsBetter: true }))
        },
    },
])

const { formatCurrency: formatCurrencyBase } = useCurrencyFormatter()

function formatCurrency(value) {
    if (value === null || value === undefined) return '—'
    return formatCurrencyBase(value)
}

function formatPercent(value, showSign = true) {
    return formatPercentBase(value, { showSign, nullValue: '' })
}

function formatMetric(value, decimals = 2) {
    if (value === null || value === undefined) return 'N/A'
    return Number(value).toFixed(decimals)
}

function driftColorClass(driftPercent) {
    if (driftPercent === null || driftPercent === undefined) return 'text-gray-500 dark:text-gray-400'
    return Math.abs(Number(driftPercent)) > 5
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-gray-100'
}

function goBack() {
    router.push({
        name: 'analysis',
        query: {
            tab: 'holdings',
            compare: selectedAccountValues.value.join(','),
        },
    })
}

// Fetch overview + performance + rebalance for a single account.
async function loadAccount(account) {
    perAccountLoading.value = { ...perAccountLoading.value, [account]: true }
    try {
        const params = {
            accounts: account,
            period: period.value,
            benchmark: benchmark.value,
        }
        const [overviewResult, performanceResult, rebalanceResult] = await Promise.allSettled([
            api.get('/investments/portfolio/overview', { params }),
            api.get('/investments/portfolio/performance', { params }),
            api.get('/investments/portfolio/rebalance', { params }),
        ])
        const overview = overviewResult.status === 'fulfilled' ? overviewResult.value.data : null
        const performance = performanceResult.status === 'fulfilled' ? performanceResult.value.data : null
        const rebalance = rebalanceResult.status === 'fulfilled' ? rebalanceResult.value.data : null
        const maxDriftPercent = (rebalance?.positions || []).reduce((max, position) => {
            if (position.driftPercent === null || position.driftPercent === undefined) return max
            const absoluteDrift = Math.abs(Number(position.driftPercent))
            return max === null || absoluteDrift > max ? absoluteDrift : max
        }, null)
        perAccountData.value = {
            ...perAccountData.value,
            [account]: { overview, performance, rebalance, maxDriftPercent },
        }
    } catch (error) {
        console.error(`Failed to load compare data for ${account}:`, error)
    } finally {
        perAccountLoading.value = { ...perAccountLoading.value, [account]: false }
    }
}

async function loadAllAccounts() {
    if (selectedAccountValues.value.length < 2) {
        initialLoading.value = false
        return
    }
    await Promise.all(selectedAccountValues.value.map((account) => loadAccount(account)))
    initialLoading.value = false
}

// Sync period/benchmark changes back into the URL so the view is shareable
// and a refresh preserves the selection.
watch([period, benchmark], () => {
    router.replace({
        name: route.name,
        query: {
            ...route.query,
            period: period.value,
            benchmark: benchmark.value,
        },
    })
})

// Re-fetch when period changes (benchmark change also triggers via the same params).
watch([period, benchmark, selectedAccountValues], async () => {
    perAccountData.value = {}
    await loadAllAccounts()
})

onMounted(async () => {
    if (!accounts.value || accounts.value.length === 0) {
        await fetchAccounts()
    }
    await loadAllAccounts()
})
</script>
