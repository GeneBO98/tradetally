<template>
  <div v-if="open" class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="fixed inset-0 bg-gray-900/60" aria-hidden="true" @click="emit('close')"></div>
      <section class="relative w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-800" role="dialog" aria-modal="true" aria-labelledby="bulk-allocation-title">
        <header class="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-gray-700">
          <div>
            <h2 id="bulk-allocation-title" class="text-lg font-semibold text-gray-900 dark:text-white">Allocate {{ tradeCount }} trades</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Apply the same proportional split to every selected trade.</p>
          </div>
          <button type="button" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close" @click="emit('close')">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </header>

        <div class="space-y-3 px-6 py-5">
          <div v-for="(row, index) in rows" :key="row.key" class="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-3">
            <div>
              <label :for="`bulk-group-${index}`" class="label">Group</label>
              <select :id="`bulk-group-${index}`" v-model="row.allocation_group_id" class="input">
                <option value="" disabled>Select a group</option>
                <option v-for="group in availableGroups(row.allocation_group_id)" :key="group.id" :value="group.id">{{ group.name }}</option>
              </select>
            </div>
            <div>
              <label :for="`bulk-percent-${index}`" class="label">Percent</label>
              <div class="relative">
                <input :id="`bulk-percent-${index}`" v-model.number="row.percentage" type="number" min="0" max="100" step="0.01" class="input pr-8" />
                <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-500">%</span>
              </div>
            </div>
            <button type="button" class="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700" :disabled="rows.length <= 2" aria-label="Remove group" @click="rows.splice(index, 1)">
              <TrashIcon class="h-5 w-5" />
            </button>
          </div>

          <div class="flex items-center justify-between gap-3 pt-1">
            <button v-if="rows.length < groups.length" type="button" class="btn-secondary inline-flex items-center gap-2" @click="addRow">
              <PlusIcon class="h-4 w-4" /> Add group
            </button>
            <div class="ml-auto text-sm" :class="Math.abs(remaining) <= 0.01 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'">{{ remaining.toFixed(2) }}% remaining</div>
          </div>

          <p class="rounded-md bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
            Existing allocations on the selected trades will be replaced. Trades, tags, and broker data are not modified.
          </p>
          <div v-if="error" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{{ error }}</div>
        </div>

        <footer class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
          <button type="button" class="btn-primary" :disabled="saving || !canSave" @click="save">{{ saving ? 'Saving...' : 'Apply allocation' }}</button>
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
  groups: { type: Array, default: () => [] },
  tradeIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])

const rows = ref([])
const saving = ref(false)
const error = ref('')
let key = 0

const tradeCount = computed(() => props.tradeIds.length)
const total = computed(() => rows.value.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0))
const remaining = computed(() => 100 - total.value)
const canSave = computed(() => {
  const ids = rows.value.map((row) => row.allocation_group_id)
  return props.tradeIds.length > 0 && rows.value.length >= 2 && Math.abs(remaining.value) <= 0.01
    && ids.every(Boolean) && new Set(ids).size === ids.length
    && rows.value.every((row) => Number(row.percentage) > 0)
})

function makeRow(groupId, percentage) {
  key += 1
  return { key, allocation_group_id: groupId || '', percentage }
}

function reset() {
  rows.value = [makeRow(props.groups[0]?.id, 50), makeRow(props.groups[1]?.id, 50)]
  error.value = ''
}

function availableGroups(currentId) {
  const used = new Set(rows.value.map((row) => row.allocation_group_id).filter((id) => id && id !== currentId))
  return props.groups.filter((group) => !used.has(group.id))
}

function addRow() {
  const available = availableGroups('')
  rows.value.push(makeRow(available[0]?.id, Math.max(0, remaining.value)))
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const response = await api.put('/trade-allocations/trades/bulk', {
      trade_ids: props.tradeIds,
      allocations: rows.value.map((row) => ({
        allocation_group_id: row.allocation_group_id,
        allocation_ratio: Number(row.percentage) / 100,
        input_method: 'percentage'
      }))
    })
    emit('saved', response.data)
    emit('close')
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to allocate the selected trades'
  } finally {
    saving.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) reset()
}, { immediate: true })
</script>
