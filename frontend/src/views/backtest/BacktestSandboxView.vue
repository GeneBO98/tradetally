<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div class="flex items-center space-x-3">
        <button
          v-if="mode !== 'setup'"
          @click="exitSession"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Back to session setup"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Backtest Sandbox
          <span v-if="sessionData" class="text-gray-500 dark:text-gray-400 font-medium">
            {{ sessionData.symbol }}
            <span class="text-sm">{{ sessionDateLabel }}</span>
          </span>
        </h1>
      </div>
      <div class="flex items-center space-x-2">
        <span
          v-if="mode === 'review'"
          class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 font-medium"
        >
          Reviewing saved session
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
      description="You've used all of your free backtest sessions. Upgrade to Pro for unlimited symbol/day backtesting."
    />

    <!-- Setup: pick a session + saved sessions -->
    <template v-else-if="mode === 'setup'">
      <div class="card mb-6">
        <div class="card-body">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">New Session</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Pick a symbol and a past trading day, then trade it bar-by-bar with simulated orders.
            Fills execute at the close of the current 1-minute bar.
          </p>
          <form @submit.prevent="loadSessionData" class="flex flex-wrap items-end gap-3">
            <div>
              <label class="label">Instrument</label>
              <div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  type="button"
                  @click="form.instrument = 'stock'"
                  class="px-3 py-2 text-sm font-medium"
                  :class="form.instrument === 'stock'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
                >
                  Stocks
                </button>
                <button
                  type="button"
                  @click="futuresAvailable && (form.instrument = 'future')"
                  :disabled="!futuresAvailable"
                  class="px-3 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600"
                  :class="form.instrument === 'future'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'"
                  :title="futuresAvailable ? '' : 'Requires a Databento API key on the server (DATABENTO_API_KEY)'"
                >
                  Futures
                </button>
              </div>
            </div>
            <div>
              <label class="label" for="backtest-symbol">Symbol</label>
              <input
                id="backtest-symbol"
                v-model="form.symbol"
                type="text"
                class="input w-32 uppercase"
                :placeholder="form.instrument === 'future' ? 'MNQ' : 'AAPL'"
                maxlength="16"
                required
              />
            </div>
            <div>
              <label class="label" for="backtest-date">Session date</label>
              <input
                id="backtest-date"
                v-model="form.date"
                type="date"
                class="input"
                :max="maxSessionDate"
                required
              />
            </div>
            <button type="submit" class="btn-primary" :disabled="loading">
              <span v-if="loading">Loading...</span>
              <span v-else>Load Session</span>
            </button>
          </form>
          <p v-if="form.instrument === 'future'" class="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Root or contract symbol (MNQ, ES, MNQM6...). Data: CME Globex continuous front-month,
            session runs 6:00 PM ET the prior evening through 5:00 PM ET.
          </p>
          <p v-if="error" class="text-sm text-red-600 dark:text-red-400 mt-3">{{ error }}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Saved Sessions</h2>
          <div v-if="sessions.length === 0" class="text-center py-8">
            <p class="text-gray-500 dark:text-gray-400 text-sm">
              No saved sessions yet. Load a symbol and day above to run your first backtest.
            </p>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Symbol</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Session</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">P&amp;L</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Win Rate</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Saved</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="session in sessions" :key="session.id">
                  <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {{ session.symbol }}
                    <span
                      v-if="session.instrument_type === 'future'"
                      class="ml-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium"
                    >
                      FUT
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{{ formatSessionDate(session.session_date) }}</td>
                  <td class="px-4 py-3 text-sm text-right tabular-nums" :class="pnlClass(session.total_pnl)">
                    {{ formatSignedCurrency(session.total_pnl) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {{ session.round_trips }}
                    <span class="text-gray-500 dark:text-gray-400">({{ session.wins }}W / {{ session.losses }}L)</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-700 dark:text-gray-300">{{ winRateLabel(session) }}</td>
                  <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ formatSavedAt(session.created_at) }}</td>
                  <td class="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <button @click="reviewSession(session)" class="btn-secondary text-xs px-2.5 py-1.5 mr-2">
                      Review
                    </button>
                    <button
                      v-if="confirmDeleteId !== session.id"
                      @click="confirmDeleteId = session.id"
                      class="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                    <button
                      v-else
                      @click="deleteSession(session)"
                      class="text-xs text-red-600 dark:text-red-400 font-medium"
                    >
                      Confirm delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- Playback -->
    <template v-else-if="sessionData">
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
            :trade="chartTrade"
            :display-offset-seconds="sessionData.session.display_offset_seconds"
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

      <!-- Order ticket (sandbox mode only) -->
      <div v-if="mode === 'sandbox'" class="card mb-4">
        <div class="card-body">
          <div class="flex flex-wrap items-end gap-4">
            <div>
              <label class="label" for="backtest-quantity">{{ isFuturesSession ? 'Contracts' : 'Shares' }}</label>
              <input
                id="backtest-quantity"
                v-model.number="orderQuantity"
                type="number"
                min="1"
                step="1"
                class="input w-28"
              />
            </div>
            <span
              v-if="isFuturesSession"
              class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 mb-2.5"
            >
              {{ sessionData.symbol }} &middot; ${{ sessionData.multiplier }}/pt
            </span>
            <div class="flex items-center gap-2">
              <button
                @click="placeOrder('buy')"
                :disabled="!canTrade"
                class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Buy (B)"
              >
                Buy
              </button>
              <button
                @click="placeOrder('sell')"
                :disabled="!canTrade"
                class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sell / Short (S)"
              >
                Sell
              </button>
              <button
                @click="flattenPosition"
                :disabled="!canTrade || stats.position === 0"
                class="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Flatten (F)"
              >
                Flatten
              </button>
            </div>
            <div class="ml-auto text-right">
              <p class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Current price</p>
              <p class="font-semibold text-gray-900 dark:text-white tabular-nums">
                {{ currentBar ? formatCurrency(currentBar.close) : '--' }}
              </p>
            </div>
          </div>
          <p v-if="!canTrade" class="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Scrub forward past your last fill to place orders. Orders always execute at the current bar.
          </p>
          <p v-else class="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Keyboard: B to buy, S to sell, F to flatten, Space to play/pause, arrows to step.
          </p>
        </div>
      </div>

      <!-- Running stats -->
      <div class="card mb-4">
        <div class="card-body">
          <ReplayStatsBar
            :stats="stats"
            :current-time="currentTime"
            :timezone="sessionData.session.timezone"
          />
        </div>
      </div>

      <!-- Save (sandbox) / summary (review) -->
      <div v-if="mode === 'sandbox'" class="card">
        <div class="card-body">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">Save Session</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {{ fills.length === 0
              ? 'Place at least one order to save this session.'
              : 'Saves your fills and results so you can review this run later.' }}
          </p>
          <textarea
            v-model="notes"
            rows="2"
            class="input w-full mb-3"
            placeholder="Notes about this run (setup tested, rules followed, observations)..."
            maxlength="5000"
          ></textarea>
          <div class="flex items-center gap-3">
            <button
              @click="saveSession"
              :disabled="fills.length === 0 || saving"
              class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="saving">Saving...</span>
              <span v-else>{{ stats.position !== 0 ? 'Flatten & Save' : 'Save Session' }}</span>
            </button>
            <p v-if="stats.position !== 0" class="text-xs text-gray-500 dark:text-gray-400">
              Your open position will be closed at the current bar before saving.
            </p>
          </div>
          <p v-if="saveError" class="text-sm text-red-600 dark:text-red-400 mt-3">{{ saveError }}</p>
          <p v-if="saveSuccess" class="text-sm text-green-600 dark:text-green-400 mt-3">
            Session saved. Use the back arrow to start another run or review past sessions.
          </p>
        </div>
      </div>

      <div v-else-if="reviewedSession" class="card">
        <div class="card-body">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Session Result</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Total P&amp;L</dt>
              <dd class="font-semibold tabular-nums" :class="pnlClass(reviewedSession.total_pnl)">
                {{ formatSignedCurrency(reviewedSession.total_pnl) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Round Trips</dt>
              <dd class="font-medium text-gray-900 dark:text-white tabular-nums">{{ reviewedSession.round_trips }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Wins / Losses</dt>
              <dd class="font-medium text-gray-900 dark:text-white tabular-nums">
                {{ reviewedSession.wins }}W / {{ reviewedSession.losses }}L
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Fills</dt>
              <dd class="font-medium text-gray-900 dark:text-white tabular-nums">{{ fills.length }}</dd>
            </div>
          </div>
          <div v-if="reviewedSession.notes" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Notes</p>
            <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ reviewedSession.notes }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import api from '@/services/api'
import { useReplayEngine } from '@/composables/useReplayEngine'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import ReplayChart from '@/components/replay/ReplayChart.vue'
import ReplayControls from '@/components/replay/ReplayControls.vue'
import ReplayStatsBar from '@/components/replay/ReplayStatsBar.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'

const engine = useReplayEngine()
const {
  bars, fills, cursor, playing, speed, executedFills,
  stats, currentBar, currentTime, atEnd, SPEED_OPTIONS
} = engine

const { formatCurrency } = useCurrencyFormatter()

// 'setup' | 'sandbox' | 'review'
const mode = ref('setup')
const loading = ref(false)
const initialLoading = ref(true)
const error = ref(null)
const upgradeRequired = ref(false)
const sessionData = ref(null)
const quota = ref(null)

const form = reactive({ symbol: '', date: '', instrument: 'stock' })
const sessions = ref([])
const confirmDeleteId = ref(null)

const orderQuantity = ref(100)
const notes = ref('')
const saving = ref(false)
const saveError = ref(null)
const saveSuccess = ref(false)
const reviewedSession = ref(null)

const indicators = reactive({ vwap: true, ema9: false, ema20: false, volume: true })
const indicatorOptions = [
  { key: 'vwap', label: 'VWAP' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'ema20', label: 'EMA 20' },
  { key: 'volume', label: 'Volume' }
]

const maxSessionDate = computed(() => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return yesterday.toISOString().split('T')[0]
})

const sessionDateLabel = computed(() =>
  sessionData.value?.session?.date ? formatSessionDate(sessionData.value.session.date) : ''
)

const quotaChip = computed(() => {
  if (!quota.value || quota.value.unlimited) return null
  return `${quota.value.remaining} free ${quota.value.remaining === 1 ? 'session' : 'sessions'} left`
})

const futuresAvailable = computed(() => quota.value?.futures_available === true)

const isFuturesSession = computed(() => sessionData.value?.instrument_type === 'future')

// Minimal trade-shaped object so the chart (tick-size price format) and the
// engine (P&L multiplier) treat futures sessions correctly
const chartTrade = computed(() => {
  if (!sessionData.value) return null
  return {
    instrument_type: sessionData.value.instrument_type || 'stock',
    multiplier: sessionData.value.multiplier || 1,
    tick_size: sessionData.value.tick_size || null
  }
})

// Orders may only be placed with the cursor at or past the last fill; scrubbed
// back in time, the buttons lock so runs stay chronologically honest.
const canTrade = computed(() => {
  if (!currentBar.value) return false
  const lastFill = fills.value[fills.value.length - 1]
  return !lastFill || currentBar.value.time >= lastFill.time
})

function formatSessionDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatSavedAt(value) {
  return value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

function formatSignedCurrency(value) {
  const num = Number(value) || 0
  const formatted = formatCurrency(Math.abs(num))
  return num < 0 ? `-${formatted}` : `+${formatted}`
}

function pnlClass(value) {
  const num = Number(value) || 0
  if (num > 0) return 'text-green-600 dark:text-green-400'
  if (num < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function winRateLabel(session) {
  const total = session.wins + session.losses
  return total > 0 ? `${Math.round((session.wins / total) * 100)}%` : '--'
}

function startPlayback(payload, savedFills) {
  sessionData.value = payload
  if (payload.quota) quota.value = payload.quota
  engine.load({
    candles: payload.candles,
    fills: savedFills || [],
    trade: {
      instrument_type: payload.instrument_type || 'stock',
      multiplier: payload.multiplier || 1,
      tick_size: payload.tick_size || null
    }
  })
  if (!savedFills || savedFills.length === 0) {
    // Skip most of the overnight/premarket: start a few bars before the
    // 09:30 ET regular open. Equity sessions start 04:00 ET (5.5h earlier);
    // futures Globex sessions start 18:00 ET the prior evening (15.5h earlier).
    const hoursToOpen = payload.instrument_type === 'future' ? 15.5 : 5.5
    const openTs = payload.session.from_ts + hoursToOpen * 3600
    const openIndex = payload.candles.findIndex((bar) => bar.time >= openTs)
    if (openIndex > 0) engine.seek(Math.max(0, openIndex - 5))
  }
}

async function loadSessionData() {
  loading.value = true
  error.value = null
  try {
    const response = await api.get('/backtest/session-data', {
      params: {
        symbol: form.symbol.trim().toUpperCase(),
        date: form.date,
        instrument: form.instrument
      }
    })
    notes.value = ''
    saveError.value = null
    saveSuccess.value = false
    startPlayback(response.data, [])
    mode.value = 'sandbox'
  } catch (err) {
    if (err.response?.status === 403 && err.response.data?.upgrade_required) {
      upgradeRequired.value = true
    } else if (err.response?.status === 429) {
      error.value = err.response.data?.error || 'Rate limit reached. Please try again shortly.'
    } else {
      error.value = err.response?.data?.error || 'Failed to load session data'
    }
  } finally {
    loading.value = false
  }
}

async function reviewSession(session) {
  loading.value = true
  error.value = null
  try {
    const response = await api.get(`/backtest/sessions/${session.id}`)
    reviewedSession.value = response.data.saved_session
    startPlayback(response.data, response.data.saved_session.fills)
    mode.value = 'review'
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load saved session'
  } finally {
    loading.value = false
  }
}

function placeOrder(action) {
  if (!canTrade.value || mode.value !== 'sandbox') return
  const quantity = Math.floor(Math.abs(Number(orderQuantity.value)))
  if (!quantity) return
  saveSuccess.value = false
  fills.value = [
    ...fills.value,
    { time: currentBar.value.time, price: Number(currentBar.value.close), quantity, action }
  ]
}

// Flatten closes the exact open size, so it builds its own fill instead of
// going through the ticket's share quantity
function flattenPosition() {
  if (!canTrade.value || stats.value.position === 0) return
  const action = stats.value.position > 0 ? 'sell' : 'buy'
  fills.value = [
    ...fills.value,
    {
      time: currentBar.value.time,
      price: Number(currentBar.value.close),
      quantity: Math.abs(stats.value.position),
      action
    }
  ]
}

async function saveSession() {
  if (fills.value.length === 0 || saving.value) return
  engine.pause()
  if (stats.value.position !== 0) flattenPosition()

  saving.value = true
  saveError.value = null
  try {
    await api.post('/backtest/sessions', {
      symbol: sessionData.value.symbol,
      session_date: sessionData.value.session.date,
      instrument_type: sessionData.value.instrument_type || 'stock',
      fills: fills.value,
      notes: notes.value.trim() || null
    })
    saveSuccess.value = true
    await loadSessions()
  } catch (err) {
    saveError.value = err.response?.data?.error || 'Failed to save session'
  } finally {
    saving.value = false
  }
}

async function deleteSession(session) {
  try {
    await api.delete(`/backtest/sessions/${session.id}`)
    sessions.value = sessions.value.filter((s) => s.id !== session.id)
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to delete session'
  } finally {
    confirmDeleteId.value = null
  }
}

async function loadSessions() {
  const response = await api.get('/backtest/sessions')
  sessions.value = response.data.sessions || []
}

async function loadQuota() {
  try {
    const response = await api.get('/backtest/quota')
    quota.value = response.data
  } catch {
    quota.value = null
  }
}

function exitSession() {
  engine.pause()
  mode.value = 'setup'
  sessionData.value = null
  reviewedSession.value = null
  saveSuccess.value = false
  saveError.value = null
  error.value = null
}

function handleKeydown(event) {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return
  if (mode.value === 'setup') return
  if (event.code === 'Space') {
    event.preventDefault()
    engine.toggle()
  } else if (event.code === 'ArrowRight') {
    event.preventDefault()
    engine.stepForward()
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault()
    engine.stepBack()
  } else if (mode.value === 'sandbox' && event.code === 'KeyB') {
    placeOrder('buy')
  } else if (mode.value === 'sandbox' && event.code === 'KeyS') {
    placeOrder('sell')
  } else if (mode.value === 'sandbox' && event.code === 'KeyF') {
    flattenPosition()
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadSessions(), loadQuota()])
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load backtest sessions'
  } finally {
    initialLoading.value = false
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
