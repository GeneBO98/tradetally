import { ref } from 'vue'

const unreadCount = ref(0)
const optimisticUnreadFloor = ref(0)
const optimisticUnreadFloorUntil = ref(0)
const recentUnreadNotifications = ref([])

function addUnreadNotifications(delta, notifications = []) {
  const normalizedDelta = Number(delta || 0)

  if (normalizedDelta > 0) {
    const optimisticCount = unreadCount.value + normalizedDelta
    unreadCount.value = optimisticCount
    optimisticUnreadFloor.value = Math.max(optimisticUnreadFloor.value, optimisticCount)
    optimisticUnreadFloorUntil.value = Date.now() + 30000
  }

  if (Array.isArray(notifications) && notifications.length > 0) {
    const seen = new Set()
    recentUnreadNotifications.value = [...notifications, ...recentUnreadNotifications.value]
      .filter(notification => {
        const key = `${notification.type}:${notification.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
  }
}

function reconcileUnreadCount(serverUnreadCount) {
  const normalizedCount = Number(serverUnreadCount || 0)

  if (
    optimisticUnreadFloorUntil.value > Date.now()
    && normalizedCount < optimisticUnreadFloor.value
  ) {
    unreadCount.value = optimisticUnreadFloor.value
    return unreadCount.value
  }

  unreadCount.value = normalizedCount
  optimisticUnreadFloor.value = normalizedCount
  optimisticUnreadFloorUntil.value = 0
  return unreadCount.value
}

function setRecentUnreadNotifications(notifications = []) {
  recentUnreadNotifications.value = Array.isArray(notifications) ? notifications : []
}

function decrementUnreadCount(amount = 1) {
  unreadCount.value = Math.max(0, unreadCount.value - amount)
  optimisticUnreadFloor.value = unreadCount.value
  optimisticUnreadFloorUntil.value = Date.now() + 5000
}

function clearUnreadState() {
  unreadCount.value = 0
  optimisticUnreadFloor.value = 0
  optimisticUnreadFloorUntil.value = 0
  recentUnreadNotifications.value = []
}

export function useNotificationCenter() {
  return {
    unreadCount,
    recentUnreadNotifications,
    addUnreadNotifications,
    reconcileUnreadCount,
    setRecentUnreadNotifications,
    decrementUnreadCount,
    clearUnreadState
  }
}
