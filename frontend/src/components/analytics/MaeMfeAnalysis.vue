<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">MAE / MFE Analysis</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Maximum Adverse / Favorable Excursion — {{ stats.trades_with_data || 0 }} trades with data
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-gray-400">Display in</span>
          <button
            @click="hasRValues ? (useRMultiple = !useRMultiple) : null"
            :class="[
              useRMultiple && hasRValues ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700',
              hasRValues ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
              'relative inline-flex h-5 w-10 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out'
            ]"
            type="button"
            :title="hasRValues ? (useRMultiple ? 'Switch to dollar view' : 'Switch to R-multiple view') : 'R-multiples require a stop loss set on trades'"
          >
            <span
              :class="[
                useRMultiple && hasRValues ? 'translate-x-5' : 'translate-x-0',
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
              ]"
            />
          </button>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
            {{ useRMultiple && hasRValues ? 'R-Multiples' : 'Dollars' }}
          </span>
          <span v-if="!hasRValues" class="text-xs text-gray-400 dark:text-gray-500">(set stop loss on trades to enable)</span>
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
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
            <p class="text-xs text-gray-500 dark:text-gray-400">Avg profit left on table</p>
            <p class="text-lg font-semibold text-orange-600 dark:text-orange-400 font-mono mt-1">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="displayStats.avg_profit_left != null">{{ formatValue(displayStats.avg_profit_left) }}</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">MFE minus exit P&L (winners)</p>
          </div>
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <p class="text-xs text-gray-500 dark:text-gray-400">Exit efficiency</p>
            <p class="text-lg font-semibold font-mono mt-1" :class="exitEfficiency >= 60 ? 'text-green-600 dark:text-green-400' : exitEfficiency >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'">
              <span v-if="loading" class="text-gray-300 dark:text-gray-600">—</span>
              <span v-else-if="exitEfficiency != null">{{ exitEfficiency.toFixed(0) }}%</span>
              <span v-else class="text-gray-400">—</span>
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Avg P&L / MFE (winners)</p>
          </div>
        </div>

        <!-- Charts grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- MFE vs Result Scatter Plot -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">MFE vs. Result</h4>
              <span class="text-xs text-gray-400 dark:text-gray-500">— points above diagonal leave profit on table</span>
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
const useRMultiple = ref(false)
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

function formatValue(val) {
  if (val == null) return '—'
  if (useRMultiple.value) return `${val.toFixed(2)}R`
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

const displayStats = computed(() => {
  const winners = trades.value.filter(t => t.is_winner)
  const losers = trades.value.filter(t => !t.is_winner)

  const winnersAvgMae = average(winners.map(t => getTradeValue(t, 'mae')))
  const losersAvgMfe = average(losers.map(t => getTradeValue(t, 'mfe')))
  const avgProfitLeft = average(winners.map(t => {
    const mfe = getTradeValue(t, 'mfe')
    const pnl = getTradeValue(t, 'pnl')
    return mfe != null && pnl != null ? Math.max(0, mfe - pnl) : null
  }))
  const avgMfeVsPnlGap = average(trades.value.map(t => {
    const mfe = getTradeValue(t, 'mfe')
    const pnl = getTradeValue(t, 'pnl')
    return mfe != null && pnl != null ? mfe - pnl : null
  }))

  return {
    trades_with_data: stats.value.trades_with_data || trades.value.length,
    winners_avg_mae: roundMetric(winnersAvgMae),
    losers_avg_mfe: roundMetric(losersAvgMfe),
    avg_profit_left: roundMetric(avgProfitLeft),
    avg_mfe_vs_pnl_gap: roundMetric(avgMfeVsPnlGap)
  }
})

const exitEfficiency = computed(() => {
  const winners = trades.value.filter(t => t.is_winner && getTradeValue(t, 'mfe') > 0)
  if (!winners.length) return null
  const ratios = winners
    .map(t => {
      const pnl = getTradeValue(t, 'pnl')
      const mfe = getTradeValue(t, 'mfe')
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

function getTradeValue(t, field) {
  if (useRMultiple.value) {
    if (field === 'pnl') return asNumber(t.r_value)

    const riskAmount = asNumber(t.risk_amount)
    const value = asNumber(t[field])
    return riskAmount > 0 && value != null ? value / riskAmount : null
  }

  return asNumber(field === 'pnl' ? t.pnl : field === 'mfe' ? t.mfe : t.mae)
}

function renderScatter() {
  if (!scatterChart.value) return
  const ctx = scatterChart.value.getContext('2d')

  const winners = trades.value.filter(t => t.is_winner)
  const losers = trades.value.filter(t => !t.is_winner)

  const toPoint = t => ({ x: getTradeValue(t, 'mfe'), y: getTradeValue(t, 'pnl'), label: t.symbol, tradeId: t.id })
  const validPoint = point => point.x != null && point.y != null

  // Perfect-exit reference line: max MFE across all trades
  const allMfe = trades.value.map(t => getTradeValue(t, 'mfe')).filter(value => value != null)
  const maxMfe = Math.max(...allMfe, 0)

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Winners',
          data: winners.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(74, 222, 128, 0.65)',
          borderColor: 'rgba(22, 163, 74, 0.8)',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Losers',
          data: losers.map(toPoint).filter(validPoint),
          backgroundColor: 'rgba(248, 113, 113, 0.65)',
          borderColor: 'rgba(220, 38, 38, 0.8)',
          pointRadius: 5,
          pointHoverRadius: 7
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
          labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text') || '#6b7280', boxWidth: 10, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.label === 'Perfect exit') return null
              const p = ctx.raw
              const sym = p.label || ''
              const fmt = v => useRMultiple.value ? `${v.toFixed(2)}R` : formatCurrency(v)
              return `${sym}  MFE: ${fmt(p.x)}  Result: ${fmt(p.y)}`
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: useRMultiple.value ? 'MFE (R)' : 'MFE ($)', color: '#6b7280', font: { size: 11 } },
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid: { color: 'rgba(107,114,128,0.1)' }
        },
        y: {
          title: { display: true, text: useRMultiple.value ? 'Result (R)' : 'Result ($)', color: '#6b7280', font: { size: 11 } },
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
    return useRMultiple.value
      ? `${lo.toFixed(1)}–${hi.toFixed(1)}R`
      : `${formatCurrency(lo)}–${formatCurrency(hi)}`
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
          title: { display: true, text: useRMultiple.value ? 'MAE (R)' : 'MAE ($)', color: '#6b7280', font: { size: 11 } },
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
watch(useRMultiple, async (val) => {
  if (val && !hasRValues.value) {
    useRMultiple.value = false
    return
  }
  await nextTick()
  renderCharts()
})

onMounted(fetchData)
onBeforeUnmount(destroyCharts)
</script>
