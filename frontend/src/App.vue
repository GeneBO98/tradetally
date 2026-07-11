<template>
  <div id="app" style="width: 100%; min-width: 100%; overflow-x: visible;">
    <div v-if="runtimeError" class="min-h-screen bg-white dark:bg-gray-950">
      <div class="content-wrapper py-16">
        <div class="max-w-lg">
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Something went wrong</h1>
          <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
            The app hit an unexpected error and stopped rendering this view.
          </p>
          <div class="mt-6 flex gap-3">
            <button class="btn btn-primary" @click="reloadApp">
              Reload
            </button>
            <button class="btn btn-outline" @click="clearRuntimeError">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
    <template v-else>
    <UpdateBanner v-if="!isAuthRoute" />
    <EmailVerificationBanner v-if="!isAuthRoute" />
    <IOSAppBanner v-if="!isAuthRoute" />

    <!-- Authenticated layout: sidebar fixed left, content offset right -->
    <template v-if="!isAuthRoute && authStore.isAuthenticated">
      <Sidebar />
      <div
        class="flex min-h-screen min-w-0 flex-col transition-[padding] duration-300 ease-out"
        :class="sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'"
      >
        <!-- Mobile top bar -->
        <div class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white/95 px-3 backdrop-blur-sm lg:hidden dark:border-gray-700 dark:bg-gray-800/95">
          <button
            @click="openDrawer"
            class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Open menu"
          >
            <Bars3Icon class="h-6 w-6" />
          </button>
          <router-link to="/dashboard" class="flex items-center gap-2">
            <img src="/favicon.svg" alt="TradeTally" class="h-7 w-auto" />
            <span class="font-semibold text-gray-900 dark:text-white">TradeTally</span>
          </router-link>
          <NotificationBell />
        </div>
        <main class="flex-1">
          <router-view />
        </main>
        <AppFooter @show-support="showSupportModal = true" />
      </div>
    </template>

    <!-- Unauthenticated / public layout: top nav -->
    <template v-else-if="!isAuthRoute">
      <NavBar />
      <main class="min-h-screen">
        <router-view />
      </main>
      <AppFooter @show-support="showSupportModal = true" />
    </template>

    <!-- Auth routes: bare layout -->
    <main v-else class="min-h-screen">
      <router-view />
    </main>


    <Notification />
    <ModalAlert />
    <CookieConsentBanner v-if="isBillingEnabled" />
    <!-- Gamification celebration overlay -->
    <CelebrationOverlay v-if="!isImportRoute" :queue="celebrationQueue" />

    <!-- Passkey registration prompt (shown after login if user has no passkeys) -->
    <div v-if="showPasskeyPrompt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 text-center">
        <svg class="w-12 h-12 mx-auto mb-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Add a passkey?</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Sign in faster next time using your device's biometrics, security key, or PIN. No password needed.
        </p>
        <div class="flex space-x-3 justify-center">
          <button
            @click="registerPasskey"
            :disabled="passkeyRegistering"
            class="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <span v-if="passkeyRegistering">Setting up...</span>
            <span v-else>Add passkey</span>
          </button>
          <button
            @click="dismissPasskeyPrompt"
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>

    <!-- Contact Support Modal -->
    <div v-if="showSupportModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showSupportModal = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Contact Support</h3>
          <button @click="showSupportModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="supportSent" class="text-center py-6">
          <svg class="w-12 h-12 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Message Sent</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">We'll get back to you as soon as possible.</p>
          <button @click="showSupportModal = false; supportSent = false" class="mt-4 btn btn-primary">Close</button>
        </div>

        <form v-else @submit.prevent="submitSupportRequest">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
              <input
                v-model="supportSubject"
                type="text"
                required
                placeholder="Brief description of your issue"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
              <textarea
                v-model="supportMessage"
                required
                rows="5"
                placeholder="Describe your issue or question in detail..."
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500"
              ></textarea>
            </div>
          </div>
          <div class="flex justify-end space-x-3 mt-6">
            <button type="button" @click="showSupportModal = false" class="btn btn-outline">Cancel</button>
            <button type="submit" :disabled="supportSending" class="btn btn-primary">
              <span v-if="supportSending" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
              {{ supportSending ? 'Sending...' : 'Send Message' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useVersionStore } from '@/stores/version'
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'
import { useNotification } from '@/composables/useNotification'
import NavBar from '@/components/layout/NavBar.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import NotificationBell from '@/components/common/NotificationBell.vue'
import { Bars3Icon } from '@heroicons/vue/24/outline'
import { useSidebar } from '@/composables/useSidebar'
import Notification from '@/components/common/Notification.vue'
import ModalAlert from '@/components/common/ModalAlert.vue'
import CelebrationOverlay from '@/components/gamification/CelebrationOverlay.vue'
import UpdateBanner from '@/components/common/UpdateBanner.vue'
import EmailVerificationBanner from '@/components/common/EmailVerificationBanner.vue'
import IOSAppBanner from '@/components/common/IOSAppBanner.vue'
import VersionDisplay from '@/components/common/VersionDisplay.vue'
import CookieConsentBanner from '@/components/common/CookieConsentBanner.vue'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { useVisibilityPolling } from '@/composables/useVisibilityPolling'
import api from '@/services/api'

// Rate limit notification handling
const { showError, showSuccess } = useNotification()
const lastRateLimitNotification = ref(0)

const route = useRoute()
const authStore = useAuthStore()
const versionStore = useVersionStore()
const uiPreferencesStore = useUiPreferencesStore()
const { isBillingEnabled } = useRegistrationMode()
const { openDrawer, collapsed: sidebarCollapsed } = useSidebar()

// Initialize price alert notifications globally
const { isConnected, connect, disconnect, celebrationQueue } = usePriceAlertNotifications()

const isAuthRoute = computed(() => {
  return ['login', 'register'].includes(route.name)
})

const isImportRoute = computed(() => route.name === 'import')

const showSupportModal = ref(false)
const supportSubject = ref('')
const supportMessage = ref('')
const supportSending = ref(false)
const supportSent = ref(false)
const runtimeError = ref(null)

function clearRuntimeError() {
  runtimeError.value = null
}

function reloadApp() {
  window.location.reload()
}

function handleRuntimeError(event) {
  runtimeError.value = event.detail || { message: 'Unexpected application error' }
}

async function submitSupportRequest() {
  supportSending.value = true
  try {
    await api.post('/support/contact', {
      subject: supportSubject.value,
      message: supportMessage.value
    })
    supportSent.value = true
    supportSubject.value = ''
    supportMessage.value = ''
  } catch (error) {
    console.error('[ERROR] Failed to send support request:', error)
    showError(error.response?.data?.message || 'Failed to send message. Please try again.')
  } finally {
    supportSending.value = false
  }
}

// Watch for authentication changes and user tier changes
let lastConnectionState = false
watch(() => [authStore.user?.tier, authStore.isAuthenticated, authStore.user?.billingEnabled], ([tier, isAuthenticated, billingEnabled]) => {
  const shouldConnect = isAuthenticated && (tier === 'pro' || billingEnabled === false)
  
  // Only connect/disconnect if the state actually changed
  if (shouldConnect !== lastConnectionState) {
    lastConnectionState = shouldConnect
    
    if (shouldConnect) {
      console.log('Connecting to notification stream (user is Pro or billing disabled)')
      connect()
    } else {
      console.log('Disconnecting from notification stream (user not Pro or not authenticated)')
      disconnect()
    }
  }
}, { immediate: true })

watch(isImportRoute, (onImportRoute) => {
  if (!onImportRoute) return
  celebrationQueue.value.splice(0, celebrationQueue.value.length)
}, { immediate: true })

// Passkey registration prompt
const showPasskeyPrompt = ref(false)
const passkeyRegistering = ref(false)
const PASSKEY_PROMPT_DISMISSED_KEY = 'passkey_prompt_dismissed'

// Watch for login: when session becomes active, check if user has passkeys
let previousSessionState = authStore.isAuthenticated
watch(() => authStore.isAuthenticated, async (isAuthenticated) => {
  if (isAuthenticated && !previousSessionState) {
    if (localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY)) {
      previousSessionState = isAuthenticated
      return
    }
    // Wait for page to settle after redirect
    setTimeout(async () => {
      try {
        if (!uiPreferencesStore.initialized) {
          await uiPreferencesStore.init()
        }
        if (localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY)) {
          return
        }
        const res = await api.get('/auth/passkey')
        if (!authStore.isAuthenticated) {
          return
        }
        if (!res.data.passkeys || res.data.passkeys.length === 0) {
          showPasskeyPrompt.value = true
        }
      } catch (e) {
        // Not critical
      }
    }, 1500)
  }
  if (!isAuthenticated) {
    // Logout with the prompt open: close it so it doesn't sit over the login
    // page, and so dismissing it there can't write the previous user's
    // dismissal into the next user's preferences.
    showPasskeyPrompt.value = false
  }
  previousSessionState = isAuthenticated
})

async function registerPasskey() {
  passkeyRegistering.value = true
  try {
    const { startRegistration } = await import('@simplewebauthn/browser')
    const optionsRes = await api.post('/auth/passkey/register/options')
    const regResponse = await startRegistration({ optionsJSON: optionsRes.data })

    await api.post('/auth/passkey/register/verify', {
      response: regResponse,
      deviceName: navigator.platform || 'My device',
    })

    showPasskeyPrompt.value = false
    showSuccess('Passkey added', 'You can now sign in with your passkey next time.')
  } catch (err) {
    showPasskeyPrompt.value = false
    if (err.name !== 'NotAllowedError') {
      showError('Error', err.response?.data?.error || err.message || 'Failed to register passkey.')
    }
  } finally {
    passkeyRegistering.value = false
  }
}

async function dismissPasskeyPrompt() {
  showPasskeyPrompt.value = false
  localStorage.setItem(PASSKEY_PROMPT_DISMISSED_KEY, 'true')
  uiPreferencesStore.notifyChanged(PASSKEY_PROMPT_DISMISSED_KEY, true)
  await uiPreferencesStore.flush()
}

// Version check polling (6 hours, visibility-gated)
const VERSION_CHECK_INTERVAL = 6 * 60 * 60 * 1000
const { start: startVersionPolling } = useVisibilityPolling(
  () => versionStore.checkForUpdates(),
  VERSION_CHECK_INTERVAL
)

// Handle rate limit exceeded events globally
const handleRateLimitExceeded = (event) => {
  const { retryAfter, message } = event.detail
  const now = Date.now()

  // Only show notification once every 30 seconds to avoid spamming
  if (now - lastRateLimitNotification.value > 30000) {
    lastRateLimitNotification.value = now
    showError(
      'Rate Limit Exceeded',
      `${message} Please wait ${retryAfter} seconds before trying again. If you're self-hosting, you can disable rate limiting by setting RATE_LIMIT_ENABLED=false in your environment.`
    )
  }
}

onMounted(async () => {
  // Initialize dark mode from localStorage (needed for auth pages where NavBar isn't rendered)
  if (localStorage.getItem('darkMode') === 'true') {
    document.documentElement.classList.add('dark')
  }

  // Listen for rate limit events from the API interceptor
  window.addEventListener('app-runtime-error', handleRuntimeError)
  window.addEventListener('rate-limit-exceeded', handleRateLimitExceeded)

  // Note: checkAuth() is awaited in main.js before mount to prevent flash of public page

  // Initialize version store and check for updates
  versionStore.initialize()
  versionStore.checkForUpdates()

  // Poll for updates every 6 hours (paused while the tab is hidden)
  startVersionPolling()
})

onUnmounted(() => {
  // Clean up rate limit event listener
  window.removeEventListener('app-runtime-error', handleRuntimeError)
  window.removeEventListener('rate-limit-exceeded', handleRateLimitExceeded)
})
</script>
