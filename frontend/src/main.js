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

// Initialize auth state on app startup
const authStore = useAuthStore()
authStore.checkAuth()

// Start fetching registration config early so it's cached
// before the router guard runs on first navigation
import { useRegistrationMode } from '@/composables/useRegistrationMode'
const { fetchRegistrationConfig } = useRegistrationMode()
fetchRegistrationConfig() // fire-and-forget, router guard awaits same promise

// Initialize analytics after first paint to avoid blocking LCP
const analytics = useAnalytics()
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => analytics.initialize())
} else {
  setTimeout(() => analytics.initialize(), 1)
}

// Load PromoteKit affiliate tracking if configured
const promoteKitId = import.meta.env.VITE_PROMOTEKIT_ID
if (promoteKitId) {
  const script = document.createElement('script')
  script.src = 'https://cdn.promotekit.com/promotekit.js'
  script.async = true
  script.setAttribute('data-promotekit', promoteKitId)
  document.head.appendChild(script)
}

app.mount('#app')