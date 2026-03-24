<template>
  <div
    class="card border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 mb-6"
    role="region"
    aria-labelledby="onboarding-card-title"
  >
    <div class="card-body">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <!-- Step indicator -->
          <div v-if="step && totalSteps" class="flex items-center gap-3 mb-2">
            <span class="text-xs font-medium text-primary-600 dark:text-primary-400">
              Step {{ step }} of {{ totalSteps }}
            </span>
            <div class="flex-1 max-w-[200px] h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-primary-600 dark:bg-primary-500 rounded-full transition-all duration-300"
                :style="{ width: `${(step / totalSteps) * 100}%` }"
              ></div>
            </div>
          </div>

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
              Skip tour
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
  ctaRoute: { type: String, default: null },
  step: { type: Number, default: null },
  totalSteps: { type: Number, default: null },
  nextStep: { type: Number, default: null },
  tourType: { type: String, default: 'free' } // 'free' or 'pro'
})

const router = useRouter()
const authStore = useAuthStore()

async function goToRoute() {
  // Advance to next step before navigating
  if (props.nextStep) {
    await authStore.advanceOnboardingStep(props.nextStep, props.tourType)
  }
  if (props.ctaRoute) {
    router.push({ name: props.ctaRoute })
  }
}

async function handleDone() {
  if (props.nextStep) {
    await authStore.advanceOnboardingStep(props.nextStep, props.tourType)
  } else {
    await authStore.skipOnboarding(props.tourType)
  }
}

async function handleSkip() {
  await authStore.skipOnboarding(props.tourType)
}
</script>
