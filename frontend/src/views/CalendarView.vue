<template>
  <div class="max-w-[65%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      <div v-if="expandedMonth" ref="expandedMonthContainer" class="mb-8">
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
                <button @click="closeExpandedMonth" class="btn-secondary">
                  Close
                </button>
              </div>
            </div>

            <!-- Calendar Grid - Weekdays Only -->
            <div class="grid grid-cols-6 gap-1 mb-2">
              <div v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']" :key="day"
                class="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
                {{ day }}
              </div>
              <div class="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
                Week P/L
              </div>
            </div>
            <div v-for="(week, weekIndex) in expandedMonthWeekdays" :key="weekIndex" class="grid grid-cols-6 gap-1 mb-1">
              <div v-for="(day, dayIndex) in week.days" :key="dayIndex"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 min-h-[70px] sm:min-h-[80px] cursor-pointer hover:brightness-95 transition-all"
                :class="getDayClass(day)"
                :style="getDayStyle(day)"
                @click="day.date && day.trades > 0 ? selectDay(day) : null">
                <div v-if="day.date">
                  <div class="text-xs sm:text-sm font-medium" :class="getDayTextColor(day)">
                    {{ day.date.getDate() }}
                  </div>
                  <div v-if="day.pnl !== undefined && day.trades > 0" class="mt-1">
                    <p class="text-xs sm:text-sm font-semibold truncate" :class="getDayPnlTextColor(day)">
                      ${{ formatNumber(day.pnl, 0) }}
                    </p>
                    <p class="text-xs" :class="getDaySubTextColor(day)">
                      {{ day.trades }} {{ day.trades === 1 ? 'trade' : 'trades' }}
                    </p>
                  </div>
                </div>
              </div>
              <!-- Week P/L Column -->
              <div class="flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 bg-gray-50 dark:bg-gray-800">
                <p class="text-xs sm:text-sm font-semibold" :class="week.weekPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                  ${{ formatNumber(week.weekPnl, 0) }}
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
                :class="getMiniDayClass(day)"
                :style="getMiniDayStyle(day)">
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
              class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="navigateToTrade(trade.id)">
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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const router = useRouter()

const loading = ref(true)
const trades = ref([])
const expandedMonth = ref(null)
const currentYear = ref(new Date().getFullYear())
const selectedDay = ref(null)
const expandedMonthContainer = ref(null)

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

const expandedMonthWeekdays = computed(() => {
  if (!expandedMonth.value) return []
  const days = expandedMonthDays.value
  const weeks = []
  let currentWeek = { days: [], weekPnl: 0 }
  
  days.forEach((day, index) => {
    if (day.date) {
      const dayOfWeek = getDay(day.date)
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        currentWeek.days.push(day)
        if (day.pnl !== undefined) {
          currentWeek.weekPnl += day.pnl
        }
      }
      
      // Start new week on Monday or if it's the last day
      if (dayOfWeek === 0 || index === days.length - 1) {
        if (currentWeek.days.length > 0) {
          // Pad the week if it has less than 5 days
          while (currentWeek.days.length < 5) {
            currentWeek.days.push({ date: null })
          }
          weeks.push(currentWeek)
          currentWeek = { days: [], weekPnl: 0 }
        }
      }
    }
  })
  
  // Add any remaining days
  if (currentWeek.days.length > 0) {
    while (currentWeek.days.length < 5) {
      currentWeek.days.push({ date: null })
    }
    weeks.push(currentWeek)
  }
  
  return weeks
})

const selectedDayTrades = computed(() => {
  if (!selectedDay.value || !selectedDay.value.date) return []
  return trades.value.filter(trade => {
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = trade.trade_date.split('T')[0].split('-')
    const tradeDate = new Date(year, month - 1, day)
    return tradeDate.toDateString() === selectedDay.value.date.toDateString()
  })
})

const expandedMonthTrades = computed(() => {
  if (!expandedMonth.value) return []
  return trades.value
    .filter(trade => {
      // Parse date as local date to avoid timezone issues
      const [year, month, day] = trade.trade_date.split('T')[0].split('-')
      const tradeDate = new Date(year, month - 1, day)
      return isSameMonth(tradeDate, expandedMonth.value)
    })
    .sort((a, b) => {
      // Also fix sorting to use proper date parsing
      const [yearA, monthA, dayA] = a.trade_date.split('T')[0].split('-')
      const [yearB, monthB, dayB] = b.trade_date.split('T')[0].split('-')
      const dateA = new Date(yearA, monthA - 1, dayA)
      const dateB = new Date(yearB, monthB - 1, dayB)
      return dateB - dateA
    })
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
      // Parse date as local date to avoid timezone issues
      const [year, month, day] = trade.trade_date.split('T')[0].split('-')
      const tradeDate = new Date(year, month - 1, day)
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
  return '' // Style handled by getDayStyle
}

function getDayStyle(day) {
  if (!day.date || day.pnl === undefined) return {}

  // Get all days with P/L for the expanded month to calculate relative intensity
  const daysWithPnl = expandedMonthDays.value.filter(d => d.pnl !== undefined)
  if (daysWithPnl.length === 0) return {}

  const maxProfit = Math.max(...daysWithPnl.filter(d => d.pnl > 0).map(d => d.pnl), 0)
  const maxLoss = Math.abs(Math.min(...daysWithPnl.filter(d => d.pnl < 0).map(d => d.pnl), 0))

  if (day.pnl >= 0) {
    // Green for profits - scale from light to dark based on relative size
    const intensity = maxProfit > 0 ? Math.min(day.pnl / maxProfit, 1) : 0.5
    const saturation = 50 + intensity * 30
    const lightness = 95 - (intensity * 45)
    return {
      backgroundColor: `hsl(142, ${saturation}%, ${lightness}%)`
    }
  } else {
    // Red for losses - scale from light to dark based on relative size
    const intensity = maxLoss > 0 ? Math.min(Math.abs(day.pnl) / maxLoss, 1) : 0.5
    const saturation = 50 + intensity * 30
    const lightness = 95 - (intensity * 45)
    return {
      backgroundColor: `hsl(0, ${saturation}%, ${lightness}%)`
    }
  }
}

function getDayTextColor(day) {
  if (!day.date || day.pnl === undefined) return 'text-gray-900 dark:text-white'

  const daysWithPnl = expandedMonthDays.value.filter(d => d.pnl !== undefined)
  if (daysWithPnl.length === 0) return 'text-gray-900 dark:text-white'

  const maxProfit = Math.max(...daysWithPnl.filter(d => d.pnl > 0).map(d => d.pnl), 0)
  const maxLoss = Math.abs(Math.min(...daysWithPnl.filter(d => d.pnl < 0).map(d => d.pnl), 0))

  const intensity = day.pnl >= 0
    ? (maxProfit > 0 ? Math.min(day.pnl / maxProfit, 1) : 0.5)
    : (maxLoss > 0 ? Math.min(Math.abs(day.pnl) / maxLoss, 1) : 0.5)

  // Use dark text for light backgrounds (low intensity), white for dark backgrounds (high intensity)
  return intensity > 0.4 ? 'text-white' : 'text-gray-900'
}

function getDayPnlTextColor(day) {
  if (!day.date || day.pnl === undefined) return day.pnl >= 0 ? 'text-green-600' : 'text-red-600'

  const daysWithPnl = expandedMonthDays.value.filter(d => d.pnl !== undefined)
  if (daysWithPnl.length === 0) return day.pnl >= 0 ? 'text-green-600' : 'text-red-600'

  const maxProfit = Math.max(...daysWithPnl.filter(d => d.pnl > 0).map(d => d.pnl), 0)
  const maxLoss = Math.abs(Math.min(...daysWithPnl.filter(d => d.pnl < 0).map(d => d.pnl), 0))

  const intensity = day.pnl >= 0
    ? (maxProfit > 0 ? Math.min(day.pnl / maxProfit, 1) : 0.5)
    : (maxLoss > 0 ? Math.min(Math.abs(day.pnl) / maxLoss, 1) : 0.5)

  // Use white/light colors for dark backgrounds, darker colors for light backgrounds
  if (intensity > 0.4) {
    return 'text-white font-bold'
  } else {
    return day.pnl >= 0 ? 'text-green-700' : 'text-red-700'
  }
}

function getDaySubTextColor(day) {
  if (!day.date || day.pnl === undefined) return 'text-gray-500 dark:text-gray-400'

  const daysWithPnl = expandedMonthDays.value.filter(d => d.pnl !== undefined)
  if (daysWithPnl.length === 0) return 'text-gray-500 dark:text-gray-400'

  const maxProfit = Math.max(...daysWithPnl.filter(d => d.pnl > 0).map(d => d.pnl), 0)
  const maxLoss = Math.abs(Math.min(...daysWithPnl.filter(d => d.pnl < 0).map(d => d.pnl), 0))

  const intensity = day.pnl >= 0
    ? (maxProfit > 0 ? Math.min(day.pnl / maxProfit, 1) : 0.5)
    : (maxLoss > 0 ? Math.min(Math.abs(day.pnl) / maxLoss, 1) : 0.5)

  return intensity > 0.4 ? 'text-white/80' : 'text-gray-600'
}

function getMiniDayClass(day) {
  if (!day.date) return ''
  if (day.pnl === undefined) return ''
  return 'text-white' // Color handled by getMiniDayStyle
}

function getMiniDayStyle(day) {
  if (!day.date || day.pnl === undefined) return {}

  // Get all days with P/L for the year to calculate relative intensity
  const allDaysWithPnl = []
  yearlyCalendar.value.forEach(month => {
    month.days.forEach(d => {
      if (d.pnl !== undefined) allDaysWithPnl.push(d)
    })
  })

  if (allDaysWithPnl.length === 0) {
    return {
      backgroundColor: day.pnl >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
    }
  }

  const maxProfit = Math.max(...allDaysWithPnl.filter(d => d.pnl > 0).map(d => d.pnl), 0)
  const maxLoss = Math.abs(Math.min(...allDaysWithPnl.filter(d => d.pnl < 0).map(d => d.pnl), 0))

  if (day.pnl >= 0) {
    // Green for profits - scale saturation/lightness
    const intensity = maxProfit > 0 ? Math.min(day.pnl / maxProfit, 1) : 0.5
    const saturation = 40 + (intensity * 50)
    const lightness = 55 - (intensity * 15)
    return {
      backgroundColor: `hsl(142, ${saturation}%, ${lightness}%)`
    }
  } else {
    // Red for losses - scale saturation/lightness
    const intensity = maxLoss > 0 ? Math.min(Math.abs(day.pnl) / maxLoss, 1) : 0.5
    const saturation = 40 + (intensity * 50)
    const lightness = 55 - (intensity * 15)
    return {
      backgroundColor: `hsl(0, ${saturation}%, ${lightness}%)`
    }
  }
}

async function expandMonth(monthDate) {
  expandedMonth.value = monthDate
  // Save to localStorage for persistence across navigation
  try {
    localStorage.setItem('calendar_expanded_month', monthDate.toISOString())
    localStorage.setItem('calendar_expanded_year', currentYear.value.toString())
  } catch (e) {
    console.warn('Failed to save expanded month to localStorage:', e)
  }

  // Scroll to the expanded month view after DOM updates
  await nextTick()
  if (expandedMonthContainer.value) {
    expandedMonthContainer.value.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }
}

function closeExpandedMonth() {
  expandedMonth.value = null
  // Clear from localStorage
  try {
    localStorage.removeItem('calendar_expanded_month')
    localStorage.removeItem('calendar_expanded_year')
  } catch (e) {
    console.warn('Failed to clear expanded month from localStorage:', e)
  }
}

function selectDay(day) {
  selectedDay.value = day
}

function changeYear(direction) {
  currentYear.value += direction
  // Keep expanded month open if it exists, just update to same month in new year
  if (expandedMonth.value) {
    const currentMonth = expandedMonth.value.getMonth()
    expandedMonth.value = new Date(currentYear.value, currentMonth, 1)
  }
  selectedDay.value = null
  fetchTrades()
}

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

function navigateToTrade(tradeId) {
  router.push(`/trades/${tradeId}`)
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
  // Restore expanded month from localStorage if it exists
  try {
    const savedMonth = localStorage.getItem('calendar_expanded_month')
    const savedYear = localStorage.getItem('calendar_expanded_year')

    if (savedMonth && savedYear) {
      const year = parseInt(savedYear)
      // Only restore if it's for the current year being viewed
      if (year === currentYear.value) {
        expandedMonth.value = new Date(savedMonth)
      } else {
        // Clear stale data
        localStorage.removeItem('calendar_expanded_month')
        localStorage.removeItem('calendar_expanded_year')
      }
    }
  } catch (e) {
    console.warn('Failed to restore expanded month from localStorage:', e)
  }

  fetchTrades()
})

watch(currentYear, () => {
  fetchTrades()
})
</script>