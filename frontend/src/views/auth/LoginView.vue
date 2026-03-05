<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">DOMINATE WITH DATA</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Sign in to your account
        </h2>
        <p v-if="allowRegistration" class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Or
          <router-link to="/register" class="font-medium text-primary-600 hover:text-primary-500">
            create a new account
          </router-link>
        </p>
      </div>

      <!-- Verification message from registration -->
      <div v-if="verificationMessage" class="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
        <p class="text-sm text-blue-800 dark:text-blue-400">{{ verificationMessage }}</p>
      </div>

      <!-- 2FA verification form -->
      <div v-if="showTwoFactor">
        <TwoFactorAuth
          :loading="authStore.loading"
          :error="authStore.error"
          @submit="handleTwoFactorSubmit"
          @cancel="handleTwoFactorCancel"
        />
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div class="rounded-md shadow-sm -space-y-px">
          <div>
            <label for="email" class="sr-only">Email address</label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              required
              class="input rounded-t-md"
              placeholder="Email address"
              @keydown.enter="handleLogin"
            />
          </div>
          <div>
            <label for="password" class="sr-only">Password</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              required
              class="input rounded-b-md"
              placeholder="Password"
              @keydown.enter="handleLogin"
            />
          </div>
        </div>

        <div v-if="authStore.error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ authStore.error }}</p>
          <div v-if="showResendVerification" class="mt-3">
            <button
              @click="handleResendVerification"
              :disabled="resendLoading || resendCooldown > 0"
              class="text-sm text-primary-600 hover:text-primary-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="resendLoading">Sending...</span>
              <span v-else-if="resendCooldown > 0">Resend in {{ resendCooldown }}s</span>
              <span v-else>Resend verification email</span>
            </button>
          </div>
          <div v-if="showApprovalMessage" class="mt-3">
            <p class="text-xs text-red-700 dark:text-red-300">
              Your account is pending approval from an administrator. You will be able to sign in once approved.
            </p>
          </div>
        </div>

        <!-- Resend verification success message -->
        <div v-if="resendSuccess" class="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
          <p class="text-sm text-green-800 dark:text-green-400">
            Verification email sent successfully! Please check your inbox.
          </p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.loading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <span v-if="authStore.loading">Signing in...</span>
            <span v-else>Sign in</span>
          </button>
        </div>

        <!-- Divider -->
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">or</span>
          </div>
        </div>

        <!-- Passkey login -->
        <div>
          <button
            type="button"
            :disabled="passkeyLoading"
            @click="handlePasskeyLogin"
            class="group relative w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <svg class="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span v-if="passkeyLoading">Verifying passkey...</span>
            <span v-else>Sign in with passkey</span>
          </button>
        </div>

        <div class="text-center mt-4">
          <router-link to="/forgot-password" class="text-sm text-primary-600 hover:text-primary-500">
            Forgot your password?
          </router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import api from '@/services/api'
import TwoFactorAuth from '@/components/TwoFactorAuth.vue'

const route = useRoute()
const authStore = useAuthStore()
const { showError, showSuccess } = useNotification()
const { allowRegistration, fetchRegistrationConfig } = useRegistrationMode()

const verificationMessage = ref('')
const showResendVerification = ref(false)
const showApprovalMessage = ref(false)
const userEmail = ref('')
const resendLoading = ref(false)
const resendCooldown = ref(0)
const resendSuccess = ref(false)
const showTwoFactor = ref(false)
const tempToken = ref('')
const passkeyLoading = ref(false)

const form = ref({
  email: '',
  password: ''
})

async function handleLogin() {
  showResendVerification.value = false
  showApprovalMessage.value = false
  resendSuccess.value = false
  showTwoFactor.value = false
  userEmail.value = ''
  tempToken.value = ''

  try {
    const returnUrl = route.query.return_url || route.query.redirect || null
    await authStore.login(form.value, returnUrl)
  } catch (error) {
    if (error.requiresApproval) {
      showApprovalMessage.value = true
      userEmail.value = error.email || form.value.email
    } else if (error.requires2FA) {
      showTwoFactor.value = true
      tempToken.value = error.tempToken
      authStore.error = null
    }
  }
}

async function handlePasskeyLogin() {
  passkeyLoading.value = true
  showResendVerification.value = false
  showApprovalMessage.value = false
  resendSuccess.value = false
  showTwoFactor.value = false
  authStore.error = null

  try {
    const returnUrl = route.query.return_url || route.query.redirect || null
    await authStore.loginWithPasskey(returnUrl)
  } catch (error) {
    if (error.requires2FA) {
      showTwoFactor.value = true
      tempToken.value = error.tempToken
      authStore.error = null
    }
  } finally {
    passkeyLoading.value = false
  }
}

async function handleResendVerification() {
  const emailToUse = userEmail.value || form.value.email
  if (!emailToUse) {
    showError('Error', 'Please enter your email address')
    return
  }

  resendLoading.value = true
  resendSuccess.value = false

  try {
    const response = await api.post('/auth/resend-verification', {
      email: emailToUse
    })

    resendSuccess.value = true
    showSuccess('Success', response.data.message)
    authStore.error = null

    resendCooldown.value = 60
    const cooldownInterval = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0) {
        clearInterval(cooldownInterval)
      }
    }, 1000)

  } catch (error) {
    showError('Error', error.response?.data?.error || 'Failed to resend verification email')
  } finally {
    resendLoading.value = false
  }
}

async function handleTwoFactorSubmit(code) {
  try {
    await authStore.verify2FA(tempToken.value, code)
  } catch (error) {
    // Error will be displayed via authStore.error in the template
  }
}

function handleTwoFactorCancel() {
  showTwoFactor.value = false
  tempToken.value = ''
  authStore.error = null
}

onMounted(async () => {
  await fetchRegistrationConfig()

  if (route.query.message) {
    verificationMessage.value = route.query.message
  }
})
</script>
