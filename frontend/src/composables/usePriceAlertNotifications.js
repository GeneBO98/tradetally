import { ref, reactive } from 'vue'
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
const reconnectDelay = ref(3000) // Start at 3s, exponential backoff up to 60s
// Ephemeral queue for achievement celebrations and xp updates
const celebrationQueue = ref([])
// Pending unread achievement notifications the user has not yet stepped
// through in the celebration modal. Populated when a notification click
// triggers a celebration; drained by CelebrationOverlay's Continue button.
// Each item: { notificationId, achievement }
const pendingCelebrationNotifications = ref([])
// State of an in-progress notification-driven celebration. The bar animation
// across multiple modals walks a cursor from `cursorXP` (where it started
// before viewing any achievement in the chain) up to `actualCurrentXP` (the
// user's true server-side state). Each modal advances the cursor by its own
// achievement's points so by the time the user finishes the last modal the
// bar visually catches up to reality. Cleared on Dismiss all and when the
// chain finishes naturally.
// Shape: {
//   actualCurrentXP, actualCurrentLevel,
//   currentLevelMinXP, nextLevelMinXP,
//   cursorXP                          // mutable: advanced per modal
// }
const celebrationLevelContext = ref(null)

// Compute level + level-XP-range for an arbitrary XP value, assuming a
// constant `xpPerLevel` interval anchored on the user's current level.
// Linear approximation — accurate near currentLevel, may misnumber far-away
// levels. Good enough for the short walks our notification flow does (a
// handful of achievements totaling at most a few hundred XP).
function computeLevelInfo(xp, ctx) {
  const xpPerLevel = Math.max(1, ctx.nextLevelMinXP - ctx.currentLevelMinXP)
  const delta = xp - ctx.currentLevelMinXP
  if (delta >= 0) {
    const levelsUp = Math.floor(delta / xpPerLevel)
    const level = ctx.actualCurrentLevel + levelsUp
    const levelMinXP = ctx.currentLevelMinXP + levelsUp * xpPerLevel
    return { level, levelMinXP, levelMaxXP: levelMinXP + xpPerLevel }
  }
  const levelsDown = Math.ceil(-delta / xpPerLevel)
  const level = Math.max(1, ctx.actualCurrentLevel - levelsDown)
  const levelMinXP = Math.max(0, ctx.currentLevelMinXP - levelsDown * xpPerLevel)
  return { level, levelMinXP, levelMaxXP: levelMinXP + xpPerLevel }
}

// Advance the celebration cursor by `points` and return the xp_update
// payload the modal needs to animate the bar over that segment. Mutates
// `ctx.cursorXP` so successive calls (one per modal) walk the user's XP
// up to `actualCurrentXP`.
export function advanceCelebrationCursor(ctx, points) {
  if (!ctx) return null
  const oldXP = ctx.cursorXP
  const delta = Math.max(0, points || 0)
  const newXP = oldXP + delta
  const oldInfo = computeLevelInfo(oldXP, ctx)
  const newInfo = computeLevelInfo(newXP, ctx)
  ctx.cursorXP = newXP
  return {
    oldXP,
    newXP,
    oldLevel: oldInfo.level,
    newLevel: newInfo.level,
    currentLevelMinXPBefore: oldInfo.levelMinXP,
    nextLevelMinXPBefore: oldInfo.levelMaxXP,
    currentLevelMinXPAfter: ctx.currentLevelMinXP,
    nextLevelMinXPAfter: ctx.nextLevelMinXP,
  }
}
const DEFAULT_CELEBRATION_SUPPRESSION_MS = 30 * 1000
const celebrationSuppressedUntil = ref(0)

export function usePriceAlertNotifications() {
  const authStore = useAuthStore()
  const { showSuccess, showWarning } = useNotification()

  const isSuppressingCelebrations = () => {
    if (!celebrationSuppressedUntil.value) return false

    if (Date.now() > celebrationSuppressedUntil.value) {
      celebrationSuppressedUntil.value = 0
      return false
    }

    return true
  }

  const suppressCelebrations = (durationMs = DEFAULT_CELEBRATION_SUPPRESSION_MS) => {
    celebrationSuppressedUntil.value = Date.now() + durationMs
  }

  const clearCelebrationSuppression = () => {
    celebrationSuppressedUntil.value = 0
  }

  const queueCelebrationItem = (item) => {
    if (isSuppressingCelebrations()) {
      return
    }

    celebrationQueue.value.push(item)
  }
  
  const connect = () => {
    // Skip verbose logging - only log important state changes
    if (!authStore.token || (authStore.user?.tier !== 'pro' && authStore.user?.billingEnabled !== false)) {
      return
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }

    // Check if we already have an active connection
    if (eventSource.value && eventSource.value.readyState === EventSource.OPEN) {
      console.log('SSE already connected, skipping reconnect')
      return
    }

    // Close any existing connection (might be in CONNECTING or CLOSED state)
    if (eventSource.value) {
      disconnect()
    }

    // Construct SSE URL - always use relative URL to go through Vite proxy in development
    // This avoids CORS issues since EventSource doesn't support credentials for cross-origin
    // In production (same origin), relative URLs also work correctly
    const sseUrl = `/api/notifications/stream?token=${authStore.token}`
    console.log('Connecting to SSE:', sseUrl)
    eventSource.value = new EventSource(sseUrl)
    
    eventSource.value.onopen = () => {
      console.log('Connected to notification stream')
      isConnected.value = true
      reconnectDelay.value = 3000 // Reset backoff on successful connection
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
      // EventSource fires error events for normal disconnects - only log if unexpected
      // ReadyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
      const readyState = eventSource.value?.readyState

      if (readyState === EventSource.CLOSED) {
        // Connection was closed - this is normal for tab close, navigation, server restart
        console.log('SSE connection closed')
        isConnected.value = false
      } else if (readyState === EventSource.CONNECTING) {
        // EventSource is trying to reconnect automatically - this is normal
        console.log('SSE reconnecting...')
      } else {
        // Unexpected error while connection was open
        console.error('SSE connection error:', error)
      }

      // Only manually reconnect if the connection is CLOSED (not CONNECTING)
      // EventSource automatically tries to reconnect when in CONNECTING state
      if (readyState === EventSource.CLOSED && !reconnectTimeout.value) {
        const delay = reconnectDelay.value
        reconnectDelay.value = Math.min(reconnectDelay.value * 2, 60000) // Exponential backoff, cap at 60s
        reconnectTimeout.value = setTimeout(() => {
          reconnectTimeout.value = null
          if (authStore.token && (authStore.user?.tier === 'pro' || authStore.user?.billingEnabled === false)) {
            console.log(`SSE manual reconnect after ${delay / 1000}s`)
            connect()
          }
        }, delay)
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
      // Remove event handlers before closing to prevent error events from triggering reconnect
      eventSource.value.onopen = null
      eventSource.value.onmessage = null
      eventSource.value.onerror = null
      eventSource.value.close()
      eventSource.value = null
      isConnected.value = false
      console.log('SSE disconnected intentionally')
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

      case 'achievement_earned':
        // Queue celebration items for UI overlay
        queueCelebrationItem({ type: 'achievement', payload: data.data })
        break

      case 'level_up':
        queueCelebrationItem({ type: 'level_up', payload: data.data })
        break

      case 'xp_update':
        queueCelebrationItem({ type: 'xp_update', payload: data.data })
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
  
  // Note: Connection lifecycle is managed by App.vue globally
  // Individual components should not disconnect on unmount as it would
  // break the global SSE connection for other components

  return {
    isConnected,
    notifications,
    connect,
    disconnect,
    requestNotificationPermission,
    celebrationQueue,
    pendingCelebrationNotifications,
    celebrationLevelContext,
    suppressCelebrations,
    clearCelebrationSuppression,
    queueCelebrationItem,
    isSuppressingCelebrations
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
