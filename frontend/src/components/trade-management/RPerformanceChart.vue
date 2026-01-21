<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">R-Multiple Performance</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Cumulative R performance across trades with stop loss defined
      </p>
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
        <!-- Summary Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <!-- Total Actual R -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Actual R</div>
            <div class="text-2xl font-bold" :class="summary.total_actual_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ formatR(summary.total_actual_r) }}
            </div>
          </div>

          <!-- Total Potential R -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Potential R</div>
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {{ formatR(summary.total_potential_r) }}
            </div>
          </div>

          <!-- Management R -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Management R</div>
            <div class="text-2xl font-bold" :class="getManagementRColor(summary.total_management_r)">
              {{ formatR(summary.total_management_r || 0) }}
            </div>
            <div v-if="summary.trades_with_management_r > 0" class="text-xs text-gray-500 dark:text-gray-400">
              {{ summary.trades_with_management_r }} trades
            </div>
          </div>

          <!-- R Efficiency -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">R Efficiency</div>
            <div class="text-2xl font-bold" :class="getEfficiencyColor(summary.r_efficiency)">
              {{ summary.r_efficiency }}%
            </div>
          </div>

          <!-- R Left on Table -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">R Left on Table</div>
            <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {{ formatR(summary.r_left_on_table) }}
            </div>
          </div>

          <!-- Win Rate -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Win Rate</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ summary.win_rate }}%
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ summary.winning_trades }}W / {{ summary.losing_trades }}L
            </div>
          </div>

          <!-- Avg Win/Loss R -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Avg R</div>
            <div class="flex items-center space-x-2">
              <span class="text-lg font-bold text-green-600 dark:text-green-400">+{{ summary.avg_win_r }}</span>
              <span class="text-gray-400">/</span>
              <span class="text-lg font-bold text-red-600 dark:text-red-400">{{ summary.avg_loss_r }}</span>
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
            <span class="w-4 h-0.5 bg-emerald-600 dark:bg-emerald-500 mr-2"></span>
            <span class="text-gray-600 dark:text-gray-400">Actual Performance</span>
          </div>
          <div class="flex items-center">
            <span class="w-4 h-0.5 bg-primary-600 dark:bg-primary-500 mr-2" style="border-bottom: 2px dashed;"></span>
            <span class="text-gray-600 dark:text-gray-400">Potential Performance</span>
          </div>
          <div class="flex items-center">
            <span class="w-4 h-0.5 bg-amber-500 dark:bg-amber-400 mr-2" style="border-bottom: 2px dotted;"></span>
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
      label: 'Actual R',
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
      label: 'Potential R',
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
                return `Actual R: ${dataPoint.cumulative_actual_r}R (this trade: ${dataPoint.actual_r > 0 ? '+' : ''}${dataPoint.actual_r}R)`
              } else if (context.datasetIndex === 1) {
                return `Potential R: ${dataPoint.cumulative_potential_r}R`
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

function getEfficiencyColor(efficiency) {
  if (efficiency >= 80) return 'text-green-600 dark:text-green-400'
  if (efficiency >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
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
