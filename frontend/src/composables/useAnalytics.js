import { ref } from 'vue'

const isInitialized = ref(false)
const isEnabled = ref(false)
const lastIdentifySignature = ref('')
const queuedEvents = ref([])
const queuedIdentify = ref(null)

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

function getRuntimeConfig() {
  if (typeof window === 'undefined') return {}
  return window.__APP_CONFIG__ || {}
}

function normalizePostHogHost(host) {
  const normalized = String(host || DEFAULT_POSTHOG_HOST).trim().replace(/\/+$/, '')

  if (/^https:\/\/(us|eu)\.posthog\.com$/i.test(normalized)) {
    return normalized.replace('.posthog.com', '.i.posthog.com')
  }

  return normalized || DEFAULT_POSTHOG_HOST
}

function getAnalyticsConfig() {
  const runtimeConfig = getRuntimeConfig()
  const enabledValue = runtimeConfig.VITE_POSTHOG_ENABLED ?? import.meta.env.VITE_POSTHOG_ENABLED
  const keyValue = runtimeConfig.VITE_POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY
  const hostValue = runtimeConfig.VITE_POSTHOG_HOST ?? import.meta.env.VITE_POSTHOG_HOST

  return {
    enabled: String(enabledValue || '').toLowerCase() === 'true',
    key: String(keyValue || '').trim(),
    host: normalizePostHogHost(hostValue || DEFAULT_POSTHOG_HOST)
  }
}

function getPostHogAssetHost(host) {
  return host.replace('.i.posthog.com', '-assets.i.posthog.com')
}

export function useAnalytics() {
  // Analytics implementation with optional PostHog support
  const runWhenIdle = (callback) => {
    if (typeof window === 'undefined') return

    if (window.requestIdleCallback) {
      window.requestIdleCallback(callback, { timeout: 1500 })
      return
    }

    window.setTimeout(callback, 1)
  }

  const flushQueuedCalls = () => {
    if (typeof window === 'undefined' || !window.posthog) return

    if (queuedIdentify.value && lastIdentifySignature.value !== queuedIdentify.value.signature) {
      window.posthog.identify(queuedIdentify.value.userId, queuedIdentify.value.properties)
      lastIdentifySignature.value = queuedIdentify.value.signature
      queuedIdentify.value = null
    }

    if (queuedEvents.value.length > 0) {
      for (const event of queuedEvents.value) {
        window.posthog.capture(event.name, event.properties)
      }
      queuedEvents.value = []
    }
  }

  const clearQueuedCalls = () => {
    queuedEvents.value = []
    queuedIdentify.value = null
  }

  const initialize = async () => {
    const { enabled, key, host } = getAnalyticsConfig()

    if (enabled && key && !isInitialized.value) {
      // Check if PostHog is reachable before loading SDK (prevents retry storm when ad-blocked)
      try {
        const testUrl = getPostHogAssetHost(host) + '/static/array.js'
        const resp = await fetch(testUrl, { method: 'HEAD', mode: 'no-cors' }).catch(() => null)
        if (!resp) {
          console.log('[STATS] PostHog blocked by browser - analytics disabled')
          isInitialized.value = false
          isEnabled.value = false
          return
        }
      } catch {
        console.log('[STATS] PostHog unreachable - analytics disabled')
        isInitialized.value = false
        isEnabled.value = false
        return
      }

      // Load PostHog script dynamically using textContent (safe from XSS)
      const script = document.createElement('script')
      script.textContent = [
        '!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init ss us bi os hs es ns capture Bi calculateEventProperties cs register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty ps vs createPersonProfile gs Zr ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing ds debug O fs getPageViewId captureTraceFeedback captureTraceMetric Yr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);',
        'posthog.init(' + JSON.stringify(key) + ', {',
        '  api_host: ' + JSON.stringify(host) + ',',
        '  person_profiles: "identified_only",',
        '  opt_out_capturing_by_default: true',
        '})'
      ].join('\n')
      document.head.appendChild(script)
      console.log('[STATS] PostHog analytics initialized (opted out by default)')
      isInitialized.value = true
      isEnabled.value = false

      // Restore consent from localStorage
      const consent = localStorage.getItem('cookie_consent')
      if (consent === 'accepted' && window.posthog) {
        window.posthog.opt_in_capturing()
        isEnabled.value = true
        console.log('[STATS] Restored opt-in from saved consent')
      }

      flushQueuedCalls()
    } else {
      console.log('[STATS] Analytics disabled')
      isInitialized.value = false
      isEnabled.value = false
      clearQueuedCalls()
    }
  }

  const identifyUser = (userId, properties = {}) => {
    const { enabled } = getAnalyticsConfig()
    if (!enabled || !userId) return

    const signature = JSON.stringify({
      userId,
      email: properties.email || null,
      tier: properties.tier || null
    })

    runWhenIdle(() => {
      if (window.posthog && lastIdentifySignature.value !== signature) {
        window.posthog.identify(userId, properties)
        lastIdentifySignature.value = signature
        return
      }

      queuedIdentify.value = { userId, properties, signature }
    })
  }

  const track = (eventName, properties = {}) => {
    const { enabled } = getAnalyticsConfig()
    if (!enabled) return

    if (window.posthog) {
      window.posthog.capture(eventName, properties)
      return
    }

    queuedEvents.value.push({ name: eventName, properties })
  }

  const trackPageView = (pageName, properties = {}) => {
    const { enabled } = getAnalyticsConfig()
    if (!enabled) return

    runWhenIdle(() => {
      const payload = { ...properties, page: pageName }

      if (window.posthog) {
        window.posthog.capture('$pageview', payload)
        return
      }

      queuedEvents.value.push({ name: '$pageview', properties: payload })
    })
  }

  const trackTradeAction = (action, metadata = {}) => {
    track('trade_action', { action, ...metadata })
  }

  const trackFeatureUsage = (featureName, context = {}) => {
    runWhenIdle(() => {
      track('feature_usage', { feature: featureName, ...context })
    })
  }

  const trackImport = (broker, outcome, tradeCount = null) => {
    track('import_trades', { broker, outcome, trade_count: tradeCount })
  }

  const trackAchievement = (achievementType, points = null) => {
    track('achievement_unlocked', { type: achievementType, points })
  }

  const reset = () => {
    const { enabled } = getAnalyticsConfig()
    if (enabled && window.posthog) {
      window.posthog.reset()
    }
    clearQueuedCalls()
    lastIdentifySignature.value = ''
  }

  const optOut = () => {
    const { enabled } = getAnalyticsConfig()
    if (enabled && window.posthog) {
      window.posthog.opt_out_capturing()
      isEnabled.value = false
    }
    clearQueuedCalls()
  }

  const optIn = () => {
    const { enabled } = getAnalyticsConfig()
    if (enabled && window.posthog) {
      window.posthog.opt_in_capturing()
      isEnabled.value = true
      flushQueuedCalls()
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
