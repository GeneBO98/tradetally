<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">R-Multiple Analysis</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Compare actual performance vs potential based on your risk parameters
      </p>
    </div>

    <div class="p-6">
      <!-- R-Multiple Cards: equal height, aligned content -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <!-- Actual R -->
        <div class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 rounded-lg" :class="getActualRClass">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0 truncate">Actual R (Net)</div>
          <div class="text-xl sm:text-2xl md:text-3xl font-bold truncate" :class="analysis.actual_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ formatR(analysis.actual_r) }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate shrink-0">
            {{ analysis.actual_r >= 0 ? 'Profit' : 'Loss' }} of {{ formatCurrency(analysis.actual_pl_amount) }}
          </div>
        </div>

        <!-- Target R -->
        <div v-if="effectiveTargetR !== null" class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0 truncate">
            Target R (Net)
            <span v-if="weightedAverageR !== null" class="text-xs font-normal">(weighted avg)</span>
          </div>
          <div class="text-xl sm:text-2xl md:text-3xl font-bold truncate text-primary-600 dark:text-primary-400">
            {{ formatR(effectiveTargetR) }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate shrink-0">
            Potential: {{ formatCurrency(effectivePotentialPL) }}
          </div>
        </div>
        <div v-else class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0">Target R (Net)</div>
          <div class="text-xl sm:text-2xl font-medium text-gray-400 dark:text-gray-500 truncate">
            Not Set
          </div>
          <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-500 mt-1 shrink-0">
            Set take profit to see target R
          </div>
        </div>

        <!-- Management R (when target hit analysis is set) -->
        <div v-if="analysis.management_r !== null && analysis.management_r !== undefined" class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 rounded-lg" :class="getManagementRClass">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0 truncate">
            Management Impact
          </div>
          <div class="text-xl sm:text-2xl md:text-3xl font-bold truncate" :class="getManagementRTextClass">
            {{ formatR(analysis.management_r) }}
          </div>
          <div v-if="analysis.management_r !== 0" class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate shrink-0">
            {{ getManagementRDescription }}
          </div>
        </div>
        <!-- R Lost/Gained (when no target hit analysis) -->
        <div v-else-if="effectiveRLost !== null" class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 rounded-lg" :class="getRLostClass">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0 truncate">
            {{ effectiveRLost > 0 ? 'R Left on Table' : (effectiveRLost === 0 ? 'Target Hit' : 'R Exceeded') }}
          </div>
          <div class="text-xl sm:text-2xl md:text-3xl font-bold truncate" :class="getRLostTextClass">
            {{ formatR(Math.abs(effectiveRLost)) }}
          </div>
          <div class="text-xs sm:text-sm truncate shrink-0" :class="effectiveRLost === 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'" v-if="getRLostDescription">
            {{ getRLostDescription }}
          </div>
        </div>
        <div v-else class="r-multiple-card flex flex-col min-h-[5rem] p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5 shrink-0">R Comparison</div>
          <div class="text-xl sm:text-2xl font-medium text-gray-400 dark:text-gray-500 truncate">
            N/A
          </div>
          <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-500 mt-1 shrink-0">
            Requires take profit target
          </div>
        </div>
      </div>

      <!-- Visual Bar Comparison -->
      <div v-if="effectiveTargetR !== null" class="mb-6">
        <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Performance vs Target</div>
        <div class="relative h-8 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <!-- Target bar (background) -->
          <div
            class="absolute h-full bg-primary-200 dark:bg-primary-800/50 rounded-full"
            :style="{ width: `${Math.min(100, (effectiveTargetR / maxR) * 100)}%` }"
          ></div>
          <!-- Actual bar (foreground) -->
          <div
            class="absolute h-full rounded-full transition-all duration-500"
            :class="analysis.actual_r >= 0 ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-red-500 dark:bg-red-600'"
            :style="{ width: `${Math.min(100, Math.max(0, (analysis.actual_r / maxR) * 100))}%` }"
          ></div>
          <!-- Labels -->
          <div class="absolute inset-0 flex items-center justify-between px-4">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
              Actual: {{ formatR(analysis.actual_r) }}
            </span>
            <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
              Target: {{ formatR(effectiveTargetR) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Management Assessment -->
      <div class="p-4 rounded-lg" :class="getAssessmentClass">
        <div class="flex items-center">
          <div class="flex-shrink-0 mr-3">
            <svg v-if="analysis.management_score.color === 'green'" class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else-if="analysis.management_score.color === 'yellow'" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <svg v-else class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div class="font-medium" :class="getAssessmentTextClass">
              {{ analysis.management_score.label }}
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              {{ getAssessmentDescription }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  analysis: {
    type: Object,
    required: true
  },
  trade: {
    type: Object,
    default: null
  }
})

// Calculate R for a given take profit price
function calculateTargetR(tpPrice) {
  if (!tpPrice || !props.trade?.stop_loss || !props.trade?.entry_price) return null

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
  return reward / risk
}

// Calculate weighted average R from all TP targets
const weightedAverageR = computed(() => {
  if (!props.trade) return null

  const targets = props.trade.take_profit_targets || []
  const primaryTp = props.trade.take_profit

  // If no additional targets, return null (use analysis.target_r)
  if (targets.length === 0) return null

  // Collect all targets with their R values and quantities
  const allTargets = []

  // Add primary TP as TP1 if it exists
  if (primaryTp) {
    const r = calculateTargetR(primaryTp)
    if (r && !isNaN(r)) {
      const additionalShares = targets.reduce((sum, t) => sum + (t.shares || 0), 0)
      const tp1Shares = additionalShares > 0 ? Math.max(0, parseFloat(props.trade.quantity) - additionalShares) : parseFloat(props.trade.quantity)
      allTargets.push({ r, shares: tp1Shares || 1 })
    }
  }

  // Add additional targets
  targets.forEach(t => {
    if (t.price) {
      const r = calculateTargetR(t.price)
      if (r && !isNaN(r)) {
        allTargets.push({ r, shares: t.shares || 1 })
      }
    }
  })

  if (allTargets.length <= 1) return null // Only primary TP, no weighted avg needed

  // Calculate weighted average
  const totalShares = allTargets.reduce((sum, t) => sum + t.shares, 0)
  const weightedSum = allTargets.reduce((sum, t) => sum + (t.r * t.shares), 0)
  return weightedSum / totalShares
})

// Effective target R (prefer backend weighted_target_r, then frontend calculation, then single target_r)
const effectiveTargetR = computed(() => {
  // First prefer backend-calculated weighted average
  if (props.analysis.weighted_target_r !== null && props.analysis.weighted_target_r !== undefined) {
    return props.analysis.weighted_target_r
  }
  // Then try frontend-calculated weighted average
  if (weightedAverageR.value !== null) {
    return Math.round(weightedAverageR.value * 100) / 100
  }
  // Fall back to single target R
  return props.analysis.target_r
})

// Effective potential P&L - prefer backend's direct calculation
// Backend now calculates target_pl_amount as sum of net profits at each TP level
const effectivePotentialPL = computed(() => {
  // Prefer target_pl_amount from backend (direct calculation is more accurate for multiple targets)
  if (props.analysis.target_pl_amount !== null && props.analysis.target_pl_amount !== undefined) {
    return props.analysis.target_pl_amount
  }

  // Fallback to ratio-based formula if target_pl_amount not available
  const actualR = props.analysis.actual_r
  const actualPL = props.analysis.actual_pl_amount
  const targetR = effectiveTargetR.value

  if (targetR !== null && actualR !== null && actualR !== 0 && actualPL !== null) {
    const perR = actualPL / actualR
    return Math.round(perR * targetR * 100) / 100
  }

  return null
})

// Effective R lost (prefer backend calculation, then frontend)
const effectiveRLost = computed(() => {
  // Prefer backend-calculated effective R lost
  if (props.analysis.effective_r_lost !== null && props.analysis.effective_r_lost !== undefined) {
    return props.analysis.effective_r_lost
  }
  if (effectiveTargetR.value === null) return null
  return Math.round((effectiveTargetR.value - props.analysis.actual_r) * 100) / 100
})

const maxR = computed(() => {
  const values = [
    Math.abs(props.analysis.actual_r || 0),
    Math.abs(effectiveTargetR.value || 0),
    3 // Minimum scale of 3R
  ]
  return Math.max(...values) * 1.1 // Slightly beyond max for padding
})

const getActualRClass = computed(() => {
  if (props.analysis.actual_r >= 0) {
    return 'bg-green-50 dark:bg-green-900/20'
  }
  return 'bg-red-50 dark:bg-red-900/20'
})

const getRLostClass = computed(() => {
  if (effectiveRLost.value > 0) {
    return 'bg-yellow-50 dark:bg-yellow-900/20'
  }
  if (effectiveRLost.value === 0) {
    return 'bg-yellow-50 dark:bg-yellow-900/20'
  }
  return 'bg-green-50 dark:bg-green-900/20'
})

const getRLostTextClass = computed(() => {
  if (effectiveRLost.value > 0) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  if (effectiveRLost.value === 0) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-green-600 dark:text-green-400'
})

const getRLostDescription = computed(() => {
  const rLost = effectiveRLost.value
  if (rLost === null) return ''
  if (rLost > 0) {
    return 'Exited before reaching target'
  }
  if (rLost === 0) {
    return 'You stuck to your plans'
  }
  return 'Exceeded target - excellent management!'
})

// Management R styling and description (based on target hit analysis)
const getManagementRClass = computed(() => {
  const mgmtR = props.analysis.management_r
  if (mgmtR > 0) {
    return 'bg-green-50 dark:bg-green-900/20'
  }
  // 0 or negative gets yellow/orange background
  return 'bg-yellow-50 dark:bg-yellow-900/20'
})

const getManagementRTextClass = computed(() => {
  const mgmtR = props.analysis.management_r
  if (mgmtR > 0) {
    return 'text-green-600 dark:text-green-400'
  }
  // 0 or negative gets yellow/orange text
  return 'text-yellow-600 dark:text-yellow-400'
})

const getManagementRDescription = computed(() => {
  const mgmtR = props.analysis.management_r
  if (mgmtR === null || mgmtR === undefined) return ''

  // Check if SL or TP was hit first based on the trade data
  const targetHitFirst = props.trade?.manual_target_hit_first

  if (targetHitFirst === 'stop_loss') {
    // SL hit first means management saved them from -1R
    if (mgmtR > 0) {
      return `Management saved ${formatR(mgmtR)} by moving SL`
    }
    return 'SL was hit first - management reduced losses'
  } else if (targetHitFirst === 'take_profit') {
    // TP hit first
    if (mgmtR >= 0) {
      return 'Exceeded target despite management'
    }
    return `Left ${formatR(Math.abs(mgmtR))} on table by trailing too soon`
  }

  return mgmtR >= 0 ? 'Positive management impact' : 'Left R on table'
})

const getAssessmentClass = computed(() => {
  const color = props.analysis.management_score?.color
  switch (color) {
    case 'green':
      return 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
    case 'yellow':
      return 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
    case 'red':
      return 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
    default:
      return 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
  }
})

const getAssessmentTextClass = computed(() => {
  const color = props.analysis.management_score?.color
  switch (color) {
    case 'green':
      return 'text-green-800 dark:text-green-200'
    case 'yellow':
      return 'text-yellow-800 dark:text-yellow-200'
    case 'red':
      return 'text-red-800 dark:text-red-200'
    default:
      return 'text-gray-800 dark:text-gray-200'
  }
})

const getAssessmentDescription = computed(() => {
  const score = props.analysis.management_score?.score
  const actualR = props.analysis.actual_r
  const targetR = effectiveTargetR.value
  const targetHitFirst = props.trade?.manual_target_hit_first

  // Check if they hit exactly their target (within small tolerance for floating point)
  const hitExactTarget = targetR !== null && Math.abs(actualR - targetR) < 0.01
  // Check if they hit exactly their stop loss (-1R)
  const hitExactStopLoss = Math.abs(actualR - (-1)) < 0.01
  // Check if they took a loss but less than planned risk (between -1R and 0)
  const reducedLoss = actualR < 0 && actualR > -1

  // When TP hit first is selected, use TP-specific messages
  if (targetHitFirst === 'take_profit') {
    if (actualR >= targetR && targetR !== null) {
      return `You captured ${formatR(actualR)} vs your ${formatR(targetR)} target - excellent execution!`
    }
    if (actualR > 0 && targetR !== null) {
      return `You exited at ${formatR(actualR)} before reaching your ${formatR(targetR)} target.`
    }
    if (actualR === 0) {
      return `Trade closed at breakeven despite TP being hit first.`
    }
    // Loss with TP hit first - they trailed too tight or exited early after TP1
    if (targetR !== null) {
      return `Trade reversed to ${formatR(actualR)} after TP was hit - consider locking in profits.`
    }
    return `Trade ended at ${formatR(actualR)} after initial target area was reached.`
  }

  // When SL hit first is selected, use SL-specific messages
  if (targetHitFirst === 'stop_loss') {
    if (hitExactStopLoss) {
      return `You hit your stop loss exactly at -1R - you stuck to your plans.`
    }
    if (reducedLoss) {
      return `You reduced your planned loss by exiting at ${formatR(actualR)} instead of -1R.`
    }
    if (actualR > 0) {
      return `You managed to exit with ${formatR(actualR)} profit despite SL being hit first.`
    }
    return `SL was hit first - loss of ${formatR(actualR)}.`
  }

  // Default behavior when no target hit analysis is set
  switch (score) {
    case 'exceeded':
      if (hitExactTarget) {
        return `You hit your ${formatR(targetR)} target exactly - you stuck to your plans.`
      }
      return `You captured ${formatR(actualR)} vs your ${formatR(targetR)} target - you let your winner run!`
    case 'near_target':
      if (hitExactTarget) {
        return `You hit your ${formatR(targetR)} target exactly - you stuck to your plans.`
      }
      return `You captured most of your target R - solid trade management.`
    case 'partial':
      return `You captured about half of your target R - consider letting winners run longer.`
    case 'early_exit':
      return `You exited early with a small profit - work on holding to target.`
    case 'excellent':
      return `Great R-Multiple achieved without a defined target.`
    case 'good':
      return `Solid profit relative to risk taken.`
    case 'breakeven':
      return `Trade closed at breakeven - no damage, no gain.`
    case 'stopped_out':
      if (hitExactStopLoss) {
        return `You hit your stop loss exactly at -1R - you stuck to your plans.`
      }
      if (reducedLoss) {
        return `You reduced your planned loss by exiting at ${formatR(actualR)} instead of -1R.`
      }
      return `Stopped out at planned risk level - this is proper risk management.`
    case 'loss':
      if (hitExactStopLoss) {
        return `You hit your stop loss exactly at -1R - you stuck to your plans.`
      }
      if (reducedLoss) {
        return `You reduced your planned loss by exiting at ${formatR(actualR)} instead of -1R.`
      }
      return `Loss exceeded planned risk - review your stop loss placement.`
    default:
      return `Trade management analysis complete.`
  }
})

function formatR(value) {
  if (value === null || value === undefined) return '-'
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}R`
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  const prefix = num >= 0 ? '+' : ''
  return `${prefix}${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Math.abs(num))}`
}
</script>
