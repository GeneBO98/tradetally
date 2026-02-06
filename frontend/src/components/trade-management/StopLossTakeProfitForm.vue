<template>
  <div class="mt-6 bg-white dark:bg-gray-800 shadow-sm rounded-lg">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">
        Set Risk Levels for {{ trade.symbol }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Stop loss is required for R-Multiple analysis. Take profit is optional but recommended.
      </p>
    </div>

    <div class="p-6">
      <!-- Trade Info Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Entry Price</div>
          <div class="text-lg font-medium text-gray-900 dark:text-white">
            {{ formatPrice(trade.entry_price) }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Exit Price</div>
          <div class="text-lg font-medium text-gray-900 dark:text-white">
            {{ formatPrice(trade.exit_price) }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Side</div>
          <div
            :class="[
              'text-lg font-medium capitalize',
              trade.side === 'long' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            ]"
          >
            {{ trade.side }}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">P&L</div>
          <div
            :class="[
              'text-lg font-medium',
              parseFloat(trade.pnl) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            ]"
          >
            {{ formatCurrency(trade.pnl) }}
          </div>
        </div>
      </div>

      <!-- Form Fields -->
      <form @submit.prevent="saveLevels" class="space-y-4">
        <!-- Stop Loss -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Stop Loss Price
            <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <span class="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
            <input
              v-model="stopLoss"
              type="number"
              step="0.01"
              required
              :placeholder="stopLossPlaceholder"
              class="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ trade.side === 'long' ? 'Must be below entry price' : 'Must be above entry price' }}
          </p>
          <p v-if="stopLossError" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ stopLossError }}
          </p>
        </div>

        <!-- Take Profit Mode Toggle -->
        <div class="flex items-center space-x-4 mb-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Take Profit Mode:</span>
          <button
            type="button"
            @click="useMultipleTargets = false"
            :class="[
              'px-3 py-1 text-sm rounded',
              !useMultipleTargets
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            ]"
          >
            Single
          </button>
          <button
            type="button"
            @click="useMultipleTargets = true"
            :class="[
              'px-3 py-1 text-sm rounded',
              useMultipleTargets
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            ]"
          >
            Multiple Targets
          </button>
        </div>

        <!-- Single Take Profit -->
        <div v-if="!useMultipleTargets">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Take Profit Price
            <span class="text-gray-400">(optional)</span>
          </label>
          <div class="relative">
            <span class="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
            <input
              v-model="takeProfit"
              type="number"
              step="0.01"
              :placeholder="takeProfitPlaceholder"
              class="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ trade.side === 'long' ? 'Must be above entry price' : 'Must be below entry price' }}
          </p>
          <p v-if="takeProfitError" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ takeProfitError }}
          </p>
        </div>

        <!-- Multiple Take Profit Targets -->
        <TakeProfitTargetsForm
          v-else
          :trade="trade"
          :stop-loss="stopLoss"
          :initial-targets="trade.take_profit_targets || []"
          @update:targets="takeProfitTargets = $event"
        />

        <!-- Quick Set Buttons -->
        <div class="pt-2">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick set stop loss:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="pct in [1, 2, 3, 5]"
              :key="pct"
              type="button"
              @click="setStopLossPercent(pct)"
              class="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {{ pct }}% risk
            </button>
          </div>
        </div>

        <!-- API Error -->
        <div v-if="apiError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p class="text-sm text-red-700 dark:text-red-300">{{ apiError }}</p>
        </div>

        <!-- Actions -->
        <div class="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            @click="$emit('cancel')"
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="localSaving || !isValid"
            class="btn-primary"
          >
            <span v-if="localSaving">Saving...</span>
            <span v-else>Save & Analyze</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import TakeProfitTargetsForm from './TakeProfitTargetsForm.vue'

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['levels-saved', 'cancel'])

const stopLoss = ref(props.trade.stop_loss || '')
const takeProfit = ref(props.trade.take_profit || '')
const takeProfitTargets = ref([])
const useMultipleTargets = ref(
  props.trade.take_profit_targets && props.trade.take_profit_targets.length > 0
)
const localSaving = ref(false)
const apiError = ref('')

const entryPrice = computed(() => parseFloat(props.trade.entry_price))

const stopLossPlaceholder = computed(() => {
  if (props.trade.side === 'long') {
    return `e.g., ${(entryPrice.value * 0.98).toFixed(2)} (2% below entry)`
  }
  return `e.g., ${(entryPrice.value * 1.02).toFixed(2)} (2% above entry)`
})

const takeProfitPlaceholder = computed(() => {
  if (props.trade.side === 'long') {
    return `e.g., ${(entryPrice.value * 1.06).toFixed(2)} (6% above entry)`
  }
  return `e.g., ${(entryPrice.value * 0.94).toFixed(2)} (6% below entry)`
})

const stopLossError = computed(() => {
  if (!stopLoss.value) return ''
  const sl = parseFloat(stopLoss.value)
  if (props.trade.side === 'long' && sl >= entryPrice.value) {
    return 'Stop loss must be below entry price for long trades'
  }
  if (props.trade.side === 'short' && sl <= entryPrice.value) {
    return 'Stop loss must be above entry price for short trades'
  }
  return ''
})

const takeProfitError = computed(() => {
  if (!takeProfit.value) return ''
  const tp = parseFloat(takeProfit.value)
  if (props.trade.side === 'long' && tp <= entryPrice.value) {
    return 'Take profit must be above entry price for long trades'
  }
  if (props.trade.side === 'short' && tp >= entryPrice.value) {
    return 'Take profit must be below entry price for short trades'
  }
  return ''
})

const isValid = computed(() => {
  return stopLoss.value && !stopLossError.value && !takeProfitError.value
})

function setStopLossPercent(pct) {
  const risk = entryPrice.value * (pct / 100)
  if (props.trade.side === 'long') {
    stopLoss.value = (entryPrice.value - risk).toFixed(2)
  } else {
    stopLoss.value = (entryPrice.value + risk).toFixed(2)
  }
}

async function saveLevels() {
  if (!isValid.value) return

  localSaving.value = true
  apiError.value = ''

  try {
    const payload = {
      stop_loss: parseFloat(stopLoss.value)
    }

    // Add either single take profit or multiple targets
    if (useMultipleTargets.value && takeProfitTargets.value.length > 0) {
      payload.take_profit_targets = takeProfitTargets.value
      // Also set take_profit to first target for backwards compatibility
      if (takeProfitTargets.value[0]?.price) {
        payload.take_profit = takeProfitTargets.value[0].price
      }
    } else {
      payload.take_profit = takeProfit.value ? parseFloat(takeProfit.value) : null
    }

    const response = await api.patch(`/trade-management/trades/${props.trade.id}/levels`, payload)

    emit('levels-saved', response.data.trade)
  } catch (err) {
    apiError.value = err.response?.data?.error || 'Failed to save levels'
    console.error('Error saving levels:', err)
  } finally {
    localSaving.value = false
  }
}

function formatPrice(value) {
  if (!value) return '-'
  return parseFloat(value).toFixed(2)
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

// Reset form when trade changes
watch(() => props.trade.id, () => {
  stopLoss.value = props.trade.stop_loss || ''
  takeProfit.value = props.trade.take_profit || ''
  apiError.value = ''
})
</script>
