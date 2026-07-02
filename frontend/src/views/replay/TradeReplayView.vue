<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div class="flex items-center space-x-3">
        <router-link
          :to="`/trades/${route.params.id}`"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Back to trade"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </router-link>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Trade Replay
          <span v-if="replayData" class="text-gray-500 dark:text-gray-400 font-medium">
            {{ replayData.symbol }}
            <span class="text-sm">{{ sessionDateLabel }}</span>
          </span>
        </h1>
      </div>
      <div v-if="replayData" class="flex items-center space-x-2">
        <span
          v-if="replayData.trade.side"
          class="text-xs px-2 py-1 rounded-full font-medium"
          :class="replayData.trade.side === 'long'
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'"
        >
          {{ replayData.trade.side.toUpperCase() }}
        </span>
        <span
          v-if="replayData.trade.instrument_type === 'option'"
          class="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
        >
          Options Trade
        </span>
        <span
          v-if="quotaChip"
          class="text-xs px-2 py-1 rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
        >
          {{ quotaChip }}
        </span>
      </div>
    </div>

    <!-- Initial loading -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Free quota exhausted -->
    <ProUpgradePrompt
      v-else-if="upgradeRequired"
      variant="card"
      description="You've used all of your free trade replays. Upgrade to Pro for unlimited replays of every trade and session."
    />

    <!-- Error -->
    <div v-else-if="error" class="card">
      <div class="card-body text-center py-16">
        <svg class="w-16 h-16 mx-auto text-red-500 dark:text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-600 dark:text-red-400 font-medium mb-2">{{ error }}</p>
        <button @click="loadReplay" class="btn-secondary text-sm mt-2">Try Again</button>
      </div>
    </div>

    <template v-else-if="replayData">
      <!-- Degraded-data notice -->
      <div
        v-if="replayData.degraded"
        class="mb-4 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20"
      >
        <p class="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Daily mode:</strong> minute-level data isn't available for this trade, so the
          replay steps through daily candles instead.
          <span v-if="!isBillingEnabled">
            Configure an FMP key (or a paid Finnhub plan) to unlock minute replay.
          </span>
        </p>
      </div>

      <!-- Split-adjustment notice -->
      <div
        v-if="replayData.price_scale && replayData.price_scale !== 1"
        class="mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60"
      >
        <p class="text-sm text-gray-600 dark:text-gray-400">
          The provider's chart data for this day is split-adjusted; prices have been rescaled
          (&divide;{{ replayData.price_scale }}) to match your actual fill prices.
        </p>
      </div>

      <!-- Options underlying notice -->
      <div
        v-if="replayData.trade.instrument_type === 'option'"
        class="mb-4 p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20"
      >
        <p class="text-sm text-primary-800 dark:text-primary-200">
          The chart shows the <strong>underlying stock</strong> ({{ replayData.chart_symbol }});
          markers show when your option fills executed, with contract prices in the marker labels.
          Running P&amp;L is computed from your option fill prices.
        </p>
      </div>

      <!-- Chart card -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="flex flex-wrap items-center justify-end gap-1.5 mb-3">
            <span class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mr-1">Indicators</span>
            <button
              v-for="option in indicatorOptions"
              :key="option.key"
              @click="indicators[option.key] = !indicators[option.key]"
              class="px-2 py-1 text-xs rounded-md font-medium"
              :class="indicators[option.key]
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
            >
              {{ option.label }}
            </button>
          </div>
          <ReplayChart
            :candles="bars"
            :fills="fills"
            :executed-fills="executedFills"
            :cursor="cursor"
            :trade="replayData.trade"
            :display-offset-seconds="replayData.session.display_offset_seconds"
            :resolution="replayData.resolution"
            :indicators="indicators"
            :height="480"
          />
          <div class="mt-4">
            <ReplayControls
              :playing="playing"
              :at-end="atEnd"
              :speed="speed"
              :speed-options="SPEED_OPTIONS"
              :cursor="cursor"
              :bar-count="bars.length"
              @toggle="engine.toggle"
              @step-back="engine.stepBack"
              @step-forward="engine.stepForward"
              @set-speed="engine.setSpeed"
              @seek="engine.seek"
              @jump-to-entry="engine.jumpToEntry"
              @jump-to-exit="engine.jumpToExit"
            />
          </div>
        </div>
      </div>

      <!-- Running stats -->
      <div class="card mb-4">
        <div class="card-body">
          <ReplayStatsBar
            :stats="stats"
            :current-time="currentTime"
            :timezone="replayData.session.timezone"
            :resolution="replayData.resolution"
          />
        </div>
      </div>

      <!-- What-if analysis -->
      <div v-if="whatIf" class="card">
        <div class="card-body">
          <ReplayWhatIf
            :result="whatIf"
            :timezone="replayData.session.timezone"
            :resolution="replayData.resolution"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useReplayEngine } from '@/composables/useReplayEngine'
import { computeReplayScenarios } from '@/utils/replayScenarios'
import ReplayChart from '@/components/replay/ReplayChart.vue'
import ReplayControls from '@/components/replay/ReplayControls.vue'
import ReplayStatsBar from '@/components/replay/ReplayStatsBar.vue'
import ReplayWhatIf from '@/components/replay/ReplayWhatIf.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'

const route = useRoute()
const authStore = useAuthStore()
const engine = useReplayEngine()
const {
  bars, fills, cursor, playing, speed, executedFills,
  stats, currentTime, atEnd, SPEED_OPTIONS
} = engine

const loading = ref(true)
const initialLoading = ref(true)
const error = ref(null)
const upgradeRequired = ref(false)
const replayData = ref(null)

const indicators = reactive({ vwap: true, ema9: false, ema20: false, volume: true })
const indicatorOptions = [
  { key: 'vwap', label: 'VWAP' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'ema20', label: 'EMA 20' },
  { key: 'volume', label: 'Volume' }
]

const whatIf = computed(() => {
  if (!replayData.value) return null
  return computeReplayScenarios({
    bars: replayData.value.candles,
    fills: replayData.value.fills,
    trade: replayData.value.trade
  })
})

const isBillingEnabled = computed(() => authStore.user?.billingEnabled !== false)

const sessionDateLabel = computed(() => {
  if (!replayData.value?.session?.date) return ''
  const [year, month, day] = replayData.value.session.date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
})

const quotaChip = computed(() => {
  const quota = replayData.value?.quota
  if (!quota || quota.unlimited) return null
  return `${quota.remaining} free ${quota.remaining === 1 ? 'replay' : 'replays'} left`
})

async function loadReplay() {
  loading.value = true
  error.value = null
  upgradeRequired.value = false
  try {
    const response = await api.get(`/replay/trades/${route.params.id}`)
    replayData.value = response.data
    engine.load(response.data)
  } catch (err) {
    if (err.response?.status === 403 && err.response.data?.upgrade_required) {
      upgradeRequired.value = true
    } else if (err.response?.status === 429) {
      error.value = err.response.data?.error || 'Rate limit reached. Please try again shortly.'
    } else {
      error.value = err.response?.data?.error || 'Failed to load replay data'
    }
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function handleKeydown(event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return
  if (event.code === 'Space') {
    event.preventDefault()
    engine.toggle()
  } else if (event.code === 'ArrowRight') {
    event.preventDefault()
    engine.stepForward()
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault()
    engine.stepBack()
  }
}

onMounted(() => {
  loadReplay()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
