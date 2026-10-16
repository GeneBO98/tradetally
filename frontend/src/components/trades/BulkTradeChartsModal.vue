<template>
  <BaseModal :model-value="open" title="Add chart link to selected trades" size="lg"
    :close-on-backdrop="!saving" :close-on-escape="!saving" :show-close="!saving"
    @update:model-value="!$event && !saving && emit('close')">
    <p class="mb-5 text-sm text-gray-600 dark:text-gray-300">
      Add the same TradingView chart to {{ trade_ids.length }} selected trade{{ trade_ids.length === 1 ? '' : 's' }}.
      Existing charts stay attached. Trades with this link are skipped.
    </p>
    <form id="bulk-chart-form" class="space-y-4" @submit.prevent="save">
      <div>
        <label for="bulk-chart-url" class="label">TradingView link</label>
        <input id="bulk-chart-url" v-model="chart_url" type="url" required maxlength="1000" class="input"
          placeholder="https://www.tradingview.com/x/..." :disabled="saving" />
      </div>
      <div>
        <label for="bulk-chart-title" class="label">Title (optional)</label>
        <input id="bulk-chart-title" v-model="chart_title" type="text" maxlength="255" class="input" :disabled="saving" />
      </div>
      <p v-if="error" class="text-sm text-red-600 dark:text-red-400" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn-secondary" :disabled="saving" @click="emit('close')">Cancel</button>
      <button type="submit" form="bulk-chart-form" class="btn-primary" :disabled="saving || !chart_url.trim() || !trade_ids.length">
        {{ saving ? 'Adding...' : 'Add chart link' }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import api from '@/services/api'
import { useTradesStore } from '@/stores/trades'

const props = defineProps({ open: Boolean, trade_ids: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'saved'])
const tradesStore = useTradesStore()
const chart_url = ref('')
const chart_title = ref('')
const saving = ref(false)
const error = ref('')

watch(() => props.open, open => {
  if (open) { chart_url.value = ''; chart_title.value = ''; error.value = '' }
})

async function save() {
  if (saving.value || !chart_url.value.trim() || !props.trade_ids.length) return
  saving.value = true
  error.value = ''
  const trade_ids = [...props.trade_ids]
  try {
    const response = await api.post('/trades/bulk/charts', {
      trade_ids, chart_url: chart_url.value.trim(), chart_title: chart_title.value.trim() || null
    })
    const result = { ...response.data, refresh_failed: false }
    try { await tradesStore.refreshAfterBulkUpdate(trade_ids) }
    catch (_) { result.refresh_failed = true }
    emit('saved', result)
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to add the chart link'
  } finally {
    saving.value = false
  }
}
</script>
