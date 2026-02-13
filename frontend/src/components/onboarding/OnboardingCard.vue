<template>
  <div
    class="card border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 mb-6"
    role="region"
    aria-labelledby="onboarding-card-title"
  >
    <div class="card-body">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <h2 id="onboarding-card-title" class="text-base font-semibold text-gray-900 dark:text-white">
            {{ title }}
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ description }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              v-if="ctaRoute"
              type="button"
              class="btn-primary"
              @click="goToRoute"
            >
              {{ ctaLabel }}
            </button>
            <button
              v-else
              type="button"
              class="btn-primary"
              @click="handleDone"
            >
              {{ ctaLabel }}
            </button>
            <button
              type="button"
              class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              @click="handleSkip"
            >
              Skip for now
            </button>
          </div>
        </div>
        <button
          type="button"
          class="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Dismiss"
          @click="handleSkip"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  ctaLabel: { type: String, required: true },
  ctaRoute: { type: String, default: null }
})

const router = useRouter()
const authStore = useAuthStore()

function goToRoute() {
  if (props.ctaRoute) {
    router.push({ name: props.ctaRoute })
  }
}

async function handleDone() {
  await authStore.completeOnboarding()
}

async function handleSkip() {
  await authStore.completeOnboarding()
}
</script>
