<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex justify-center mb-6">
          <img src="https://zipline.id10tips.com/u/tradetally-banner.svg" alt="TradeTally" class="h-16 w-auto" />
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

const form = ref({
  email: '',
  password: ''
})

async function handleLogin() {
  // Reset state
  showResendVerification.value = false
  showApprovalMessage.value = false
  resendSuccess.value = false
  showTwoFactor.value = false
  userEmail.value = ''
  tempToken.value = ''
  
  try {
    await authStore.login(form.value)
  } catch (error) {
    if (error.requiresVerification) {
      showResendVerification.value = true
      userEmail.value = error.email || form.value.email
    } else if (error.requiresApproval) {
      showApprovalMessage.value = true
      userEmail.value = error.email || form.value.email
    } else if (error.requires2FA) {
      showTwoFactor.value = true
      tempToken.value = error.tempToken
      // Clear any error message since 2FA is a normal flow
      authStore.error = null
    } else if (authStore.error && authStore.error.includes('verify your email')) {
      // Fallback for other email verification error patterns
      showResendVerification.value = true
      userEmail.value = form.value.email
    }
    // Error will be displayed via authStore.error in the template
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
    
    // Clear the auth error since we've sent a new verification email
    authStore.error = null
    
    // Start cooldown timer
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
  // Fetch registration config to determine if registration is allowed
  await fetchRegistrationConfig()
  
  // Check for verification message from registration
  if (route.query.message) {
    verificationMessage.value = route.query.message
  }
})
</script>