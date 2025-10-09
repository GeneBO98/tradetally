<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <!-- TradeTally Logo -->
      <div class="flex justify-center">
        <div class="text-4xl font-bold text-primary-600">TradeTally</div>
      </div>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-200 dark:border-gray-700">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">Loading authorization request...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-8">
          <ExclamationTriangleIcon class="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authorization Error</h2>
          <p class="text-red-600 dark:text-red-400 mb-4">{{ error }}</p>
          <button @click="$router.push('/')" class="btn-secondary">
            Return to Dashboard
          </button>
        </div>

        <!-- Consent Screen -->
        <div v-else-if="consentData">
          <!-- Client Info -->
          <div class="text-center mb-6">
            <img
              v-if="consentData.client.logo_url"
              :src="consentData.client.logo_url"
              :alt="consentData.client.name"
              class="w-16 h-16 mx-auto mb-4 rounded-lg"
            />
            <div v-else class="w-16 h-16 mx-auto mb-4 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
              <span class="text-2xl font-bold text-primary-600">{{ consentData.client.name[0] }}</span>
            </div>

            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {{ consentData.client.name }}
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              wants to access your TradeTally account
            </p>

            <a
              v-if="consentData.client.website_url"
              :href="consentData.client.website_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-primary-600 hover:text-primary-700 mt-2 inline-block"
            >
              Visit {{ consentData.client.name }} website
            </a>
          </div>

          <!-- Description -->
          <div v-if="consentData.client.description" class="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p class="text-sm text-gray-700 dark:text-gray-300">
              {{ consentData.client.description }}
            </p>
          </div>

          <!-- Permissions -->
          <div class="mb-6">
            <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
              This application will be able to:
            </h3>
            <ul class="space-y-2">
              <li
                v-for="scope in scopeDescriptions"
                :key="scope.name"
                class="flex items-start"
              >
                <CheckCircleIcon class="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ scope.title }}</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">{{ scope.description }}</p>
                </div>
              </li>
            </ul>
          </div>

          <!-- User Info -->
          <div class="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p class="text-sm text-blue-800 dark:text-blue-300">
              Signing in as <strong>{{ user?.email }}</strong>
            </p>
          </div>

          <!-- Actions -->
          <div class="space-y-3">
            <button
              @click="approve"
              :disabled="submitting"
              class="w-full btn-primary"
            >
              {{ submitting ? 'Authorizing...' : 'Authorize' }}
            </button>
            <button
              @click="deny"
              :disabled="submitting"
              class="w-full btn-secondary"
            >
              Cancel
            </button>
          </div>

          <!-- Trust Info -->
          <p class="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
            By authorizing, you allow {{ consentData.client.name }} to access your TradeTally data as described above. You can revoke this access at any time from your account settings.
          </p>
        </div>

        <!-- Auto-redirect State -->
        <div v-else class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">Redirecting...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(true)
const submitting = ref(false)
const error = ref(null)
const consentData = ref(null)

const user = computed(() => authStore.user)

// Scope descriptions for user-friendly display
const scopeMap = {
  openid: {
    title: 'Verify your identity',
    description: 'Access your user ID to identify you'
  },
  profile: {
    title: 'View your profile information',
    description: 'Access your username, name, and avatar'
  },
  email: {
    title: 'View your email address',
    description: 'Access your email address for communication'
  }
}

const scopeDescriptions = computed(() => {
  if (!consentData.value) return []
  return consentData.value.scopes
    .map(scope => ({
      name: scope,
      ...scopeMap[scope]
    }))
    .filter(s => s.title)
})

const loadAuthorizationRequest = async () => {
  try {
    loading.value = true
    error.value = null

    // Check if user is authenticated
    if (!authStore.isAuthenticated) {
      // Save the current URL to return after login
      const returnUrl = encodeURIComponent(route.fullPath)
      router.push(`/login?return_url=${returnUrl}`)
      return
    }

    // Make request to authorization endpoint
    const params = new URLSearchParams(route.query).toString()
    const response = await api.get(`/oauth/authorize?${params}`)

    if (response.data.needs_consent) {
      consentData.value = response.data
    } else if (response.data.redirect_url) {
      // Auto-redirect if no consent needed
      window.location.href = response.data.redirect_url
    }
  } catch (err) {
    console.error('Authorization request error:', err)
    error.value = err.response?.data?.error_description || 'Failed to load authorization request'
  } finally {
    loading.value = false
  }
}

const approve = async () => {
  try {
    submitting.value = true
    error.value = null

    const response = await api.post('/oauth/authorize', {
      client_id: route.query.client_id,
      redirect_uri: route.query.redirect_uri,
      scope: route.query.scope || 'openid profile email',
      state: route.query.state,
      code_challenge: route.query.code_challenge,
      code_challenge_method: route.query.code_challenge_method,
      approved: true
    })

    // Redirect to the client application
    if (response.data.redirect_url) {
      window.location.href = response.data.redirect_url
    }
  } catch (err) {
    console.error('Authorization approval error:', err)
    error.value = err.response?.data?.error_description || 'Failed to authorize application'
    submitting.value = false
  }
}

const deny = async () => {
  try {
    submitting.value = true

    const response = await api.post('/oauth/authorize', {
      client_id: route.query.client_id,
      redirect_uri: route.query.redirect_uri,
      scope: route.query.scope,
      state: route.query.state,
      approved: false
    })

    // Redirect back to client with error
    if (response.data.redirect_url) {
      window.location.href = response.data.redirect_url
    } else {
      router.push('/')
    }
  } catch (err) {
    console.error('Authorization denial error:', err)
    router.push('/')
  }
}

onMounted(() => {
  loadAuthorizationRequest()
})
</script>
