<template>
  <div v-if="initialLoading || has_history_accounts" class="card">
    <div class="card-body">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="heading-card">Account Equity Curve</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Daily balances from linked Plaid accounts for the selected period
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="option in rangeOptions"
            :key="option.days"
            @click="setRange(option.days)"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
            :class="selectedDays === option.days
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <p v-if="loading && !initialLoading" class="text-xs text-primary-600 mb-2" role="status">Updating...</p>
      <div v-if="initialLoading" class="flex justify-center py-10">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="filledSeries.length < 2" class="text-center py-8">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Balance history builds up as your connections sync daily. Check back after a few syncs.
        </p>
      </div>

      <div v-else class="h-64">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { resolveDatePreset, monthPresetOptions } from '@/utils/datePresets'
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart } from '@/lib/chartSetup'
import { format, parseISO } from 'date-fns'
import { usePlaidFundingStore } from '@/stores/plaidFunding'

const plaidFundingStore = usePlaidFundingStore()

const rangeOptions = [
  ...monthPresetOptions.map(option => ({ days: option.value, label: option.label })),
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
  { days: 365, label: '1Y' }
]

const selectedDays = ref(90)
const series = ref([])
const accounts = ref([])
const has_history_accounts = ref(false)
const loading = ref(false)
const initialLoading = ref(true)
const chartCanvas = ref(null)
let chart = null

// Forward-fill missing days so sync gaps don't distort the curve
const filledSeries = computed(() => {
  if (series.value.length === 0) return []

  const byDate = new Map(
    series.value.map(point => [format(parseISO(point.date), 'yyyy-MM-dd'), point])
  )
  const first = parseISO(series.value[0].date)
  const last = parseISO(series.value[series.value.length - 1].date)
  const filled = []
  let lastPoint = null

  for (let day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
    const key = format(day, 'yyyy-MM-dd')
    const point = byDate.get(key) || lastPoint
    if (point) {
      filled.push({ date: key, currentBalance: point.currentBalance })
      lastPoint = point
    }
  }

  return filled
})

async function loadHistory() {
  loading.value = true
  try {
    const params = ['this_month', 'last_month'].includes(selectedDays.value)
      ? resolveDatePreset(selectedDays.value)
      : { days: selectedDays.value }
    const data = await plaidFundingStore.fetchBalanceHistory(params)
    series.value = data.series || []
    accounts.value = data.accounts || []
    if (accounts.value.length > 0) has_history_accounts.value = true
  } catch (error) {
    console.error('[CASHFLOW] Failed to load balance history:', error)
    series.value = []
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function setRange(days) {
  if (selectedDays.value === days) return
  selectedDays.value = days
  loadHistory()
}

function createChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
  if (!chartCanvas.value || filledSeries.value.length < 2) return

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#E5E7EB' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'
  const primaryColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary-500').trim() || '#6366f1'

  const ctx = chartCanvas.value.getContext('2d')

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filledSeries.value.map(point => format(new Date(`${point.date}T00:00:00`), 'MMM dd')),
      datasets: [
        {
          label: 'Total Balance',
          data: filledSeries.value.map(point => point.currentBalance),
          borderColor: primaryColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(context.parsed.y)
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            maxTicksLimit: 8,
            maxRotation: 0
          },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            callback: value => new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              notation: 'compact'
            }).format(value)
          },
          grid: { color: gridColor }
        }
      }
    }
  })
}

watch(filledSeries, async () => {
  await nextTick()
  createChart()
})

onMounted(loadHistory)

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})

defineExpose({ refresh: loadHistory })
</script>
