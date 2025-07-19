import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from './useNotification'

export function usePriceAlertNotifications() {
  const authStore = useAuthStore()
  const { showSuccess, showWarning } = useNotification()
  
  const isConnected = ref(false)
  const eventSource = ref(null)
  const notifications = ref([])
  const reconnectTimeout = ref(null)
  
  const connect = () => {
    console.log('Connect called:', { 
      hasToken: !!authStore.token, 
      userTier: authStore.user?.tier,
      user: authStore.user 
    })
    
    if (!authStore.token || authStore.user?.tier !== 'pro') {
      console.log('SSE notifications require Pro tier - not connecting')
      return
    }
    
    // Clear any pending reconnect timeout
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }
    
    if (eventSource.value) {
      disconnect()
    }
    
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const sseUrl = `${baseURL}/api/notifications/stream?token=${authStore.token}`
    console.log('Connecting to SSE:', sseUrl)
    eventSource.value = new EventSource(sseUrl)
    
    eventSource.value.onopen = () => {
      console.log('Connected to notification stream')
      isConnected.value = true
    }
    
    eventSource.value.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleNotification(data)
      } catch (error) {
        console.error('Error parsing notification:', error)
      }
    }
    
    eventSource.value.onerror = (error) => {
      console.error('SSE connection error:', error)
      
      // Only mark as disconnected if we stay disconnected for more than 10 seconds
      setTimeout(() => {
        if (eventSource.value && eventSource.value.readyState === EventSource.CLOSED) {
          isConnected.value = false
        }
      }, 10000)
      
      // Reconnect after 3 seconds, but only if we don't already have a reconnect pending
      if (!reconnectTimeout.value) {
        reconnectTimeout.value = setTimeout(() => {
          reconnectTimeout.value = null
          if (authStore.token && authStore.user?.tier === 'pro') {
            connect()
          }
        }, 3000)
      }
    }
  }
  
  const disconnect = () => {
    // Clear any pending reconnect timeout
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }
    
    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
      isConnected.value = false
    }
  }
  
  const handleNotification = (data) => {
    switch (data.type) {
      case 'connected':
        console.log('Notification stream connected:', data.message)
        break
        
      case 'heartbeat':
        // Ignore heartbeat messages - they just keep the connection alive
        break
        
      case 'price_alert':
        handlePriceAlert(data.data)
        break
        
      case 'recent_notifications':
        // Handle recent notifications on connection
        if (data.data && data.data.length > 0) {
          notifications.value = data.data
        }
        break
        
      case 'system_announcement':
        showWarning('System Announcement', data.data.message)
        break
    }
  }
  
  const handlePriceAlert = (alert) => {
    // Add to notifications list
    notifications.value.unshift(alert)
    if (notifications.value.length > 10) {
      notifications.value.pop()
    }
    
    // Show toast notification
    showSuccess(`Price Alert: ${alert.symbol}`, alert.message)
    
    // Request browser notification permission if not granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    
    // Show browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(`TradeTally Alert: ${alert.symbol}`, {
        body: alert.message,
        icon: '/favicon.ico',
        tag: alert.id,
        requireInteraction: false
      })
      
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
      
      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000)
    }
    
    // Play sound if available
    try {
      const audio = new Audio('/notification-sound.mp3')
      audio.volume = 0.3
      audio.play().catch(() => {
        // Ignore audio play errors (browser restrictions)
      })
    } catch (error) {
      // Ignore audio errors
    }
  }
  
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    }
    return Notification.permission === 'granted'
  }
  
  // Note: Connection is now managed by App.vue globally
  // onMounted(() => {
  //   if (authStore.user?.tier === 'pro') {
  //     connect()
  //   }
  // })
  
  onUnmounted(() => {
    disconnect()
  })
  
  return {
    isConnected,
    notifications,
    connect,
    disconnect,
    requestNotificationPermission
  }
}