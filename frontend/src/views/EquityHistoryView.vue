<template>
  <div class="max-w-[75%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Equity History</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Track your account equity over time. Click on any day to add or edit your equity amount.
          </p>
        </div>
        <router-link 
          to="/settings" 
          class="btn-secondary"
        >
          Back to Settings
        </router-link>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="space-y-6">
      <!-- Calendar Navigation -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <button 
              @click="previousMonth"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ currentMonthYear }}
            </h2>
            
            <button 
              @click="nextMonth"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 gap-1">
            <!-- Day Headers -->
            <div 
              v-for="day in dayHeaders" 
              :key="day"
              class="p-2 text-xs font-medium text-gray-500 dark:text-gray-400 text-center"
            >
              {{ day }}
            </div>

            <!-- Calendar Days -->
            <div
              v-for="day in calendarDays"
              :key="day.dateStr"
              @click="selectDay(day)"
              class="relative p-2 min-h-[80px] border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer transition-colors"
              :class="getDayClasses(day)"
            >
              <div class="text-sm font-medium" :class="day.isCurrentMonth ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'">
                {{ day.day }}
              </div>
              
              <!-- Equity Amount Display -->
              <div v-if="day.equity" class="mt-1">
                <div class="text-xs font-medium text-green-600 dark:text-green-400">
                  ${{ formatNumber(day.equity) }}
                </div>
              </div>
              
              <!-- Today Indicator -->
              <div v-if="day.isToday" class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              
              <!-- Has Equity Indicator -->
              <div v-if="day.equity" class="absolute bottom-1 left-1 w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Summary -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
              Month Start
            </dt>
            <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {{ monthStartEquity ? `$${formatNumber(monthStartEquity)}` : 'N/A' }}
            </dd>
          </div>
        </div>
        
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
              Month End
            </dt>
            <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {{ monthEndEquity ? `$${formatNumber(monthEndEquity)}` : 'N/A' }}
            </dd>
          </div>
        </div>
        
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
              Monthly Change
            </dt>
            <dd class="mt-1 text-lg font-semibold" :class="monthlyChangeClass">
              {{ monthlyChange }}
            </dd>
          </div>
        </div>
      </div>
    </div>

    <!-- Equity Edit Modal -->
    <div v-if="showEquityModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Edit Equity for {{ selectedDateFormatted }}
          </h3>
          
          <form @submit.prevent="saveEquity">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Equity
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span class="text-gray-500 dark:text-gray-400">$</span>
                </div>
                <input
                  v-model="equityForm.amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter equity amount"
                  class="block w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes (Optional)
              </label>
              <textarea
                v-model="equityForm.notes"
                rows="3"
                placeholder="Add any notes about this equity entry"
                class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              ></textarea>
            </div>

            <div class="flex justify-between items-center">
              <button
                v-if="selectedDayEquity"
                @click="deleteEquity"
                type="button"
                class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
              >
                Delete Entry
              </button>
              <div v-else></div>
              
              <div class="flex space-x-3">
                <button
                  @click="closeEquityModal"
                  type="button"
                  class="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  :disabled="saving"
                  class="btn-primary"
                >
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const { showSuccess, showError } = useNotification()

const loading = ref(true)
const saving = ref(false)
const equitySnapshots = ref([])
const showEquityModal = ref(false)
const selectedDay = ref(null)
const selectedDayEquity = ref(null)

const currentMonthYear = ref('')
const calendarDays = ref([])
const monthStartEquity = ref(null)
const monthEndEquity = ref(null)
const monthlyChange = ref('N/A')
const monthlyChangeClass = ref('text-gray-900 dark:text-white')

const selectedDateFormatted = ref('')

const equityForm = ref({
  amount: '',
  notes: ''
})

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Current date state
let currentDate = new Date()

function formatNumber(number) {
  return parseFloat(number).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function isToday(date) {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function getDayClasses(day) {
  const classes = []
  
  if (day.isCurrentMonth) {
    classes.push('hover:bg-gray-50 dark:hover:bg-gray-700')
  } else {
    classes.push('bg-gray-50 dark:bg-gray-800')
  }
  
  if (day.isToday) {
    classes.push('ring-2 ring-blue-500')
  }
  
  if (day.equity) {
    classes.push('bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700')
  }
  
  return classes
}

function updateCalendarData() {
  // Update month year display
  currentMonthYear.value = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })
  
  // Generate calendar days
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())
  
  console.log('Calendar generation for:', { year, month, firstDay, lastDay, startDate })
  
  const days = []
  const currentDateIterator = new Date(startDate)
  
  for (let i = 0; i < 42; i++) {
    const dateStr = currentDateIterator.toISOString().split('T')[0]
    // Try multiple date format matches to handle potential timezone issues
    const equity = equitySnapshots.value.find(s => {
      const dbDate = s.snapshot_date
      // Try exact match first
      if (dbDate === dateStr) return true
      // Try matching just the date part if it's a full timestamp
      if (dbDate && dbDate.split('T')[0] === dateStr) return true
      // Try parsing the database date and comparing
      try {
        const dbDateOnly = new Date(dbDate).toISOString().split('T')[0]
        return dbDateOnly === dateStr
      } catch (e) {
        return false
      }
    })
    
    if (equity) {
      console.log('Found equity for', dateStr, ':', equity)
    }
    
    // Debug today's date specifically
    if (dateStr === '2025-07-09') {
      console.log('Processing today (2025-07-09):')
      console.log('  dateStr:', dateStr)
      console.log('  equitySnapshots:', equitySnapshots.value)
      console.log('  search result:', equity)
      console.log('  available dates:', equitySnapshots.value.map(s => s.snapshot_date))
    }
    
    days.push({
      date: new Date(currentDateIterator),
      dateStr: dateStr,
      day: currentDateIterator.getDate(),
      isCurrentMonth: currentDateIterator.getMonth() === month,
      isToday: isToday(currentDateIterator),
      equity: equity?.equity_amount || null,
      equityData: equity
    })
    
    currentDateIterator.setDate(currentDateIterator.getDate() + 1)
  }
  
  calendarDays.value = days
  
  // Update monthly stats
  updateMonthlyStats()
}

function updateMonthlyStats() {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const monthlyEquities = equitySnapshots.value
    .filter(s => {
      const date = new Date(s.snapshot_date)
      return date.getFullYear() === year && date.getMonth() === month
    })
    .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date))
  
  monthStartEquity.value = monthlyEquities.length > 0 ? monthlyEquities[0].equity_amount : null
  monthEndEquity.value = monthlyEquities.length > 0 ? monthlyEquities[monthlyEquities.length - 1].equity_amount : null
  
  if (monthStartEquity.value && monthEndEquity.value) {
    const change = monthEndEquity.value - monthStartEquity.value
    const percentage = ((change / monthStartEquity.value) * 100).toFixed(2)
    monthlyChange.value = `$${formatNumber(change)} (${percentage}%)`
    monthlyChangeClass.value = change >= 0 ? 'text-green-600' : 'text-red-600'
  } else {
    monthlyChange.value = 'N/A'
    monthlyChangeClass.value = 'text-gray-900 dark:text-white'
  }
}

function previousMonth() {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  loadEquitySnapshots()
}

function nextMonth() {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  loadEquitySnapshots()
}

function selectDay(day) {
  selectedDay.value = day
  selectedDayEquity.value = day.equityData
  
  selectedDateFormatted.value = day.date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  equityForm.value = {
    amount: day.equity || '',
    notes: day.equityData?.notes || ''
  }
  
  showEquityModal.value = true
}

function closeEquityModal() {
  showEquityModal.value = false
  selectedDay.value = null
  selectedDayEquity.value = null
  selectedDateFormatted.value = ''
  equityForm.value = {
    amount: '',
    notes: ''
  }
}

async function saveEquity() {
  if (!selectedDay.value || !equityForm.value.amount) return
  
  saving.value = true
  
  try {
    const dateStr = selectedDay.value.dateStr
    const payload = {
      equityAmount: parseFloat(equityForm.value.amount),
      snapshotDate: dateStr,
      notes: equityForm.value.notes
    }
    
    if (selectedDayEquity.value) {
      // Update existing
      await api.put(`/equity/snapshots/${selectedDayEquity.value.id}`, payload)
    } else {
      // Create new
      await api.post('/equity/snapshots', payload)
    }
    
    showSuccess('Success', 'Equity updated successfully')
    closeEquityModal()
    await loadEquitySnapshots()
  } catch (error) {
    showError('Error', error.response?.data?.message || 'Failed to save equity')
  } finally {
    saving.value = false
  }
}

async function deleteEquity() {
  if (!selectedDayEquity.value) return
  
  if (!confirm('Are you sure you want to delete this equity entry?')) return
  
  saving.value = true
  
  try {
    await api.delete(`/equity/snapshots/${selectedDayEquity.value.id}`)
    showSuccess('Success', 'Equity entry deleted successfully')
    closeEquityModal()
    await loadEquitySnapshots()
  } catch (error) {
    showError('Error', 'Failed to delete equity entry')
  } finally {
    saving.value = false
  }
}

async function loadEquitySnapshots() {
  try {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // Get full calendar range including prev/next month days
    const firstDay = new Date(year, month, 1)
    const calendarStartDate = new Date(firstDay)
    calendarStartDate.setDate(calendarStartDate.getDate() - firstDay.getDay())
    
    const lastDay = new Date(year, month + 1, 0)
    const calendarEndDate = new Date(lastDay)
    calendarEndDate.setDate(calendarEndDate.getDate() + (6 - lastDay.getDay()))
    
    const startDate = calendarStartDate.toISOString().split('T')[0]
    const endDate = calendarEndDate.toISOString().split('T')[0]
    
    console.log('Current date object:', currentDate)
    console.log('Year:', year, 'Month:', month)
    console.log('Calendar range:', startDate, 'to', endDate)
    
    console.log('Loading equity snapshots for:', { startDate, endDate })
    console.log('Today is:', new Date().toISOString().split('T')[0])
    
    const response = await api.get('/equity/snapshots', {
      params: {
        startDate,
        endDate,
        limit: 100
      }
    })
    
    console.log('API response:', response.data)
    
    equitySnapshots.value = response.data.data || []
    console.log('Processed equity snapshots:', equitySnapshots.value)
    console.log('Equity snapshots details:', equitySnapshots.value.map(s => ({
      id: s.id,
      equity_amount: s.equity_amount,
      snapshot_date: s.snapshot_date,
      notes: s.notes
    })))
    updateCalendarData()
  } catch (error) {
    console.error('Error loading equity snapshots:', error)
    showError('Error', 'Failed to load equity history')
  }
}

onMounted(async () => {
  try {
    await loadEquitySnapshots()
  } catch (error) {
    console.error('Error loading equity history:', error)
    showError('Error', 'Failed to load equity history')
  } finally {
    loading.value = false
  }
})
</script>