<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Upcoming Earnings</h3>
        <span class="text-xs text-gray-500 dark:text-gray-400">Next 2 weeks</span>
      </div>

      <div v-if="loading && !earnings.length" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <div class="text-red-500 dark:text-red-400 mb-2">
          <svg class="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {{ error }}
        </div>
        <button
          @click="fetchEarnings"
          class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Try again
        </button>
      </div>

      <div v-else-if="!earnings.length" class="text-center py-8">
        <p class="text-gray-500 dark:text-gray-400">No upcoming earnings for your open positions in the next 2 weeks.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Symbol
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Time
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estimate
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Year
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Days Until
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="earning in earnings" :key="`${earning.symbol}-${earning.date}`" class="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                {{ earning.symbol }}
              </td>
              <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                {{ formatEarningsDate(earning.date) }}
              </td>
              <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                <span v-if="earning.hour" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  :class="[
                    earning.hour === 'bmo' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                  ]">
                  {{ earning.hour === 'bmo' ? 'Before Market' : 'After Market' }}
                </span>
                <span v-else class="text-gray-400">TBD</span>
              </td>
              <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                <span v-if="earning.epsEstimate !== null">
                  ${{ formatNumber(earning.epsEstimate) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                <span v-if="earning.epsActual !== null">
                  ${{ formatNumber(earning.epsActual) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-3 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="[
                    earning.daysUntil <= 3 
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      : earning.daysUntil <= 7
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  ]">
                  {{ earning.daysUntil === 0 ? 'Today' : earning.daysUntil === 1 ? 'Tomorrow' : `${earning.daysUntil} days` }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'

const props = defineProps({
  symbols: {
    type: Array,
    required: true
  }
})

const earnings = ref([])
const loading = ref(false)
const error = ref(null)

const formatEarningsDate = (dateStr) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  })
}

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0.00'
  return parseFloat(num).toFixed(2)
}

const fetchEarnings = async () => {
  if (!props.symbols.length) {
    earnings.value = []
    return
  }

  loading.value = true
  error.value = null

  try {
    const response = await api.get('/trades/earnings', {
      params: {
        symbols: props.symbols.join(',')
      }
    })

    // Calculate days until earnings and sort by date
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    
    earnings.value = response.data
      .map(earning => {
        const earningsDate = new Date(earning.date)
        earningsDate.setHours(0, 0, 0, 0)
        const diffTime = earningsDate - now
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        
        return {
          ...earning,
          daysUntil: diffDays
        }
      })
      .filter(earning => earning.daysUntil >= 0 && earning.daysUntil <= 14) // Only next 2 weeks
      .sort((a, b) => a.daysUntil - b.daysUntil)
  } catch (err) {
    console.error('Failed to fetch earnings:', err)
    error.value = err.response?.data?.error || 'Failed to load earnings data. Please try again later.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchEarnings()
})

watch(() => props.symbols, () => {
  fetchEarnings()
}, { deep: true })
</script>