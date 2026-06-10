<template>
  <div>
    <!-- Range selector -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Dividend, interest, and fee activity from your Plaid-linked investment accounts
      </p>
      <div class="flex items-center gap-1">
        <button
          v-for="option in rangeOptions"
          :key="option.id"
          @click="setRange(option.id)"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="selectedRange === option.id
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
    </div>

    <template v-else-if="income">
      <!-- Summary cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dividends</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
            {{ formatCurrency(income.summary.totalDividends) }}
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Interest</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
            {{ formatCurrency(income.summary.totalInterest) }}
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fees & Taxes</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {{ formatCurrency(income.summary.totalFees) }}
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dividends (Trailing 12M)</div>
          <div class="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {{ formatCurrency(income.summary.trailing12mDividends) }}
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="income.byMonth.length === 0"
        class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
      >
        <h3 class="text-sm font-medium text-gray-900 dark:text-white">No income activity yet</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Connect an investment account on the
          <router-link to="/cashflow" class="text-primary-600 hover:text-primary-800">Account & Cashflow</router-link>
          page and income will appear here after the first sync.
        </p>
      </div>

      <template v-else>
        <!-- Monthly chart -->
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6">
          <h3 class="heading-card mb-4">Monthly Income</h3>
          <div class="h-72">
            <canvas ref="chartCanvas"></canvas>
          </div>
        </div>

        <!-- By symbol table -->
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="heading-card">Income by Symbol</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Dividends</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Interest</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fees</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Payments</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Payment</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="entry in income.bySymbol" :key="entry.symbol">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {{ entry.symbol }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                    {{ entry.dividends ? formatCurrency(entry.dividends) : '—' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                    {{ entry.interest ? formatCurrency(entry.interest) : '—' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                    {{ entry.fees ? formatCurrency(entry.fees) : '—' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                    {{ entry.transactionCount }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                    {{ formatDate(entry.lastDate) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { format } from 'date-fns'
import { useInvestmentsStore } from '@/stores/investments'

Chart.register(...registerables)

const investmentsStore = useInvestmentsStore()

const rangeOptions = [
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' }
]

const selectedRange = ref('1y')
const income = ref(null)
const loading = ref(false)
const chartCanvas = ref(null)
let chart = null

function rangeParams() {
  const today = new Date()
  if (selectedRange.value === 'ytd') {
    return { startDate: `${today.getFullYear()}-01-01` }
  }
  if (selectedRange.value === '1y') {
    const start = new Date(today)
    start.setFullYear(start.getFullYear() - 1)
    return { startDate: format(start, 'yyyy-MM-dd') }
  }
  return {}
}

async function loadIncome() {
  loading.value = true
  try {
    income.value = await investmentsStore.fetchIncome(rangeParams())
  } catch (error) {
    console.error('[INVESTMENTS] Failed to load income analytics:', error)
    income.value = null
  } finally {
    loading.value = false
  }
}

function setRange(rangeId) {
  if (selectedRange.value === rangeId) return
  selectedRange.value = rangeId
  loadIncome()
}

function createChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
  if (!chartCanvas.value || !income.value || income.value.byMonth.length === 0) return

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#E5E7EB' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'
  const primaryColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary-500').trim() || '#6366f1'

  const ctx = chartCanvas.value.getContext('2d')
  const months = income.value.byMonth

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(entry => format(new Date(`${entry.month}-01T00:00:00`), 'MMM yyyy')),
      datasets: [
        {
          label: 'Dividends',
          data: months.map(entry => entry.dividends),
          backgroundColor: primaryColor,
          stack: 'income'
        },
        {
          label: 'Interest',
          data: months.map(entry => entry.interest),
          backgroundColor: '#10B981',
          stack: 'income'
        },
        {
          label: 'Fees & Taxes',
          data: months.map(entry => -entry.fees),
          backgroundColor: '#EF4444',
          stack: 'income'
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
        legend: {
          labels: { color: textColor }
        },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: textColor, maxRotation: 0 },
          grid: { display: false }
        },
        y: {
          stacked: true,
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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value || 0)
}

function formatDate(value) {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy')
}

watch(income, async () => {
  await nextTick()
  createChart()
})

onMounted(loadIncome)

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>
