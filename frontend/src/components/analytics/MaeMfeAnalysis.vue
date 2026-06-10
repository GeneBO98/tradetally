<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">MAE / MFE Analysis</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            In-trade is entry to exit. After-trade is entry through the configured post-exit window. {{ stats.trades_with_data || 0 }} trades with data
          </p>
          <p v-if="stats.trades_with_post_exit_data" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Continuation = positive difference between after-trade MFE and in-trade MFE. Missed after exit = positive difference between after-trade MFE and realized P&L.
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <span class="text-xs text-gray-500 dark:text-gray-400">Display in</span>
          <div class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium transition-colors"
              :class="displayMode === 'dollars' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
              @click="displayMode = 'dollars'"
            >
              Dollars
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium border-l border-gray-200 dark:border-gray-700 transition-colors"
              :class="displayMode === 'points' && canUsePoints ? 'bg-primary-600 text-white' : canUsePoints ? 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'"
              :disabled="!canUsePoints"
              :title="canUsePoints ? 'Switch to futures points view' : 'Points view is available when all displayed trades are futures with quantity and point value set'"
              @click="canUsePoints ? (displayMode = 'points') : null"
            >
              Points
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium border-l border-gray-200 dark:border-gray-700 transition-colors"
              :class="displayMode === 'r' && hasRValues ? 'bg-primary-600 text-white' : hasRValues ? 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'"
              :disabled="!hasRValues"
              :title="hasRValues ? 'Switch to R-multiple view' : 'R-multiples require a stop loss set on trades'"
              @click="hasRValues ? (displayMode = 'r') : null"
            >
              R-Multiples
            </button>
          </div>
          <span v-if="!hasRValues || !canUsePoints" class="text-xs text-gray-400 dark:text-gray-500">
            {{ !hasRValues && !canUsePoints ? 'R needs stop loss. Points need futures-only trades with qty and point value.' : !hasRValues ? 'R needs stop loss.' : 'Points need futures-only trades with qty and point value.' }}
          </span>
        </div>
      </div>

      <!-- No data state -->
      <div v-if="!loading && stats.trades_with_data === 0" class="text-center py-12">
        <svg class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 font-medium">No MAE/MFE data available</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2 max-w-sm mx-auto">
          Enter MAE and MFE values manually when logging trades, or they will be auto-calculated for closed trades if market data is available.
        </p>
      </div>

      <template v-else>
        <!-- Summary stat cards -->
        <div class="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Avg heat on winners</p>
            <p class="text-lg font-semibold text-red-600 dark:text-red-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.winners_avg_mae != null">{{ formatValue(displayStats.winners_avg_mae) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">MAE on winning trades</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">MFE on losers</p>
            <p class="text-lg font-semibold text-yellow-600 dark:text-yellow-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.losers_avg_mfe != null">{{ formatValue(displayStats.losers_avg_mfe) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">How far losers ran in your favor</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400" title="For trades with after-trade data, this uses after-trade MFE. Otherwise it uses in-trade MFE.">Avg profit left on table</p>
            <p class="text-lg font-semibold text-orange-600 dark:text-orange-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.avg_profit_left != null">{{ formatValue(displayStats.avg_profit_left) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Best available MFE minus exit P&L (winners)</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400" title="Average realized P&L divided by best available MFE on winning trades. After-trade MFE is used when present.">Exit efficiency</p>
            <p class="text-lg font-semibold font-mono mt-1" :class="exitEfficiency >= 60 ? 'text-green-600 dark:text-green-400' : exitEfficiency >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="exitEfficiency != null">{{ exitEfficiency.toFixed(0) }}%</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Avg P&L / best MFE (winners)</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400" title="Additional favorable movement after the in-trade MFE peak, measured within the configured post-exit window.">After-trade continuation</p>
            <p class="text-lg font-semibold text-primary-600 dark:text-primary-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.avg_post_exit_mfe_delta != null">{{ formatValue(displayStats.avg_post_exit_mfe_delta) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">After-trade MFE minus in-trade MFE</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400" title="Potential profit between the actual exit and the best favorable move in the post-exit window.">Missed after exit</p>
            <p class="text-lg font-semibold text-primary-600 dark:text-primary-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.avg_missed_after_exit != null">{{ formatValue(displayStats.avg_missed_after_exit) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ stats.trades_with_post_exit_data || 0 }} trades with after-trade data</p>
          </div>
        </div>

        <!-- Charts grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- MFE vs Result Scatter Plot -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">MFE vs. Result</h4>
              <span class="text-xs text-gray-400 dark:text-gray-500">— primary points show after-trade continuation</span>
            </div>
            <div class="h-72 relative">
              <canvas ref="scatterChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>

          <!-- MAE Histogram (winners only) -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">MAE Distribution — Winners</h4>
              <span class="text-xs text-gray-400 dark:text-gray-500">— calibrate your stop loss</span>
            </div>
            <div class="h-72 relative">
              <canvas ref="histogramChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>

        <!-- Insight callout -->
        <div v-if="insights.length > 0 && !loading" class="mt-4 space-y-2">
          <div
            v-for="(insight, i) in insights"
            :key="i"
            class="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
            :class="insight.type === 'warn' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300' : 'bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300'"
          >
            <svg class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
            <span>{{ insight.text }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import Chart from 'chart.js/auto'
import api from '@/services/api'

const props = defineProps({
  filters: { type: Object, default: () => ({}) }
})

const loading = ref(true)
const trades = ref([])
const stats = ref({ trades_with_data: 0 })
const displayMode = ref('dollars')
const router = useRouter()

let scatterChartInstance = null
let histogramChartInstance = null
const scatterChart = ref(null)
const histogramChart = ref(null)

// ---- formatting ----
function formatCurrency(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

function formatPoints(val) {
  if (val == null) return '—'
  return `${val.toFixed(2)} pts`
}

function formatValue(val) {
  if (val == null) return '—'
  if (displayMode.value === 'r') return `${val.toFixed(2)}R`
  if (displayMode.value === 'points') return formatPoints(val)
  return formatCurrency(val)
}

// ---- derived stats ----
function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function average(values) {
  const validValues = values.filter(value => value != null && Number.isFinite(value))
  if (!validValues.length) return null
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

function roundMetric(value) {
  return value == null ? null : Number(value.toFixed(2))
}

const hasRValues = computed(() => trades.value.some(t => asNumber(t.risk_amount) > 0))

const canUsePoints = computed(() => (
  trades.value.length > 0 &&
  trades.value.every(t =>
    t.instrument_type === 'future' &&
    asNumber(t.quantity) > 0 &&
    asNumber(t.point_value) > 0
  )
))

const displayStats = computed(() => {
  const winners = trades.value.filter(t => t.is_winner)
  const losers = trades.value.filter(t => !t.is_winner)

  const winnersAvgMae = average(winners.map(t => getTradeValue(t, 'mae')))
  const losersAvgMfe = average(losers.map(t => getTradeValue(t, 'mfe')))
  const avgProfitLeft = average(winners.map(t => {
    const mfe = getBestAvailableMfe(t)
    const captured = getTradeValue(t, 'captured_move')
    return mfe != null && captured != null ? Math.max(0, mfe - captured) : null
  }))
  const avgMfeVsPnlGap = average(trades.value.map(t => {
    const mfe = getTradeValue(t, 'mfe')
    const pnl = getTradeValue(t, 'pnl')
    return mfe != null && pnl != null ? mfe - pnl : null
  }))
  const avgPostExitMfeDelta = average(trades.value.map(t => getTradeValue(t, 'post_exit_mfe_delta')))
  const avgMissedAfterExit = average(trades.value.map(t => getTradeValue(t, 'missed_after_exit')))

  return {
    trades_with_data: stats.value.trades_with_data || trades.value.length,
    winners_avg_mae: roundMetric(winnersAvgMae),
    losers_avg_mfe: roundMetric(losersAvgMfe),
    avg_profit_left: roundMetric(avgProfitLeft),
    avg_mfe_vs_pnl_gap: roundMetric(avgMfeVsPnlGap),
    avg_post_exit_mfe_delta: roundMetric(avgPostExitMfeDelta),
    avg_missed_after_exit: roundMetric(avgMissedAfterExit)
  }
})

const exitEfficiency = computed(() => {
  const winners = trades.value.filter(t => t.is_winner && getBestAvailableMfe(t) > 0)
  if (!winners.length) return null
  const ratios = winners
    .map(t => {
      const pnl = getTradeValue(t, 'captured_move')
      const mfe = getBestAvailableMfe(t)
      return pnl != null && mfe > 0 ? pnl / mfe : null
    })
    .filter(value => value != null && Number.isFinite(value))
  if (!ratios.length) return null
  const avg = ratios.reduce((sum, value) => sum + value, 0) / ratios.length
  return avg * 100
})

// ---- actionable insights ----
const insights = computed(() => {
  const out = []
  const { winners_avg_mae, losers_avg_mfe, avg_profit_left } = displayStats.value

  if (exitEfficiency.value != null && exitEfficiency.value < 50) {
    out.push({ type: 'warn', text: `Exit efficiency is ${exitEfficiency.value.toFixed(0)}% — on average you're capturing less than half of each winner's favorable move. Consider a trailing stop or restructured TP ladder.` })
  }
  if (losers_avg_mfe != null && winners_avg_mae != null && losers_avg_mfe > winners_avg_mae * 1.5) {
    out.push({ type: 'warn', text: `Losers ran ${formatValue(losers_avg_mfe)} in your favor before stopping out vs. ${formatValue(winners_avg_mae)} heat on winners — entry timing or TP1 placement may need adjustment.` })
  }
  if (avg_profit_left != null && avg_profit_left > 0) {
    out.push({ type: 'info', text: `On average you're leaving ${formatValue(avg_profit_left)} per winning trade on the table relative to the MFE peak.` })
  }
  return out
})

// ---- data fetch ----
async function fetchData() {
  loading.value = true
  try {
    const params = { ...props.filters }
    const res = await api.get('/analytics/maemfe/trades', { params })
    trades.value = res.data.trades || []
    stats.value = res.data.stats || { trades_with_data: 0 }
    await nextTick()
    renderCharts()
  } catch (e) {
    console.error('[MAE/MFE] Failed to fetch data:', e)
  } finally {
    loading.value = false
  }
}

// ---- chart rendering ----
function destroyCharts() {
  if (scatterChartInstance) { scatterChartInstance.destroy(); scatterChartInstance = null }
  if (histogramChartInstance) { histogramChartInstance.destroy(); histogramChartInstance = null }
}

function renderCharts() {
  destroyCharts()
  if (!trades.value.length) return
  renderScatter()
  renderHistogram()
}

function getPointsValue(t, field) {
  const derived = asNumber(t[`${field}_points`])
  if (derived != null) return derived

  const quantity = Math.abs(asNumber(t.quantity) || 0)
  const pointValue = asNumber(t.point_value)
  if (quantity <= 0 || pointValue == null || pointValue <= 0) return null

  const value = asNumber(field === 'pnl' ? (t.gross_pnl ?? t.pnl) : t[field])
  if (value == null) return null

  return value / (quantity * pointValue)
}

function getTradeValue(t, field) {
  if (displayMode.value === 'r') {
    if (field === 'pnl') return asNumber(t.r_value)

    const derived = asNumber(t[`${field}_r`])
    if (derived != null) return derived

    const riskAmount = asNumber(t.risk_amount)
    const value = asNumber(t[field])
    return riskAmount > 0 && value != null ? value / riskAmount : null
  }

  if (displayMode.value === 'points') {
    return getPointsValue(t, field)
  }

  return asNumber(field === 'pnl' ? (t.gross_pnl ?? t.pnl) : t[field])
}

function getBestAvailableMfe(t) {
  const bestMfe = getTradeValue(t, 'best_mfe')
  if (bestMfe != null) return bestMfe
  const postExitMfe = getTradeValue(t, 'post_exit_mfe')
  if (postExitMfe != null) return postExitMfe
  return getTradeValue(t, 'mfe')
}

function renderScatter() {
  if (!scatterChart.value) return
  const ctx = scatterChart.value.getContext('2d')

  const winners = trades.value.filter(t => t.outcome === 'winner' || (!t.outcome && t.is_winner))
  const partialWinners = trades.value.filter(t => t.outcome === 'partial_winner')
  const losers = trades.value.filter(t => t.outcome === 'loser' || (!t.outcome && !t.is_winner && Math.abs(asNumber(t.pnl) || 0) >= 0.01))
  const scratches = trades.value.filter(t => t.outcome === 'scratch' || (!t.outcome && Math.abs(asNumber(t.pnl) || 0) < 0.01))

  const toPoint = t => ({
    x: getTradeValue(t, 'mfe'),
    y: getTradeValue(t, 'pnl'),
    label: t.symbol,
    tradeId: t.id,
    kind: 'in_trade'
  })
  const toPostExitPoint = t => ({
    x: getTradeValue(t, 'post_exit_mfe'),
    y: getTradeValue(t, 'pnl'),
    label: t.symbol,
    tradeId: t.id,
    kind: 'post_exit',
    inTradeMfe: getTradeValue(t, 'mfe'),
    missedAfterExit: getTradeValue(t, 'missed_after_exit'),
    postExitDelta: getTradeValue(t, 'post_exit_mfe_delta'),
    windowMinutes: t.post_exit_window_minutes,
    windowSource: t.post_exit_window_source
  })
  const validPoint = point => point.x != null && point.y != null

  // Perfect-exit reference line: max MFE across all trades
  const allMfe = trades.value.flatMap(t => [getTradeValue(t, 'mfe'), getTradeValue(t, 'post_exit_mfe')]).filter(value => value != null)
  const maxMfe = Math.max(...allMfe, 0)
  const postExitTrades = trades.value.filter(t => getTradeValue(t, 'post_exit_mfe') != null)
  const connectors = postExitTrades.map(t => ([
    { x: getTradeValue(t, 'mfe'), y: getTradeValue(t, 'pnl') },
    { x: getTradeValue(t, 'post_exit_mfe'), y: getTradeValue(t, 'pnl') }
  ])).filter(line => validPoint(line[0]) && validPoint(line[1]))

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Winners in-trade',
          data: winners.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(74, 222, 128, 0.65)',
          borderColor: 'rgba(22, 163, 74, 0.8)',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Partial winners in-trade',
          data: partialWinners.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(52, 211, 153, 0.55)',
          borderColor: 'rgba(5, 150, 105, 0.9)',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Losers in-trade',
          data: losers.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(248, 113, 113, 0.65)',
          borderColor: 'rgba(220, 38, 38, 0.8)',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Scratches in-trade',
          data: scratches.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(156, 163, 175, 0.65)',
          borderColor: 'rgba(107, 114, 128, 0.8)',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        ...connectors.map((data, index) => ({
          label: index === 0 ? 'After-trade move' : 'After-trade move',
          data,
          type: 'line',
          borderColor: 'rgba(14, 165, 233, 0.22)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          showLine: true
        })),
        {
          label: 'After-trade MFE',
          data: postExitTrades.map(toPostExitPoint).filter(validPoint),
          backgroundColor: 'rgba(14, 165, 233, 0.75)',
          borderColor: 'rgba(2, 132, 199, 0.95)',
          pointRadius: 4,
          pointHoverRadius: 7,
          pointStyle: 'rectRot'
        },
        {
          label: 'Perfect exit',
          data: [{ x: 0, y: 0 }, { x: maxMfe, y: maxMfe }],
          type: 'line',
          borderColor: 'rgba(156, 163, 175, 0.5)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: -1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(event, _elements, chart) {
        const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true)
        const point = points[0]
        if (!point) return

        const tradeId = chart.data.datasets[point.datasetIndex]?.data?.[point.index]?.tradeId
        if (tradeId) {
          router.push(`/trades/${tradeId}`)
        }
      },
      onHover(event, elements) {
        if (event.native?.target) {
          event.native.target.style.cursor = elements.length ? 'pointer' : 'default'
        }
      },
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--color-text') || '#6b7280',
            boxWidth: 10,
            font: { size: 11 },
            filter(item, data) {
              return data.datasets.findIndex(dataset => dataset.label === item.text) === item.datasetIndex
            }
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.label === 'Perfect exit' || ctx.dataset.type === 'line') return null
              const p = ctx.raw
              if (!p.tradeId) return null
              const sym = p.label || ''
              const fmt = v => formatValue(v)
              if (p.kind === 'post_exit') {
                const window = p.windowMinutes ? `${p.windowMinutes}m ${p.windowSource || ''}`.trim() : 'configured window'
                return `${sym}  After-trade MFE: ${fmt(p.x)}  Continuation: ${fmt(p.postExitDelta)}  Missed: ${fmt(p.missedAfterExit)}  Window: ${window}`
              }
              return `${sym}  In-trade MFE: ${fmt(p.x)}  Result: ${fmt(p.y)}`
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: displayMode.value === 'r' ? 'MFE (R)' : displayMode.value === 'points' ? 'MFE (pts)' : 'MFE ($)', color: '#6b7280', font: { size: 11 } },
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid: { color: 'rgba(107,114,128,0.1)' }
        },
        y: {
          title: { display: true, text: displayMode.value === 'r' ? 'Result (R)' : displayMode.value === 'points' ? 'Result (pts)' : 'Result ($)', color: '#6b7280', font: { size: 11 } },
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid: { color: 'rgba(107,114,128,0.1)' }
        }
      }
    }
  })
}

function renderHistogram() {
  if (!histogramChart.value) return
  const ctx = histogramChart.value.getContext('2d')

  const winners = trades.value.filter(t => t.is_winner)
  if (!winners.length) return

  const values = winners.map(t => getTradeValue(t, 'mae')).filter(value => value != null)
  if (!values.length) return
  const max = Math.max(...values)
  const BIN_COUNT = Math.min(10, Math.ceil(Math.sqrt(winners.length)))
  const binSize = max / BIN_COUNT || 1
  const bins = Array(BIN_COUNT).fill(0)
  values.forEach(v => {
    const idx = Math.min(Math.floor(v / binSize), BIN_COUNT - 1)
    bins[idx]++
  })

  const labels = bins.map((_, i) => {
    const lo = i * binSize
    const hi = (i + 1) * binSize
    if (displayMode.value === 'r') return `${lo.toFixed(1)}–${hi.toFixed(1)}R`
    if (displayMode.value === 'points') return `${lo.toFixed(1)}–${hi.toFixed(1)} pts`
    return `${formatCurrency(lo)}–${formatCurrency(hi)}`
  })

  histogramChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Winners',
        data: bins,
        backgroundColor: bins.map((_, i) => {
          const pct = i / BIN_COUNT
          // Green for small MAE (good), fades to orange for large MAE (high heat)
          return pct < 0.33 ? 'rgba(74,222,128,0.7)' : pct < 0.66 ? 'rgba(251,191,36,0.7)' : 'rgba(248,113,113,0.7)'
        }),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(ctx) { return `MAE range: ${ctx[0].label}` },
            label(ctx) { return `${ctx.raw} winning trade${ctx.raw !== 1 ? 's' : ''}` }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: displayMode.value === 'r' ? 'MAE (R)' : displayMode.value === 'points' ? 'MAE (pts)' : 'MAE ($)', color: '#6b7280', font: { size: 11 } },
          ticks: { color: '#6b7280', font: { size: 9 }, maxRotation: 30 },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: 'Trades', color: '#6b7280', font: { size: 11 } },
          ticks: { color: '#6b7280', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(107,114,128,0.1)' }
        }
      }
    }
  })
}

// ---- watchers ----
watch(() => props.filters, fetchData, { deep: true })
watch(displayMode, async (val) => {
  if (val === 'r' && !hasRValues.value) {
    displayMode.value = 'dollars'
    return
  }
  if (val === 'points' && !canUsePoints.value) {
    displayMode.value = 'dollars'
    return
  }
  await nextTick()
  renderCharts()
})

watch(canUsePoints, value => {
  if (!value && displayMode.value === 'points') {
    displayMode.value = 'dollars'
  }
})

watch(hasRValues, value => {
  if (!value && displayMode.value === 'r') {
    displayMode.value = 'dollars'
  }
})

onMounted(fetchData)
onBeforeUnmount(destroyCharts)
</script>
