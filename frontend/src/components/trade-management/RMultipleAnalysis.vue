<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">R-Multiple Analysis</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Compare actual performance vs potential based on your risk parameters
      </p>
    </div>

    <div class="p-6">
      <!-- R-Multiple Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <!-- Actual R -->
        <div class="p-4 rounded-lg" :class="getActualRClass">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Actual R</div>
          <div class="text-3xl font-bold" :class="analysis.actual_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ formatR(analysis.actual_r) }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ analysis.actual_r >= 0 ? 'Profit' : 'Loss' }} of {{ formatCurrency(analysis.actual_pl_amount) }}
          </div>
        </div>

        <!-- Target R -->
        <div v-if="effectiveTargetR !== null" class="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            Target R
            <span v-if="weightedAverageR !== null" class="text-xs font-normal">(weighted avg)</span>
          </div>
          <div class="text-3xl font-bold text-primary-600 dark:text-primary-400">
            {{ formatR(effectiveTargetR) }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Potential: {{ formatCurrency(effectivePotentialPL) }}
          </div>
        </div>
        <div v-else class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Target R</div>
          <div class="text-2xl font-medium text-gray-400 dark:text-gray-500">
            Not Set
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Set take profit to see target R
          </div>
        </div>

        <!-- R Lost/Gained -->
        <div v-if="effectiveRLost !== null" class="p-4 rounded-lg" :class="getRLostClass">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            {{ effectiveRLost > 0 ? 'R Left on Table' : 'R Exceeded' }}
          </div>
          <div class="text-3xl font-bold" :class="effectiveRLost > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'">
            {{ formatR(Math.abs(effectiveRLost)) }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ getRLostDescription }}
          </div>
        </div>
        <div v-else class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">R Comparison</div>
          <div class="text-2xl font-medium text-gray-400 dark:text-gray-500">
            N/A
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-500 mt-1">
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

// Effective target R (weighted avg if available, otherwise analysis.target_r)
const effectiveTargetR = computed(() => {
  if (weightedAverageR.value !== null) {
    return Math.round(weightedAverageR.value * 100) / 100
  }
  return props.analysis.target_r
})

// Effective potential P&L (recalculated if using weighted avg)
const effectivePotentialPL = computed(() => {
  if (weightedAverageR.value !== null && props.analysis.risk_amount) {
    return Math.round(weightedAverageR.value * props.analysis.risk_amount * 100) / 100
  }
  return props.analysis.target_pl_amount
})

// Effective R lost (recalculated if using weighted avg)
const effectiveRLost = computed(() => {
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
  return 'bg-green-50 dark:bg-green-900/20'
})

const getRLostDescription = computed(() => {
  const rLost = effectiveRLost.value
  if (rLost === null) return ''
  if (rLost > 0) {
    return 'Exited before reaching target'
  }
  return 'Exceeded target - excellent management!'
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

  switch (score) {
    case 'exceeded':
      return `You captured ${formatR(actualR)} vs your ${formatR(targetR)} target - you let your winner run!`
    case 'near_target':
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
      return `Stopped out at planned risk level - this is proper risk management.`
    case 'loss':
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
