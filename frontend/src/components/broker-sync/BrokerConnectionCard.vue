<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-4">
          <!-- Broker Logo -->
          <div
            class="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
            :class="brokerStyles.bgClass"
          >
            <span :class="brokerStyles.textClass" class="font-bold text-lg">
              {{ brokerStyles.abbrev }}
            </span>
          </div>

          <div>
            <h4 class="font-medium text-gray-900 dark:text-white">{{ brokerStyles.name }}</h4>
            <div class="flex items-center space-x-2 mt-1">
              <span
                class="px-2 py-0.5 text-xs rounded-full"
                :class="statusClass"
              >
                {{ connection.connectionStatus }}
              </span>
              <span v-if="connection.autoSyncEnabled" class="text-xs text-gray-500 dark:text-gray-400">
                Auto-sync {{ connection.syncFrequency }}
              </span>
            </div>
          </div>
        </div>

        <!-- Actions Menu -->
        <div class="relative" ref="menuRef">
          <button
            @click="showMenu = !showMenu"
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          <div
            v-if="showMenu"
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10"
          >
            <button
              @click="emit('settings', connection); showMenu = false"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg"
            >
              Settings
            </button>
            <button
              @click="emit('test', connection); showMenu = false"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Test Connection
            </button>
            <button
              @click="emit('delete', connection); showMenu = false"
              class="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 last:rounded-b-lg"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      <!-- Last Sync Info -->
      <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between text-sm">
          <div class="text-gray-500 dark:text-gray-400">
            <template v-if="connection.lastSyncAt">
              Last synced: {{ formatDate(connection.lastSyncAt) }}
              <span v-if="connection.lastSyncTradesImported" class="text-green-600 dark:text-green-400">
                ({{ connection.lastSyncTradesImported }} imported)
              </span>
            </template>
            <template v-else>
              Never synced
            </template>
          </div>

          <button
            @click="emit('sync', connection)"
            :disabled="syncing"
            class="btn-primary text-sm py-1.5 px-3"
          >
            <span v-if="syncing" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Syncing...
            </span>
            <span v-else>Sync Now</span>
          </button>
        </div>

        <!-- Error Message -->
        <div
          v-if="connection.lastErrorMessage && connection.connectionStatus === 'error'"
          class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300"
        >
          {{ connection.lastErrorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBrokerSyncStore } from '@/stores/brokerSync'

const props = defineProps({
  connection: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['sync', 'test', 'settings', 'delete'])

const store = useBrokerSyncStore()
const showMenu = ref(false)
const menuRef = ref(null)

const syncing = computed(() => store.isConnectionSyncing(props.connection.id))

const brokerStyles = computed(() => {
  switch (props.connection.brokerType) {
    case 'ibkr':
      return {
        name: 'Interactive Brokers',
        abbrev: 'IB',
        bgClass: 'bg-red-100 dark:bg-red-900/30',
        textClass: 'text-red-600 dark:text-red-400'
      }
    case 'schwab':
      return {
        name: 'Charles Schwab',
        abbrev: 'CS',
        bgClass: 'bg-blue-100 dark:bg-blue-900/30',
        textClass: 'text-blue-600 dark:text-blue-400'
      }
    default:
      return {
        name: props.connection.brokerType,
        abbrev: props.connection.brokerType.substring(0, 2).toUpperCase(),
        bgClass: 'bg-gray-100 dark:bg-gray-900/30',
        textClass: 'text-gray-600 dark:text-gray-400'
      }
  }
})

const statusClass = computed(() => {
  switch (props.connection.connectionStatus) {
    case 'active':
      return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
    case 'error':
      return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
    case 'expired':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
    default:
      return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300'
  }
})

function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now - d

  // If less than 24 hours, show relative time
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) {
      const minutes = Math.floor(diff / 60000)
      return minutes < 1 ? 'Just now' : `${minutes}m ago`
    }
    return `${hours}h ago`
  }

  return d.toLocaleDateString()
}

// Close menu when clicking outside
function handleClickOutside(event) {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
