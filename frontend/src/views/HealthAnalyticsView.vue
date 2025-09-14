<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Health Analytics</h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Analyze how your health metrics correlate with trading performance
      </p>
    </div>

    <!-- Health Overview Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Heart Rate</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">
                {{ healthSummary.avgHeartRate ? Math.round(healthSummary.avgHeartRate) : '--' }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">BPM</p>
            </div>
            <svg class="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z" />
            </svg>
          </div>
          <div class="mt-3">
            <div class="flex items-center text-xs">
              <span v-if="healthSummary.heartRateTrend > 0" class="text-red-600">
                ↑ {{ Math.abs(healthSummary.heartRateTrend).toFixed(1) }}%
              </span>
              <span v-else-if="healthSummary.heartRateTrend < 0" class="text-green-600">
                ↓ {{ Math.abs(healthSummary.heartRateTrend).toFixed(1) }}%
              </span>
              <span v-else class="text-gray-500">No change</span>
              <span class="ml-1 text-gray-500">vs last period</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Sleep Score</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">
                {{ healthSummary.avgSleepScore ? Math.round(healthSummary.avgSleepScore) : '--' }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">/ 100</p>
            </div>
            <svg class="w-10 h-10 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z" />
            </svg>
          </div>
          <div class="mt-3">
            <div class="flex items-center text-xs">
              <span v-if="healthSummary.sleepScoreTrend > 0" class="text-green-600">
                ↑ {{ Math.abs(healthSummary.sleepScoreTrend).toFixed(1) }}%
              </span>
              <span v-else-if="healthSummary.sleepScoreTrend < 0" class="text-red-600">
                ↓ {{ Math.abs(healthSummary.sleepScoreTrend).toFixed(1) }}%
              </span>
              <span v-else class="text-gray-500">No change</span>
              <span class="ml-1 text-gray-500">vs last period</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Sleep Hours</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">
                {{ healthSummary.avgSleepHours ? healthSummary.avgSleepHours.toFixed(1) : '--' }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">hours</p>
            </div>
            <svg class="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,7H11V14H3V5H1V20H3V17H21V20H23V11A4,4 0 0,0 19,7M7,10H5V8H7V10Z" />
            </svg>
          </div>
          <div class="mt-3">
            <div class="flex items-center text-xs">
              <span v-if="healthSummary.sleepHoursTrend > 0" class="text-green-600">
                ↑ {{ Math.abs(healthSummary.sleepHoursTrend).toFixed(1) }}%
              </span>
              <span v-else-if="healthSummary.sleepHoursTrend < 0" class="text-red-600">
                ↓ {{ Math.abs(healthSummary.sleepHoursTrend).toFixed(1) }}%
              </span>
              <span v-else class="text-gray-500">No change</span>
              <span class="ml-1 text-gray-500">vs last period</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">Avg Stress Level</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">
                {{ healthSummary.avgStressLevel ? (healthSummary.avgStressLevel * 100).toFixed(0) : '--' }}%
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">calculated</p>
            </div>
            <svg class="w-10 h-10 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M10,9.5C10,10.3 9.3,11 8.5,11C7.7,11 7,10.3 7,9.5C7,8.7 7.7,8 8.5,8C9.3,8 10,8.7 10,9.5M15,13H9V14.5H15V13M17,9.5C17,10.3 16.3,11 15.5,11C14.7,11 14,10.3 14,9.5C14,8.7 14.7,8 15.5,8C16.3,8 17,8.7 17,9.5Z" />
            </svg>
          </div>
          <div class="mt-3">
            <div class="flex items-center text-xs">
              <span v-if="healthSummary.stressLevelTrend > 0" class="text-red-600">
                ↑ {{ Math.abs(healthSummary.stressLevelTrend).toFixed(1) }}%
              </span>
              <span v-else-if="healthSummary.stressLevelTrend < 0" class="text-green-600">
                ↓ {{ Math.abs(healthSummary.stressLevelTrend).toFixed(1) }}%
              </span>
              <span v-else class="text-gray-500">No change</span>
              <span class="ml-1 text-gray-500">vs last period</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Correlation Chart Component -->
    <HealthCorrelationChart :user-id="authStore.user?.id" />

    <!-- Performance by Health Condition -->
    <div class="card mt-6">
      <div class="card-body">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Performance by Health Condition
        </h3>
        
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Condition
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trades
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Win Rate
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Avg P&L
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total P&L
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="condition in healthConditions" :key="condition.name">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <svg class="w-8 h-8 mr-3" :class="condition.iconColor" fill="currentColor" viewBox="0 0 24 24">
                      <path :d="condition.iconPath" />
                    </svg>
                    <div>
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        {{ condition.name }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ condition.description }}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {{ condition.tradeCount }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="text-sm font-medium" 
                          :class="condition.winRate >= 50 ? 'text-green-600' : 'text-red-600'">
                      {{ condition.winRate.toFixed(1) }}%
                    </span>
                    <div class="ml-2 w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div class="h-2 rounded-full" 
                           :class="condition.winRate >= 50 ? 'bg-green-500' : 'bg-red-500'"
                           :style="`width: ${condition.winRate}%`"></div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono"
                    :class="condition.avgPnL >= 0 ? 'text-green-600' : 'text-red-600'">
                  ${{ Math.abs(condition.avgPnL).toFixed(2) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold"
                    :class="condition.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'">
                  ${{ Math.abs(condition.totalPnL).toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Health Insights -->
    <div class="card mt-6">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            Personalized Health Insights
          </h3>
          <button @click="refreshInsights" 
                  :disabled="loadingInsights"
                  class="btn-secondary text-sm">
            <svg v-if="loadingInsights" class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Refresh Insights
          </button>
        </div>

        <div v-if="healthInsights.length === 0" class="text-center py-8">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Collecting health data to generate insights...
          </p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="insight in healthInsights" :key="insight.id"
               class="p-4 rounded-lg border"
               :class="getInsightTypeClass(insight.insightType)">
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3 flex-1">
                <h4 class="text-sm font-medium">{{ insight.title }}</h4>
                <p class="mt-1 text-sm">{{ insight.description }}</p>
                <div class="mt-2 flex items-center justify-between">
                  <span class="text-xs opacity-75">
                    Confidence: {{ (insight.confidence * 100).toFixed(0) }}%
                  </span>
                  <span v-if="insight.isActionable" class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 rounded-full">
                    Actionable
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import HealthCorrelationChart from '@/components/health/HealthCorrelationChart.vue'

const authStore = useAuthStore()

const healthSummary = ref({
  avgHeartRate: null,
  avgSleepScore: null,
  avgSleepHours: null,
  avgStressLevel: null,
  heartRateTrend: 0,
  sleepScoreTrend: 0,
  sleepHoursTrend: 0,
  stressLevelTrend: 0
})

const healthConditions = ref([])
const healthInsights = ref([])
const loadingInsights = ref(false)

async function loadHealthSummary() {
  try {
    // Get trades from last 30 days with health data
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    
    const response = await api.get('/trades', {
      params: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        limit: 1000
      }
    })
    
    const trades = response.data.trades
    
    // Calculate current period averages
    const tradesWithHealth = trades.filter(t => 
      t.heartRate || t.sleepScore || t.sleepHours || t.stressLevel !== null
    )
    
    if (tradesWithHealth.length > 0) {
      const heartRates = tradesWithHealth.filter(t => t.heartRate).map(t => parseFloat(t.heartRate))
      const sleepScores = tradesWithHealth.filter(t => t.sleepScore).map(t => parseFloat(t.sleepScore))
      const sleepHours = tradesWithHealth.filter(t => t.sleepHours).map(t => parseFloat(t.sleepHours))
      const stressLevels = tradesWithHealth.filter(t => t.stressLevel !== null).map(t => parseFloat(t.stressLevel))
      
      healthSummary.value.avgHeartRate = heartRates.length > 0 ? 
        heartRates.reduce((a, b) => a + b, 0) / heartRates.length : null
      healthSummary.value.avgSleepScore = sleepScores.length > 0 ?
        sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length : null
      healthSummary.value.avgSleepHours = sleepHours.length > 0 ?
        sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length : null
      healthSummary.value.avgStressLevel = stressLevels.length > 0 ?
        stressLevels.reduce((a, b) => a + b, 0) / stressLevels.length : null
    }
    
    // Calculate health condition performance
    calculateHealthConditions(trades)
    
  } catch (error) {
    console.error('Error loading health summary:', error)
  }
}

function calculateHealthConditions(trades) {
  const conditions = [
    {
      name: 'Well Rested',
      iconPath: 'M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z',
      iconColor: 'text-indigo-500',
      description: 'Sleep > 7 hours',
      filter: t => t.sleepHours && parseFloat(t.sleepHours) >= 7
    },
    {
      name: 'Sleep Deprived',
      iconPath: 'M2,21H20V19H2M20,8H18V5H20M20,3H4V13A4,4 0 0,0 8,17H14A4,4 0 0,0 18,13V10H20A2,2 0 0,0 22,8V5C22,3.89 21.1,3 20,3Z',
      iconColor: 'text-orange-500',
      description: 'Sleep < 6 hours',
      filter: t => t.sleepHours && parseFloat(t.sleepHours) < 6
    },
    {
      name: 'Low Stress',
      iconPath: 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M10,9.5C10,10.3 9.3,11 8.5,11C7.7,11 7,10.3 7,9.5C7,8.7 7.7,8 8.5,8C9.3,8 10,8.7 10,9.5M17,9.5C17,10.3 16.3,11 15.5,11C14.7,11 14,10.3 14,9.5C14,8.7 14.7,8 15.5,8C16.3,8 17,8.7 17,9.5M12,17.5C10.07,17.5 8.5,16.5 7.5,15H16.5C15.5,16.5 13.93,17.5 12,17.5Z',
      iconColor: 'text-green-500',
      description: 'Stress < 30%',
      filter: t => t.stressLevel !== null && t.stressLevel !== undefined && parseFloat(t.stressLevel) < 0.3
    },
    {
      name: 'High Stress',
      iconPath: 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M10,9.5C10,10.3 9.3,11 8.5,11C7.7,11 7,10.3 7,9.5C7,8.7 7.7,8 8.5,8C9.3,8 10,8.7 10,9.5M15,13H9V14.5H15V13M17,9.5C17,10.3 16.3,11 15.5,11C14.7,11 14,10.3 14,9.5C14,8.7 14.7,8 15.5,8C16.3,8 17,8.7 17,9.5Z',
      iconColor: 'text-red-500',
      description: 'Stress > 60%',
      filter: t => t.stressLevel !== null && t.stressLevel !== undefined && parseFloat(t.stressLevel) > 0.6
    },
    {
      name: 'Normal Heart Rate',
      iconPath: 'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
      iconColor: 'text-green-500',
      description: '60-80 BPM',
      filter: t => t.heartRate && parseFloat(t.heartRate) >= 60 && parseFloat(t.heartRate) <= 80
    },
    {
      name: 'Elevated Heart Rate',
      iconPath: 'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
      iconColor: 'text-red-500',
      description: '> 80 BPM',
      filter: t => t.heartRate && parseFloat(t.heartRate) > 80
    }
  ]
  
  healthConditions.value = conditions.map(condition => {
    const matchingTrades = trades.filter(condition.filter)
    const wins = matchingTrades.filter(t => parseFloat(t.pnl) > 0).length
    const totalPnL = matchingTrades.reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0)
    
    return {
      ...condition,
      tradeCount: matchingTrades.length,
      winRate: matchingTrades.length > 0 ? (wins / matchingTrades.length) * 100 : 0,
      avgPnL: matchingTrades.length > 0 ? totalPnL / matchingTrades.length : 0,
      totalPnL: totalPnL
    }
  }).filter(c => c.tradeCount > 0)
}

async function loadHealthInsights() {
  try {
    const response = await api.get('/health/insights')
    healthInsights.value = response.data.insights
  } catch (error) {
    console.error('Error loading health insights:', error)
  }
}

async function refreshInsights() {
  loadingInsights.value = true
  try {
    // Trigger analysis
    await api.post('/health/analyze', {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    })
    
    // Reload insights
    await loadHealthInsights()
  } catch (error) {
    console.error('Error refreshing insights:', error)
  } finally {
    loadingInsights.value = false
  }
}

function getInsightTypeClass(type) {
  const classes = {
    'sleep_quality': 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300',
    'heart_rate': 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
    'stress': 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300',
    'overall': 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
  }
  return classes[type] || classes.overall
}

onMounted(() => {
  loadHealthSummary()
  loadHealthInsights()
})
</script>