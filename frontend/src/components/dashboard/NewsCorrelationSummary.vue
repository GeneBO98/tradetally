<template>
  <div v-if="enabled && summary" class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
          <MdiIcon :icon="newspaperIcon" :size="20" class="mr-2 text-blue-500" />
          News Sentiment Impact
        </h3>
        <router-link
          to="/metrics"
          class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
        >
          View Details →
        </router-link>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ summary.total_trades_with_news }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Trades with News</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold" :class="summary.overall_win_rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ Math.round(summary.overall_win_rate) }}%
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Overall Win Rate</div>
        </div>
      </div>

      <!-- Sentiment Breakdown -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span class="text-sm text-gray-700 dark:text-gray-300">Positive News</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-900 dark:text-white font-medium">
              {{ summary.sentiment_breakdown.positive }} trades
            </span>
            <span class="text-sm" :class="summary.performance_by_sentiment.positive_win_rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ Math.round(summary.performance_by_sentiment.positive_win_rate) }}%
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span class="text-sm text-gray-700 dark:text-gray-300">Negative News</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-900 dark:text-white font-medium">
              {{ summary.sentiment_breakdown.negative }} trades
            </span>
            <span class="text-sm" :class="summary.performance_by_sentiment.negative_win_rate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ Math.round(summary.performance_by_sentiment.negative_win_rate) }}%
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full bg-gray-500 mr-2"></div>
            <span class="text-sm text-gray-700 dark:text-gray-300">Neutral News</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-900 dark:text-white font-medium">
              {{ summary.sentiment_breakdown.neutral }} trades
            </span>
          </div>
        </div>
      </div>

      <!-- Quick Insight -->
      <div v-if="bestSentiment" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-start">
          <MdiIcon :icon="bulbIcon" :size="16" class="mr-2 text-yellow-500 mt-0.5" />
          <div class="text-sm text-gray-600 dark:text-gray-400">
            <span class="font-medium">Quick Insight:</span>
            Your best performance is on
            <span class="font-medium text-gray-900 dark:text-white">{{ bestSentiment.sentiment }}</span>
            news with a {{ Math.round(bestSentiment.win_rate) }}% win rate.
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Not Enabled State -->
  <div v-else-if="enabled === false" class="card">
    <div class="card-body text-center py-6">
      <MdiIcon :icon="lockIcon" :size="32" class="mx-auto text-gray-400 mb-3" />
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-1">News Analytics</h3>
      <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
        Available for Pro users and self-hosters
      </p>
      <router-link
        to="/pricing"
        class="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
      >
        Upgrade to Pro →
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiNewspaper, mdiLightbulb, mdiLock } from '@mdi/js'
import api from '@/services/api'

// Icons
const newspaperIcon = mdiNewspaper
const bulbIcon = mdiLightbulb
const lockIcon = mdiLock

// Data
const summary = ref(null)
const enabled = ref(null)
const loading = ref(false)

// Computed
const bestSentiment = computed(() => {
  if (!summary.value) return null

  const sentiments = [
    {
      sentiment: 'positive',
      win_rate: summary.value.performance_by_sentiment.positive_win_rate,
      trades: summary.value.sentiment_breakdown.positive
    },
    {
      sentiment: 'negative', 
      win_rate: summary.value.performance_by_sentiment.negative_win_rate,
      trades: summary.value.sentiment_breakdown.negative
    }
  ].filter(s => s.trades > 0)

  if (sentiments.length === 0) return null

  return sentiments.sort((a, b) => b.win_rate - a.win_rate)[0]
})

// Methods
async function fetchSummary() {
  if (loading.value) return
  
  loading.value = true

  try {
    const response = await api.get('/news-correlation/summary')
    
    enabled.value = response.data.enabled
    if (response.data.data) {
      summary.value = response.data.data
    }
  } catch (error) {
    console.error('Failed to fetch news correlation summary:', error)
    enabled.value = false
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSummary()
})
</script>