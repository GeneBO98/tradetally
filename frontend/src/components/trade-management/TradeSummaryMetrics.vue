<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
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
          <div v-if="editingStopLoss" class="space-y-2">
            <div class="relative">
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
            <div class="flex items-center gap-2">
              <button @click="saveStopLoss" :disabled="saving" class="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                Save
              </button>
              <button @click="cancelEditingStopLoss" class="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                Cancel
              </button>
            </div>
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

        <!-- Take Profit Column -->
        <div class="space-y-3">
          <!-- TP1 (from take_profit field only when NO take_profit_targets exist - neither in DB nor locally) -->
          <div v-if="!hasMultipleTpTargets && editableTakeProfitTargets.length === 0">
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Take Profit (TP1)
              <span v-if="!editingTakeProfit" @click="startEditingTakeProfit" class="ml-1 text-primary-500 hover:text-primary-600 cursor-pointer">(edit)</span>
            </div>
            <div v-if="editingTakeProfit" class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="relative flex-1 min-w-0">
                  <span class="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
                  <input
                    ref="takeProfitInput"
                    v-model="editTakeProfit"
                    type="number"
                    step="0.01"
                    class="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Price"
                    @keyup.enter="saveTakeProfit"
                    @keyup.escape="cancelEditingTakeProfit"
                  />
                </div>
                <input
                  v-model.number="editTakeProfitQty"
                  type="number"
                  step="1"
                  min="1"
                  class="w-14 px-1 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Qty"
                  title="Number of shares"
                  @keyup.enter="saveTakeProfit"
                  @keyup.escape="cancelEditingTakeProfit"
                />
              </div>
              <div class="flex items-center gap-2">
                <button @click="saveTakeProfit" :disabled="saving" class="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Save
                </button>
                <button @click="cancelEditingTakeProfit" class="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                  Cancel
                </button>
              </div>
            </div>
            <div v-else>
              <div v-if="trade.take_profit">
                <div class="text-lg font-semibold text-primary-600 dark:text-primary-400">
                  {{ formatCurrency(trade.take_profit) }}
                  <span v-if="tp1R" class="text-sm font-medium ml-1">({{ tp1R }}R)</span>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  <span v-if="tp1Qty">{{ tp1Qty }} shares · </span>
                  {{ formatPercent(takeProfitPercent) }} from entry
                </div>
              </div>
              <div v-else class="text-lg text-gray-400 dark:text-gray-500">
                Not set
              </div>
            </div>
          </div>

          <!-- All TP Targets (TP1, TP2, etc. from take_profit_targets array) -->
          <div v-for="(target, index) in editableTakeProfitTargets" :key="index">
            <div class="flex items-center gap-1 mb-1">
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">TP{{ index + 1 }}</span>
              <!-- Show calculated R for this target (moved to header line) -->
              <span v-if="target.price && calculateTargetR(target.price)" class="text-xs text-primary-600 dark:text-primary-400 font-medium">
                ({{ calculateTargetR(target.price) }}R)
              </span>
              <button
                @click="removeTakeProfitTarget(index)"
                class="p-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 ml-auto"
                title="Remove target"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative flex-1 min-w-0">
                <span class="absolute left-2 top-1 text-gray-500 text-sm">$</span>
                <input
                  v-model.number="target.price"
                  type="number"
                  step="0.01"
                  class="w-full pl-5 pr-2 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Price"
                  @focus="isEditingTargets = true"
                  @blur="handleTargetBlur"
                  @keyup.enter="saveTakeProfitTargets"
                />
              </div>
              <input
                v-model.number="target.shares"
                type="number"
                step="1"
                min="1"
                class="w-14 px-1 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                placeholder="Qty"
                title="Number of shares"
                @focus="isEditingTargets = true"
                @blur="handleTargetBlur"
                @keyup.enter="saveTakeProfitTargets"
              />
            </div>
          </div>

          <!-- Add Target Button -->
          <button
            @click="addTakeProfitTarget"
            class="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Target
          </button>
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

        <!-- Target P&L -->
        <div v-if="potentialPL !== null">
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target P&L</div>
          <div class="text-lg font-semibold text-primary-600 dark:text-primary-400">
            {{ formatCurrency(potentialPL) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            If held to target
          </div>
        </div>
        <div v-else>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target P&L</div>
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
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Trade Date & Time</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ formatDateWithTime(trade) }}</div>
        </div>
      </div>

      <!-- Target Hit Analysis -->
      <div v-if="trade.stop_loss" class="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
        <TargetHitFirstIndicator
          :trade="trade"
          :auto-analyze="false"
          @updated="handleTargetHitUpdated"
        />
      </div>

      <!-- Management R Summary (use analysis.management_r which is recalculated fresh) -->
      <div v-if="analysis?.management_r !== null && analysis?.management_r !== undefined" class="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
        <div class="flex items-center justify-between p-4 rounded-lg" :class="getManagementRBgClass">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Trade Management Impact</div>
            <div class="text-lg font-semibold" :class="getManagementRTextClass">
              {{ analysis.management_r >= 0 ? '+' : '' }}{{ analysis.management_r }}R
            </div>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 text-right max-w-xs">
            <span v-if="analysis.management_r > 0">
              Good management - captured more R than planned
            </span>
            <span v-else-if="analysis.management_r < 0">
              Poor management - missed planned R target
            </span>
            <span v-else>
              Matched plan exactly
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { format } from 'date-fns'
import api from '@/services/api'
import { useUserTimezone } from '@/composables/useUserTimezone'
import TargetHitFirstIndicator from './TargetHitFirstIndicator.vue'

const { formatDateTime: formatDateTimeTz } = useUserTimezone()

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

const potentialPL = computed(() => {
  // Prefer target_pl_amount from backend (direct calculation: sum of net profits at each TP level)
  // This is more accurate than the ratio-based formula for multiple targets
  if (props.analysis.target_pl_amount !== null && props.analysis.target_pl_amount !== undefined) {
    return props.analysis.target_pl_amount
  }

  // Fallback to ratio-based formula if target_pl_amount not available
  const actualR = props.analysis.actual_r
  const actualPL = props.analysis.actual_pl_amount
  const targetR = props.analysis.weighted_target_r ?? props.analysis.target_r

  if (targetR !== null && actualR !== null && actualR !== 0 && actualPL !== null) {
    const perR = actualPL / actualR
    return Math.round(perR * targetR * 100) / 100
  }

  return null
})

// Check if we should use take_profit_targets array (instead of single take_profit)
const hasMultipleTpTargets = computed(() => {
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
  const r = props.analysis?.management_r
  if (r > 0) return 'bg-green-50 dark:bg-green-900/20'
  if (r < 0) return 'bg-amber-50 dark:bg-amber-900/20'
  return 'bg-gray-50 dark:bg-gray-700/50'
})

const getManagementRTextClass = computed(() => {
  const r = props.analysis?.management_r
  if (r > 0) return 'text-green-600 dark:text-green-400'
  if (r < 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-gray-600 dark:text-gray-400'
})

const emit = defineEmits(['levels-updated', 'target-hit-updated'])

// Editing state
const editingStopLoss = ref(false)
const editingTakeProfit = ref(false)
const editStopLoss = ref('')
const editTakeProfit = ref('')
const editTakeProfitQty = ref('')
const saving = ref(false)
const error = ref(null)

// Take profit targets editing
const editableTakeProfitTargets = ref([])
const savingTargets = ref(false)
const isEditingTargets = ref(false) // Flag to prevent watch from overwriting during edits

// Initialize editable targets from trade data
function initializeTakeProfitTargets() {
  // Don't reinitialize if we're actively editing or saving
  if (isEditingTargets.value || savingTargets.value) {
    console.log('[TP TARGETS] Skipping reinitialization - currently editing/saving')
    return
  }

  const targets = props.trade?.take_profit_targets || []
  const singleTakeProfit = props.trade?.take_profit

  console.log('[TP TARGETS] Initializing from trade data:', {
    targetsCount: targets.length,
    targets: JSON.stringify(targets),
    singleTakeProfit
  })

  // Build the complete list of targets
  // Priority: use take_profit_targets array if it has data, otherwise fall back to single take_profit
  let allTargets = []

  if (Array.isArray(targets) && targets.length > 0) {
    // Use the targets array - this is the source of truth when present
    // Map to our editable format
    allTargets = targets.map(t => ({
      price: t.price ? parseFloat(t.price) : null,
      shares: t.shares || t.quantity || null
    }))

    // Check if take_profit is different from the first target (edge case from edit page)
    // Only add it if it's significantly different AND not already in the array
    const takeProfitPrice = singleTakeProfit ? parseFloat(singleTakeProfit) : null
    if (takeProfitPrice) {
      const alreadyInArray = allTargets.some(t =>
        t.price && Math.abs(t.price - takeProfitPrice) < 0.01
      )
      if (!alreadyInArray) {
        console.log('[TP TARGETS] take_profit not in array, prepending as TP1:', takeProfitPrice)
        allTargets.unshift({
          price: takeProfitPrice,
          shares: null
        })
      }
    }
  } else if (singleTakeProfit) {
    // No targets array, but we have a single take_profit - use it as TP1
    console.log('[TP TARGETS] No targets array, using take_profit as TP1')
    allTargets.push({
      price: parseFloat(singleTakeProfit),
      shares: null
    })
  }

  editableTakeProfitTargets.value = allTargets
  console.log('[TP TARGETS] Final initialized targets:', JSON.stringify(editableTakeProfitTargets.value))
}

// Watch for trade changes (by ID) and reinitialize targets
watch(() => props.trade?.id, (newId, oldId) => {
  if (newId && newId !== oldId) {
    console.log('[TP TARGETS] Trade changed, reinitializing targets for trade:', newId)
    isEditingTargets.value = false // Reset editing flag when trade changes
    initializeTakeProfitTargets()
  }
}, { immediate: true })

// Also watch the targets array itself in case it's updated without trade change
// But only when we're not actively editing
watch(() => props.trade?.take_profit_targets, (newTargets, oldTargets) => {
  // Skip if actively editing - the user's local state takes precedence
  if (isEditingTargets.value || savingTargets.value) {
    console.log('[TP TARGETS] take_profit_targets changed but skipping - editing/saving in progress')
    return
  }
  console.log('[TP TARGETS] take_profit_targets changed:', newTargets)
  initializeTakeProfitTargets()
}, { deep: true })

function addTakeProfitTarget() {
  isEditingTargets.value = true // Mark as editing to prevent watch interference

  // If we have a single take_profit but no targets yet, migrate TP1 to the array first
  if (editableTakeProfitTargets.value.length === 0 && props.trade.take_profit) {
    console.log('[TP TARGETS] Migrating single take_profit to array as TP1')
    editableTakeProfitTargets.value.push({
      price: parseFloat(props.trade.take_profit),
      shares: null // Will use remaining shares calculation
    })
  }

  // Now add the new empty target
  editableTakeProfitTargets.value.push({
    price: null,
    shares: null
  })
  console.log('[TP TARGETS] Added new target, total:', editableTakeProfitTargets.value.length)
}

function removeTakeProfitTarget(index) {
  isEditingTargets.value = true
  editableTakeProfitTargets.value.splice(index, 1)
  // Auto-save when removing (intentional action)
  saveTakeProfitTargets()
}

// Handle blur - save valid targets (empty ones get filtered out anyway)
function handleTargetBlur() {
  // Check if there are any targets with valid prices (not null, not empty string, not NaN)
  const hasValidData = editableTakeProfitTargets.value.some(t => {
    const price = t.price
    return price != null && price !== '' && !isNaN(price)
  })

  console.log('[TP TARGETS] Blur event - hasValidData:', hasValidData, 'targets:', JSON.stringify(editableTakeProfitTargets.value))

  // Save if we have any valid data - empty targets are filtered out in saveTakeProfitTargets
  // This allows editing existing values even when there's an unfilled new target
  if (hasValidData) {
    // Small delay to avoid saving mid-typing when user tabs between fields
    setTimeout(() => {
      // Re-check in case user is still editing
      if (!isEditingTargets.value || !savingTargets.value) {
        saveTakeProfitTargets()
      }
    }, 200)
  }
}

async function saveTakeProfitTargets() {
  // Don't save if already saving
  if (savingTargets.value) {
    console.log('[TP TARGETS] Already saving, skipping')
    return
  }

  savingTargets.value = true
  isEditingTargets.value = true // Ensure editing flag is set during save
  error.value = null

  try {
    // Filter out empty or invalid targets (null, empty string, NaN)
    const validTargets = editableTakeProfitTargets.value
      .filter(t => {
        const price = t.price
        return price != null && price !== '' && !isNaN(price) && isFinite(price)
      })
      .map(t => ({
        price: parseFloat(t.price),
        shares: t.shares ? parseInt(t.shares) : null
      }))

    console.log('[TP TARGETS] Valid targets to save:', validTargets)

    // Build the update payload
    // If we have valid targets, clear the single take_profit field to avoid duplication
    // The first target in the array becomes the new TP1
    const payload = {
      take_profit_targets: validTargets
    }

    // If using the array, set take_profit to the first target's price (for backwards compatibility)
    // This ensures TP1 is stored in both places but with the same value
    if (validTargets.length > 0) {
      payload.take_profit = validTargets[0].price
      console.log('[TP TARGETS] Also setting take_profit to TP1 price:', validTargets[0].price)
    }

    console.log('[TP TARGETS] Saving payload:', payload)
    const response = await api.patch(`/trade-management/trades/${props.trade.id}/levels`, payload)
    console.log('[TP TARGETS] Save response:', response.data)

    // Update local state from server response to stay in sync
    // This prevents watchers from triggering reinitialization
    const serverTargets = response.data.trade?.take_profit_targets || []
    editableTakeProfitTargets.value = serverTargets.map(t => ({
      price: t.price ? parseFloat(t.price) : null,
      shares: t.shares || t.quantity || null
    }))
    console.log('[TP TARGETS] Updated local state from server:', editableTakeProfitTargets.value)

    // Emit the update to parent - this will trigger re-fetch of analysis
    emit('levels-updated', response.data.trade)

    // Keep editing flag true longer to prevent watchers from reinitializing
    // during the parent's fetch cycle (which can take 500ms+)
    setTimeout(() => {
      isEditingTargets.value = false
      console.log('[TP TARGETS] Editing flag cleared')
    }, 1000)
  } catch (err) {
    console.error('[TRADE-MGMT] Save targets error:', err)
    error.value = err.response?.data?.error || 'Failed to save targets'
    isEditingTargets.value = false
  } finally {
    savingTargets.value = false
  }
}

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

// Calculate R for a given take profit price
function calculateTargetR(tpPrice) {
  if (!tpPrice || !props.trade.stop_loss || !props.trade.entry_price) return null

  const entry = parseFloat(props.trade.entry_price)
  const sl = parseFloat(props.trade.stop_loss)
  const tp = parseFloat(tpPrice)

  let risk, reward
  if (props.trade.side === 'long') {
    risk = entry - sl
    reward = tp - entry
  } else {
    risk = sl - entry
    reward = entry - tp
  }

  if (risk <= 0) return null
  const r = reward / risk
  return r.toFixed(2)
}

// Calculate R for primary take profit (TP1)
const tp1R = computed(() => {
  return calculateTargetR(props.trade.take_profit)
})

// Get quantity for TP1 from take_profit_targets if it exists
const tp1Qty = computed(() => {
  const tp1Target = props.trade.take_profit_targets?.[0]
  return tp1Target?.shares || tp1Target?.quantity || null
})

const riskRewardActual = computed(() => {
  const actualR = props.analysis.actual_r
  if (actualR === null || actualR === undefined) return 'N/A'
  return `1:${actualR.toFixed(2)}`
})

// Calculate weighted average R for planned risk:reward
const weightedAverageR = computed(() => {
  const targets = props.trade.take_profit_targets || []
  const primaryTp = props.trade.take_profit

  // If no targets and no primary TP, return null
  if (targets.length === 0 && !primaryTp) return null

  // Collect all targets with their R values and quantities
  const allTargets = []

  // Check if TP1 is already in the targets array (matches primaryTp)
  // This avoids double-counting TP1 when it's stored in both places
  const firstTargetPrice = targets[0]?.price ? parseFloat(targets[0].price) : null
  const takeProfitPrice = primaryTp ? parseFloat(primaryTp) : null
  const tp1AlreadyInTargets = takeProfitPrice && firstTargetPrice && Math.abs(firstTargetPrice - takeProfitPrice) < 0.01

  // Add primary TP as TP1 if it exists AND is NOT already in targets array
  if (primaryTp && !tp1AlreadyInTargets) {
    const r = parseFloat(calculateTargetR(primaryTp))
    if (r && !isNaN(r)) {
      // Use remaining quantity for TP1 if additional targets have shares
      const additionalShares = targets.reduce((sum, t) => sum + (t.shares || 0), 0)
      const tp1Shares = additionalShares > 0 ? Math.max(0, parseFloat(props.trade.quantity) - additionalShares) : parseFloat(props.trade.quantity)
      allTargets.push({ r, shares: tp1Shares || 1 })
    }
  }

  // Add targets from the array
  targets.forEach(t => {
    if (t.price) {
      const r = parseFloat(calculateTargetR(t.price))
      if (r && !isNaN(r)) {
        allTargets.push({ r, shares: t.shares || 1 })
      }
    }
  })

  if (allTargets.length === 0) return null

  // Calculate weighted average
  const totalShares = allTargets.reduce((sum, t) => sum + t.shares, 0)
  const weightedSum = allTargets.reduce((sum, t) => sum + (t.r * t.shares), 0)
  return weightedSum / totalShares
})

const riskRewardPlanned = computed(() => {
  // Use weighted average if multiple targets exist, otherwise use analysis.target_r
  const avgR = weightedAverageR.value
  if (avgR !== null) {
    return `1:${avgR.toFixed(2)}`
  }
  const targetR = props.analysis.target_r
  if (targetR === null || targetR === undefined) return null
  return `1:${targetR.toFixed(2)}`
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
  // Get quantity from take_profit_targets if it exists (TP1 is first target)
  const tp1Target = props.trade.take_profit_targets?.[0]
  editTakeProfitQty.value = tp1Target?.shares || tp1Target?.quantity || ''
  editingTakeProfit.value = true
  error.value = null
  await nextTick()
  takeProfitInput.value?.focus()
}

function cancelEditingTakeProfit() {
  editingTakeProfit.value = false
  editTakeProfit.value = ''
  editTakeProfitQty.value = ''
  error.value = null
}

async function saveTakeProfit() {
  const tp = editTakeProfit.value ? parseFloat(editTakeProfit.value) : null
  const qty = editTakeProfitQty.value ? parseInt(editTakeProfitQty.value) : null
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

  // If quantity is provided, save as a target in take_profit_targets array
  const payload = { take_profit: tp }
  if (tp !== null && qty !== null && qty > 0) {
    payload.take_profit_targets = [{
      price: tp,
      shares: qty
    }]
  }

  await saveLevels(payload)
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

// Handle manual target hit update from TargetHitFirstIndicator
function handleTargetHitUpdated(data) {
  console.log('[TRADE-MGMT] Target hit updated:', data)
  emit('target-hit-updated', data)
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

/** Date and time using last execution time (exit_time), fallback to entry_time */
function formatDateWithTime(trade) {
  const timeStr = trade?.exit_time ?? trade?.entry_time
  if (!timeStr) return formatDate(trade?.trade_date) || '-'
  try {
    return formatDateTimeTz(timeStr)
  } catch {
    return formatDate(trade?.trade_date) || '-'
  }
}

</script>
