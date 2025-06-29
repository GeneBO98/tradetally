<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex justify-center mb-6">
          <img src="/tradetally-logo.svg" alt="TradeTally" class="h-16 w-auto" />
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
      
      <form class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="space-y-4">
          <div>
            <label for="fullName" class="label">Full Name</label>
            <input
              id="fullName"
              v-model="form.fullName"
              name="fullName"
              type="text"
              class="input"
              placeholder="John Doe"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="username" class="label">Username</label>
            <input
              id="username"
              v-model="form.username"
              name="username"
              type="text"
              required
              class="input"
              placeholder="johndoe"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="email" class="label">Email address</label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              required
              class="input"
              placeholder="john@example.com"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="password" class="label">Password</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              required
              class="input"
              placeholder="Minimum 6 characters"
              @keydown.enter="handleRegister"
            />
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'

const authStore = useAuthStore()
const router = useRouter()
const { showError, showSuccess } = useNotification()

const form = ref({
  fullName: '',
  username: '',
  email: '',
  password: ''
})

async function handleRegister() {
  try {
    const response = await authStore.register(form.value)
    
    // Show success message
    showSuccess('Registration Successful', response.message)
    
    // Check if email verification is required
    if (response.requiresVerification) {
      // Redirect to login page with verification message
      router.push({ name: 'login', query: { message: 'Please check your email to verify your account' } })
    } else {
      // Email verification not required, can proceed to login
      router.push({ name: 'login', query: { message: 'You can now sign in to your account' } })
    }
  } catch (error) {
    showError('Registration failed', authStore.error)
  }
}
</script>