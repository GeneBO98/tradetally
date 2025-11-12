<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">System Logs</h3>
      <div class="flex items-center space-x-3">
        <!-- Log limit selector -->
        <div class="flex items-center space-x-2">
          <label class="text-sm text-gray-700 dark:text-gray-300">Show:</label>
          <select
            v-model="logLimit"
            @change="handleLimitChange"
            class="text-sm rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-primary-500 focus:border-primary-500"
          >
            <option :value="50">50 logs</option>
            <option :value="100">100 logs</option>
            <option :value="200">200 logs</option>
            <option :value="500">500 logs</option>
            <option :value="1000">1000 logs</option>
          </select>
        </div>

        <!-- Auto-refresh toggle -->
        <label class="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            v-model="autoRefresh"
            class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span class="text-gray-700 dark:text-gray-300">Auto-refresh (5s)</span>
        </label>

        <!-- Refresh button -->
        <button
          @click="fetchLogs"
          :disabled="loading"
          class="btn-secondary text-sm"
        >
          <span v-if="loading">Refreshing...</span>
          <span v-else>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Search bar -->
    <div class="relative">
      <input
        v-model="searchQuery"
        @input="debouncedSearch"
        type="text"
        placeholder="Search logs..."
        class="input pr-10"
      />
      <div class="absolute inset-y-0 right-0 flex items-center pr-3">
        <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Log level filters -->
    <div class="flex items-center space-x-2">
      <span class="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
      <button
        v-for="level in logLevels"
        :key="level"
        @click="toggleLevel(level)"
        :class="[
          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
          visibleLevels.includes(level)
            ? getLevelButtonClass(level)
            : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        ]"
      >
        {{ level }}
      </button>
    </div>

    <!-- Logs container -->
    <div class="card">
      <div class="card-body p-0">
        <div
          ref="logsContainer"
          class="overflow-auto font-mono text-xs bg-gray-900 text-gray-100 p-4 rounded-lg"
          style="max-height: 600px"
        >
          <div v-if="loading && !logs.length" class="text-center py-8 text-gray-400">
            Loading logs...
          </div>

          <div v-else-if="!logs.length" class="text-center py-8 text-gray-400">
            No logs found
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="(log, index) in filteredLogs"
              :key="index"
              :class="[
                'py-1 px-2 rounded hover:bg-gray-800 transition-colors',
                getLogLineClass(log)
              ]"
            >
              <div class="flex items-start space-x-2">
                <span class="text-gray-500 whitespace-nowrap">{{ log.timestamp }}</span>
                <span :class="getLevelClass(log.level)" class="font-bold whitespace-nowrap">
                  [{{ log.level }}]
                </span>
                <span class="flex-1 break-all" v-html="highlightSearch(log.message)"></span>
              </div>
            </div>
          </div>

          <!-- Loading more indicator -->
          <div v-if="loading && logs.length" class="text-center py-4 text-gray-400">
            Loading more logs...
          </div>
        </div>

        <!-- Stats footer -->
        <div class="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-800">
          <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <div class="space-x-4">
              <span>Total: {{ logs.length }}</span>
              <span>Filtered: {{ filteredLogs.length }}</span>
              <span v-if="searchQuery">Matches: {{ searchMatchCount }}</span>
            </div>
            <div v-if="lastUpdate" class="text-gray-500">
              Last update: {{ formatTime(lastUpdate) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import api from '@/services/api'

const logs = ref([])
const loading = ref(false)
const autoRefresh = ref(true)
const searchQuery = ref('')
const lastUpdate = ref(null)
const logsContainer = ref(null)
const searchMatchCount = ref(0)
const logLimit = ref(200)

const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const visibleLevels = ref(['DEBUG', 'INFO', 'WARN', 'ERROR'])

let refreshInterval = null
let debounceTimeout = null

// Parse log line into structured format
function parseLogLine(line) {
  // Format: [2025-01-15T10:30:45.123Z] [INFO] Message
  const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$/)

  if (match) {
    return {
      timestamp: match[1],
      level: match[2],
      message: match[3],
      raw: line
    }
  }

  // Fallback for unparsed lines - tag as DEBUG
  return {
    timestamp: '',
    level: 'DEBUG',
    message: line,
    raw: line
  }
}

// Fetch logs from API
async function fetchLogs() {
  try {
    loading.value = true
    const response = await api.get('/admin/logs/recent', {
      params: { limit: logLimit.value }
    })

    if (response.data.content) {
      const lines = response.data.content.split('\n').filter(line => line.trim())
      logs.value = lines.map(parseLogLine)
      searchMatchCount.value = response.data.pagination?.searchMatchCount || 0
    } else {
      logs.value = []
    }

    lastUpdate.value = new Date()

    // Scroll to bottom to show newest logs (oldest at top, newest at bottom)
    setTimeout(() => {
      if (logsContainer.value) {
        logsContainer.value.scrollTop = logsContainer.value.scrollHeight
      }
    }, 100)
  } catch (error) {
    console.error('[LOGS] Failed to fetch logs:', error)
  } finally {
    loading.value = false
  }
}

// Handle log limit change
function handleLimitChange() {
  fetchLogs()
}

// Filtered logs based on level and search
const filteredLogs = computed(() => {
  let filtered = logs.value.filter(log => visibleLevels.value.includes(log.level))

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(log =>
      log.message.toLowerCase().includes(query) ||
      log.level.toLowerCase().includes(query)
    )
  }

  return filtered
})

// Toggle log level visibility
function toggleLevel(level) {
  const index = visibleLevels.value.indexOf(level)
  if (index > -1) {
    visibleLevels.value.splice(index, 1)
  } else {
    visibleLevels.value.push(level)
  }
}

// Get CSS class for log level badge
function getLevelClass(level) {
  const classes = {
    DEBUG: 'text-cyan-400',
    INFO: 'text-green-400',
    WARN: 'text-yellow-400',
    ERROR: 'text-red-400'
  }
  return classes[level] || 'text-gray-400'
}

// Get button class for level filter
function getLevelButtonClass(level) {
  const classes = {
    DEBUG: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    INFO: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WARN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    ERROR: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }
  return classes[level] || 'bg-gray-100 text-gray-800'
}

// Get subtle background for log lines
function getLogLineClass(log) {
  const classes = {
    ERROR: 'bg-red-900/10',
    WARN: 'bg-yellow-900/10'
  }
  return classes[log.level] || ''
}

// Highlight search terms in log messages
function highlightSearch(message) {
  if (!searchQuery.value) return message

  const query = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${query})`, 'gi')
  return message.replace(regex, '<span class="bg-yellow-400 text-gray-900 px-1 rounded">$1</span>')
}

// Debounced search
function debouncedSearch() {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    // Search is handled by computed property
  }, 300)
}

// Format time for display
function formatTime(date) {
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)

  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`

  return date.toLocaleTimeString()
}

// Set up auto-refresh
watch(autoRefresh, (enabled) => {
  if (enabled) {
    refreshInterval = setInterval(fetchLogs, 5000)
  } else {
    clearInterval(refreshInterval)
  }
})

onMounted(() => {
  fetchLogs()
  if (autoRefresh.value) {
    refreshInterval = setInterval(fetchLogs, 5000)
  }
})

onUnmounted(() => {
  clearInterval(refreshInterval)
  clearTimeout(debounceTimeout)
})
</script>
