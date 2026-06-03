import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { useAuthStore } from './stores/auth'
import { useAnalytics } from './composables/useAnalytics'
import { growthbook, initializeGrowthBook, updateGrowthBookContext } from './services/growthbook'

const app = createApp(App)
const AUTH_BOOTSTRAP_TIMEOUT_MS = 4000
const GROWTHBOOK_BOOTSTRAP_TIMEOUT_MS = 1500

app.use(createPinia())
app.use(router)
app.use(MotionPlugin)
app.config.globalProperties.$growthbook = growthbook
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

  try {
    // Bound auth bootstrap so a slow /api/auth/me cannot trap the app behind the loader.
    await withTimeout(authStore.checkAuth(), AUTH_BOOTSTRAP_TIMEOUT_MS)
  } catch (error) {
    console.error('Auth bootstrap failed:', error)
  }

  // Wait for initial navigation/redirects so public routes don't paint briefly on refresh.
  await router.isReady()

  try {
    await withTimeout(initializeGrowthBook({
      user: authStore.user,
      route: router.currentRoute.value
    }), GROWTHBOOK_BOOTSTRAP_TIMEOUT_MS)
  } catch (error) {
    console.error('GrowthBook bootstrap failed:', error)
  }

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

  app.mount('#app')

  runWhenIdle(() => {
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
