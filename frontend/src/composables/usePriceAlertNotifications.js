import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from './useNotification'

// Global reactive state for CUSIP mappings
const cusipMappings = reactive({})

// Global reactive state for enrichment status
const enrichmentStatus = reactive({
  tradeEnrichment: [],
  lastUpdate: null
})

// Global reactive state for connection status
const isConnected = ref(false)
const eventSource = ref(null)
const notifications = ref([])
const reconnectTimeout = ref(null)

export function usePriceAlertNotifications() {
  const authStore = useAuthStore()
  const { showSuccess, showWarning } = useNotification()
  
  const connect = () => {
    console.log('Connect called:', { 
      hasToken: !!authStore.token, 
      userTier: authStore.user?.tier,
      user: authStore.user 
    })
    
    if (!authStore.token || (authStore.user?.tier !== 'pro' && authStore.user?.billingEnabled !== false)) {
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
          if (authStore.token && (authStore.user?.tier === 'pro' || authStore.user?.billingEnabled === false)) {
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
        
      case 'cusip_resolved':
        handleCusipResolution(data.data)
        break
        
      case 'enrichment_update':
        handleEnrichmentUpdate(data.data)
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

  const handleCusipResolution = (data) => {
    console.log('CUSIP resolution received:', data)
    
    // Update global CUSIP mappings
    const mappings = data.mappings
    Object.assign(cusipMappings, mappings)
    
    // Show notification for each resolved CUSIP
    const count = Object.keys(mappings).length
    
    if (count === 1) {
      const cusip = Object.keys(mappings)[0]
      const symbol = mappings[cusip]
      showSuccess('CUSIP Resolved', `${cusip} → ${symbol}`)
    } else {
      showSuccess('CUSIPs Resolved', `${count} CUSIPs have been resolved to symbols`)
    }
  }

  const handleEnrichmentUpdate = (data) => {
    console.log('Enrichment update received:', data)
    
    // Update global enrichment status
    if (data.tradeEnrichment) {
      enrichmentStatus.tradeEnrichment = data.tradeEnrichment
      enrichmentStatus.lastUpdate = Date.now()
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

// Export CUSIP mapping utilities
export function useCusipMappings() {
  return {
    cusipMappings,
    // Function to get current symbol for a CUSIP
    getSymbolForCusip: (cusip) => cusipMappings[cusip] || cusip,
    // Function to check if a string is a CUSIP that has been resolved
    isResolvedCusip: (symbol) => symbol in cusipMappings
  }
}

// Export enrichment status utilities
export function useEnrichmentStatus() {
  return {
    enrichmentStatus,
    // Check if enrichment data is available from SSE
    hasSSEData: () => enrichmentStatus.lastUpdate !== null,
    // Get age of last SSE update in milliseconds
    getDataAge: () => enrichmentStatus.lastUpdate ? Date.now() - enrichmentStatus.lastUpdate : null
  }
}