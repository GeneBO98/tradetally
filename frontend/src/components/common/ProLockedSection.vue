<template>
  <!-- Pro users: render the real section -->
  <slot v-if="isProUser" />

  <!-- Everyone else: blurred placeholder (never real data) + upgrade overlay -->
  <div v-else class="relative" data-testid="pro-locked-section">
    <div
      v-if="showProLock"
      class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-lg"
    >
      <div class="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-4">
        <svg class="mx-auto h-12 w-12 text-primary-600 dark:text-primary-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Pro Feature</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ description }}</p>
        <router-link
          :to="pricingLink"
          class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Upgrade to Pro - {{ monthlyPricePerMonthLabel }}
        </router-link>
      </div>
    </div>

    <div class="card filter blur-sm pointer-events-none select-none" aria-hidden="true">
      <div class="card-body">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">{{ title }}</h3>
        <div class="space-y-3" :class="minHeightClass">
          <div v-for="n in 6" :key="n" class="h-6 rounded bg-gray-100 dark:bg-gray-800" :style="{ width: `${95 - n * 9}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProAccess } from '@/composables/useProAccess'
import { usePricingExperiment } from '@/composables/usePricingExperiment'

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  minHeightClass: { type: String, default: 'min-h-[18rem]' }
})

const route = useRoute()
const { isProUser, showProLock } = useProAccess()
const { monthlyPricePerMonthLabel } = usePricingExperiment()

const pricingLink = computed(() => `/pricing?redirect=${encodeURIComponent(route?.fullPath || '/')}`)
</script>
