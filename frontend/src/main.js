import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { useAuthStore } from './stores/auth'
import { useAnalytics } from './composables/useAnalytics'

const app = createApp(App)

app.use(createPinia())
app.use(router)

async function bootstrap() {
  const authStore = useAuthStore()
  const runWhenIdle = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback)
    : (callback) => setTimeout(callback, 1)

  try {
    // Initialize auth state before mount.
    await authStore.checkAuth()
  } catch (error) {
    console.error('Auth bootstrap failed:', error)
  }

  // Wait for initial navigation/redirects so public routes don't paint briefly on refresh.
  await router.isReady()

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
