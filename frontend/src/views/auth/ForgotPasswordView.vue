<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">DOMINATE WITH DATA</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Reset your password
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <div v-if="emailSent" class="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
        <p class="text-sm text-green-800 dark:text-green-400">
          If an account with that email exists, we've sent you a password reset link.
        </p>
        <div class="mt-4">
          <router-link to="/login" class="text-sm text-primary-600 hover:text-primary-500 font-medium">
            Back to sign in
          </router-link>
        </div>
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="handleForgotPassword">
        <div>
          <label for="email" class="label">Email address</label>
          <input
            id="email"
            v-model="email"
            name="email"
            type="email"
            required
            class="input"
            placeholder="Enter your email address"
            @keydown.enter="handleForgotPassword"
          />
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
            <span v-if="authStore.loading">Sending...</span>
            <span v-else>Send reset link</span>
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
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'

const authStore = useAuthStore()
const { showError } = useNotification()

const email = ref('')
const emailSent = ref(false)

async function handleForgotPassword() {
  try {
    await authStore.forgotPassword(email.value)
    emailSent.value = true
  } catch (error) {
    showError('Error', authStore.error)
  }
}
</script>