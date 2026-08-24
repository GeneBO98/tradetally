<template>
  <div v-if="open" class="fixed inset-0 z-50 overflow-y-auto" @keydown.esc="emit('close')">
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="fixed inset-0 bg-gray-900/60" aria-hidden="true" @click="emit('close')"></div>

      <section class="relative w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800" role="dialog" aria-modal="true" aria-labelledby="allocation-title">
        <header class="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-gray-700">
          <div>
            <h2 id="allocation-title" class="text-lg font-semibold text-gray-900 dark:text-white">
              Allocate {{ trade?.symbol || 'trade' }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Divide this trade without changing its tags or brokerage record.
            </p>
          </div>
          <button type="button" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200" aria-label="Close" @click="emit('close')">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </header>

        <div class="px-6 py-5">
          <div v-if="loading" class="flex justify-center py-12">
            <div class="h-9 w-9 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
          </div>

          <template v-else>
            <div v-if="groups.length < 2" class="rounded-lg border border-gray-200 bg-gray-50 p-5 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <p class="text-sm font-medium text-gray-900 dark:text-white">Two allocation groups are required</p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Create groups in Trading settings, then return to this trade.</p>
              <router-link to="/settings" class="btn-primary mt-4 inline-flex" @click="emit('close')">Open settings</router-link>
            </div>

            <template v-else>
              <div class="flex flex-col gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Allocation basis</div>
                  <div class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {{ formatQuantity(basisQuantity) }} {{ quantityLabel }}
                    <span v-if="tradePnl !== null" class="font-normal text-gray-500 dark:text-gray-400"> · {{ formatMoney(tradePnl) }} P&amp;L</span>
                  </div>
                </div>
                <div class="inline-flex rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-800" role="group" aria-label="Allocation input method">
                  <button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium" :class="mode === 'percentage' ? selectedModeClass : unselectedModeClass" @click="changeMode('percentage')">Percentage</button>
                  <button type="button" class="rounded-md px-3 py-1.5 text-sm font-medium" :class="mode === 'quantity' ? selectedModeClass : unselectedModeClass" @click="changeMode('quantity')">Quantity</button>
                </div>
              </div>

              <div class="mt-5 space-y-3">
                <div v-for="(row, index) in rows" :key="row.key" class="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
                  <div>
                    <label :for="`allocation-group-${index}`" class="label">Group</label>
                    <select :id="`allocation-group-${index}`" v-model="row.allocation_group_id" class="input">
                      <option value="" disabled>Select a group</option>
                      <option v-for="group in availableGroups(row.allocation_group_id)" :key="group.id" :value="group.id">{{ group.name }}</option>
                    </select>
                  </div>
                  <div>
                    <label :for="`allocation-value-${index}`" class="label">{{ mode === 'percentage' ? 'Percentage' : 'Quantity' }}</label>
                    <div class="relative">
                      <input
                        :id="`allocation-value-${index}`"
                        v-model.number="row.value"
                        type="number"
                        min="0"
                        :max="mode === 'percentage' ? 100 : basisQuantity"
                        :step="mode === 'percentage' ? 0.01 : quantityStep"
                        class="input pr-9"
                      />
                      <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-500 dark:text-gray-400">{{ mode === 'percentage' ? '%' : '' }}</span>
                    </div>
                    <p v-if="tradePnl !== null" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ formatMoney(previewPnl(row)) }}</p>
                  </div>
                  <button type="button" class="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700 dark:hover:text-red-400" :disabled="rows.length <= 2" aria-label="Remove allocation" @click="removeRow(index)">
                    <TrashIcon class="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button v-if="rows.length < groups.length" type="button" class="btn-secondary inline-flex items-center gap-2" @click="addRow">
                  <PlusIcon class="h-4 w-4" /> Add group
                </button>
                <div class="ml-auto flex items-center gap-3 text-sm">
                  <span :class="Math.abs(remaining) <= tolerance ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'">
                    {{ formatRemaining() }} remaining
                  </span>
                  <button v-if="Math.abs(remaining) > tolerance" type="button" class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400" @click="fillRemaining">Use remainder</button>
                </div>
              </div>

              <p class="mt-5 rounded-md bg-primary-50 px-4 py-3 text-sm leading-relaxed text-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                All entries, exits, commissions, fees, and P&amp;L follow this same proportional split. This version does not perform tax-lot or beneficiary accounting.
              </p>

              <div v-if="error" class="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{{ error }}</div>
            </template>
          </template>
        </div>

        <footer v-if="!loading && groups.length >= 2" class="flex flex-col-reverse gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700 sm:flex-row sm:justify-between">
          <button v-if="hasExisting" type="button" class="rounded-md px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" :disabled="saving" @click="clearAllocation">Clear allocation</button>
          <div v-else></div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
            <button type="button" class="btn-primary" :disabled="saving || !canSave" @click="saveAllocation">{{ saving ? 'Saving...' : 'Save allocation' }}</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const props = defineProps({
  open: { type: Boolean, default: false },
  trade: { type: Object, default: null },
  groups: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const mode = ref('percentage')
const basisQuantity = ref(0)
const rows = ref([])
const hasExisting = ref(false)
let rowCounter = 0

const selectedModeClass = 'bg-primary-600 text-white shadow-sm'
const unselectedModeClass = 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
const tolerance = computed(() => mode.value === 'percentage' ? 0.01 : Math.max(0.000001, basisQuantity.value * 0.000001))
const targetTotal = computed(() => mode.value === 'percentage' ? 100 : basisQuantity.value)
const currentTotal = computed(() => rows.value.reduce((sum, row) => sum + (Number(row.value) || 0), 0))
const remaining = computed(() => targetTotal.value - currentTotal.value)
const tradePnl = computed(() => {
  const parsed = Number(props.trade?.pnl)
  return Number.isFinite(parsed) ? parsed : null
})
const quantityStep = computed(() => {
  const instrument = props.trade?.instrument_type ?? props.trade?.instrumentType
  return instrument === 'stock' || instrument === 'crypto' ? 0.0001 : 1
})
const quantityLabel = computed(() => {
  const instrument = props.trade?.instrument_type ?? props.trade?.instrumentType
  return instrument === 'option' || instrument === 'future' ? 'contracts' : 'shares'
})
const canSave = computed(() => {
  if (rows.value.length < 2 || Math.abs(remaining.value) > tolerance.value) return false
  const ids = rows.value.map((row) => row.allocation_group_id)
  return ids.every(Boolean) && new Set(ids).size === ids.length && rows.value.every((row) => Number(row.value) > 0)
})

function makeRow(groupId = '', value = 0) {
  rowCounter += 1
  return { key: rowCounter, allocation_group_id: groupId, value }
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function formatMoney(value) {
  const requestedCurrency = String(props.trade?.original_currency ?? props.trade?.originalCurrency ?? 'USD').toUpperCase()
  const currency = /^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : 'USD'
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 })
}

function rowRatio(row) {
  const value = Number(row.value) || 0
  if (mode.value === 'percentage') return value / 100
  return basisQuantity.value > 0 ? value / basisQuantity.value : 0
}

function previewPnl(row) {
  return (tradePnl.value || 0) * rowRatio(row)
}

function formatRemaining() {
  return mode.value === 'percentage' ? `${remaining.value.toFixed(2)}%` : formatQuantity(remaining.value)
}

function availableGroups(currentId) {
  const used = new Set(rows.value.map((row) => row.allocation_group_id).filter((id) => id && id !== currentId))
  return props.groups.filter((group) => !used.has(group.id))
}

function changeMode(nextMode) {
  if (nextMode === mode.value) return
  if (nextMode === 'quantity') {
    rows.value.forEach((row) => { row.value = Number(((Number(row.value) || 0) / 100 * basisQuantity.value).toFixed(8)) })
  } else {
    rows.value.forEach((row) => { row.value = basisQuantity.value > 0 ? Number(((Number(row.value) || 0) / basisQuantity.value * 100).toFixed(6)) : 0 })
  }
  mode.value = nextMode
}

function addRow() {
  const available = availableGroups('')
  rows.value.push(makeRow(available[0]?.id || '', Math.max(0, remaining.value)))
}

function removeRow(index) {
  if (rows.value.length <= 2) return
  rows.value.splice(index, 1)
}

function fillRemaining() {
  if (rows.value.length === 0) return
  const last = rows.value[rows.value.length - 1]
  last.value = Math.max(0, (Number(last.value) || 0) + remaining.value)
}

async function loadAllocation() {
  if (!props.open || !props.trade?.id) return
  loading.value = true
  error.value = ''
  try {
    const response = await api.get(`/trade-allocations/trades/${props.trade.id}`)
    basisQuantity.value = Number(response.data.basis_quantity) || Math.abs(Number(props.trade.quantity) || 0)
    const allocations = response.data.allocations || []
    hasExisting.value = allocations.length > 0
    mode.value = allocations[0]?.input_method === 'quantity' ? 'quantity' : 'percentage'
    if (allocations.length > 0) {
      rows.value = allocations.map((allocation) => {
        const ratio = Number(allocation.allocation_ratio) || 0
        const value = mode.value === 'quantity' ? ratio * basisQuantity.value : ratio * 100
        return makeRow(allocation.allocation_group_id, Number(value.toFixed(8)))
      })
    } else {
      const first = props.groups[0]?.id || ''
      const second = props.groups[1]?.id || ''
      rows.value = [makeRow(first, 50), makeRow(second, 50)]
      mode.value = 'percentage'
    }
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to load this trade allocation'
  } finally {
    loading.value = false
  }
}

async function saveAllocation() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const allocations = rows.value.map((row) => ({
      allocation_group_id: row.allocation_group_id,
      allocation_ratio: rowRatio(row),
      input_method: mode.value
    }))
    const response = await api.put(`/trade-allocations/trades/${props.trade.id}`, { allocations })
    emit('saved', response.data)
    emit('close')
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to save this trade allocation'
  } finally {
    saving.value = false
  }
}

async function clearAllocation() {
  if (!window.confirm('Clear this trade allocation? The trade and its tags will not be changed.')) return
  saving.value = true
  error.value = ''
  try {
    await api.delete(`/trade-allocations/trades/${props.trade.id}`)
    emit('saved', { trade_id: props.trade.id, basis_quantity: basisQuantity.value, allocations: [] })
    emit('close')
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to clear this trade allocation'
  } finally {
    saving.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) loadAllocation()
}, { immediate: true })
</script>
