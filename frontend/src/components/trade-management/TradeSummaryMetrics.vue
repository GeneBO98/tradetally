<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trade Summary</h3>
      <router-link
        :to="{ name: 'trade-detail', params: { id: trade.id } }"
        class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-300 dark:border-primary-600 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
      >
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        View Details
      </router-link>
    </div>

    <div class="p-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <!-- Entry Price -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Entry Price</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ formatCurrency(trade.entry_price) }}
          </div>
        </div>

        <!-- Exit Price -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Exit Price</div>
          <div class="text-lg font-semibold" :class="pnlClass">
            {{ formatCurrency(trade.exit_price) }}
          </div>
        </div>

        <!-- Stop Loss (Editable) -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Stop Loss
            <span v-if="!editingStopLoss" @click="startEditingStopLoss" class="ml-1 text-primary-500 hover:text-primary-600 cursor-pointer">(edit)</span>
          </div>
          <div v-if="editingStopLoss" class="flex items-center space-x-2">
            <div class="relative flex-1">
              <span class="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
              <input
                ref="stopLossInput"
                v-model="editStopLoss"
                type="number"
                step="0.01"
                class="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                @keyup.enter="saveStopLoss"
                @keyup.escape="cancelEditingStopLoss"
              />
            </div>
            <button @click="saveStopLoss" :disabled="saving" class="text-green-600 hover:text-green-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <button @click="cancelEditingStopLoss" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div v-else>
            <div class="text-lg font-semibold text-red-600 dark:text-red-400">
              {{ formatCurrency(trade.stop_loss) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatPercent(stopLossPercent) }} from entry
            </div>
          </div>
        </div>

        <!-- Take Profit (Editable) -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Take Profit
            <span v-if="!editingTakeProfit" @click="startEditingTakeProfit" class="ml-1 text-primary-500 hover:text-primary-600 cursor-pointer">(edit)</span>
          </div>
          <div v-if="editingTakeProfit" class="flex items-center space-x-2">
            <div class="relative flex-1">
              <span class="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
              <input
                ref="takeProfitInput"
                v-model="editTakeProfit"
                type="number"
                step="0.01"
                class="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                @keyup.enter="saveTakeProfit"
                @keyup.escape="cancelEditingTakeProfit"
              />
            </div>
            <button @click="saveTakeProfit" :disabled="saving" class="text-green-600 hover:text-green-700">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <button @click="cancelEditingTakeProfit" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div v-else>
            <div v-if="trade.take_profit" class="text-lg font-semibold text-primary-600 dark:text-primary-400">
              {{ formatCurrency(trade.take_profit) }}
              <span class="text-xs text-gray-500 dark:text-gray-400 font-normal block">
                {{ formatPercent(takeProfitPercent) }} from entry
              </span>
            </div>
            <div v-else class="text-lg text-gray-400 dark:text-gray-500">
              Not set
            </div>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
        {{ error }}
      </div>

      <div class="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <!-- Risk Amount -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Risk Amount</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ formatCurrency(analysis.risk_amount) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            ${{ formatNumber(analysis.risk_per_share) }} per share
          </div>
        </div>

        <!-- Actual P&L -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Actual P&L</div>
          <div class="text-lg font-semibold" :class="pnlClass">
            {{ formatCurrency(analysis.actual_pl_amount) }}
          </div>
          <div class="text-xs" :class="pnlClass">
            {{ formatPercent(trade.pnl_percent) }}
          </div>
        </div>

        <!-- Potential P&L -->
        <div v-if="analysis.target_pl_amount !== null">
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Potential P&L</div>
          <div class="text-lg font-semibold text-primary-600 dark:text-primary-400">
            {{ formatCurrency(analysis.target_pl_amount) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            If held to target
          </div>
        </div>
        <div v-else>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Potential P&L</div>
          <div class="text-lg text-gray-400 dark:text-gray-500">
            N/A
          </div>
        </div>

        <!-- Risk:Reward -->
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Risk:Reward</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ riskRewardActual }}
          </div>
          <div v-if="riskRewardPlanned" class="text-xs text-gray-500 dark:text-gray-400">
            Planned: {{ riskRewardPlanned }}
          </div>
        </div>
      </div>

      <!-- Trade Details -->
      <div class="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Symbol</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ trade.symbol }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Side</div>
          <div class="text-lg font-semibold capitalize" :class="trade.side === 'long' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ trade.side }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Quantity</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ trade.quantity }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Trade Date</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ formatDate(trade.trade_date) }}</div>
        </div>
      </div>

      <!-- Multiple Take Profit Targets -->
      <div v-if="hasMultipleTargets" class="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Take Profit Targets
        </h4>
        <div class="space-y-2">
          <div
            v-for="(target, index) in trade.take_profit_targets"
            :key="target.id"
            class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
          >
            <div class="flex items-center space-x-3">
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                TP{{ index + 1 }}
              </span>
              <span class="text-sm text-gray-600 dark:text-gray-400">
                {{ formatCurrency(target.price) }}
              </span>
              <span v-if="target.quantity" class="text-xs text-gray-500 dark:text-gray-400">
                {{ target.quantity }} shares
              </span>
            </div>
            <span :class="getTargetStatusClass(target.status)">
              {{ target.status || 'pending' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Target Hit Analysis -->
      <div v-if="trade.stop_loss" class="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
        <TargetHitFirstIndicator
          :trade="trade"
          :auto-analyze="false"
        />
      </div>

      <!-- Management R Summary -->
      <div v-if="trade.management_r !== null && trade.management_r !== undefined" class="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
        <div class="flex items-center justify-between p-4 rounded-lg" :class="getManagementRBgClass">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Trade Management Impact</div>
            <div class="text-lg font-semibold" :class="getManagementRTextClass">
              {{ trade.management_r >= 0 ? '+' : '' }}{{ trade.management_r }}R
            </div>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 text-right max-w-xs">
            <span v-if="trade.management_r > 0">
              Good management - captured more R than original target
            </span>
            <span v-else-if="trade.management_r < 0">
              Left R on table - exited before reaching original target
            </span>
            <span v-else>
              Matched original plan
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { format } from 'date-fns'
import api from '@/services/api'
import TargetHitFirstIndicator from './TargetHitFirstIndicator.vue'

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  analysis: {
    type: Object,
    required: true
  }
})

// Check if trade has multiple TP targets
const hasMultipleTargets = computed(() => {
  return props.trade.take_profit_targets && props.trade.take_profit_targets.length > 0
})

// Get CSS class for target status badges
function getTargetStatusClass(status) {
  switch (status) {
    case 'hit':
      return 'px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    case 'cancelled':
      return 'px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    default:
      return 'px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400'
  }
}

// Management R styling
const getManagementRBgClass = computed(() => {
  const r = props.trade.management_r
  if (r > 0) return 'bg-green-50 dark:bg-green-900/20'
  if (r < 0) return 'bg-amber-50 dark:bg-amber-900/20'
  return 'bg-gray-50 dark:bg-gray-700/50'
})

const getManagementRTextClass = computed(() => {
  const r = props.trade.management_r
  if (r > 0) return 'text-green-600 dark:text-green-400'
  if (r < 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-gray-600 dark:text-gray-400'
})

const emit = defineEmits(['levels-updated'])

// Editing state
const editingStopLoss = ref(false)
const editingTakeProfit = ref(false)
const editStopLoss = ref('')
const editTakeProfit = ref('')
const saving = ref(false)
const error = ref(null)

// Input refs
const stopLossInput = ref(null)
const takeProfitInput = ref(null)

const pnlClass = computed(() => {
  const pnl = parseFloat(props.trade.pnl)
  return pnl >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
})

const stopLossPercent = computed(() => {
  const entry = parseFloat(props.trade.entry_price)
  const sl = parseFloat(props.trade.stop_loss)
  if (props.trade.side === 'long') {
    return ((entry - sl) / entry) * 100
  }
  return ((sl - entry) / entry) * 100
})

const takeProfitPercent = computed(() => {
  if (!props.trade.take_profit) return null
  const entry = parseFloat(props.trade.entry_price)
  const tp = parseFloat(props.trade.take_profit)
  if (props.trade.side === 'long') {
    return ((tp - entry) / entry) * 100
  }
  return ((entry - tp) / entry) * 100
})

const riskRewardActual = computed(() => {
  const actualR = props.analysis.actual_r
  if (actualR === null || actualR === undefined) return 'N/A'
  return `1:${Math.abs(actualR).toFixed(1)}`
})

const riskRewardPlanned = computed(() => {
  const targetR = props.analysis.target_r
  if (targetR === null || targetR === undefined) return null
  return `1:${targetR.toFixed(1)}`
})

// Stop Loss editing
async function startEditingStopLoss() {
  editStopLoss.value = props.trade.stop_loss || ''
  editingStopLoss.value = true
  error.value = null
  await nextTick()
  stopLossInput.value?.focus()
}

function cancelEditingStopLoss() {
  editingStopLoss.value = false
  editStopLoss.value = ''
  error.value = null
}

async function saveStopLoss() {
  if (!editStopLoss.value) {
    error.value = 'Stop loss is required'
    return
  }

  const sl = parseFloat(editStopLoss.value)
  const entry = parseFloat(props.trade.entry_price)

  // Validate
  if (props.trade.side === 'long' && sl >= entry) {
    error.value = 'Stop loss must be below entry price for long trades'
    return
  }
  if (props.trade.side === 'short' && sl <= entry) {
    error.value = 'Stop loss must be above entry price for short trades'
    return
  }

  await saveLevels({ stop_loss: sl })
  editingStopLoss.value = false
}

// Take Profit editing
async function startEditingTakeProfit() {
  editTakeProfit.value = props.trade.take_profit || ''
  editingTakeProfit.value = true
  error.value = null
  await nextTick()
  takeProfitInput.value?.focus()
}

function cancelEditingTakeProfit() {
  editingTakeProfit.value = false
  editTakeProfit.value = ''
  error.value = null
}

async function saveTakeProfit() {
  const tp = editTakeProfit.value ? parseFloat(editTakeProfit.value) : null
  const entry = parseFloat(props.trade.entry_price)

  // Validate if value provided
  if (tp !== null) {
    if (props.trade.side === 'long' && tp <= entry) {
      error.value = 'Take profit must be above entry price for long trades'
      return
    }
    if (props.trade.side === 'short' && tp >= entry) {
      error.value = 'Take profit must be below entry price for short trades'
      return
    }
  }

  await saveLevels({ take_profit: tp })
  editingTakeProfit.value = false
}

// Save to API
async function saveLevels(updates) {
  saving.value = true
  error.value = null

  try {
    console.log('[TRADE-MGMT] Saving levels:', updates, 'for trade:', props.trade.id)
    const response = await api.patch(`/trade-management/trades/${props.trade.id}/levels`, updates)
    console.log('[TRADE-MGMT] Save response:', response.data)
    emit('levels-updated', response.data.trade)
  } catch (err) {
    console.error('[TRADE-MGMT] Save error:', err)
    error.value = err.response?.data?.error || 'Failed to save changes'
  } finally {
    saving.value = false
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num)
}

function formatNumber(value) {
  if (value === null || value === undefined) return '-'
  return parseFloat(value).toFixed(2)
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  return `${Math.abs(num).toFixed(2)}%`
}

function formatDate(dateString) {
  if (!dateString) return '-'
  try {
    return format(new Date(dateString), 'MMM d, yyyy')
  } catch {
    return dateString
  }
}
</script>
