<template>
  <!-- Only show upgrade prompts if billing is enabled -->
  <div v-if="shouldShowUpgradePrompt">
    <!-- Centered Card Style (for full page replacements) -->
    <div v-if="variant === 'card'" class="card mb-8">
    <div class="card-body text-center py-12">
      <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/20 mb-4">
        <svg class="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Pro Feature</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        {{ description }}
      </p>
      <router-link :to="pricingLink" class="btn btn-primary">
        Upgrade to Pro
      </router-link>
    </div>
  </div>

  <!-- Banner Style (for inline notices) -->
  <div v-else-if="variant === 'banner'" class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
    <div class="flex">
      <div class="flex-shrink-0">
        <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="ml-3">
        <p class="text-sm text-yellow-700">
          <strong>Pro Feature:</strong> {{ description }}
          <router-link :to="pricingLink" class="font-medium underline">Upgrade to Pro</router-link>
        </p>
      </div>
    </div>
  </div>

  <!-- Compact Style (for smaller spaces) -->
  <div v-else-if="variant === 'compact'" class="text-center py-8">
    <div class="text-gray-500 dark:text-gray-400 mb-4">
      <svg class="mx-auto h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ description }}</p>
    <router-link :to="pricingLink" class="btn btn-sm btn-primary">
      Upgrade to Pro
    </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  // Style variant: 'card', 'banner', or 'compact'
  variant: {
    type: String,
    default: 'card',
    validator: (value) => ['card', 'banner', 'compact'].includes(value)
  },
  // Description of the Pro feature
  description: {
    type: String,
    required: true
  }
})

const route = useRoute()
const authStore = useAuthStore()

// Only show upgrade prompts if billing is enabled (not self-hosted)
const shouldShowUpgradePrompt = computed(() => {
  // If user data hasn't loaded yet, don't show the prompt
  if (!authStore.user) return false
  
  // If billing is disabled (self-hosted), don't show upgrade prompts
  return authStore.user.billingEnabled !== false
})

// Create pricing link with redirect parameter
const pricingLink = computed(() => {
  const currentPath = route.fullPath
  return `/pricing?redirect=${encodeURIComponent(currentPath)}`
})
</script>