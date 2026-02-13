<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
      <div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">R-Multiple Performance</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Cumulative R performance across trades with stop loss defined
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 border border-primary-200 dark:border-primary-700"
        :disabled="loading"
        @click="fetchRPerformance"
      >
        <svg v-if="loading" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <svg v-else class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        {{ loading ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <div class="p-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-12">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-4"></div>
        <p class="text-sm text-gray-500 dark:text-gray-400">Loading R performance data...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="!chartData || chartData.length === 0" class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 mb-2">No R-Multiple data available</p>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Add stop loss levels to your trades to see R performance analysis
        </p>
      </div>

      <!-- Chart and Summary -->
      <div v-else>
        <!-- Summary Stats Grid: equal-height cards with consistent alignment -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
          <!-- Total Actual R -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">Actual R (Net)</div>
            <div class="text-lg sm:text-xl xl:text-2xl font-bold mt-0.5 truncate" :class="summary.total_actual_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ formatR(summary.total_actual_r) }}
            </div>
          </div>

          <!-- Total Potential R -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">Target R (Net)</div>
            <div class="text-lg sm:text-xl xl:text-2xl font-bold mt-0.5 truncate text-primary-600 dark:text-primary-400">
              {{ formatR(summary.total_potential_r) }}
            </div>
          </div>

          <!-- Management R -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">Management R</div>
            <div class="text-lg sm:text-xl xl:text-2xl font-bold mt-0.5 truncate" :class="getManagementRColor(summary.total_management_r)">
              {{ formatR(summary.total_management_r || 0) }}
            </div>
            <div v-if="summary.trades_with_management_r > 0" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate shrink-0">
              {{ summary.trades_with_management_r }} trades
            </div>
          </div>

          <!-- R Left on Table -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">R Left on Table</div>
            <div class="text-lg sm:text-xl xl:text-2xl font-bold mt-0.5 truncate" :class="summary.r_left_on_table > 0 ? 'text-red-600 dark:text-red-400' : summary.r_left_on_table < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'">
              {{ formatR(summary.r_left_on_table) }}
            </div>
          </div>

          <!-- Win Rate -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">Win Rate</div>
            <div class="text-lg sm:text-xl xl:text-2xl font-bold mt-0.5 truncate text-gray-900 dark:text-white">
              {{ summary.win_rate }}%
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate shrink-0">
              {{ summary.winning_trades }}W / {{ summary.losing_trades }}L
            </div>
          </div>

          <!-- Avg Win/Loss R -->
          <div class="r-perf-card flex flex-col min-h-[4.5rem] sm:min-h-[5.25rem] bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate shrink-0">Avg R</div>
            <div class="flex items-center gap-1 sm:gap-2 mt-0.5 flex-wrap min-h-[1.75rem]">
              <span class="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">+{{ summary.avg_win_r }}</span>
              <span class="text-gray-400 shrink-0">/</span>
              <span class="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">{{ summary.avg_loss_r }}</span>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div class="relative h-80">
          <canvas ref="chartCanvas"></canvas>
        </div>

        <!-- Legend -->
        <div class="mt-4 flex flex-wrap justify-center gap-6 text-sm">
          <div class="flex items-center">
            <span class="w-6 h-1 rounded-full bg-emerald-600 dark:bg-emerald-500 mr-2"></span>
            <span class="text-gray-600 dark:text-gray-400">Actual Performance (Net)</span>
          </div>
          <div class="flex items-center">
            <span class="w-6 h-1 rounded-full mr-2" style="background-color: #6366f1;"></span>
            <span class="text-gray-600 dark:text-gray-400">Target Performance (Net)</span>
          </div>
          <div class="flex items-center">
            <span class="w-6 h-1 rounded-full bg-amber-500 dark:bg-amber-400 mr-2"></span>
            <span class="text-gray-600 dark:text-gray-400">Trade Management Impact</span>
          </div>
        </div>

        <!-- Trades Count -->
        <div class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Based on {{ summary.total_trades }} trades with stop loss defined
          <span v-if="summary.trades_with_target < summary.total_trades">
            ({{ summary.trades_with_target }} with take profit targets)
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import api from '@/services/api'

Chart.register(...registerables)

const props = defineProps({
  filters: {
    type: Object,
    default: () => ({})
  },
  refreshTrigger: {
    type: Number,
    default: 0
  }
})

const chartCanvas = ref(null)
const loading = ref(false)
const chartData = ref(null)
const summary = ref(null)
let chartInstance = null

async function fetchRPerformance() {
  loading.value = true

  try {
    const params = { limit: 2000 }

    if (props.filters.startDate) {
      params.startDate = props.filters.startDate
    }
    if (props.filters.endDate) {
      params.endDate = props.filters.endDate
    }
    if (props.filters.symbol && props.filters.symbol.trim()) {
      params.symbol = props.filters.symbol.trim()
    }
    if (props.filters.accounts) {
      params.accounts = props.filters.accounts
    }

    console.log('[R-PERF] Fetching R performance with params:', params)
    const response = await api.get('/trade-management/r-performance', { params })
    console.log('[R-PERF] Response:', response.data)

    chartData.value = response.data.chart_data
    summary.value = response.data.summary

    // IMPORTANT: Set loading to false BEFORE nextTick so the canvas element renders
    // The template uses v-if="loading" which hides the chart container
    loading.value = false

    await nextTick()
    createChart()
  } catch (err) {
    console.error('[R-PERF] Error fetching R performance:', err)
    chartData.value = []
    summary.value = null
    loading.value = false
  }
}

function createChart() {
  if (!chartCanvas.value || !chartData.value || chartData.value.length === 0) return

  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#e5e7eb' : '#374151'
  const gridColor = isDark ? '#374151' : '#e5e7eb'

  const ctx = chartCanvas.value.getContext('2d')

  // Prepare data
  const labels = chartData.value.map(d => d.trade_number)
  const actualData = chartData.value.map(d => d.cumulative_actual_r)
  const potentialData = chartData.value.map(d => d.cumulative_potential_r)
  const managementData = chartData.value.map(d => d.cumulative_management_r || 0)

  // Check if we have any management R data
  const hasManagementData = managementData.some(v => v !== 0)

  // Get primary color from CSS custom property or use default
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-600').trim() || '#6366f1'

  const datasets = [
    {
      label: 'Actual R (Net)',
      data: actualData,
      borderColor: '#059669', // emerald-600 - softer green
      backgroundColor: 'rgba(5, 150, 105, 0.08)',
      fill: true,
      tension: 0.2,
      pointRadius: actualData.length > 50 ? 0 : 3,
      pointHoverRadius: 5,
      borderWidth: 2
    },
    {
      label: 'Target R (Net)',
      data: potentialData,
      borderColor: '#6366f1', // indigo-500 - theme-adjacent
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 5,
      borderWidth: 2,
      borderDash: [5, 5]
    }
  ]

  // Add management R line if there's data
  if (hasManagementData) {
    datasets.push({
      label: 'Management R',
      data: managementData,
      borderColor: '#f59e0b', // amber-500
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      fill: false,
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 5,
      borderWidth: 2,
      borderDash: [3, 3]
    })
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              if (items.length > 0) {
                const dataPoint = chartData.value[items[0].dataIndex]
                return `Trade #${dataPoint.trade_number} - ${dataPoint.symbol}`
              }
              return ''
            },
            label: (context) => {
              const dataPoint = chartData.value[context.dataIndex]
              if (context.datasetIndex === 0) {
                return `Actual R (Net): ${dataPoint.cumulative_actual_r}R (this trade: ${dataPoint.actual_r > 0 ? '+' : ''}${dataPoint.actual_r}R)`
              } else if (context.datasetIndex === 1) {
                return `Target R (Net): ${dataPoint.cumulative_potential_r}R`
              } else if (context.datasetIndex === 2) {
                const mgmtR = dataPoint.management_r || 0
                return `Management R: ${dataPoint.cumulative_management_r || 0}R (this trade: ${mgmtR >= 0 ? '+' : ''}${mgmtR}R)`
              }
              return ''
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Trade #',
            color: textColor
          },
          ticks: {
            color: textColor
          },
          grid: {
            color: gridColor,
            display: false
          }
        },
        y: {
          title: {
            display: true,
            text: 'Cumulative R',
            color: textColor
          },
          ticks: {
            color: textColor,
            callback: (value) => `${value}R`
          },
          grid: {
            color: gridColor
          }
        }
      }
    }
  })
}

function formatR(value) {
  if (value === null || value === undefined) return '-'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value}R`
}

function getManagementRColor(managementR) {
  if (!managementR || managementR === 0) return 'text-gray-500 dark:text-gray-400'
  if (managementR > 0) return 'text-green-600 dark:text-green-400'
  return 'text-amber-600 dark:text-amber-400'
}

// Watch for filter changes
watch(() => props.filters, () => {
  fetchRPerformance()
}, { deep: true })

// Watch for refresh trigger (e.g., when trade management data is updated)
watch(() => props.refreshTrigger, () => {
  if (props.refreshTrigger > 0) {
    console.log('[R-PERF] Refresh triggered')
    fetchRPerformance()
  }
})

// Initial load
onMounted(() => {
  fetchRPerformance()
})

// Cleanup
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>
