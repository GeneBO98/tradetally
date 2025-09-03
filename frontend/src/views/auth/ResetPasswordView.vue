<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex justify-center mb-6">
          <img src="https://zipline.id10tips.com/u/tradetally-banner.svg" alt="TradeTally" class="h-16 w-auto max-w-full" />
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Reset your password
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Enter your new password below.
        </p>
      </div>

      <div v-if="resetSuccess" class="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
        <p class="text-sm text-green-800 dark:text-green-400">
          Your password has been reset successfully. You can now sign in with your new password.
        </p>
        <div class="mt-4">
          <router-link to="/login" class="btn-primary w-full text-center">
            Continue to sign in
          </router-link>
        </div>
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="handleResetPassword">
        <div class="space-y-4">
          <div>
            <label for="password" class="label">New Password</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              required
              class="input"
              placeholder="Enter new password"
              @keydown.enter="handleResetPassword"
            />
          </div>
          
          <div>
            <label for="confirmPassword" class="label">Confirm New Password</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              name="confirmPassword"
              type="password"
              required
              class="input"
              placeholder="Confirm new password"
              @keydown.enter="handleResetPassword"
            />
          </div>
        </div>

        <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.loading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <span v-if="authStore.loading">Resetting...</span>
            <span v-else>Reset password</span>
          </button>
        </div>

        <div class="text-center">
          <router-link to="/login" class="text-sm text-primary-600 hover:text-primary-500">
            Back to sign in
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
const { showError } = useNotification()

const form = ref({
  password: '',
  confirmPassword: ''
})
const error = ref('')
const resetSuccess = ref(false)

async function handleResetPassword() {
  if (form.value.password !== form.value.confirmPassword) {
    error.value = 'Passwords do not match'
    return
  }

  if (form.value.password.length < 6) {
    error.value = 'Password must be at least 6 characters long'
    return
  }

  const token = route.params.token
  if (!token) {
    error.value = 'Invalid reset link'
    return
  }

  try {
    await authStore.resetPassword(token, form.value.password)
    resetSuccess.value = true
    error.value = ''
  } catch (err) {
    error.value = authStore.error || 'Failed to reset password'
  }
}

onMounted(() => {
  if (!route.params.token) {
    error.value = 'Invalid reset link'
  }
})
</script>