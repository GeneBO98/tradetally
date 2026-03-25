<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 relative">
    <!-- Dark mode toggle -->
    <button
      @click="toggleDarkMode"
      class="absolute top-4 right-4 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    </button>

    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">DOMINATE WITH DATA</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Create your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Or
          <router-link to="/login" class="font-medium text-primary-600 hover:text-primary-500">
            sign in to existing account
          </router-link>
        </p>
      </div>

      <!-- Registration disabled message -->
      <div v-if="registrationDisabled" class="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4">
        <div class="text-center">
          <h3 class="text-lg font-medium text-yellow-800 dark:text-yellow-400 mb-2">
            Registration Currently Disabled
          </h3>
          <p class="text-sm text-yellow-700 dark:text-yellow-300">
            User registration is currently disabled by the administrator. Please contact an administrator for assistance.
          </p>
          <div class="mt-4">
            <router-link to="/login" class="btn-primary">
              Sign In Instead
            </router-link>
          </div>
        </div>
      </div>
      
      <form v-if="!registrationDisabled" class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="space-y-4">
          <div>
            <label for="email" class="label">Email address</label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              autocomplete="email"
              required
              class="input"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label for="password" class="label">Password</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
              class="input"
              placeholder="Minimum 8 characters"
            />
          </div>
        </div>

        <!-- Marketing Consent Checkbox (only shown when billing is enabled) -->
        <div v-if="billingEnabled" class="flex items-start">
          <div class="flex items-center h-5">
            <input
              id="marketing_consent"
              v-model="form.marketing_consent"
              name="marketing_consent"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
          </div>
          <div class="ml-3 text-sm">
            <label for="marketing_consent" class="text-gray-700 dark:text-gray-300">
              I agree to receive marketing and promotional emails about TradeTally features, tips, and special offers.
            </label>
          </div>
        </div>

        <div v-if="authStore.error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ authStore.error }}</p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.loading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <span v-if="authStore.loading">Creating account...</span>
            <span v-else>Create account</span>
          </button>
        </div>
        
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useRegistrationMode } from '@/composables/useRegistrationMode'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { showError, showSuccess } = useNotification()
const { registrationConfig, fetchRegistrationConfig } = useRegistrationMode()

const isDark = ref(localStorage.getItem('darkMode') === 'true')

function toggleDarkMode() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('darkMode', isDark.value)
}

const form = ref({
  email: '',
  password: '',
  marketing_consent: false
})

const registrationDisabled = computed(() => registrationConfig.value?.allowRegistration === false)
const billingEnabled = computed(() => registrationConfig.value?.billingEnabled === true)
let redirectTimeoutId = null

onMounted(async () => {
  // Pre-fill email from query param (from home page quick signup)
  if (route.query.email) {
    form.value.email = route.query.email
  }

  fetchRegistrationConfig().catch((error) => {
    console.error('Failed to fetch registration config:', error)
  })
})

watch(registrationDisabled, (isDisabled) => {
  if (redirectTimeoutId) {
    clearTimeout(redirectTimeoutId)
    redirectTimeoutId = null
  }

  if (isDisabled) {
    redirectTimeoutId = setTimeout(() => {
      router.push('/login')
    }, 5000)
  }
})

onUnmounted(() => {
  if (redirectTimeoutId) {
    clearTimeout(redirectTimeoutId)
  }
})

async function handleRegister() {
  try {
    const response = await authStore.register(form.value)

    // If auto-logged in (token returned), the store already navigated to dashboard
    if (response.token) {
      return
    }

    // Approval-pending: redirect to login with message
    showSuccess('Registration Successful', response.message)
    if (response.requiresApproval) {
      router.push({ name: 'login', query: { message: response.requiresVerification
        ? 'Registration successful! Please check your email to verify your account and wait for admin approval.'
        : 'Your account is pending admin approval' } })
    }
  } catch (error) {
    showError('Registration failed', authStore.error)
  }
}
</script>
