<template>
  <div class="space-y-3 py-2" :aria-busy="loading">
    <p class="text-sm text-gray-600 dark:text-gray-400">Individual confirmation checks for {{ group.local_date }}. Times use your display timezone.</p>
    <p v-if="error" class="text-sm text-primary-700 dark:text-primary-300" role="alert">{{ error }} <button type="button" class="btn-link" @click="fetchChecks(false)">Retry</button></p>
    <div v-if="initial_loading" class="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400"><div class="spinner spinner-xs"></div>Loading checks…</div>
    <table v-else class="min-w-full text-sm">
      <thead class="table-head"><tr class="text-left text-gray-500 dark:text-gray-400"><th class="table-th px-3 py-2">Time</th><th class="table-th px-3 py-2">Status</th><th class="table-th px-3 py-2">Imported</th><th class="table-th px-3 py-2">Updated</th><th class="table-th px-3 py-2">Duplicates</th></tr></thead>
      <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
        <template v-for="log in checks" :key="log.id">
          <tr><td class="px-3 py-2 whitespace-nowrap">{{ formatDateTime(log.startedAt) }}</td><td class="px-3 py-2">{{ log.syncDetails?.outcome === 'warning' || log.syncDetails?.warnings?.length ? 'Completed with warnings' : 'Completed' }}</td><td class="px-3 py-2">{{ log.tradesImported || 0 }}</td><td class="px-3 py-2">{{ log.syncDetails?.updated_count || 0 }}</td><td class="px-3 py-2">{{ log.duplicatesDetected || 0 }}</td></tr>
          <tr v-if="log.syncDetails?.warnings?.length"><td colspan="5" class="px-3 py-2 text-primary-700 dark:text-primary-300"><ul class="list-disc pl-4 space-y-1"><li v-for="(warning, index) in log.syncDetails.warnings" :key="index">{{ warning }}</li></ul></td></tr>
        </template>
      </tbody>
    </table>
    <p v-if="!initial_loading && !error && !checks.length" class="text-sm text-gray-500 dark:text-gray-400">No checks are available for this day.</p>
    <button v-if="has_more" type="button" class="btn-link" :disabled="loading" @click="fetchChecks(true)">{{ loading ? 'Loading…' : 'Load older checks' }}</button>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import { useUserTimezone } from '@/composables/useUserTimezone'
const props = defineProps({ group: { type: Object, required: true } })
const { formatDateTime } = useUserTimezone()
const checks = ref([])
const initial_loading = ref(true)
const loading = ref(false)
const has_more = ref(false)
const error = ref('')
let request_version = 0
async function fetchChecks(append = false) {
  const version = ++request_version
  loading.value = true
  error.value = ''
  try {
    const response = await api.get(`/broker-sync/connections/${props.group.connectionId}/logs`, {
      params: { group_date: props.group.local_date, limit: 50, offset: append ? checks.value.length : 0 }
    })
    if (version !== request_version) return
    const rows = response.data.data || []
    checks.value = append ? [...checks.value, ...rows.filter(row => !checks.value.some(existing => existing.id === row.id))] : rows
    has_more.value = response.data.has_more === true
  } catch (failure) {
    if (version === request_version) error.value = failure.response?.data?.error || 'Unable to load confirmation checks.'
  } finally {
    if (version === request_version) { loading.value = false; initial_loading.value = false }
  }
}
onMounted(() => fetchChecks())
watch(() => [props.group.id, props.group.createdAt, props.group.sync_count], () => fetchChecks())
onBeforeUnmount(() => { request_version++ })
</script>
