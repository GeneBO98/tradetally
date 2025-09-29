import { ref } from 'vue'

const isInitialized = ref(false)
const isEnabled = ref(false)

export function useAnalytics() {
  // No-op analytics implementation - all tracking disabled
  
  const initialize = () => {
    console.log('[STATS] Analytics disabled')
    isInitialized.value = false
    isEnabled.value = false
  }

  const identifyUser = (userId, properties = {}) => {
    // No-op
  }

  const track = (eventName, properties = {}) => {
    // No-op
  }

  const trackPageView = (pageName, properties = {}) => {
    // No-op
  }

  const trackTradeAction = (action, metadata = {}) => {
    // No-op
  }

  const trackFeatureUsage = (featureName, context = {}) => {
    // No-op
  }

  const trackImport = (broker, outcome, tradeCount = null) => {
    // No-op
  }

  const trackAchievement = (achievementType, points = null) => {
    // No-op
  }

  const reset = () => {
    // No-op
  }

  const optOut = () => {
    // No-op
  }

  const optIn = () => {
    // No-op
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