<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ isEdit ? 'Edit Trade' : 'Add New Trade' }}
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {{ isEdit ? 'Update your trade details' : 'Enter the details of your trade' }}
      </p>
    </div>

    <!-- Behavioral Alert -->
    <div v-if="behavioralAlert" class="mb-6 card border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10">
      <div class="card-body">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div class="ml-3 flex-1">
            <h3 class="text-lg font-medium text-red-800 dark:text-red-400">Revenge Trading Alert</h3>
            <p class="text-red-700 dark:text-red-300 mt-1">{{ behavioralAlert.message }}</p>
            <div v-if="behavioralAlert.recommendation" class="mt-2">
              <p class="text-sm text-red-600 dark:text-red-400">
                <strong>Recommendation:</strong> {{ behavioralAlert.recommendation }}
              </p>
            </div>
            <div v-if="behavioralAlert.coolingPeriod" class="mt-3">
              <div class="flex items-center space-x-2">
                <button
                  @click="takeCoolingPeriod"
                  class="px-3 py-1 text-sm bg-red-200 text-red-800 rounded hover:bg-red-300 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                >
                  Take {{ behavioralAlert.coolingPeriod }} minute break
                </button>
                <button
                  @click="acknowledgeBehavioralAlert"
                  class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Continue anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Trade Blocking Warning -->
    <div v-if="tradeBlocked" class="mb-6 card border-l-4 border-l-red-600 bg-red-100 dark:bg-red-900/20">
      <div class="card-body text-center">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
          <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-red-800 dark:text-red-400 mb-2">Trading Temporarily Blocked</h3>
        <p class="text-red-700 dark:text-red-300 mb-4">
          Based on your recent trading patterns, we recommend taking a break to avoid emotional decision-making.
        </p>
        <p class="text-sm text-red-600 dark:text-red-400">
          Recommended cooling period: {{ tradeBlockingInfo.recommendedCoolingPeriod }} minutes
        </p>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="card">
      <div class="card-body space-y-6">
        <!-- Symbol field standalone -->
        <div>
          <label for="symbol" class="label">Symbol *</label>
          <input
            id="symbol"
            v-model="form.symbol"
            type="text"
            required
            class="input uppercase"
            placeholder="AAPL"
          />
        </div>

        <!-- Two column grid for remaining fields -->
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label for="entryTime" class="label">Entry Time *</label>
            <input
              id="entryTime"
              v-model="form.entryTime"
              type="datetime-local"
              required
              class="input"
            />
          </div>

          <div>
            <label for="exitTime" class="label">Exit Time</label>
            <input
              id="exitTime"
              v-model="form.exitTime"
              type="datetime-local"
              class="input"
            />
          </div>

          <div>
            <label for="entryPrice" class="label">Entry Price *</label>
            <input
              id="entryPrice"
              v-model="form.entryPrice"
              type="number"
              step="0.0001"
              min="0"
              required
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="exitPrice" class="label">Exit Price</label>
            <input
              id="exitPrice"
              v-model="form.exitPrice"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="quantity" class="label">Quantity *</label>
            <input
              id="quantity"
              v-model="form.quantity"
              type="number"
              min="1"
              required
              class="input"
              placeholder="100"
            />
          </div>

          <div>
            <label for="side" class="label">Side *</label>
            <select id="side" v-model="form.side" required class="input">
              <option value="">Select side</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          <div>
            <label for="commission" class="label">Commission</label>
            <input
              id="commission"
              v-model="form.commission"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="fees" class="label">Fees</label>
            <input
              id="fees"
              v-model="form.fees"
              type="number"
              step="0.0001"
              min="0"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="mae" class="label">
              MAE (Max Adverse Excursion)
              <span class="text-xs text-gray-500">Maximum loss during trade</span>
            </label>
            <input
              id="mae"
              v-model="form.mae"
              type="number"
              step="0.0001"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="mfe" class="label">
              MFE (Max Favorable Excursion)
              <span class="text-xs text-gray-500">Maximum profit during trade</span>
            </label>
            <input
              id="mfe"
              v-model="form.mfe"
              type="number"
              step="0.0001"
              class="input"
              placeholder="0.0000"
            />
          </div>

          <div>
            <label for="broker" class="label">Broker</label>
            <input
              id="broker"
              v-model="form.broker"
              type="text"
              class="input"
              placeholder="ThinkorSwim"
            />
          </div>

          <!-- Confidence Level -->
          <div class="sm:col-span-2">
            <label for="confidence" class="label">Confidence Level (1-10)</label>
            <div class="mt-2">
              <div class="flex items-center space-x-4">
                <span class="text-sm text-gray-500 dark:text-gray-400">1</span>
                <div class="flex-1 relative">
                  <input
                    id="confidence"
                    v-model="form.confidence"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
                    :style="{ background: `linear-gradient(to right, #F0812A 0%, #F0812A ${(form.confidence - 1) * 11.11}%, #e5e7eb ${(form.confidence - 1) * 11.11}%, #e5e7eb 100%)` }"
                  />
                  <div class="flex justify-between text-xs text-gray-400 mt-1">
                    <span v-for="i in 10" :key="i" class="w-4 text-center">{{ i }}</span>
                  </div>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">10</span>
              </div>
              <div class="mt-2 text-center">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                  Confidence: {{ form.confidence }}/10
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Rate your confidence level in this trade setup from 1 (very low) to 10 (very high)
              </p>
            </div>
          </div>
          
        </div>
      
      <div v-if="showMoreOptions">
        <div>
          <label for="strategy" class="label">Strategy</label>
          <input
            id="strategy"
            v-model="form.strategy"
            type="text"
            class="input"
            placeholder="Scalping"
          />
        </div>
        <div>
          <label for="setup" class="label">Setup</label>
          <input
            id="setup"
            v-model="form.setup"
            type="text"
            class="input"
            placeholder="Breakout"
          />
        </div>
  
        <div>
          <label for="tags" class="label">Tags (comma separated)</label>
          <input
            id="tags"
            v-model="tagsInput"
            type="text"
            class="input"
            placeholder="momentum, earnings, breakout"
          />
        </div>
  
        <div>
          <label for="notes" class="label">Notes</label>
          <textarea
            id="notes"
            v-model="form.notes"
            rows="4"
            class="input"
            placeholder="Add your trade notes, observations, and learnings..."
            @keydown="handleNotesKeydown"
          ></textarea>
        </div>
  
        <div class="flex items-center">
          <input
            id="isPublic"
            v-model="form.isPublic"
            type="checkbox"
            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label for="isPublic" class="ml-2 block text-sm text-gray-900 dark:text-white">
            Make this trade public
          </label>
        </div>
      </div>
      <button type="button" @click="showMoreOptions = !showMoreOptions" class="btn-secondary">
        {{ showMoreOptions ? 'Less Options' : 'More Options' }}
      </button>
      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/trades" class="btn-secondary">
            Cancel
          </router-link>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary"
          >
            <span v-if="loading">{{ isEdit ? 'Updating...' : 'Creating...' }}</span>
            <span v-else>{{ isEdit ? 'Update Trade' : 'Create Trade' }}</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const showMoreOptions = ref(false)
const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const { showSuccess, showError } = useNotification()

const loading = ref(false)
const error = ref(null)
const behavioralAlert = ref(null)
const tradeBlocked = ref(false)
const tradeBlockingInfo = ref(null)
const hasProAccess = ref(false)

const isEdit = computed(() => !!route.params.id)

const form = ref({
  symbol: '',
  entryTime: '',
  exitTime: '',
  entryPrice: '',
  exitPrice: '',
  quantity: '',
  side: '',
  commission: 0,
  fees: 0,
  mae: null,
  mfe: null,
  broker: '',
  strategy: '',
  setup: '',
  notes: '',
  isPublic: false,
  confidence: 5
})

const tagsInput = ref('')

function formatDateTimeLocal(date) {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

async function loadTrade() {
  if (!isEdit.value) return
  
  try {
    loading.value = true
    const trade = await tradesStore.fetchTrade(route.params.id)
    
    form.value = {
      symbol: trade.symbol,
      entryTime: formatDateTimeLocal(trade.entry_time),
      exitTime: trade.exit_time ? formatDateTimeLocal(trade.exit_time) : '',
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price || '',
      quantity: trade.quantity,
      side: trade.side,
      commission: trade.commission || 0,
      fees: trade.fees || 0,
      mae: trade.mae || null,
      mfe: trade.mfe || null,
      broker: trade.broker || '',
      strategy: trade.strategy || '',
      setup: trade.setup || '',
      notes: trade.notes || '',
      isPublic: trade.is_public || false,
      confidence: trade.confidence || 5
    }
    
    tagsInput.value = trade.tags ? trade.tags.join(', ') : ''
  } catch (err) {
    showError('Error', 'Failed to load trade')
    router.push('/trades')
  } finally {
    loading.value = false
  }
}

function handleNotesKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = null

  try {
    // Check for trade blocking if user has Pro access and it's a new trade
    if (!isEdit.value && hasProAccess.value) {
      const blockStatus = await checkTradeBlocking()
      if (blockStatus.shouldBlock) {
        return
      }
    }

    const tradeData = {
      ...form.value,
      entryPrice: parseFloat(form.value.entryPrice),
      exitPrice: form.value.exitPrice ? parseFloat(form.value.exitPrice) : null,
      quantity: parseInt(form.value.quantity),
      commission: parseFloat(form.value.commission) || 0,
      fees: parseFloat(form.value.fees) || 0,
      mae: form.value.mae ? parseFloat(form.value.mae) : null,
      mfe: form.value.mfe ? parseFloat(form.value.mfe) : null,
      confidence: parseInt(form.value.confidence) || 5,
      tags: tagsInput.value ? tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean) : []
    }

    if (isEdit.value) {
      await tradesStore.updateTrade(route.params.id, tradeData)
      showSuccess('Success', 'Trade updated successfully')
    } else {
      // Analyze for revenge trading before creating (non-blocking)
      if (hasProAccess.value) {
        analyzeForRevengeTrading(tradeData).catch(err => {
          console.warn('Revenge trading analysis failed, continuing with trade creation:', err)
        })
      }
      await tradesStore.createTrade(tradeData)
      showSuccess('Success', 'Trade created successfully')
    }

    router.push('/trades')
  } catch (err) {
    error.value = err.response?.data?.error || 'An error occurred'
    showError('Error', error.value)
  } finally {
    loading.value = false
  }
}

// Check if user has access to behavioral analytics
async function checkProAccess() {
  try {
    const response = await api.get('/features/check/behavioral_analytics')
    hasProAccess.value = response.data.hasAccess
  } catch (error) {
    hasProAccess.value = false
  }
}

// Check if user should be blocked from trading
async function checkTradeBlocking() {
  try {
    const response = await api.get('/behavioral-analytics/trade-block-status')
    const { shouldBlock, reason, alerts, recommendedCoolingPeriod } = response.data.data
    
    if (shouldBlock) {
      tradeBlocked.value = true
      tradeBlockingInfo.value = {
        reason,
        alerts,
        recommendedCoolingPeriod
      }
      return { shouldBlock: true }
    }
    
    return { shouldBlock: false }
  } catch (error) {
    console.error('Error checking trade blocking:', error)
    return { shouldBlock: false }
  }
}

// Analyze trade for revenge trading patterns
async function analyzeForRevengeTrading(tradeData) {
  try {
    const response = await api.post('/behavioral-analytics/analyze-trade', {
      trade: tradeData
    })
    
    const analysis = response.data.data
    if (analysis && analysis.alerts && Array.isArray(analysis.alerts) && analysis.alerts.length > 0) {
      const alert = analysis.alerts[0]
      behavioralAlert.value = {
        message: alert.message,
        recommendation: alert.recommendation,
        coolingPeriod: analysis.recommendedCoolingPeriod
      }
    }
  } catch (error) {
    console.error('Error analyzing trade for revenge trading:', error)
  }
}

// Handle cooling period action
function takeCoolingPeriod() {
  showSuccess('Cooling Period', `Taking a ${behavioralAlert.value.coolingPeriod} minute break. Come back refreshed!`)
  router.push('/dashboard')
}

// Acknowledge behavioral alert and continue
function acknowledgeBehavioralAlert() {
  behavioralAlert.value = null
}

// Watch for changes in entry time to trigger revenge trading analysis
watch(() => form.value.entryTime, async (newTime) => {
  if (!isEdit.value && hasProAccess.value && newTime) {
    // Clear previous alerts when entry time changes
    behavioralAlert.value = null
    
    // Only analyze if we have enough data to calculate patterns
    if (form.value.symbol && form.value.entryPrice && form.value.quantity && form.value.side) {
      const tradeData = {
        ...form.value,
        entryPrice: parseFloat(form.value.entryPrice),
        quantity: parseInt(form.value.quantity)
      }
      await analyzeForRevengeTrading(tradeData)
    }
  }
})

onMounted(async () => {
  await checkProAccess()
  
  if (isEdit.value) {
    loadTrade()
  } else {
    // Set default entry time
    const now = new Date()
    form.value.entryTime = formatDateTimeLocal(now)
    
    // Check for trade blocking on new trades
    if (hasProAccess.value) {
      await checkTradeBlocking()
    }
  }
})
</script>