<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-lg w-full space-y-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Loading referral info...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center">
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-6">
          <h3 class="text-lg font-medium text-red-800 dark:text-red-400 mb-2">
            Referral Link Not Found
          </h3>
          <p class="text-sm text-red-700 dark:text-red-300 mb-4">
            {{ error }}
          </p>
          <router-link to="/register" class="btn-primary">
            Register Anyway
          </router-link>
        </div>
      </div>

      <!-- Success State -->
      <div v-else-if="referral" class="text-center">
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">TRADETALLY</span>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            You've been invited by {{ referral.creator_name }}
          </h2>

          <div class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6">
            <p class="text-lg font-semibold text-primary-800 dark:text-primary-300">
              Get {{ referral.discount_percent }}% off your first month of Pro!
            </p>
            <p class="text-sm text-primary-600 dark:text-primary-400 mt-1">
              Use code <span class="font-mono font-bold">{{ referral.code }}</span> at checkout
            </p>
          </div>

          <div class="space-y-4 text-left mb-8">
            <h3 class="font-semibold text-gray-900 dark:text-white">TradeTally helps you:</h3>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400">
              <li class="flex items-start">
                <svg class="h-5 w-5 text-primary-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Track all your trades across multiple brokers
              </li>
              <li class="flex items-start">
                <svg class="h-5 w-5 text-primary-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Analyze your performance with detailed analytics
              </li>
              <li class="flex items-start">
                <svg class="h-5 w-5 text-primary-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Identify behavioral patterns affecting your trading
              </li>
              <li class="flex items-start">
                <svg class="h-5 w-5 text-primary-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Stock screener with 8 Pillars value investing analysis
              </li>
            </ul>
          </div>

          <button
            @click="goToRegister"
            class="w-full py-3 px-4 border border-transparent text-lg font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Get Started - Claim Your Discount
          </button>

          <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Already have an account?
            <router-link to="/login" class="text-primary-600 hover:text-primary-500 font-medium">
              Sign in
            </router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const referral = ref(null)

onMounted(async () => {
  const slug = route.params.slug

  if (!slug) {
    error.value = 'Invalid referral link'
    loading.value = false
    return
  }

  try {
    // Fetch referral info
    const response = await api.get(`/referral/r/${slug}`)
    referral.value = response.data.referral

    // Store referral code in localStorage for registration
    localStorage.setItem('referral_code', referral.value.code)
    localStorage.setItem('referral_creator', referral.value.creator_name)

    // Track the visit
    await api.post('/referral/track-visit', { slug })
  } catch (err) {
    console.error('Error fetching referral:', err)
    if (err.response?.status === 404) {
      error.value = 'This referral link is invalid or has expired.'
    } else {
      error.value = 'Unable to load referral information. Please try again.'
    }
  } finally {
    loading.value = false
  }
})

function goToRegister() {
  router.push('/register')
}
</script>
