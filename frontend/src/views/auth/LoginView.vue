<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex justify-center mb-6">
          <img src="/tradetally-logo.svg" alt="TradeTally" class="h-16 w-auto" />
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Sign in to your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
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
      
      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
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
              :disabled="authStore.loading"
              class="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              Resend verification email
            </button>
          </div>
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

const route = useRoute()
const authStore = useAuthStore()
const { showError, showSuccess } = useNotification()

const verificationMessage = ref('')
const showResendVerification = ref(false)
const userEmail = ref('')

const form = ref({
  email: '',
  password: ''
})

async function handleLogin() {
  try {
    await authStore.login(form.value)
  } catch (error) {
    if (error.requiresVerification) {
      showResendVerification.value = true
      userEmail.value = error.email
    }
    // Error will be displayed via authStore.error in the template
  }
}

async function handleResendVerification() {
  try {
    await authStore.resendVerification(userEmail.value)
    showSuccess('Success', 'Verification email has been resent. Please check your inbox.')
    showResendVerification.value = false
  } catch (error) {
    showError('Error', 'Failed to resend verification email')
  }
}

onMounted(() => {
  // Check for verification message from registration
  if (route.query.message) {
    verificationMessage.value = route.query.message
  }
})
</script>