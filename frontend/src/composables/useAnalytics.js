import { ref, onMounted } from 'vue'
import posthog from 'posthog-js'
import { useAuthStore } from '@/stores/auth'

const isInitialized = ref(false)
const isEnabled = ref(false)

export function useAnalytics() {
  const authStore = useAuthStore()

  const initialize = () => {
    const posthogKey = import.meta.env.VITE_POSTHOG_KEY
    const posthogHost = import.meta.env.VITE_POSTHOG_HOST


    // Only initialize if environment variables are provided
    if (posthogKey && posthogHost) {
      try {
        posthog.init(posthogKey, {
          api_host: posthogHost,
          person_profiles: 'identified_only',
          capture_pageview: true, // Enable automatic pageviews
          capture_pageleave: true,
          disable_session_recording: true, // Respect privacy
          opt_out_capturing_by_default: false,
          respect_dnt: true, // Respect Do Not Track
          autocapture: false, // Manual event tracking only
          cross_subdomain_cookie: false,
          secure_cookie: true,
          debug: import.meta.env.DEV
        })
        
        isInitialized.value = true
        isEnabled.value = true
        console.log('[STATS] Analytics initialized')
      } catch (error) {
        console.warn('Failed to initialize analytics:', error)
        isEnabled.value = false
      }
    } else {
      console.log('[STATS] Analytics disabled (no environment variables)')
      isEnabled.value = false
    }
  }

  const identifyUser = (userId, properties = {}) => {
    if (!isEnabled.value) return
    
    try {
      posthog.identify(userId, {
        $groups: { instance: 'tradetally-hosted' },
        ...properties
      })
    } catch (error) {
      console.warn('Analytics identify error:', error)
    }
  }

  const track = (eventName, properties = {}) => {
    if (!isEnabled.value) return
    
    try {
      // Add common properties
      const enhancedProperties = {
        ...properties,
        instance_type: 'docker',
        app_version: '1.0.0',
        timestamp: new Date().toISOString()
      }
      
      posthog.capture(eventName, enhancedProperties)
    } catch (error) {
      console.warn('Analytics track error:', error)
    }
  }

  const trackPageView = (pageName, properties = {}) => {
    if (!isEnabled.value) return
    
    try {
      // Send proper $pageview event for PostHog web analytics
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        $pathname: window.location.pathname,
        page_name: pageName,
        ...properties
      })
    } catch (error) {
      console.warn('Analytics pageview error:', error)
    }
  }

  const trackTradeAction = (action, metadata = {}) => {
    if (!isEnabled.value) return
    
    // Only track counts and types, never actual trade values or symbols
    const safeMetadata = {
      action,
      broker: metadata.broker || 'unknown',
      side: metadata.side || 'unknown',
      has_strategy: !!metadata.strategy,
      has_notes: !!metadata.notes,
      // Never track: symbol, prices, quantities, pnl, etc.
    }
    
    track('trade_action', safeMetadata)
  }

  const trackFeatureUsage = (featureName, context = {}) => {
    if (!isEnabled.value) return
    
    track('feature_usage', {
      feature: featureName,
      ...context
    })
  }

  const trackImport = (broker, outcome, tradeCount = null) => {
    if (!isEnabled.value) return
    
    track('import_action', {
      broker,
      outcome,
      trade_count: tradeCount,
      // Never track actual trade data
    })
  }

  const trackAchievement = (achievementType, points = null) => {
    if (!isEnabled.value) return
    
    track('achievement_unlocked', {
      achievement_type: achievementType,
      points,
      // Never track user-specific data
    })
  }

  const reset = () => {
    if (!isEnabled.value) return
    
    try {
      posthog.reset()
    } catch (error) {
      console.warn('Analytics reset error:', error)
    }
  }

  const optOut = () => {
    if (!isEnabled.value) return
    
    try {
      posthog.opt_out_capturing()
      console.log('[STATS] Analytics opt-out enabled')
    } catch (error) {
      console.warn('Analytics opt-out error:', error)
    }
  }

  const optIn = () => {
    if (!isEnabled.value) return
    
    try {
      posthog.opt_in_capturing()
      console.log('[STATS] Analytics opt-in enabled')
    } catch (error) {
      console.warn('Analytics opt-in error:', error)
    }
  }

  return {
    isEnabled,
    isInitialized,
    initialize,
    identifyUser,
    track,
    trackPageView,
    trackTradeAction,
    trackFeatureUsage,
    trackImport,
    trackAchievement,
    reset,
    optOut,
    optIn
  }
}