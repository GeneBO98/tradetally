<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="min-w-0">
          <h3 class="heading-card">Upcoming Earnings</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">Next 2 weeks</p>
        </div>
        <div class="flex items-center">
          <button
            @click="refreshEarnings"
            :disabled="loading"
            class="btn-secondary btn-sm"
          >
            <span v-if="loading" class="spinner spinner-xs spinner-current mr-2"></span><svg v-else
              class="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div v-if="loading && !earnings.length" class="flex justify-center py-8">
        <div class="spinner spinner-md"></div>
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
          class="btn-link"
        >
          Try again
        </button>
      </div>

      <div v-else-if="!earnings.length" class="text-center py-8">
        <p class="text-gray-500 dark:text-gray-400">No upcoming earnings for your open positions in the next 2 weeks.</p>
      </div>

      <!-- Compact two-line list: reads cleanly in the narrow dashboard rail
           and in the main column without a horizontal scroller. -->
      <ul v-else class="-mx-1 divide-y divide-gray-200 dark:divide-gray-700">
        <li
          v-for="earning in earnings"
          :key="`${earning.symbol}-${earning.date}`"
          class="flex items-start justify-between gap-3 px-1 py-2.5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ earning.symbol }}</span>
              <span v-if="earning.hour" class="badge-neutral" :title="earning.hour === 'bmo' ? 'Before market open' : 'After market close'">
                {{ earning.hour === 'bmo' ? 'BMO' : 'AMC' }}
              </span>
            </div>
            <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400 text-mono-num">
              <template v-if="earning.epsEstimate !== null || earning.epsActual !== null">
                <span v-if="earning.epsEstimate !== null">Est. {{ formatEps(earning.epsEstimate) }}</span>
                <span v-if="earning.epsEstimate !== null && earning.epsActual !== null" class="mx-1 text-gray-300 dark:text-gray-600">/</span>
                <span v-if="earning.epsActual !== null">Last yr {{ formatEps(earning.epsActual) }}</span>
              </template>
              <span v-else>No estimate yet</span>
            </div>
          </div>
          <div class="shrink-0 text-right">
            <div class="text-sm text-gray-700 dark:text-gray-300">{{ formatEarningsDate(earning.date) }}</div>
            <span
              class="mt-0.5"
              :class="earning.daysUntil <= 3 ? 'badge-warning' : 'badge-neutral'"
            >
              {{ earning.daysUntil === 0 ? 'Today' : earning.daysUntil === 1 ? 'Tomorrow' : `${earning.daysUntil} days` }}
            </span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

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
  // Earnings dates arrive as calendar dates (YYYY-MM-DD). Parse them as local
  // dates; new Date('YYYY-MM-DD') is UTC midnight and renders a day early in
  // US timezones.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''))
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(dateStr)
  if (isNaN(date)) return '-'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const { formatCurrency } = useCurrencyFormatter()

const formatEps = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '-'
  const value = parseFloat(num)
  return formatCurrency(value, { currency: 'USD' })
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

const refreshEarnings = async () => {
  if (!props.symbols.length) return

  loading.value = true
  error.value = null

  try {
    const response = await api.post('/trades/earnings/refresh', {
      symbols: props.symbols.join(',')
    })

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
      .filter(earning => earning.daysUntil >= 0 && earning.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  } catch (err) {
    console.error('Failed to refresh earnings:', err)
    error.value = err.response?.data?.error || 'Failed to refresh earnings data. Please try again later.'
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