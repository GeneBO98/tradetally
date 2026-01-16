<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Take Profit Targets
      </h4>
      <button
        v-if="targets.length < maxTargets"
        type="button"
        @click="addTarget"
        class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Target
      </button>
    </div>

    <!-- Quick Set Buttons -->
    <div v-if="targets.length === 0" class="flex flex-wrap gap-2">
      <button
        type="button"
        @click="setQuickTargets('single')"
        class="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
      >
        Single Target
      </button>
      <button
        type="button"
        @click="setQuickTargets('equal-split')"
        class="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
      >
        Equal Split (2 TPs)
      </button>
      <button
        type="button"
        @click="setQuickTargets('pyramid')"
        class="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
      >
        Pyramid Out (3 TPs)
      </button>
    </div>

    <!-- Target List -->
    <div v-for="(target, index) in targets" :key="target.id" class="relative p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
      <!-- Target Header -->
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-900 dark:text-white">
          TP{{ index + 1 }}
        </span>
        <div class="flex items-center space-x-2">
          <!-- Status Badge -->
          <span
            v-if="target.status === 'hit'"
            class="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          >
            Hit
          </span>
          <span
            v-else-if="target.status === 'cancelled'"
            class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
          >
            Cancelled
          </span>
          <span
            v-else
            class="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400"
          >
            Pending
          </span>
          <!-- Remove Button -->
          <button
            type="button"
            @click="removeTarget(index)"
            class="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
            title="Remove target"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Target Fields -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Price -->
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Target Price
          </label>
          <div class="relative">
            <span class="absolute left-2 top-1.5 text-gray-500 dark:text-gray-400 text-sm">$</span>
            <input
              v-model="target.price"
              type="number"
              step="0.01"
              :placeholder="getTargetPlaceholder(index)"
              class="w-full pl-6 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
              @input="validateTarget(index)"
            />
          </div>
          <p v-if="target.error" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ target.error }}
          </p>
        </div>

        <!-- Quantity -->
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Quantity
          </label>
          <input
            v-model="target.quantity"
            type="number"
            step="1"
            :placeholder="`${Math.floor(tradeQuantity / targets.length)}`"
            :max="tradeQuantity"
            class="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            @input="validateQuantities"
          />
        </div>
      </div>

      <!-- Quick Set for this Target -->
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="pct in [2, 4, 6, 10]"
          :key="pct"
          type="button"
          @click="setTargetPercent(index, pct)"
          class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          +{{ pct }}%
        </button>
      </div>
    </div>

    <!-- Quantity Summary -->
    <div v-if="targets.length > 0 && tradeQuantity" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
      <span class="text-gray-600 dark:text-gray-400">
        Total Quantity Allocated:
      </span>
      <span :class="[
        'font-medium',
        quantityDifference === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
      ]">
        {{ totalAllocatedQuantity }} / {{ tradeQuantity }}
        <span v-if="quantityDifference !== 0" class="text-xs">
          ({{ quantityDifference > 0 ? '+' : '' }}{{ quantityDifference }} {{ quantityDifference > 0 ? 'over' : 'remaining' }})
        </span>
      </span>
    </div>

    <!-- R-Multiple Preview -->
    <div v-if="targets.length > 0 && stopLoss" class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
      <div class="text-xs text-primary-700 dark:text-primary-300 font-medium mb-2">R-Multiple Preview</div>
      <div class="space-y-1">
        <div v-for="(target, index) in targets" :key="target.id" class="flex justify-between text-sm">
          <span class="text-gray-600 dark:text-gray-400">TP{{ index + 1 }} (${{ formatNumber(target.price) }}):</span>
          <span class="font-medium text-primary-600 dark:text-primary-400">
            {{ calculateTargetR(target.price) }}R
          </span>
        </div>
        <div v-if="targets.length > 1" class="flex justify-between text-sm pt-2 border-t border-primary-200 dark:border-primary-700 mt-2">
          <span class="text-gray-700 dark:text-gray-300 font-medium">Weighted Avg:</span>
          <span class="font-bold text-primary-600 dark:text-primary-400">
            {{ calculateWeightedR() }}R
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// Simple unique ID generator
function generateId() {
  return 'tp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9)
}

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  stopLoss: {
    type: [Number, String],
    default: null
  },
  initialTargets: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:targets'])

const maxTargets = 5
const targets = ref([])

const entryPrice = computed(() => parseFloat(props.trade.entry_price))
const tradeQuantity = computed(() => parseFloat(props.trade.quantity) || 0)
const isLong = computed(() => props.trade.side === 'long')

const totalAllocatedQuantity = computed(() => {
  return targets.value.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)
})

const quantityDifference = computed(() => {
  return totalAllocatedQuantity.value - tradeQuantity.value
})

// Initialize with existing targets or from take_profit
watch(() => [props.initialTargets, props.trade.take_profit], () => {
  if (props.initialTargets && props.initialTargets.length > 0) {
    targets.value = props.initialTargets.map((t, i) => ({
      id: t.id || generateId(),
      price: t.price || '',
      quantity: t.quantity || '',
      order: t.order || i + 1,
      status: t.status || 'pending',
      error: ''
    }))
  } else if (props.trade.take_profit && targets.value.length === 0) {
    // If there's a single take_profit but no targets, suggest adding it
    targets.value = [{
      id: generateId(),
      price: props.trade.take_profit,
      quantity: tradeQuantity.value,
      order: 1,
      status: 'pending',
      error: ''
    }]
  }
}, { immediate: true })

// Emit changes
watch(targets, () => {
  emit('update:targets', targets.value.map(t => ({
    id: t.id,
    price: parseFloat(t.price) || null,
    quantity: parseFloat(t.quantity) || null,
    order: t.order,
    status: t.status
  })).filter(t => t.price))
}, { deep: true })

function addTarget() {
  if (targets.value.length >= maxTargets) return

  const remainingQty = tradeQuantity.value - totalAllocatedQuantity.value
  const suggestedQty = remainingQty > 0 ? remainingQty : Math.floor(tradeQuantity.value / (targets.value.length + 1))

  targets.value.push({
    id: generateId(),
    price: '',
    quantity: suggestedQty > 0 ? suggestedQty : '',
    order: targets.value.length + 1,
    status: 'pending',
    error: ''
  })
}

function removeTarget(index) {
  targets.value.splice(index, 1)
  // Update order numbers
  targets.value.forEach((t, i) => {
    t.order = i + 1
  })
}

function validateTarget(index) {
  const target = targets.value[index]
  if (!target.price) {
    target.error = ''
    return
  }

  const price = parseFloat(target.price)

  if (isLong.value && price <= entryPrice.value) {
    target.error = 'Must be above entry price'
  } else if (!isLong.value && price >= entryPrice.value) {
    target.error = 'Must be below entry price'
  } else {
    target.error = ''
  }
}

function validateQuantities() {
  // Just for UI feedback - actual validation happens in backend
}

function getTargetPlaceholder(index) {
  const multiplier = isLong.value ? 1 + (0.02 * (index + 1)) : 1 - (0.02 * (index + 1))
  return (entryPrice.value * multiplier).toFixed(2)
}

function setTargetPercent(index, pct) {
  const multiplier = isLong.value ? 1 + (pct / 100) : 1 - (pct / 100)
  targets.value[index].price = (entryPrice.value * multiplier).toFixed(2)
  validateTarget(index)
}

function setQuickTargets(preset) {
  const qty = tradeQuantity.value

  switch (preset) {
    case 'single':
      targets.value = [{
        id: generateId(),
        price: '',
        quantity: qty,
        order: 1,
        status: 'pending',
        error: ''
      }]
      break

    case 'equal-split':
      targets.value = [
        {
          id: generateId(),
          price: (entryPrice.value * (isLong.value ? 1.03 : 0.97)).toFixed(2),
          quantity: Math.ceil(qty / 2),
          order: 1,
          status: 'pending',
          error: ''
        },
        {
          id: generateId(),
          price: (entryPrice.value * (isLong.value ? 1.06 : 0.94)).toFixed(2),
          quantity: Math.floor(qty / 2),
          order: 2,
          status: 'pending',
          error: ''
        }
      ]
      break

    case 'pyramid':
      targets.value = [
        {
          id: generateId(),
          price: (entryPrice.value * (isLong.value ? 1.02 : 0.98)).toFixed(2),
          quantity: Math.ceil(qty * 0.5),
          order: 1,
          status: 'pending',
          error: ''
        },
        {
          id: generateId(),
          price: (entryPrice.value * (isLong.value ? 1.04 : 0.96)).toFixed(2),
          quantity: Math.ceil(qty * 0.3),
          order: 2,
          status: 'pending',
          error: ''
        },
        {
          id: generateId(),
          price: (entryPrice.value * (isLong.value ? 1.06 : 0.94)).toFixed(2),
          quantity: qty - Math.ceil(qty * 0.5) - Math.ceil(qty * 0.3),
          order: 3,
          status: 'pending',
          error: ''
        }
      ]
      break
  }

  targets.value.forEach((_, i) => validateTarget(i))
}

function calculateTargetR(price) {
  if (!price || !props.stopLoss) return '-'

  const tp = parseFloat(price)
  const sl = parseFloat(props.stopLoss)
  const entry = entryPrice.value

  const risk = isLong.value ? entry - sl : sl - entry
  if (risk <= 0) return '-'

  const reward = isLong.value ? tp - entry : entry - tp
  const r = reward / risk

  return r.toFixed(2)
}

function calculateWeightedR() {
  if (!props.stopLoss || targets.value.length === 0) return '-'

  let totalWeight = 0
  let weightedSum = 0

  for (const target of targets.value) {
    const qty = parseFloat(target.quantity) || 0
    const rValue = parseFloat(calculateTargetR(target.price)) || 0

    if (qty > 0 && rValue) {
      weightedSum += rValue * qty
      totalWeight += qty
    }
  }

  if (totalWeight === 0) return '-'
  return (weightedSum / totalWeight).toFixed(2)
}

function formatNumber(value) {
  if (!value) return '-'
  return parseFloat(value).toFixed(2)
}
</script>
