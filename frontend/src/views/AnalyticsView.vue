<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Analyze your trading performance and identify areas for improvement.
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="space-y-8">
      <!-- Date Filter -->
      <div class="card">
        <div class="card-body">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label for="startDate" class="label">Start Date</label>
              <input
                id="startDate"
                v-model="filters.startDate"
                type="date"
                class="input"
              />
            </div>
            <div>
              <label for="endDate" class="label">End Date</label>
              <input
                id="endDate"
                v-model="filters.endDate"
                type="date"
                class="input"
              />
            </div>
            <div class="flex items-end">
              <button @click="applyFilters" class="btn-primary">
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Overview Stats -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Total P&L
            </dt>
            <dd class="mt-1 text-2xl font-semibold" :class="[
              overview.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
            ]">
              ${{ formatNumber(overview.total_pnl) }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Win Rate
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.win_rate }}%
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Total Trades
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.total_trades }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Avg Trade
            </dt>
            <dd class="mt-1 text-2xl font-semibold" :class="[
              overview.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'
            ]">
              ${{ formatNumber(overview.avg_pnl) }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Profit Factor
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.profit_factor }}
            </dd>
          </div>
        </div>
      </div>

      <!-- Performance Chart -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Performance Over Time</h3>
            <select v-model="performancePeriod" @change="fetchPerformance" class="input w-auto">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div class="h-80">
            <PerformanceChart :data="performanceData" />
          </div>
        </div>
      </div>

      <!-- New Chart Section -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <!-- Trade Distribution by Price -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Distribution by Price</h3>
            <div class="h-80 relative">
              <canvas ref="tradeDistributionChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance by Price -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Price</h3>
            <div class="h-80 relative">
              <canvas ref="performanceByPriceChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance by Volume Traded -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Volume Traded</h3>
            <div class="h-80 relative">
              <canvas ref="performanceByVolumeChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Stats -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <!-- Win/Loss Breakdown -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Win/Loss Breakdown</h3>
            <dl class="space-y-4">
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Winning Trades</dt>
                <dd class="text-sm font-medium text-green-600">
                  {{ overview.winning_trades }} ({{ getWinPercentage() }}%)
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Losing Trades</dt>
                <dd class="text-sm font-medium text-red-600">
                  {{ overview.losing_trades }} ({{ getLossPercentage() }}%)
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Breakeven Trades</dt>
                <dd class="text-sm font-medium text-gray-500">
                  {{ overview.breakeven_trades }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Average Win</dt>
                <dd class="text-sm font-medium text-green-600">
                  ${{ formatNumber(overview.avg_win) }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Average Loss</dt>
                <dd class="text-sm font-medium text-red-600">
                  ${{ formatNumber(Math.abs(overview.avg_loss)) }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Best Trade</dt>
                <dd class="text-sm font-medium text-green-600">
                  ${{ formatNumber(overview.best_trade) }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-sm text-gray-500 dark:text-gray-400">Worst Trade</dt>
                <dd class="text-sm font-medium text-red-600">
                  ${{ formatNumber(overview.worst_trade) }}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- Top Symbols -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Performing Symbols</h3>
            <div v-if="symbolStats.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
              No data available
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="symbol in symbolStats.slice(0, 10)"
                :key="symbol.symbol"
                class="flex items-center justify-between"
              >
                <div>
                  <span class="font-medium text-gray-900 dark:text-white">{{ symbol.symbol }}</span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {{ symbol.total_trades }} trades
                  </span>
                </div>
                <div class="text-right">
                  <div class="font-medium" :class="[
                    symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    ${{ formatNumber(symbol.total_pnl) }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ (symbol.winning_trades / symbol.total_trades * 100).toFixed(0) }}% win
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tag Performance -->
      <div v-if="tagStats.length > 0" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Tag Performance</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tag
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Trades
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    P&L
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg P&L
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="tag in tagStats" :key="tag.tag">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                      {{ tag.tag }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ tag.total_trades }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ (tag.winning_trades / tag.total_trades * 100).toFixed(1) }}%
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    tag.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    ${{ formatNumber(tag.total_pnl) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    tag.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    ${{ formatNumber(tag.avg_pnl) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import api from '@/services/api'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import Chart from 'chart.js/auto'

const loading = ref(true)
const performancePeriod = ref('daily')

const filters = ref({
  startDate: '',
  endDate: ''
})

const overview = ref({
  total_pnl: 0,
  win_rate: 0,
  total_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  breakeven_trades: 0,
  avg_pnl: 0,
  avg_win: 0,
  avg_loss: 0,
  best_trade: 0,
  worst_trade: 0,
  profit_factor: 0
})

const performanceData = ref([])
const symbolStats = ref([])
const tagStats = ref([])

// Chart refs
const tradeDistributionChart = ref(null)
const performanceByPriceChart = ref(null)
const performanceByVolumeChart = ref(null)

// Chart instances
let tradeDistributionChartInstance = null
let performanceByPriceChartInstance = null
let performanceByVolumeChartInstance = null

// Chart data
const tradeDistributionData = ref([])
const performanceByPriceData = ref([])
const performanceByVolumeData = ref([])

function formatNumber(num) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num || 0)
}

function getWinPercentage() {
  if (overview.value.total_trades === 0) return 0
  return ((overview.value.winning_trades / overview.value.total_trades) * 100).toFixed(1)
}

function getLossPercentage() {
  if (overview.value.total_trades === 0) return 0
  return ((overview.value.losing_trades / overview.value.total_trades) * 100).toFixed(1)
}

// Chart creation functions
function createTradeDistributionChart() {
  if (!tradeDistributionChart.value) {
    console.error('Trade distribution chart canvas not found')
    return
  }

  if (tradeDistributionChartInstance) {
    tradeDistributionChartInstance.destroy()
  }

  const ctx = tradeDistributionChart.value.getContext('2d')
  const labels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+']
  
  console.log('Creating trade distribution chart with data:', tradeDistributionData.value)
  
  tradeDistributionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Number of Trades',
        data: tradeDistributionData.value,
        backgroundColor: '#F0812A',
        borderColor: '#e46a16',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Trades'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Price Range'
          }
        }
      }
    }
  })
}

function createPerformanceByPriceChart() {
  if (performanceByPriceChartInstance) {
    performanceByPriceChartInstance.destroy()
  }

  const ctx = performanceByPriceChart.value.getContext('2d')
  const labels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+']
  
  performanceByPriceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total P&L',
        data: performanceByPriceData.value,
        backgroundColor: performanceByPriceData.value.map(val => val >= 0 ? '#10b981' : '#ef4444'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Price Range'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Total P&L ($)'
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Total P&L: $${context.parsed.y.toFixed(2)}`
            }
          }
        }
      }
    }
  })
}

function createPerformanceByVolumeChart() {
  if (performanceByVolumeChartInstance) {
    performanceByVolumeChartInstance.destroy()
  }

  const ctx = performanceByVolumeChart.value.getContext('2d')
  const labels = ['2-4', '5-9', '10-19', '20-49', '50-99', '100-500', '500-999', '1K-2K', '2K-3K', '3K-5K', '5K-10K', '10K-20K', '20K+']
  
  performanceByVolumeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total P&L',
        data: performanceByVolumeData.value,
        backgroundColor: performanceByVolumeData.value.map(val => val >= 0 ? '#10b981' : '#ef4444'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Volume Range (Shares)'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Total P&L ($)'
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Total P&L: $${context.parsed.y.toFixed(2)}`
            }
          }
        }
      }
    }
  })
}

async function fetchChartData() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/charts', { params })
    
    console.log('Chart data received:', response.data)
    
    tradeDistributionData.value = response.data.tradeDistribution
    performanceByPriceData.value = response.data.performanceByPrice
    performanceByVolumeData.value = response.data.performanceByVolume

    // Create charts after data is loaded and DOM is updated
    await nextTick()
    
    // Small delay to ensure canvases are ready
    setTimeout(() => {
      createTradeDistributionChart()
      createPerformanceByPriceChart()
      createPerformanceByVolumeChart()
    }, 100)
  } catch (error) {
    console.error('Error fetching chart data:', error)
  }
}

async function fetchOverview() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/overview', { params })
    overview.value = response.data.overview
  } catch (error) {
    console.error('Failed to fetch overview:', error)
  }
}

async function fetchPerformance() {
  try {
    const params = { period: performancePeriod.value }
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/performance', { params })
    performanceData.value = response.data.performance
  } catch (error) {
    console.error('Failed to fetch performance:', error)
  }
}

async function fetchSymbolStats() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/symbols', { params })
    symbolStats.value = response.data.symbols
  } catch (error) {
    console.error('Failed to fetch symbol stats:', error)
  }
}

async function fetchTagStats() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/tags', { params })
    tagStats.value = response.data.tags
  } catch (error) {
    console.error('Failed to fetch tag stats:', error)
  }
}

async function applyFilters() {
  loading.value = true
  
  // Save filters to localStorage
  saveFilters()
  
  await Promise.all([
    fetchOverview(),
    fetchPerformance(),
    fetchSymbolStats(),
    fetchTagStats(),
    fetchChartData()
  ])
  loading.value = false
}

async function loadData() {
  loading.value = true
  
  // Load saved filters from localStorage
  const savedFilters = localStorage.getItem('analyticsFilters')
  if (savedFilters) {
    try {
      const parsed = JSON.parse(savedFilters)
      filters.value = parsed
    } catch (e) {
      // If parsing fails, use default date range
      setDefaultDateRange()
    }
  } else {
    // Set default date range (last 30 days)
    setDefaultDateRange()
  }

  await applyFilters()
}

function setDefaultDateRange() {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  filters.value.endDate = today.toISOString().split('T')[0]
  filters.value.startDate = thirtyDaysAgo.toISOString().split('T')[0]
}

function saveFilters() {
  localStorage.setItem('analyticsFilters', JSON.stringify(filters.value))
}

onMounted(() => {
  loadData()
})

// Clean up charts on unmount
onUnmounted(() => {
  if (tradeDistributionChartInstance) {
    tradeDistributionChartInstance.destroy()
  }
  if (performanceByPriceChartInstance) {
    performanceByPriceChartInstance.destroy()
  }
  if (performanceByVolumeChartInstance) {
    performanceByVolumeChartInstance.destroy()
  }
})
</script>