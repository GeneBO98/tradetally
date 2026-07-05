import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { useAuthStore } from './stores/auth'
import { useAnalytics } from './composables/useAnalytics'
import { initializeGrowthBook, updateGrowthBookContext } from './services/growthbook'

const app = createApp(App)
const AUTH_BOOTSTRAP_TIMEOUT_MS = 4000
const GROWTHBOOK_BOOTSTRAP_TIMEOUT_MS = 1500

app.use(createPinia())
// router is installed inside bootstrap() after checkAuth() so the initial
// navigation fires with the correct auth state. Installing it here would let
// the router guard fire before the /auth/me response arrives, causing users
// with a valid token cookie but a missing csrf_token to be sent to /login.
app.config.errorHandler = (error, instance, info) => {
  console.error('Vue runtime error:', error, info, instance)
  window.dispatchEvent(new CustomEvent('app-runtime-error', {
    detail: {
      message: error?.message || 'Unexpected application error',
      info
    }
  }))
}

window.addEventListener('error', (event) => {
  console.error('Unhandled window error:', event.error || event.message)
  window.dispatchEvent(new CustomEvent('app-runtime-error', {
    detail: {
      message: event.error?.message || event.message || 'Unexpected window error'
    }
  }))
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  window.dispatchEvent(new CustomEvent('app-runtime-error', {
    detail: {
      message: event.reason?.message || 'Unhandled promise rejection'
    }
  }))
})

function withTimeout(promise, timeoutMs) {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId)
  })
}

async function bootstrap() {
  const authStore = useAuthStore()
  const runWhenIdle = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback)
    : (callback) => setTimeout(callback, 1)
  const syncGrowthBookContext = () => updateGrowthBookContext({
    user: authStore.user,
    route: router.currentRoute.value
  }).catch((error) => {
    console.error('GrowthBook context update failed:', error)
  })

  // Kick off the /auth/me probe immediately but DO NOT block first paint on it.
  // Gating app.mount() on this round-trip (plus GrowthBook below) was adding the
  // full request latency to LCP on every public landing (login/register/public,
  // shared trade links) — the bulk of organic-search traffic, none of which needs
  // auth to render. The router guard awaits this promise only for auth-dependent
  // routes when a session-hint cookie is present, so the no-flash guarantee for
  // logged-in users is preserved while anonymous visitors paint at bundle speed.
  const authReady = withTimeout(authStore.checkAuth(), AUTH_BOOTSTRAP_TIMEOUT_MS)
    .catch((error) => {
      console.error('Auth bootstrap failed:', error)
    })
  // Expose readiness to the router guard (see router/index.js beforeEach).
  router.authReady = authReady

  app.use(router)

  // router.isReady() settles after the initial navigation + its async route
  // chunk load. For anonymous visitors the guard returns synchronously, so this
  // resolves as soon as the view chunk loads (no auth wait); for cookie-bearing
  // visitors the guard awaits authReady first, keeping refresh free of flicker.
  await router.isReady()

  app.mount('#app')

  // Rare csrf-hint desync: a valid HttpOnly auth cookie with no JS-readable
  // csrf_token hint boots as "anonymous", so a guest route may have rendered.
  // Once the probe confirms a real session, correct the landing.
  authReady.then(() => {
    const current = router.currentRoute.value
    if (authStore.isAuthenticated && current.meta?.guest) {
      router.replace({ name: 'dashboard' }).catch(() => {})
    }
  })

  runWhenIdle(() => {
    // GrowthBook is not needed to paint — initialize it (and its context
    // watchers) after the app is interactive so flag fetches stay off the
    // critical path.
    withTimeout(initializeGrowthBook({
      user: authStore.user,
      route: router.currentRoute.value
    }), GROWTHBOOK_BOOTSTRAP_TIMEOUT_MS)
      .catch((error) => {
        console.error('GrowthBook bootstrap failed:', error)
      })
      .finally(() => {
        watch(
          () => [
            authStore.user?.id ?? null,
            authStore.user?.email ?? null,
            authStore.user?.tier ?? null,
            authStore.user?.role ?? null
          ],
          syncGrowthBookContext
        )

        watch(
          () => router.currentRoute.value.fullPath,
          syncGrowthBookContext
        )
      })

    // Initialize analytics after the app has painted.
    const analytics = useAnalytics()
    analytics.initialize()

    // Load PromoteKit affiliate tracking only after the main app is interactive.
    const promoteKitId = import.meta.env.VITE_PROMOTEKIT_ID
    if (promoteKitId) {
      const script = document.createElement('script')
      script.src = 'https://cdn.promotekit.com/promotekit.js'
      script.async = true
      script.setAttribute('data-promotekit', promoteKitId)
      document.head.appendChild(script)
    }
  })
}

bootstrap()
