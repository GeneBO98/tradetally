<template>
  <div class="relative">
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

    <!-- Overlay to close dropdown when clicking outside -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40"
      @click="closeDropdown"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { 
  BellIcon, 
  BellSlashIcon, 
  ChatBubbleLeftRightIcon 
} from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// Component state
const isOpen = ref(false)
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(false)
const markingAsRead = ref(false)
const pollInterval = ref(null)

// Computed
const isAuthenticated = computed(() => authStore.isAuthenticated)

// Methods
const toggleDropdown = async () => {
  if (!isAuthenticated.value) return
  
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await fetchNotifications()
  }
}

const closeDropdown = () => {
  isOpen.value = false
}

const fetchNotifications = async () => {
  if (!isAuthenticated.value) return
  
  try {
    loading.value = true
    // Only fetch unread notifications for the bell dropdown
    const response = await fetch('/api/notifications?limit=10&unread_only=true', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      notifications.value = data.data || []
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
  } finally {
    loading.value = false
  }
}

const fetchUnreadCount = async () => {
  if (!isAuthenticated.value) return
  
  try {
    const response = await fetch('/api/notifications/unread-count', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      unreadCount.value = data.unread_count || 0
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
    unreadCount.value = 0
    
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
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }
  
  // Navigate based on notification type
  if (notification.type === 'trade_comment' && notification.trade_id) {
    router.push(`/trades/${notification.trade_id}`)
  } else if (notification.type === 'price_alert') {
    router.push('/price-alerts')
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
  return date.toLocaleDateString()
}

// Lifecycle
onMounted(() => {
  if (isAuthenticated.value) {
    fetchUnreadCount()
    // Poll for unread count every 30 seconds
    pollInterval.value = setInterval(fetchUnreadCount, 30000)
  }
})

onUnmounted(() => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
  }
})

// Watch for auth changes
import { watch } from 'vue'
watch(isAuthenticated, (newValue) => {
  if (newValue) {
    fetchUnreadCount()
    if (!pollInterval.value) {
      pollInterval.value = setInterval(fetchUnreadCount, 30000)
    }
  } else {
    if (pollInterval.value) {
      clearInterval(pollInterval.value)
      pollInterval.value = null
    }
    notifications.value = []
    unreadCount.value = 0
    isOpen.value = false
  }
})
</script>