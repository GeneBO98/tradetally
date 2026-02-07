import { ref } from 'vue'

const isInitialized = ref(false)
const isEnabled = ref(false)

// PostHog configuration from environment variables
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || ''
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const POSTHOG_ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === 'true'

export function useAnalytics() {
  // Analytics implementation with optional PostHog support
  
  const initialize = async () => {
    if (POSTHOG_ENABLED && POSTHOG_KEY && !isInitialized.value) {
      // Check if PostHog is reachable before loading SDK (prevents retry storm when ad-blocked)
      try {
        const testUrl = POSTHOG_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js'
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

      // Load PostHog script dynamically
      const script = document.createElement('script')
      script.innerHTML = `
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init ss us bi os hs es ns capture Bi calculateEventProperties cs register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty ps vs createPersonProfile gs Zr ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing ds debug O fs getPageViewId captureTraceFeedback captureTraceMetric Yr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        posthog.init('${POSTHOG_KEY}', {
          api_host: '${POSTHOG_HOST}',
          person_profiles: 'identified_only',
          disable_session_recording: true
        })
      `
      document.head.appendChild(script)
      console.log('[STATS] PostHog analytics initialized')
      isInitialized.value = true
      isEnabled.value = true
    } else {
      console.log('[STATS] Analytics disabled')
      isInitialized.value = false
      isEnabled.value = false
    }
  }

  const identifyUser = (userId, properties = {}) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.identify(userId, properties)
    }
  }

  const track = (eventName, properties = {}) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture(eventName, properties)
    }
  }

  const trackPageView = (pageName, properties = {}) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture('$pageview', { ...properties, page: pageName })
    }
  }

  const trackTradeAction = (action, metadata = {}) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture('trade_action', { action, ...metadata })
    }
  }

  const trackFeatureUsage = (featureName, context = {}) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture('feature_usage', { feature: featureName, ...context })
    }
  }

  const trackImport = (broker, outcome, tradeCount = null) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture('import_trades', { broker, outcome, trade_count: tradeCount })
    }
  }

  const trackAchievement = (achievementType, points = null) => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.capture('achievement_unlocked', { type: achievementType, points })
    }
  }

  const reset = () => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.reset()
    }
  }

  const optOut = () => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.opt_out_capturing()
      isEnabled.value = false
    }
  }

  const optIn = () => {
    if (POSTHOG_ENABLED && window.posthog) {
      window.posthog.opt_in_capturing()
      isEnabled.value = true
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