<template>
  <BaseModal :model-value="open" title="Set stops and review R" size="4xl"
    :close-on-backdrop="!saving" :close-on-escape="!saving" @update:model-value="!$event && emit('close')">
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
      Enter a stop for each trade you want to change. Blank fields keep their current stop.
    </p>
    <label class="mb-4 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
      <input v-model="applyDefaults" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
      Fill remaining missing stops from my default risk setting
    </label>
    <div class="max-h-[55vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table class="w-full min-w-[650px] text-sm">
        <thead class="sticky top-0 bg-gray-50 text-left text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <tr><th class="px-3 py-2">Trade</th><th class="px-3 py-2">Entry</th><th class="px-3 py-2">Current stop</th><th class="px-3 py-2">New stop</th><th class="px-3 py-2">Proposed R</th></tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr v-for="row in rows" :key="row.id" class="text-gray-800 dark:text-gray-200">
            <td class="px-3 py-2 font-medium">{{ row.symbol }} <span class="font-normal text-gray-500">{{ row.side }}</span></td>
            <td class="px-3 py-2">{{ row.entry_price ?? row.entryPrice }}</td>
            <td class="px-3 py-2">{{ row.stop_loss ?? row.stopLoss ?? '—' }}</td>
            <td class="px-3 py-2">
              <input v-model="values[row.id]" type="number" min="0" step="any" class="input w-32"
                :aria-label="`New stop for ${row.symbol}`" placeholder="Keep current" />
            </td>
            <td class="px-3 py-2">
              <span v-if="previewById[row.id]">{{ previewById[row.id].r_value == null ? 'Open' : `${Number(previewById[row.id].r_value).toFixed(2)}R` }}</span>
              <span v-else>{{ (row.r_value ?? row.rValue) == null ? '—' : `${Number(row.r_value ?? row.rValue).toFixed(2)}R` }}</span>
              <span v-if="previewById[row.id]" class="block text-xs text-gray-500 dark:text-gray-400">
                {{ previewById[row.id].r_value == null ? 'Risk' : 'R = net P&L ÷ risk' }}
                {{ Number(previewById[row.id].risk_amount).toFixed(2) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="previewing" class="mt-3 text-xs text-gray-500" aria-live="polite">Calculating R…</p>
    <p v-if="error" class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{{ error }}</p>
    <p v-if="!error && preview && preview.updated_trade_count === 0" class="mt-3 text-sm text-gray-500">No stops would change. Check your default risk setting if you expected missing stops to fill.</p>
    <template #footer>
      <button type="button" class="btn-secondary" :disabled="saving" @click="emit('close')">Cancel</button>
      <button type="button" class="btn-primary" :disabled="saving || previewing || !preview?.updated_trade_count" @click="save">
        {{ saving ? 'Saving…' : `Save ${preview?.updated_trade_count || 0} stop${preview?.updated_trade_count === 1 ? '' : 's'}` }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import api from '@/services/api'
import { useTradesStore } from '@/stores/trades'

const props = defineProps({ open: Boolean, tradeIds: { type: Array, default: () => [] }, trades: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'saved'])
const tradesStore = useTradesStore()
const values = reactive({})
const applyDefaults = ref(false)
const preview = ref(null)
const previewing = ref(false)
const saving = ref(false)
const error = ref('')
const rows = computed(() => props.trades.filter(trade => props.tradeIds.includes(trade.id)))
const previewById = computed(() => Object.fromEntries((preview.value?.changes || []).map(change => [change.trade_id, change])))
const stops = computed(() => rows.value.filter(row => String(values[row.id] ?? '').trim() !== '')
  .map(row => ({ trade_id: row.id, stop_loss: Number(values[row.id]) })))
const request = computed(() => ({ trade_ids: props.tradeIds, stops: stops.value, apply_default_to_missing: applyDefaults.value }))
let timer
let revision = 0

async function loadPreview() {
  const current = ++revision
  preview.value = null
  error.value = ''
  if (!request.value.stops.length && !applyDefaults.value) return
  previewing.value = true
  try {
    const response = await api.post('/trades/bulk/stops/preview', request.value)
    if (current === revision) preview.value = response.data
  } catch (err) {
    if (current === revision) error.value = err?.response?.data?.error || 'Unable to calculate proposed R values'
  } finally {
    if (current === revision) previewing.value = false
  }
}

watch([values, applyDefaults], () => {
  if (!props.open) return
  clearTimeout(timer)
  timer = setTimeout(loadPreview, 350)
}, { deep: true })
watch(() => props.open, open => {
  clearTimeout(timer)
  revision++
  preview.value = null
  error.value = ''
  applyDefaults.value = false
  Object.keys(values).forEach(key => delete values[key])
  if (!open) previewing.value = false
})

async function save() {
  if (saving.value || previewing.value || !preview.value?.updated_trade_count) return
  saving.value = true
  error.value = ''
  try {
    const response = await api.patch('/trades/bulk/stops', request.value)
    const result = { ...response.data, refresh_failed: false }
    try { await tradesStore.refreshAfterBulkUpdate(props.tradeIds) }
    catch (_) { result.refresh_failed = true }
    emit('saved', result)
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to save stops'
  } finally {
    saving.value = false
  }
}
</script>
