<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
          Health-Trading Correlations
        </h3>
        <div class="flex items-center space-x-2">
          <select 
            v-model="selectedMetric" 
            @change="updateChart"
            class="text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
          >
            <option value="heartRate">Heart Rate</option>
            <option value="sleepScore">Sleep Quality</option>
            <option value="sleepHours">Sleep Hours</option>
            <option value="stressLevel">Stress Level</option>
          </select>
          <select 
            v-model="selectedPeriod" 
            @change="loadCorrelationData"
            class="text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="correlationData.length === 0" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No health data available for correlation analysis
        </p>
      </div>

      <div v-else>
        <!-- Scatter Plot Chart -->
        <div class="mb-6">
          <canvas ref="scatterChart" height="300"></canvas>
        </div>

        <!-- Correlation Statistics -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400">Correlation Coefficient</div>
            <div class="text-xl font-semibold" :class="getCorrelationClass(statistics.correlation)">
              {{ statistics.correlation.toFixed(3) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ getCorrelationStrength(statistics.correlation) }}
            </div>
          </div>
          
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400">Average P&L Impact</div>
            <div class="text-xl font-semibold" :class="statistics.avgImpact >= 0 ? 'text-green-600' : 'text-red-600'">
              ${{ Math.abs(statistics.avgImpact).toFixed(2) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Per {{ getMetricUnit(selectedMetric) }}
            </div>
          </div>

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div class="text-xs text-gray-500 dark:text-gray-400">Win Rate Impact</div>
            <div class="text-xl font-semibold" :class="statistics.winRateImpact >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ statistics.winRateImpact > 0 ? '+' : '' }}{{ statistics.winRateImpact.toFixed(1) }}%
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              When {{ getMetricCondition(selectedMetric) }}
            </div>
          </div>
        </div>

        <!-- Insights -->
        <div v-if="insights.length > 0" class="space-y-3">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">Key Insights</h4>
          <div v-for="(insight, index) in insights" :key="index" 
               class="p-3 rounded-lg border"
               :class="getInsightClass(insight.type)">
            <div class="flex items-start">
              <svg class="h-5 w-5 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path v-if="insight.type === 'positive'" fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                <path v-else-if="insight.type === 'warning'" fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                <path v-else fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
              <div class="flex-1">
                <p class="text-sm">{{ insight.message }}</p>
                <p v-if="insight.recommendation" class="text-xs mt-1 opacity-75">
                  <svg class="inline-block w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z" />
                  </svg>
                  {{ insight.recommendation }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
import api from '@/services/api'

Chart.register(...registerables)

const props = defineProps({
  userId: String
})

const loading = ref(false)
const selectedMetric = ref('heartRate')
const selectedPeriod = ref('30')
const correlationData = ref([])
const scatterChart = ref(null)
let chartInstance = null

const statistics = ref({
  correlation: 0,
  avgImpact: 0,
  winRateImpact: 0
})

const insights = ref([])

async function loadCorrelationData() {
  loading.value = true
  try {
    // Get trades with health data for the selected period
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(selectedPeriod.value))
    
    const response = await api.get('/trades', {
      params: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        limit: 1000
      }
    })
    
    // Filter trades with health data
    const tradesWithHealth = response.data.trades.filter(trade => {
      return trade[selectedMetric.value] !== null && trade[selectedMetric.value] !== undefined
    })
    
    correlationData.value = tradesWithHealth.map(trade => ({
      date: trade.trade_date,
      pnl: trade.pnl,
      winRate: trade.pnl > 0 ? 1 : 0,
      [selectedMetric.value]: trade[selectedMetric.value],
      heartRate: trade.heartRate,
      sleepScore: trade.sleepScore,
      sleepHours: trade.sleepHours,
      stressLevel: trade.stressLevel,
      symbol: trade.symbol,
      side: trade.side
    }))
    
    calculateStatistics()
    generateInsights()
    updateChart()
    
  } catch (error) {
    console.error('Error loading correlation data:', error)
  } finally {
    loading.value = false
  }
}

function calculateStatistics() {
  if (correlationData.value.length < 2) {
    statistics.value = { correlation: 0, avgImpact: 0, winRateImpact: 0 }
    return
  }
  
  const metric = selectedMetric.value
  const values = correlationData.value.map(d => d[metric])
  const pnls = correlationData.value.map(d => d.pnl)
  
  // Calculate Pearson correlation coefficient
  const n = values.length
  const sumX = values.reduce((a, b) => a + b, 0)
  const sumY = pnls.reduce((a, b) => a + b, 0)
  const sumXY = values.reduce((total, x, i) => total + x * pnls[i], 0)
  const sumX2 = values.reduce((total, x) => total + x * x, 0)
  const sumY2 = pnls.reduce((total, y) => total + y * y, 0)
  
  const correlation = (n * sumXY - sumX * sumY) / 
    Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  statistics.value.correlation = isNaN(correlation) ? 0 : correlation
  
  // Calculate average impact
  const avgMetric = sumX / n
  const highMetric = correlationData.value.filter(d => d[metric] > avgMetric)
  const lowMetric = correlationData.value.filter(d => d[metric] <= avgMetric)
  
  const avgHighPnL = highMetric.length > 0 ? 
    highMetric.reduce((sum, d) => sum + d.pnl, 0) / highMetric.length : 0
  const avgLowPnL = lowMetric.length > 0 ? 
    lowMetric.reduce((sum, d) => sum + d.pnl, 0) / lowMetric.length : 0
  
  statistics.value.avgImpact = avgHighPnL - avgLowPnL
  
  // Calculate win rate impact
  const highWinRate = highMetric.length > 0 ?
    (highMetric.filter(d => d.pnl > 0).length / highMetric.length) * 100 : 0
  const lowWinRate = lowMetric.length > 0 ?
    (lowMetric.filter(d => d.pnl > 0).length / lowMetric.length) * 100 : 0
  
  statistics.value.winRateImpact = highWinRate - lowWinRate
}

function generateInsights() {
  insights.value = []
  const metric = selectedMetric.value
  const correlation = statistics.value.correlation
  
  // Strong correlation insights
  if (Math.abs(correlation) > 0.5) {
    const direction = correlation > 0 ? 'positive' : 'negative'
    const metricLabel = getMetricLabel(metric)
    
    insights.value.push({
      type: correlation > 0 ? 'positive' : 'warning',
      message: `Strong ${direction} correlation detected between ${metricLabel} and trading performance`,
      recommendation: correlation > 0 ? 
        `Maintain healthy ${metricLabel} levels for better trading outcomes` :
        `Monitor ${metricLabel} levels as they may negatively impact your trading`
    })
  }
  
  // Specific metric insights
  if (metric === 'sleepHours') {
    const avgSleep = correlationData.value.reduce((sum, d) => sum + d.sleepHours, 0) / correlationData.value.length
    if (avgSleep < 6) {
      insights.value.push({
        type: 'warning',
        message: 'Your average sleep duration is below recommended levels',
        recommendation: 'Aim for 7-9 hours of sleep for optimal trading performance'
      })
    }
  }
  
  if (metric === 'heartRate') {
    const highHR = correlationData.value.filter(d => d.heartRate > 85)
    if (highHR.length > correlationData.value.length * 0.3) {
      insights.value.push({
        type: 'warning',
        message: 'Elevated heart rate detected in over 30% of trades',
        recommendation: 'Consider stress management techniques before trading'
      })
    }
  }
  
  // Win rate impact insight
  if (Math.abs(statistics.value.winRateImpact) > 10) {
    insights.value.push({
      type: statistics.value.winRateImpact > 0 ? 'positive' : 'warning',
      message: `${getMetricCondition(metric)} shows ${Math.abs(statistics.value.winRateImpact).toFixed(1)}% ${statistics.value.winRateImpact > 0 ? 'higher' : 'lower'} win rate`,
      recommendation: statistics.value.winRateImpact > 0 ? 
        `Continue maintaining good ${getMetricLabel(metric)} habits` :
        `Improve ${getMetricLabel(metric)} to potentially increase win rate`
    })
  }
}

function updateChart() {
  if (!scatterChart.value) return
  
  const ctx = scatterChart.value.getContext('2d')
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const metric = selectedMetric.value
  const data = correlationData.value.map(d => ({
    x: d[metric],
    y: d.pnl
  }))
  
  chartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Trades',
        data: data,
        backgroundColor: data.map(d => d.y >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'),
        borderColor: data.map(d => d.y >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'),
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return [
                `${getMetricLabel(metric)}: ${context.parsed.x.toFixed(1)} ${getMetricUnit(metric)}`,
                `P&L: $${context.parsed.y.toFixed(2)}`
              ]
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: `${getMetricLabel(metric)} (${getMetricUnit(metric)})`
          }
        },
        y: {
          title: {
            display: true,
            text: 'P&L ($)'
          }
        }
      }
    }
  })
}

// Helper functions
function getMetricLabel(metric) {
  const labels = {
    heartRate: 'Heart Rate',
    sleepScore: 'Sleep Quality',
    sleepHours: 'Sleep Duration',
    stressLevel: 'Stress Level'
  }
  return labels[metric] || metric
}

function getMetricUnit(metric) {
  const units = {
    heartRate: 'BPM',
    sleepScore: 'Score',
    sleepHours: 'Hours',
    stressLevel: '%'
  }
  return units[metric] || ''
}

function getMetricCondition(metric) {
  const conditions = {
    heartRate: 'Higher heart rate',
    sleepScore: 'Better sleep quality',
    sleepHours: 'More sleep',
    stressLevel: 'Higher stress'
  }
  return conditions[metric] || 'Higher values'
}

function getCorrelationClass(correlation) {
  const abs = Math.abs(correlation)
  if (abs > 0.7) return correlation > 0 ? 'text-green-600' : 'text-red-600'
  if (abs > 0.4) return correlation > 0 ? 'text-green-500' : 'text-orange-500'
  return 'text-gray-600'
}

function getCorrelationStrength(correlation) {
  const abs = Math.abs(correlation)
  if (abs > 0.7) return 'Strong correlation'
  if (abs > 0.4) return 'Moderate correlation'
  if (abs > 0.2) return 'Weak correlation'
  return 'No correlation'
}

function getInsightClass(type) {
  const classes = {
    positive: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
  }
  return classes[type] || classes.info
}

// Lifecycle
onMounted(() => {
  loadCorrelationData()
})

watch(selectedMetric, () => {
  calculateStatistics()
  generateInsights()
  updateChart()
})
</script>