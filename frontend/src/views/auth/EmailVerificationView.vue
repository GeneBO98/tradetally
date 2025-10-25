<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex justify-center px-2">
        <img src="https://zipline.id10tips.com/u/tradetally-banner.svg" alt="TradeTally" class="h-12 sm:h-16 w-auto max-w-full object-contain" />
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
        Email Verification
      </h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <!-- Loading State -->
        <div v-if="loading" class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Verifying your email...</p>
        </div>

        <!-- Success State -->
        <div v-else-if="verified" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckIcon class="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Email Verified!</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your email has been successfully verified. You can now sign in to your account.
          </p>
          <div class="mt-6">
            <router-link to="/login" class="btn-primary w-full">
              Continue to Sign In
            </router-link>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
            <XMarkIcon class="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Verification Failed</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ error }}
          </p>
          <div class="mt-6 space-y-3">
            <router-link to="/register" class="btn-secondary w-full">
              Create New Account
            </router-link>
            <button @click="showResendForm = true" class="btn-primary w-full">
              Resend Verification Email
            </button>
          </div>
        </div>

        <!-- Resend Form -->
        <div v-if="showResendForm" class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">Resend Verification Email</h4>
          <form @submit.prevent="resendVerification" class="space-y-4">
            <div>
              <label for="email" class="label">Email Address</label>
              <input
                id="email"
                v-model="resendEmail"
                type="email"
                required
                class="input"
                placeholder="Enter your email"
                @keydown.enter="resendVerification"
              />
            </div>
            <div class="flex space-x-3">
              <button
                type="button"
                @click="showResendForm = false"
                class="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="resendLoading"
                class="btn-primary flex-1"
              >
                <span v-if="resendLoading">Sending...</span>
                <span v-else>Send Email</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const route = useRoute()
const { showSuccess, showError } = useNotification()

const loading = ref(true)
const verified = ref(false)
const error = ref(null)
const showResendForm = ref(false)
const resendEmail = ref('')
const resendLoading = ref(false)

async function verifyEmail() {
  const token = route.params.token
  
  if (!token) {
    error.value = 'Invalid verification link'
    loading.value = false
    return
  }

  try {
    const response = await api.get(`/auth/verify-email/${token}`)
    verified.value = true
    showSuccess('Success', response.data.message)
  } catch (err) {
    error.value = err.response?.data?.error || 'Verification failed'
  } finally {
    loading.value = false
  }
}

async function resendVerification() {
  if (!resendEmail.value) return
  
  resendLoading.value = true
  
  try {
    const response = await api.post('/auth/resend-verification', {
      email: resendEmail.value
    })
    showSuccess('Success', response.data.message)
    showResendForm.value = false
    resendEmail.value = ''
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to resend verification email')
  } finally {
    resendLoading.value = false
  }
}

onMounted(() => {
  verifyEmail()
})
</script>