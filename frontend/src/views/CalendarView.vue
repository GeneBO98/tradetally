<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Trading Calendar</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          View your trading performance by date
        </p>
      </div>
      
      <!-- Year Navigation -->
      <div class="flex items-center space-x-4">
        <button @click="changeYear(-1)" class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ChevronLeftIcon class="h-5 w-5" />
        </button>
        <span class="text-lg font-medium text-gray-900 dark:text-white">{{ currentYear }}</span>
        <button @click="changeYear(1)" class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ChevronRightIcon class="h-5 w-5" />
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else>
      <!-- Expanded Month View -->
      <div v-if="expandedMonth" class="mb-8">
        <div class="card">
          <div class="card-body">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                {{ format(expandedMonth, 'MMMM yyyy') }}
              </h2>
              <div class="flex items-center space-x-4">
                <div class="text-right">
                  <p class="text-sm text-gray-500 dark:text-gray-400">Total P/L</p>
                  <p class="text-2xl font-bold" :class="monthlyPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                    ${{ formatNumber(monthlyPnl) }}
                  </p>
                </div>
                <button @click="expandedMonth = null" class="btn-secondary">
                  Close
                </button>
              </div>
            </div>

            <!-- Calendar Grid -->
            <div class="grid grid-cols-8 gap-1 mb-2">
              <div v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day"
                class="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
                {{ day }}
              </div>
              <div class="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
                Week P/L
              </div>
            </div>
            <div v-for="(week, weekIndex) in expandedMonthWeeks" :key="weekIndex" class="grid grid-cols-8 gap-1 mb-1">
              <div v-for="(day, dayIndex) in week.days" :key="dayIndex"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 min-h-[80px] cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                :class="getDayClass(day)"
                @click="day.date && day.trades > 0 ? selectDay(day) : null">
                <div v-if="day.date">
                  <div class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ day.date.getDate() }}
                  </div>
                  <div v-if="day.pnl !== undefined && day.trades > 0" class="mt-1">
                    <p class="text-sm font-semibold" :class="day.pnl >= 0 ? 'text-green-600' : 'text-red-600'">
                      ${{ formatNumber(day.pnl) }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ day.trades }} {{ day.trades === 1 ? 'trade' : 'trades' }}
                    </p>
                  </div>
                </div>
              </div>
              <!-- Week P/L Column -->
              <div class="flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                <p class="text-sm font-semibold" :class="week.weekPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                  ${{ formatNumber(week.weekPnl) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Yearly Overview -->
      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="month in yearlyCalendar" :key="month.key" class="card">
          <div class="card-body p-4">
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-medium text-gray-900 dark:text-white">
                {{ format(month.date, 'MMMM') }}
              </h3>
              <button @click="expandMonth(month.date)" class="text-primary-600 hover:text-primary-700 text-sm">
                Open
              </button>
            </div>

            <!-- Mini Calendar -->
            <div class="grid grid-cols-7 gap-0.5 text-xs">
              <div v-for="day in ['S', 'M', 'T', 'W', 'T', 'F', 'S']" :key="day"
                class="text-center text-gray-400 dark:text-gray-500 pb-1">
                {{ day }}
              </div>
              <div v-for="(day, index) in month.days" :key="index"
                class="aspect-square flex items-center justify-center rounded"
                :class="getMiniDayClass(day)">
                <span v-if="day.date" class="font-medium">{{ day.date.getDate() }}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Day Trades Modal -->
    <div v-if="selectedDay" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Trades for {{ format(selectedDay.date, 'MMMM d, yyyy') }}
            </h3>
            <button @click="selectedDay = null" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
          
          <div class="space-y-3 max-h-96 overflow-y-auto">
            <div v-for="trade in selectedDayTrades" :key="trade.id"
              class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div class="flex justify-between items-start">
                <div>
                  <div class="flex items-center space-x-2">
                    <h4 class="font-medium text-gray-900 dark:text-white">{{ trade.symbol }}</h4>
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.side === 'long' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                      {{ trade.side }}
                    </span>
                  </div>
                  <div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <p>Entry: ${{ formatNumber(trade.entry_price, 4) }} | Exit: {{ trade.exit_price ? `$${formatNumber(trade.exit_price, 4)}` : 'Open' }}</p>
                    <p>Quantity: {{ formatNumber(trade.quantity, 0) }}</p>
                    <p v-if="trade.notes" class="mt-1">{{ trade.notes }}</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-semibold" :class="trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'">
                    ${{ formatNumber(trade.pnl) }}
                  </p>
                  <p v-if="trade.pnl_percent" class="text-sm text-gray-500 dark:text-gray-400">
                    {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex justify-between items-center">
              <span class="font-medium text-gray-900 dark:text-white">Total for day:</span>
              <span class="font-bold text-lg" :class="selectedDay.pnl >= 0 ? 'text-green-600' : 'text-red-600'">
                ${{ formatNumber(selectedDay.pnl) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const loading = ref(true)
const trades = ref([])
const expandedMonth = ref(null)
const currentYear = ref(new Date().getFullYear())
const selectedDay = ref(null)

const yearlyCalendar = computed(() => {
  const start = startOfYear(new Date(currentYear.value, 0, 1))
  const end = endOfYear(new Date(currentYear.value, 0, 1))
  const months = eachMonthOfInterval({ start, end })

  return months.map(monthDate => {
    const monthStart = startOfMonth(monthDate)
    const monthEnd = endOfMonth(monthDate)
    const days = generateMonthDays(monthStart, monthEnd)
    
    return {
      key: format(monthDate, 'yyyy-MM'),
      date: monthDate,
      days
    }
  })
})

const expandedMonthDays = computed(() => {
  if (!expandedMonth.value) return []
  const monthStart = startOfMonth(expandedMonth.value)
  const monthEnd = endOfMonth(expandedMonth.value)
  return generateMonthDays(monthStart, monthEnd)
})

const expandedMonthWeeks = computed(() => {
  if (!expandedMonth.value) return []
  const days = expandedMonthDays.value
  const weeks = []
  
  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7)
    const weekPnl = weekDays.reduce((sum, day) => {
      if (day.pnl !== undefined) {
        return sum + day.pnl
      }
      return sum
    }, 0)
    
    weeks.push({
      days: weekDays,
      weekPnl
    })
  }
  
  return weeks
})

const selectedDayTrades = computed(() => {
  if (!selectedDay.value || !selectedDay.value.date) return []
  return trades.value.filter(trade => {
    const tradeDate = new Date(trade.trade_date)
    return tradeDate.toDateString() === selectedDay.value.date.toDateString()
  })
})

const expandedMonthTrades = computed(() => {
  if (!expandedMonth.value) return []
  return trades.value
    .filter(trade => {
      const tradeDate = new Date(trade.trade_date)
      return isSameMonth(tradeDate, expandedMonth.value)
    })
    .sort((a, b) => new Date(b.trade_date) - new Date(a.trade_date))
})

const monthlyPnl = computed(() => {
  return expandedMonthTrades.value.reduce((sum, trade) => {
    const pnl = parseFloat(trade.pnl) || 0
    return sum + pnl
  }, 0)
})

function generateMonthDays(monthStart, monthEnd) {
  const days = []
  const startPadding = getDay(monthStart)
  
  // Add padding for days before month starts
  for (let i = 0; i < startPadding; i++) {
    days.push({ date: null })
  }

  // Add all days of the month
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  monthDays.forEach(date => {
    const dayTrades = trades.value.filter(trade => {
      const tradeDate = new Date(trade.trade_date)
      return tradeDate.toDateString() === date.toDateString()
    })

    const dayPnl = dayTrades.reduce((sum, trade) => {
      const pnl = parseFloat(trade.pnl) || 0
      return sum + pnl
    }, 0)
    
    days.push({
      date,
      trades: dayTrades.length,
      pnl: dayTrades.length > 0 ? dayPnl : undefined
    })
  })

  return days
}

function getDayClass(day) {
  if (!day.date) return ''
  if (day.pnl === undefined) return 'bg-gray-50 dark:bg-gray-800'
  return day.pnl >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
}

function getMiniDayClass(day) {
  if (!day.date) return ''
  if (day.pnl === undefined) return ''
  return day.pnl >= 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
}

function expandMonth(monthDate) {
  expandedMonth.value = monthDate
}

function selectDay(day) {
  selectedDay.value = day
}

function changeYear(direction) {
  currentYear.value += direction
  expandedMonth.value = null
  selectedDay.value = null
  fetchTrades()
}

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

async function fetchTrades() {
  loading.value = true
  try {
    const response = await api.get('/trades', {
      params: {
        limit: 1000,
        startDate: `${currentYear.value}-01-01`,
        endDate: `${currentYear.value}-12-31`
      }
    })
    trades.value = response.data.trades
  } catch (error) {
    console.error('Failed to fetch trades:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchTrades()
})

watch(currentYear, () => {
  fetchTrades()
})
</script>