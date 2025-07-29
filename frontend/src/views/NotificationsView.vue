<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Notifications
          </h1>
          <div class="flex items-center space-x-4">
            <button
              v-if="notifications.length > 0 && selectedNotifications.length > 0"
              @click="deleteSelected"
              :disabled="deleting"
              class="btn-danger text-sm"
            >
              {{ deleting ? 'Deleting...' : `Delete ${selectedNotifications.length}` }}
            </button>
            <button
              v-if="notifications.length > 0"
              @click="markAllAsRead"
              :disabled="markingRead"
              class="btn-secondary text-sm"
            >
              {{ markingRead ? 'Marking...' : 'Mark all read' }}
            </button>
            <button
              @click="() => fetchNotifications(currentPage)"
              :disabled="loading"
              class="btn-primary text-sm"
            >
              {{ loading ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading && notifications.length === 0" class="p-8 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        <p class="text-gray-500 dark:text-gray-400 mt-4">Loading notifications...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="notifications.length === 0" class="p-12 text-center">
        <BellSlashIcon class="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No notifications yet
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          You'll see notifications here when someone comments on your trades or your price alerts are triggered.
        </p>
      </div>

      <!-- Notifications List -->
      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div class="flex items-start space-x-4">
            <!-- Checkbox for selection -->
            <div class="flex-shrink-0 mt-1">
              <input
                type="checkbox"
                :checked="selectedNotifications.includes(notification.id)"
                @change="toggleNotificationSelection(notification.id)"
                class="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
            </div>
            <!-- Icon -->
            <div class="flex-shrink-0 mt-1">
              <div class="p-2 rounded-full" :class="getIconBgClass(notification.type)">
                <BellIcon
                  v-if="notification.type === 'price_alert'"
                  class="h-5 w-5"
                  :class="getIconColorClass(notification.type)"
                />
                <ChatBubbleLeftRightIcon
                  v-else-if="notification.type === 'trade_comment'"
                  class="h-5 w-5"
                  :class="getIconColorClass(notification.type)"
                />
                <BellIcon
                  v-else
                  class="h-5 w-5 text-gray-400"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="handleNotificationClick(notification)">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-2 mb-1">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                      {{ notification.symbol || 'Notification' }}
                    </h3>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" :class="getTypeBadgeClass(notification.type)">
                      {{ getTypeLabel(notification.type) }}
                    </span>
                  </div>
                  <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    {{ notification.message }}
                  </p>
                  
                  <!-- Additional details based on type -->
                  <div v-if="notification.type === 'price_alert'" class="text-xs text-gray-500 dark:text-gray-400">
                    <div v-if="notification.trigger_price" class="mb-1">
                      <span class="font-medium">Triggered at:</span> ${{ parseFloat(notification.trigger_price).toFixed(2) }}
                    </div>
                    <div v-if="notification.target_price" class="mb-1">
                      <span class="font-medium">Target price:</span> ${{ parseFloat(notification.target_price).toFixed(2) }}
                    </div>
                  </div>
                  
                  <div v-if="notification.type === 'trade_comment' && notification.comment_text" class="mt-2 p-3 bg-gray-50 dark:bg-gray-600 rounded text-sm">
                    <p class="text-gray-700 dark:text-gray-300 italic">
                      "{{ notification.comment_text }}"
                    </p>
                  </div>
                </div>

                <!-- Time and read status -->
                <div class="flex flex-col items-end space-y-2 ml-4">
                  <time class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatTime(notification.created_at) }}
                  </time>
                  <div v-if="!notification.is_read" class="w-2 h-2 bg-primary-500 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination && pagination.totalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-700 dark:text-gray-300">
            Showing {{ Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total) }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} notifications
          </div>
          <div class="flex space-x-2">
            <button
              @click="loadPage(pagination.page - 1)"
              :disabled="pagination.page <= 1 || loading"
              class="btn-secondary text-sm"
            >
              Previous
            </button>
            <button
              @click="loadPage(pagination.page + 1)"
              :disabled="pagination.page >= pagination.totalPages || loading"
              class="btn-secondary text-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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
const notifications = ref([])
const pagination = ref(null)
const loading = ref(false)
const markingRead = ref(false)
const deleting = ref(false)
const currentPage = ref(1)
const selectedNotifications = ref([])

// Methods
const fetchNotifications = async (page = 1) => {
  try {
    loading.value = true
    const response = await fetch(`/api/notifications?page=${page}&limit=20`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      notifications.value = data.data || []
      pagination.value = data.pagination
      currentPage.value = page
      selectedNotifications.value = [] // Clear selections on new fetch
    } else {
      console.error('Failed to fetch notifications:', response.statusText)
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
  } finally {
    loading.value = false
  }
}

const loadPage = (page) => {
  if (page >= 1 && page <= pagination.value.totalPages) {
    fetchNotifications(page)
  }
}

const markAllAsRead = async () => {
  if (notifications.value.length === 0) return
  
  try {
    markingRead.value = true
    const notificationData = notifications.value.map(n => ({ id: n.id, type: n.type }))
    
    const response = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ notifications: notificationData })
    })
    
    if (response.ok) {
      // Update local state
      notifications.value = notifications.value.map(n => ({ ...n, is_read: true }))
    }
  } catch (error) {
    console.error('Error marking notifications as read:', error)
  } finally {
    markingRead.value = false
  }
}

const toggleNotificationSelection = (notificationId) => {
  const index = selectedNotifications.value.indexOf(notificationId)
  if (index > -1) {
    selectedNotifications.value.splice(index, 1)
  } else {
    selectedNotifications.value.push(notificationId)
  }
}

const deleteSelected = async () => {
  if (selectedNotifications.value.length === 0) return
  
  try {
    deleting.value = true
    const notificationsToDelete = notifications.value
      .filter(n => selectedNotifications.value.includes(n.id))
      .map(n => ({ id: n.id, type: n.type }))
    
    const response = await fetch('/api/notifications', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ notifications: notificationsToDelete })
    })
    
    if (response.ok) {
      // Remove deleted notifications from local state
      notifications.value = notifications.value.filter(n => !selectedNotifications.value.includes(n.id))
      selectedNotifications.value = []
      
      // Refresh the list to get updated pagination
      await fetchNotifications(currentPage.value)
    }
  } catch (error) {
    console.error('Error deleting notifications:', error)
  } finally {
    deleting.value = false
  }
}

const handleNotificationClick = (notification) => {
  if (notification.type === 'trade_comment' && notification.trade_id) {
    router.push(`/trades/${notification.trade_id}`)
  } else if (notification.type === 'price_alert') {
    router.push('/price-alerts')
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getTypeLabel = (type) => {
  switch (type) {
    case 'price_alert': return 'Price Alert'
    case 'trade_comment': return 'Comment'
    default: return 'Notification'
  }
}

const getTypeBadgeClass = (type) => {
  switch (type) {
    case 'price_alert':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'trade_comment':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }
}

const getIconBgClass = (type) => {
  switch (type) {
    case 'price_alert':
      return 'bg-yellow-50 dark:bg-yellow-900/20'
    case 'trade_comment':
      return 'bg-blue-50 dark:bg-blue-900/20'
    default:
      return 'bg-gray-50 dark:bg-gray-700'
  }
}

const getIconColorClass = (type) => {
  switch (type) {
    case 'price_alert':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'trade_comment':
      return 'text-blue-600 dark:text-blue-400'
    default:
      return 'text-gray-400'
  }
}

// Lifecycle
onMounted(() => {
  fetchNotifications()
})
</script>