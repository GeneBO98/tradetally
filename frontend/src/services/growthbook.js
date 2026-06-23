import { ref } from 'vue'
import { useAnalytics } from '@/composables/useAnalytics'

const ANON_ID_STORAGE_KEY = 'growthbook_anonymous_id'
const GROWTHBOOK_ENABLED = import.meta.env.VITE_GROWTHBOOK_ENABLED === 'true'
const GROWTHBOOK_API_HOST = import.meta.env.VITE_GROWTHBOOK_API_HOST || 'https://growthbook-api.tradetally.io'
const GROWTHBOOK_CLIENT_KEY = import.meta.env.VITE_GROWTHBOOK_CLIENT_KEY || ''
const GROWTHBOOK_DEV_MODE = import.meta.env.VITE_GROWTHBOOK_DEV_MODE === 'true' || import.meta.env.DEV

const ready = ref(false)
const initialized = ref(false)
const version = ref(0)

let initPromise = null

function getAnonymousId() {
  if (typeof window === 'undefined') {
    return 'server'
  }

  const existingId = window.localStorage.getItem(ANON_ID_STORAGE_KEY)
  if (existingId) {
    return existingId
  }

  const generatedId = window.crypto?.randomUUID?.() || `anon_${Date.now()}`
  window.localStorage.setItem(ANON_ID_STORAGE_KEY, generatedId)
  return generatedId
}

function getRouteDetails(route) {
  if (route?.fullPath && typeof window !== 'undefined') {
    return {
      path: route.path,
      url: new URL(route.fullPath, window.location.origin).toString()
    }
  }

  if (typeof window !== 'undefined') {
    return {
      path: window.location.pathname,
      url: window.location.href
    }
  }

  return {
    path: '/',
    url: ''
  }
}

function buildAttributes(user = null, route = null) {
  const anonymousId = getAnonymousId()
  const { path, url } = getRouteDetails(route)
  const userId = user?.id ? String(user.id) : anonymousId

  return {
    id: userId,
    loggedIn: Boolean(user?.id),
    anonymousId,
    path,
    url,
    ...(user?.email ? { email: user.email } : {}),
    ...(user?.tier ? { tier: user.tier } : {}),
    ...(user?.role ? { role: user.role } : {})
  }
}

// The GrowthBook SDK is loaded lazily so its bytes stay out of the entry chunk
// and off the LCP critical path. `growthbook` is a live `let` binding: importers
// (useGrowthBook) read it at call time and see the instance once it loads, and
// the reactive `version` bump re-evaluates flag consumers. Until then the
// composable's null-guards return safe fallbacks.
const GROWTHBOOK_CONFIGURED = Boolean(GROWTHBOOK_ENABLED && GROWTHBOOK_CLIENT_KEY)
let growthbook = null
let sdkLoadPromise = null

async function ensureGrowthBook() {
  if (growthbook) return growthbook
  if (!GROWTHBOOK_CONFIGURED) return null

  if (!sdkLoadPromise) {
    sdkLoadPromise = import('@growthbook/growthbook').then(({ GrowthBook }) => {
      growthbook = new GrowthBook({
        apiHost: GROWTHBOOK_API_HOST,
        clientKey: GROWTHBOOK_CLIENT_KEY,
        enableDevMode: GROWTHBOOK_DEV_MODE,
        subscribeToChanges: true,
        trackingCallback: (experiment, result) => {
          const analytics = useAnalytics()
          analytics.track('growthbook_experiment_viewed', {
            experiment_id: experiment.key,
            variation_id: result.variationId,
            variation_key: result.key,
            feature_id: result.featureId
          })
        }
      })
      growthbook.setRenderer(() => {
        version.value += 1
      })
      return growthbook
    })
  }

  return sdkLoadPromise
}

export async function initializeGrowthBook({ user = null, route = null } = {}) {
  await ensureGrowthBook()

  if (!growthbook) {
    initialized.value = true
    ready.value = false
    return false
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    await growthbook.setAttributes(buildAttributes(user, route))
    const response = await growthbook.init()
    initialized.value = true
    ready.value = response.success
    return response.success
  })().catch((error) => {
    initialized.value = true
    ready.value = false
    throw error
  }).finally(() => {
    initPromise = null
  })

  return initPromise
}

export async function updateGrowthBookContext({ user = null, route = null } = {}) {
  if (!growthbook) {
    return
  }

  const attributes = buildAttributes(user, route)
  await growthbook.setAttributes(attributes)

  if (attributes.url) {
    await growthbook.setURL(attributes.url)
  }
}

export async function refreshGrowthBook() {
  if (!growthbook) {
    return false
  }

  await growthbook.refreshFeatures()
  ready.value = true
  return true
}

export function isGrowthBookConfigured() {
  // Based on configuration, not instance presence — the SDK loads lazily, so
  // the instance is null until init even when GrowthBook is fully configured.
  return GROWTHBOOK_CONFIGURED
}

export { growthbook, initialized, ready, version }
