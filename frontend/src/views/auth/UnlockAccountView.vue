<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">DOMINATE WITH DATA</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Unlock your account
        </h2>
      </div>

      <div v-if="status === 'loading'" class="flex justify-center py-6">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="status === 'success'" class="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
        <p class="text-sm text-green-800 dark:text-green-400">
          {{ message }}
        </p>
        <div class="mt-4">
          <router-link to="/login" class="btn-primary w-full text-center">
            Continue to sign in
          </router-link>
        </div>
      </div>

      <div v-else class="space-y-6">
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ message }}</p>
        </div>
        <div class="text-center space-y-2">
          <router-link to="/forgot-password" class="block text-sm text-primary-600 hover:text-primary-500">
            Reset your password instead
          </router-link>
          <router-link to="/login" class="block text-sm text-primary-600 hover:text-primary-500">
            Back to sign in
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const status = ref('loading') // loading | success | error
const message = ref('')

onMounted(async () => {
  const token = route.params.token
  if (!token) {
    status.value = 'error'
    message.value = 'Invalid unlock link.'
    return
  }

  try {
    const data = await authStore.unlockAccount(token)
    status.value = 'success'
    message.value = data?.message || 'Your account has been unlocked. You can now sign in.'
  } catch (err) {
    status.value = 'error'
    message.value = authStore.error || 'Invalid or expired unlock link. Please reset your password to regain access.'
  }
})
</script>
