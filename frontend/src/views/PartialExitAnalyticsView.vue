<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="heading-page">Partial Exit Analytics</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Analyze how each partial exit level performs across your trades.
          </p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="card-body">
        <TradeFilters @filter="handleFilter" />

        <!-- Partial-specific filters -->
        <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Min Partials:</label>
              <select v-model="minPartials" @change="loadData" class="input text-sm w-20">
                <option value="">Any</option>
                <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Max Partials:</label>
              <select v-model="maxPartials" @change="loadData" class="input text-sm w-20">
                <option value="">Any</option>
                <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Full page spinner only on initial load -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="error" class="card p-8 text-center">
      <p class="text-danger mb-4">{{ error }}</p>
      <button @click="loadData" class="btn-primary">Retry</button>
    </div>

    <!-- Content -->
    <div v-else class="relative">
      <!-- Subtle refresh indicator -->
      <div v-if="loading" class="absolute top-0 right-0 z-10">
        <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
          <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
        </div>
      </div>

      <!-- Summary stats -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics.total_trades }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Trades Analyzed</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics.max_partials }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Max Partial Levels</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics.partials?.length || 0 }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Partial Indices</div>
        </div>
      </div>

      <!-- No data state -->
      <div v-if="!analytics.partials || analytics.partials.length === 0" class="card p-8 text-center">
        <p class="text-gray-500 dark:text-gray-400">
          No partial exit data found. This analysis requires trades with at least 2 exit executions.
        </p>
      </div>

      <!-- Analytics Table -->
      <div v-else class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Partial
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Eligible
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Abs. Hit %
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cond. Hit %
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Profitable
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  BE/Scratch
                </th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Loss
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Avg Exit (pts)
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Avg Exit Profit (pts)
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Avg R
                </th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Avg SL (pts)
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="partial in analytics.partials"
                :key="partial.index"
                class="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <!-- Partial Label -->
                <td class="px-4 py-3 whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
                      {{ partial.label }}
                    </span>
                    <span
                      v-if="partial.is_last"
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                    >
                      last
                    </span>
                  </div>
                </td>

                <!-- Eligible Trades -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-900 dark:text-white">
                  {{ partial.eligible_trades }}
                </td>

                <!-- Absolute Hit Rate -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm font-medium" :class="hitRateColor(partial.absolute_hit_rate)">
                  {{ partial.absolute_hit_rate }}%
                </td>

                <!-- Conditional Hit Rate -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm" :class="partial.conditional_hit_rate !== null ? hitRateColor(partial.conditional_hit_rate) : 'text-gray-400 dark:text-gray-500'">
                  {{ partial.conditional_hit_rate !== null ? partial.conditional_hit_rate + '%' : '--' }}
                </td>

                <!-- Profitable Count -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm text-green-600 dark:text-green-400">
                  {{ partial.profitable_count }}
                </td>

                <!-- BE/Scratch Count -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-600 dark:text-gray-400">
                  {{ partial.be_scratch_count }}
                </td>

                <!-- Loss Count -->
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm text-red-600 dark:text-red-400">
                  {{ partial.loss_count }}
                </td>

                <!-- Avg Exit Pts (all) -->
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium" :class="ptsColor(partial.avg_exit_pts)">
                  {{ formatPts(partial.avg_exit_pts) }}
                </td>

                <!-- Avg Exit Pts (profitable) -->
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm" :class="partial.avg_exit_pts_profitable !== null ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'">
                  {{ partial.avg_exit_pts_profitable !== null ? formatPts(partial.avg_exit_pts_profitable) : '--' }}
                </td>

                <!-- Avg R -->
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium" :class="partial.avg_r_at_exit !== null ? ptsColor(partial.avg_r_at_exit) : 'text-gray-400 dark:text-gray-500'">
                  {{ partial.avg_r_at_exit !== null ? formatR(partial.avg_r_at_exit) : '--' }}
                </td>

                <!-- Avg SL -->
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                  {{ partial.avg_sl_pts !== null ? formatPts(partial.avg_sl_pts) : '--' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Info note -->
      <div class="mt-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>Abs. Hit % = trades where this partial was profitable / total trades analyzed.</p>
        <p>Cond. Hit % = trades where this partial was profitable given the previous partial was also profitable.</p>
        <p>Only trades with 2+ exit executions are included. Trades without stop_loss show "--" for R and Avg SL columns.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const { selectedAccount } = useGlobalAccountFilter()

const loading = ref(false)
const initialLoading = ref(true)
const error = ref(null)
const analytics = ref({ partials: [], total_trades: 0, max_partials: 0 })
const filters = ref({})
const minPartials = ref('')
const maxPartials = ref('')

const handleFilter = (newFilters) => {
  filters.value = newFilters
  loadData()
}

const loadData = async () => {
  loading.value = true
  error.value = null
  try {
    const params = { ...filters.value }
    if (selectedAccount.value) {
      params.accounts = selectedAccount.value
    }
    if (minPartials.value) {
      params.minPartials = minPartials.value
    }
    if (maxPartials.value) {
      params.maxPartials = maxPartials.value
    }

    const response = await api.get('/trades/analytics/partial-exits', { params })
    analytics.value = response.data
  } catch (err) {
    console.error('[PARTIAL-EXIT] Error loading data:', err)
    error.value = err.response?.data?.error || 'Failed to load partial exit analytics'
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

const hitRateColor = (rate) => {
  if (rate >= 50) return 'text-green-600 dark:text-green-400'
  if (rate >= 25) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

const ptsColor = (pts) => {
  if (pts > 0) return 'text-green-600 dark:text-green-400'
  if (pts < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-400'
}

const formatPts = (value) => {
  if (value === null || value === undefined) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

const formatR = (value) => {
  if (value === null || value === undefined) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}R`
}

watch(selectedAccount, () => {
  console.log('[PARTIAL-EXIT] Global account filter changed')
  loadData()
})

onMounted(() => {
  loadData()
})
</script>
