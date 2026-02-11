<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex items-center justify-center gap-2 sm:gap-3">
        <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
        <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">TRADETALLY</span>
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
        Email Preferences
      </h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <!-- Loading State -->
        <div v-if="loading" class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Verifying your request...</p>
        </div>

        <!-- Success State (unsubscribed) -->
        <div v-else-if="unsubscribed" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckIcon class="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Successfully Unsubscribed</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You've been unsubscribed from marketing emails. You'll still receive important account notifications.
          </p>
          <div class="mt-6">
            <router-link to="/login" class="btn-primary w-full">
              Go to Login
            </router-link>
          </div>
        </div>

        <!-- Already Unsubscribed State -->
        <div v-else-if="alreadyUnsubscribed" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20">
            <InformationCircleIcon class="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Already Unsubscribed</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You're already unsubscribed from marketing emails.
          </p>
          <div class="mt-6">
            <router-link to="/login" class="btn-primary w-full">
              Go to Login
            </router-link>
          </div>
        </div>

        <!-- Confirm Unsubscribe State -->
        <div v-else-if="showConfirm" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20">
            <EnvelopeIcon class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Unsubscribe from Marketing Emails?</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You'll no longer receive weekly trading summaries or re-engagement emails. Important account notifications will still be sent.
          </p>
          <div class="mt-6 space-y-3">
            <button @click="confirmUnsubscribe" :disabled="processing" class="btn-primary w-full">
              <span v-if="processing">Processing...</span>
              <span v-else>Confirm Unsubscribe</span>
            </button>
            <router-link to="/" class="btn-secondary w-full">
              Cancel
            </router-link>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
            <XMarkIcon class="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Invalid Link</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ error }}
          </p>
          <div class="mt-6 space-y-3">
            <router-link to="/login" class="btn-primary w-full">
              Go to Login
            </router-link>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              You can manage email preferences in your account settings after logging in.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { CheckIcon, XMarkIcon, InformationCircleIcon, EnvelopeIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const route = useRoute()

const loading = ref(true)
const error = ref(null)
const showConfirm = ref(false)
const processing = ref(false)
const unsubscribed = ref(false)
const alreadyUnsubscribed = ref(false)
const token = ref(null)

async function checkUnsubscribeStatus() {
  token.value = route.query.token

  if (!token.value) {
    error.value = 'Missing unsubscribe token. Please use the link from your email.'
    loading.value = false
    return
  }

  try {
    const response = await api.get(`/unsubscribe?token=${token.value}`)

    if (response.data.success) {
      if (response.data.marketing_consent === false) {
        // Already unsubscribed
        alreadyUnsubscribed.value = true
      } else {
        // Show confirmation
        showConfirm.value = true
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'This unsubscribe link is invalid or has expired.'
  } finally {
    loading.value = false
  }
}

async function confirmUnsubscribe() {
  if (!token.value) return

  processing.value = true

  try {
    const response = await api.post('/unsubscribe', { token: token.value })

    if (response.data.success) {
      showConfirm.value = false
      unsubscribed.value = true
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to process unsubscribe request.'
    showConfirm.value = false
  } finally {
    processing.value = false
  }
}

onMounted(() => {
  checkUnsubscribeStatus()
})
</script>
