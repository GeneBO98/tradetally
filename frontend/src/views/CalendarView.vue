<template>
  <div class="content-wrapper py-8">
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1 class="heading-page">Trading Calendar</h1>
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

    <!-- Full page spinner only on initial load -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Content with optional refresh indicator -->
    <div v-else class="relative">
      <!-- Subtle refresh indicator -->
      <div v-if="loading" class="absolute top-0 right-0 z-10">
        <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
          <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
        </div>
      </div>
      <!-- Expanded Month View -->
      <div v-if="expandedMonth" ref="expandedMonthContainer" class="mb-8">
        <div class="card">
          <div class="card-body">
            <div class="flex justify-between items-center mb-6">
              <h2 class="heading-section">
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
      <div
        class="relative mx-auto p-5 border shadow-lg rounded-md bg-white dark:bg-gray-800 transition-all duration-300"
        :class="isModalExpanded
          ? 'top-4 w-full max-w-6xl h-[calc(100vh-2rem)]'
          : 'top-20 w-full max-w-2xl'">
        <div class="h-full flex flex-col">
          <div class="flex justify-between items-center mb-4">
            <h3 class="heading-card">
              Trades for {{ format(selectedDay.date, 'MMMM d, yyyy') }}
            </h3>
            <div class="flex items-center space-x-2">
              <button
                @click="isModalExpanded = !isModalExpanded"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                :title="isModalExpanded ? 'Collapse' : 'Expand'">
                <ArrowsPointingInIcon v-if="isModalExpanded" class="h-5 w-5" />
                <ArrowsPointingOutIcon v-else class="h-5 w-5" />
              </button>
              <button @click="selectedDay = null; isModalExpanded = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <XMarkIcon class="h-6 w-6" />
              </button>
            </div>
          </div>

          <div class="space-y-3 overflow-y-auto flex-1" :class="isModalExpanded ? '' : 'max-h-96'">
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

          <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex justify-between items-center">
              <span class="font-medium text-gray-900 dark:text-white">Total for day:</span>
              <span class="font-bold text-lg" :class="selectedDayTotalPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                ${{ formatNumber(selectedDayTotalPnl) }}
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
import { useRouter, useRoute } from 'vue-router'
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const { selectedAccount } = useGlobalAccountFilter()

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const initialLoading = ref(true) // Track initial load separately to preserve scroll on refresh
const calendarData = ref(new Map()) // Map of date string -> { trades: number, pnl: number }
const trades = ref([]) // Only loaded when needed (e.g., for modal)
const expandedMonth = ref(null)
// Initialize year from route query, localStorage, or current year (in that order)
const getInitialYear = () => {
  // First check route query
  if (route.query.year) {
    const queryYear = parseInt(route.query.year)
    if (!isNaN(queryYear) && queryYear >= 1900 && queryYear <= 2100) {
      return queryYear
    }
  }
  // Then check localStorage
  const savedYear = localStorage.getItem('calendar_year')
  if (savedYear) {
    const parsedYear = parseInt(savedYear)
    if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100) {
      return parsedYear
    }
  }
  // Default to current year
  return new Date().getFullYear()
}
const currentYear = ref(getInitialYear())
const selectedDay = ref(null)
const expandedMonthContainer = ref(null)
const isModalExpanded = ref(false)

// Helper to get calendar data for a date
function getCalendarDataForDate(date) {
  if (!date) return { trades: 0, pnl: 0 }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateKey = `${year}-${month}-${day}`
  return calendarData.value.get(dateKey) || { trades: 0, pnl: 0 }
}

// Helper to get trades for a date (for modal display)
function getTradesForDate(date) {
  if (!date) return []
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateKey = `${year}-${month}-${day}`
  // Filter trades that exited on this date
  return trades.value.filter(trade => {
    if (!trade.exit_time) return false
    const tradeDateKey = trade.exit_time.split('T')[0]
    return tradeDateKey === dateKey
  })
}

// Helper to get total P&L for a date
function getPnlForDate(date) {
  return getCalendarDataForDate(date).pnl
}

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
  const monthStart = startOfMonth(expandedMonth.value)
  const monthEnd = endOfMonth(expandedMonth.value)
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const weeks = []
  let currentWeek = { days: [], weekPnl: 0 }

  for (const date of allDays) {
    const dayOfWeek = getDay(date) // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // If we hit Sunday and have accumulated weekdays, finish the week
      if (dayOfWeek === 0 && currentWeek.days.length > 0) {
        // Pad to 5 days if needed (for partial weeks)
        while (currentWeek.days.length < 5) {
          currentWeek.days.push({ date: null })
        }
        weeks.push(currentWeek)
        currentWeek = { days: [], weekPnl: 0 }
      }
      continue
    }

    // If it's Monday and we already have days, start a new week
    if (dayOfWeek === 1 && currentWeek.days.length > 0) {
      // Pad to 5 days if needed (for partial weeks)
      while (currentWeek.days.length < 5) {
        currentWeek.days.push({ date: null })
      }
      weeks.push(currentWeek)
      currentWeek = { days: [], weekPnl: 0 }
    }

    // Add padding for the first week if it doesn't start on Monday
    if (weeks.length === 0 && currentWeek.days.length === 0 && dayOfWeek > 1) {
      for (let i = 1; i < dayOfWeek; i++) {
        currentWeek.days.push({ date: null })
      }
    }

    // Get calendar data using optimized lookup
    const dayData = getCalendarDataForDate(date)

    currentWeek.days.push({
      date,
      trades: dayData.trades,
      pnl: dayData.trades > 0 ? dayData.pnl : undefined
    })

    if (dayData.trades > 0) {
      currentWeek.weekPnl += dayData.pnl
    }
  }

  // Add any remaining days as the last week
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
  return getTradesForDate(selectedDay.value.date)
})

// Calculate the total P&L from the actual displayed trades (more accurate than calendar aggregation)
const selectedDayTotalPnl = computed(() => {
  return selectedDayTrades.value.reduce((sum, trade) => sum + (parseFloat(trade.pnl) || 0), 0)
})

const expandedMonthTrades = computed(() => {
  if (!expandedMonth.value) return []
  // Calculate monthly P&L from calendar data
  const monthStart = startOfMonth(expandedMonth.value)
  const monthEnd = endOfMonth(expandedMonth.value)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  return monthDays.map(date => {
    const data = getCalendarDataForDate(date)
    return {
      date: date.toISOString().split('T')[0],
      trades: data.trades,
      pnl: data.pnl
    }
  }).filter(day => day.trades > 0)
})

const monthlyPnl = computed(() => {
  if (!expandedMonth.value) return 0
  const monthStart = startOfMonth(expandedMonth.value)
  const monthEnd = endOfMonth(expandedMonth.value)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  return monthDays.reduce((sum, date) => {
    return sum + getCalendarDataForDate(date).pnl
  }, 0)
})


function generateMonthDays(monthStart, monthEnd) {
  const days = []
  const startPadding = getDay(monthStart)

  // Add padding for days before month starts
  for (let i = 0; i < startPadding; i++) {
    days.push({ date: null })
  }

  // Add all days of the month using optimized lookup
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  for (const date of monthDays) {
    const dayData = getCalendarDataForDate(date)

    days.push({
      date,
      trades: dayData.trades,
      pnl: dayData.trades > 0 ? dayData.pnl : undefined
    })
  }

  return days
}

function getDayClass(day) {
  if (!day.date) return ''
  if (day.pnl === undefined) return 'bg-gray-50 dark:bg-gray-800'
  return '' // Style handled by getDayStyle
}

function getDayStyle(day) {
  if (!day.date || day.pnl === undefined) return {}

  // Flat color scheme - no intensity-based shading
  if (day.pnl >= 0) {
    return { backgroundColor: 'rgb(34, 197, 94)' } // green-500
  } else {
    return { backgroundColor: 'rgb(239, 68, 68)' } // red-500
  }
}

function getDayTextColor(day) {
  if (!day.date || day.pnl === undefined) return 'text-gray-900 dark:text-white'
  // White text on colored backgrounds
  return 'text-white'
}

function getDayPnlTextColor(day) {
  if (!day.date || day.pnl === undefined) return day.pnl >= 0 ? 'text-green-600' : 'text-red-600'
  // White bold text on colored backgrounds
  return 'text-white font-bold'
}

function getDaySubTextColor(day) {
  if (!day.date || day.pnl === undefined) return 'text-gray-500 dark:text-gray-400'
  // Slightly transparent white on colored backgrounds
  return 'text-white/80'
}

function getMiniDayClass(day) {
  if (!day.date) return ''
  if (day.pnl === undefined) return ''
  return 'text-white' // Color handled by getMiniDayStyle
}

function getMiniDayStyle(day) {
  if (!day.date || day.pnl === undefined) return {}

  // Flat color scheme - no intensity-based shading
  if (day.pnl >= 0) {
    return { backgroundColor: 'rgb(34, 197, 94)' } // green-500
  } else {
    return { backgroundColor: 'rgb(239, 68, 68)' } // red-500
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

async function selectDay(day) {
  selectedDay.value = day
  // Lazy load trades for this day if not already loaded
  if (day.date) {
    await fetchTradesForDate(day.date)
  }
}

function changeYear(direction) {
  currentYear.value += direction
  // Keep expanded month open if it exists, just update to same month in new year
  if (expandedMonth.value) {
    const currentMonth = expandedMonth.value.getMonth()
    expandedMonth.value = new Date(currentYear.value, currentMonth, 1)
  }
  selectedDay.value = null

  // Save to localStorage and update URL for back button support
  localStorage.setItem('calendar_year', currentYear.value.toString())
  router.replace({ query: { ...route.query, year: currentYear.value } })

  fetchCalendarData()
}

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

function navigateToTrade(tradeId) {
  // Save current state to localStorage before navigating
  localStorage.setItem('calendar_year', currentYear.value.toString())
  if (expandedMonth.value) {
    localStorage.setItem('calendar_expanded_month', expandedMonth.value.toISOString())
    localStorage.setItem('calendar_expanded_year', currentYear.value.toString())
  }
  router.push(`/trades/${tradeId}`)
}

async function fetchCalendarData() {
  loading.value = true
  try {
    const params = {
      year: currentYear.value
    }
    // Apply global account filter
    if (selectedAccount.value) {
      params.accounts = selectedAccount.value
    }
    const response = await api.get('/analytics/calendar', { params })
    
    // Convert array to Map for O(1) lookup
    const dataMap = new Map()
    if (response.data.calendar) {
      for (const day of response.data.calendar) {
        dataMap.set(day.trade_date, {
          trades: parseInt(day.trades) || 0,
          pnl: parseFloat(day.daily_pnl) || 0
        })
      }
    }
    calendarData.value = dataMap
    
    // Only fetch full trades if we need them (e.g., for modal)
    // For now, we'll fetch them lazily when a day is selected
    trades.value = []
  } catch (error) {
    console.error('Failed to fetch calendar data:', error)
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

// Fetch trades for a specific date (lazy loading for modal)
async function fetchTradesForDate(date) {
  if (!date) return []
  
  // Check if we already have trades for this date
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateKey = `${year}-${month}-${day}`
  
  // Filter existing trades or fetch if needed
  const existingTrades = trades.value.filter(t => {
    if (!t.exit_time) return false
    return t.exit_time.split('T')[0] === dateKey
  })
  
  if (existingTrades.length > 0) {
    return existingTrades
  }
  
  // Fetch trades for this date - filter by EXIT date (when trade was closed)
  // This matches the calendar P&L calculation which groups by exit_time
  try {
    const params = {
      exitStartDate: dateKey,
      exitEndDate: dateKey,
      limit: 100
    }
    if (selectedAccount.value) {
      params.accounts = selectedAccount.value
    }
    const response = await api.get('/trades', { params })
    // Merge with existing trades (avoid duplicates)
    const newTrades = response.data.trades || []
    const existingIds = new Set(trades.value.map(t => t.id))
    const uniqueNewTrades = newTrades.filter(t => !existingIds.has(t.id))
    trades.value = [...trades.value, ...uniqueNewTrades]
    return newTrades
  } catch (error) {
    console.error('Failed to fetch trades for date:', error)
    return []
  }
}

onMounted(() => {
  // Sync URL with current year if it came from localStorage (not from route query)
  if (!route.query.year || parseInt(route.query.year) !== currentYear.value) {
    router.replace({ query: { ...route.query, year: currentYear.value } })
  }

  // Restore expanded month from localStorage if it exists and matches current year
  try {
    const savedMonth = localStorage.getItem('calendar_expanded_month')
    const savedYear = localStorage.getItem('calendar_expanded_year')

    if (savedMonth && savedYear) {
      const year = parseInt(savedYear)
      // Restore if it matches the current year being viewed
      if (year === currentYear.value) {
        expandedMonth.value = new Date(savedMonth)
      } else {
        // Clear stale expanded month data (but keep calendar_year)
        localStorage.removeItem('calendar_expanded_month')
        localStorage.removeItem('calendar_expanded_year')
      }
    }
  } catch (e) {
    console.warn('Failed to restore expanded month from localStorage:', e)
  }

  fetchCalendarData()
})

watch(currentYear, () => {
  fetchCalendarData()
})

// Watch for route query changes (handles browser back/forward buttons)
watch(() => route.query.year, (newYear) => {
  if (newYear) {
    const parsedYear = parseInt(newYear)
    if (!isNaN(parsedYear) && parsedYear !== currentYear.value) {
      currentYear.value = parsedYear
      localStorage.setItem('calendar_year', parsedYear.toString())
      // Restore expanded month if it matches the new year
      const savedMonth = localStorage.getItem('calendar_expanded_month')
      const savedYear = localStorage.getItem('calendar_expanded_year')
      if (savedMonth && savedYear && parseInt(savedYear) === parsedYear) {
        expandedMonth.value = new Date(savedMonth)
      } else {
        expandedMonth.value = null
      }
      selectedDay.value = null
    }
  }
})

// Watch for global account filter changes
watch(selectedAccount, () => {
  console.log('Calendar: Global account filter changed to:', selectedAccount.value || 'All Accounts')
  fetchCalendarData()
})
</script>