<template>
  <div class="card-dense h-full flex flex-col">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Market Risk</h3>
      <router-link
        to="/market-risk"
        class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        Full breakdown
      </router-link>
    </div>

    <div class="card-dense-body flex-1 flex flex-col">
      <div v-if="initialLoading" class="flex-1 flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="error" class="flex-1 flex items-center justify-center py-8">
        <p class="text-sm text-gray-600 dark:text-gray-400 text-center">
          Market risk data is temporarily unavailable.
        </p>
      </div>

      <template v-else>
        <!-- Summary strip -->
        <div
          class="rounded-md px-3 py-2 mb-3 text-sm font-medium border"
          :class="summaryClasses"
        >
          <span class="text-mono-num">{{ summary.red }} red &middot; {{ summary.amber }} amber &middot; {{ summary.green }} green.</span>
          {{ summary.headline }}
        </div>

        <!-- Indicator tiles -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          <div
            v-for="indicator in availableIndicators"
            :key="indicator.key"
            class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2"
            :title="indicator.description || ''"
          >
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ indicator.name }}</div>
            <div class="mt-0.5 flex items-baseline gap-1">
              <span class="text-lg font-semibold text-mono-num text-gray-900 dark:text-white">
                {{ indicator.display_value }}</span>
              <span v-if="indicator.unit" class="text-xs text-gray-500 dark:text-gray-400">{{ indicator.unit }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 min-w-0">
              <span
                class="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium uppercase whitespace-nowrap"
                :class="badgeClasses(indicator.status)"
              >
                {{ indicator.status_label }}
              </span>
              <span class="text-[11px] text-gray-500 dark:text-gray-400 truncate">{{ indicator.detail }}</span>
            </div>
          </div>
        </div>

        <div class="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          Macro context, not a trade signal. Updated {{ asOfLabel }}.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'

const loading = ref(true)
const initialLoading = ref(true)
const error = ref(null)
const data = ref(null)

const summary = computed(() => data.value?.summary || { red: 0, amber: 0, green: 0, headline: '' })
const availableIndicators = computed(() =>
  (data.value?.indicators || []).filter(i => i.value !== null)
)

const asOfLabel = computed(() => {
  if (!data.value?.as_of) return ''
  return new Date(data.value.as_of).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

const summaryClasses = computed(() => {
  switch (summary.value.level) {
    case 'elevated':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300'
    case 'caution':
    case 'mixed':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300'
    default:
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-300'
  }
})

function badgeClasses(status) {
  switch (status) {
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    case 'amber':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'green':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  }
}

async function fetchIndicators() {
  loading.value = true
  try {
    const response = await api.get('/market-risk')
    data.value = response.data
    error.value = null
  } catch (err) {
    console.error('[MARKET-RISK-CARD] Failed to load indicators:', err)
    error.value = err
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

onMounted(() => {
  fetchIndicators()
})
</script>
