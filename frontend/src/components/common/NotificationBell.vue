<template>
  <div ref="rootRef" class="relative">
    <!-- Bell Icon Button -->
    <button
      @click="toggleDropdown"
      class="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      :aria-label="isOpen ? 'Close notifications' : 'Open notifications'"
      :aria-expanded="isOpen"
    >
      <BellIcon class="h-5 w-5" />
      <!-- Badge for unread count -->
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <!-- Notification Dropdown -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
        @click.stop
      >
        <!-- Header -->
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            <button
              v-if="notifications.length > 0 && notifications.some(n => !n.is_read)"
              @click="markAllAsRead"
              :disabled="markingAsRead"
              class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="markingAsRead" class="flex items-center">
                <div class="animate-spin rounded-full h-3 w-3 border-b border-current mr-1"></div>
                Marking...
              </span>
              <span v-else>Mark all read</span>
            </button>
          </div>
        </div>

        <!-- Notifications List -->
        <div class="max-h-96 overflow-y-auto">
          <div v-if="loading" class="p-4 text-center">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading notifications...</p>
          </div>

          <div v-else-if="notifications.length === 0" class="p-8 text-center">
            <BellSlashIcon class="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p class="text-gray-500 dark:text-gray-400">No unread notifications</p>
            <router-link
              to="/notifications"
              class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 mt-2 inline-block"
              @click="closeDropdown"
            >
              View all notifications
            </router-link>
          </div>

          <div v-else>
            <div
              v-for="notification in notifications"
              :key="notification.id"
              class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              @click="handleNotificationClick(notification)"
            >
              <div class="flex items-start space-x-3">
                <!-- Icon based on notification type -->
                <div class="flex-shrink-0 mt-0.5">
                  <BellIcon
                    v-if="notification.type === 'price_alert'"
                    class="h-5 w-5 text-yellow-500"
                  />
                  <ChatBubbleLeftRightIcon
                    v-else-if="notification.type === 'trade_comment'"
                    class="h-5 w-5 text-blue-500"
                  />
                  <TrophyIcon
                    v-else-if="notification.type === 'achievement_earned'"
                    class="h-5 w-5 text-amber-500"
                  />
                  <ArrowTrendingUpIcon
                    v-else-if="notification.type === 'level_up'"
                    class="h-5 w-5 text-emerald-500"
                  />
                  <BellIcon v-else class="h-5 w-5 text-gray-400" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ notification.symbol || 'Notification' }}
                    </p>
                    <time class="text-xs text-gray-500 dark:text-gray-400">
                      {{ formatTime(notification.created_at) }}
                    </time>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {{ notification.message }}
                  </p>
                  
                  <!-- Additional info for price alerts -->
                  <div v-if="notification.type === 'price_alert' && notification.trigger_price" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Triggered at ${{ parseFloat(notification.trigger_price).toFixed(2) }}
                  </div>
                </div>

                <!-- Unread indicator -->
                <div v-if="!notification.is_read" class="flex-shrink-0">
                  <div class="w-2 h-2 bg-primary-500 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div v-if="notifications.length > 0" class="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <router-link
            to="/notifications"
            class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            @click="closeDropdown"
          >
            View all notifications
          </router-link>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { 
  BellIcon, 
  BellSlashIcon, 
  ChatBubbleLeftRightIcon,
  TrophyIcon,
  ArrowTrendingUpIcon
} from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { useNotificationCenter } from '@/composables/useNotificationCenter'

const router = useRouter()
const authStore = useAuthStore()
const { formatDateTime: formatDateTimeTz } = useUserTimezone()
const {
  unreadCount,
  recentUnreadNotifications,
  addUnreadNotifications,
  reconcileUnreadCount,
  setRecentUnreadNotifications,
  decrementUnreadCount,
  clearUnreadState
} = useNotificationCenter()

// Component state
const rootRef = ref(null)
const isOpen = ref(false)
const notifications = ref([])
const loading = ref(false)
const markingAsRead = ref(false)
const pollInterval = ref(null)
const pollingDisabled = ref(false)

// Computed
const isAuthenticated = computed(() => authStore.isAuthenticated)

// Methods
const toggleDropdown = async () => {
  if (!isAuthenticated.value) return
  
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    if (recentUnreadNotifications.value.length > 0) {
      notifications.value = recentUnreadNotifications.value
    }
    await fetchNotifications()
  }
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleDocumentClick = (event) => {
  if (!isOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    closeDropdown()
  }
}

const handleEscKey = (event) => {
  if (event.key === 'Escape' && isOpen.value) {
    closeDropdown()
  }
}

const handleNotificationsUpdated = async (event) => {
  if (!isAuthenticated.value || pollingDisabled.value) return

  const unreadDelta = Number(event?.detail?.unreadDelta || 0)
  const incomingNotifications = Array.isArray(event?.detail?.notifications)
    ? event.detail.notifications
    : []

  addUnreadNotifications(unreadDelta, incomingNotifications)

  if (incomingNotifications.length > 0 && isOpen.value) {
    notifications.value = recentUnreadNotifications.value
  }

  window.setTimeout(async () => {
    await fetchUnreadCount()
    if (isOpen.value) {
      await fetchNotifications()
    }
  }, 250)
}

const stopPolling = () => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

const disablePolling = () => {
  pollingDisabled.value = true
  stopPolling()
}

const fetchNotifications = async () => {
  if (!isAuthenticated.value || pollingDisabled.value) return
  
  try {
    loading.value = true
    // Only fetch unread notifications for the bell dropdown
    const response = await fetch(`/api/notifications?limit=10&unread_only=true&_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      const fetchedNotifications = data.data || []

      if (fetchedNotifications.length > 0) {
        notifications.value = fetchedNotifications
        setRecentUnreadNotifications(fetchedNotifications)
      } else if (recentUnreadNotifications.value.length > 0) {
        notifications.value = recentUnreadNotifications.value
      } else {
        notifications.value = []
      }
    } else if (response.status === 401 || response.status === 403) {
      notifications.value = []
      clearUnreadState()
      isOpen.value = false
      disablePolling()
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
  } finally {
    loading.value = false
  }
}

const fetchUnreadCount = async () => {
  if (!isAuthenticated.value || pollingDisabled.value) return
  
  try {
    const response = await fetch(`/api/notifications/unread-count?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      reconcileUnreadCount(data.unread_count || 0)
    } else if (response.status === 401 || response.status === 403) {
      clearUnreadState()
      disablePolling()
    }
  } catch (error) {
    console.error('Error fetching unread count:', error)
  }
}

const markAllAsRead = async () => {
  if (!isAuthenticated.value || markingAsRead.value) return
  
  try {
    markingAsRead.value = true
    
    const response = await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error('Failed to mark all notifications as read:', errorData)
      return
    }
    
    const result = await response.json()
    
    // Update local state
    notifications.value = notifications.value.map(n => ({ ...n, is_read: true }))
    clearUnreadState()
    
    // Refresh the notifications and unread count to make sure they're accurate
    await Promise.all([fetchNotifications(), fetchUnreadCount()])
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
  } finally {
    markingAsRead.value = false
  }
}

const handleNotificationClick = async (notification) => {
  // Mark this notification as read
  if (!notification.is_read) {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ 
          notifications: [{ id: notification.id, type: notification.type }] 
        })
      })
      
      // Remove the notification from the list (since we only show unread)
      notifications.value = notifications.value.filter(n => n.id !== notification.id)
      
      // Update unread count
      setRecentUnreadNotifications(notifications.value)
      decrementUnreadCount()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }
  
  // Navigate based on notification type
  if (notification.type === 'trade_comment' && notification.trade_id) {
    router.push(`/trades/${notification.trade_id}`)
  } else if (notification.type === 'price_alert') {
    router.push('/price-alerts')
  } else if (['achievement_earned', 'level_up', 'challenge_joined', 'challenge_completed'].includes(notification.type)) {
    router.push({ path: '/leaderboard', query: { tab: 'achievements' } })
  } else if (notification.type === 'leaderboard_ranking') {
    router.push('/leaderboard')
  } else if (notification.type === 'behavioral_alert') {
    router.push('/metrics/behavioral')
  }
  
  closeDropdown()
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDateTimeTz(timestamp)
}

// Lifecycle
onMounted(() => {
  if (isAuthenticated.value) {
    pollingDisabled.value = false
    fetchUnreadCount()
    // Poll for unread count every 30 seconds
    pollInterval.value = setInterval(fetchUnreadCount, 30000)
  }

  window.addEventListener('notifications-updated', handleNotificationsUpdated)
  document.addEventListener('mousedown', handleDocumentClick)
  document.addEventListener('keydown', handleEscKey)
})

onUnmounted(() => {
  stopPolling()
  window.removeEventListener('notifications-updated', handleNotificationsUpdated)
  document.removeEventListener('mousedown', handleDocumentClick)
  document.removeEventListener('keydown', handleEscKey)
})

// Watch for auth changes
import { watch } from 'vue'
watch(isAuthenticated, (newValue) => {
  if (newValue) {
    pollingDisabled.value = false
    fetchUnreadCount()
    if (!pollInterval.value) {
      pollInterval.value = setInterval(fetchUnreadCount, 30000)
    }
  } else {
    pollingDisabled.value = false
    stopPolling()
    notifications.value = []
    clearUnreadState()
    isOpen.value = false
  }
})
</script>
