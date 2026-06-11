<template>
  <div
    v-motion
    :initial="{ opacity: 0, y: -24, scale: 0.96 }"
    :enter="{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 220, damping: 22, delay: 60 } }"
    class="relative mb-6 overflow-hidden rounded-xl border border-primary-200 dark:border-primary-700/60 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-900/40 dark:via-gray-900 dark:to-primary-900/20 shadow-sm"
    role="region"
    :aria-labelledby="`pro-tour-title-${step}`"
  >
    <!-- Animated halo behind icon -->
    <div
      v-motion
      :initial="{ opacity: 0, scale: 0.6 }"
      :enter="{ opacity: 0.55, scale: 1, transition: { duration: 700, delay: 200 } }"
      class="pointer-events-none absolute -top-10 -left-10 h-44 w-44 rounded-full bg-primary-300 dark:bg-primary-600 blur-3xl"
      aria-hidden="true"
    ></div>

    <div class="relative p-5 sm:p-6">
      <div class="flex items-start gap-5">
        <!-- Pulsing icon -->
        <div
          v-motion
          :initial="{ opacity: 0, scale: 0.4, rotate: -20 }"
          :enter="{ opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 260, damping: 18, delay: 180 } }"
          class="relative flex-shrink-0 hidden sm:flex"
        >
          <span
            class="absolute inset-0 animate-ping rounded-2xl bg-primary-400/40 dark:bg-primary-500/30"
            aria-hidden="true"
          ></span>
          <span class="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg">
            <component :is="iconComponent" class="h-7 w-7" aria-hidden="true" />
          </span>
        </div>

        <div class="min-w-0 flex-1">
          <!-- Step indicator with progress dots -->
          <div
            v-motion
            :initial="{ opacity: 0, y: 6 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 360, delay: 240 } }"
            class="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300"
          >
            <span class="inline-flex items-center gap-1 rounded-full bg-primary-600/10 dark:bg-primary-500/20 px-2.5 py-1">
              <span>Pro Tour</span>
              <span class="text-primary-500/70 dark:text-primary-300/70">·</span>
              <span>Step {{ step }} of {{ totalSteps }}</span>
            </span>
            <div class="flex items-center gap-1.5" aria-hidden="true">
              <span
                v-for="i in totalSteps"
                :key="i"
                class="h-1.5 rounded-full transition-all duration-500"
                :class="[
                  i < step ? 'w-4 bg-primary-500' :
                  i === step ? 'w-6 bg-primary-600 shadow-[0_0_8px_rgba(59,130,246,0.5)]' :
                  'w-3 bg-primary-200 dark:bg-primary-800'
                ]"
              ></span>
            </div>
          </div>

          <h2
            :id="`pro-tour-title-${step}`"
            v-motion
            :initial="{ opacity: 0, y: 10 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 420, delay: 300 } }"
            class="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
          >
            {{ title }}
          </h2>

          <p
            v-motion
            :initial="{ opacity: 0, y: 8 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 420, delay: 360 } }"
            class="mt-2 text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300"
          >
            {{ description }}
          </p>

          <!-- Optional headline stat (counts up) -->
          <div
            v-if="statValue !== null"
            v-motion
            :initial="{ opacity: 0, y: 12, scale: 0.92 }"
            :enter="{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 16, delay: 460 } }"
            class="mt-4 inline-flex items-baseline gap-2 rounded-lg bg-white/80 dark:bg-gray-900/60 px-4 py-3 ring-1 ring-primary-200 dark:ring-primary-700/50 shadow-sm"
          >
            <span
              class="text-3xl sm:text-4xl font-black tabular-nums tracking-tight"
              :class="statValueClass"
            >{{ formattedStatValue }}</span>
            <span class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{{ statLabel }}</span>
          </div>

          <!-- CTAs -->
          <div
            v-motion
            :initial="{ opacity: 0, y: 8 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 360, delay: 540 } }"
            class="mt-5 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              class="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.99]"
              @click="handlePrimary"
            >
              <span>{{ ctaLabel }}</span>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <button
              type="button"
              class="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="handleSkip"
            >
              {{ skipLabel }}
            </button>
          </div>
        </div>

        <button
          type="button"
          class="flex-shrink-0 -mt-1 -mr-1 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Dismiss tour"
          @click="handleSkip"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon,
  RocketLaunchIcon,
  StarIcon
} from '@heroicons/vue/24/solid'

const props = defineProps({
  step: { type: Number, required: true },
  totalSteps: { type: Number, default: 5 },
  title: { type: String, required: true },
  description: { type: String, required: true },
  ctaLabel: { type: String, default: 'Continue' },
  ctaRoute: { type: String, default: null },
  ctaQuery: { type: Object, default: null },
  ctaScrollSelector: { type: String, default: null },
  nextStep: { type: Number, default: null },
  skipLabel: { type: String, default: 'Skip tour' },
  icon: { type: String, default: 'sparkles' }, // sparkles | warning | trend | scanner | rocket | star
  statValue: { type: [Number, String], default: null },
  statLabel: { type: String, default: '' },
  statFormat: { type: String, default: 'number' }, // number | currency
  statTone: { type: String, default: 'primary' }   // primary | warning | danger | success
})

const router = useRouter()
const authStore = useAuthStore()

const ICONS = {
  sparkles: SparklesIcon,
  warning: ExclamationTriangleIcon,
  trend: ArrowTrendingUpIcon,
  scanner: MagnifyingGlassIcon,
  rocket: RocketLaunchIcon,
  star: StarIcon
}
const iconComponent = computed(() => ICONS[props.icon] || SparklesIcon)

// Counting animation for headline stat
const displayedStat = ref(0)

const numericTarget = computed(() => {
  if (props.statValue === null || props.statValue === undefined) return 0
  const n = typeof props.statValue === 'number' ? props.statValue : parseFloat(String(props.statValue).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
})

function animateStat() {
  if (props.statValue === null) return
  const target = numericTarget.value
  const start = performance.now()
  const duration = 1100
  const from = 0
  const ease = (t) => 1 - Math.pow(1 - t, 3)
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    displayedStat.value = from + (target - from) * ease(t)
    if (t < 1) requestAnimationFrame(tick)
    else displayedStat.value = target
  }
  requestAnimationFrame(tick)
}

onMounted(animateStat)
watch(() => props.statValue, animateStat)

const formattedStatValue = computed(() => {
  if (props.statValue === null) return ''
  if (props.statFormat === 'currency') {
    return `$${Math.round(displayedStat.value).toLocaleString()}`
  }
  return Math.round(displayedStat.value).toLocaleString()
})

const statValueClass = computed(() => ({
  primary: 'text-primary-600 dark:text-primary-300',
  warning: 'text-amber-600 dark:text-amber-300',
  danger: 'text-red-600 dark:text-red-300',
  success: 'text-emerald-600 dark:text-emerald-300'
}[props.statTone] || 'text-primary-600 dark:text-primary-300'))

async function handlePrimary() {
  if (props.nextStep) {
    await authStore.advanceOnboardingStep(props.nextStep, 'pro')
  }
  if (props.ctaRoute) {
    const target = { name: props.ctaRoute }
    if (props.ctaQuery) target.query = props.ctaQuery
    const sameRoute = router.currentRoute.value.name === props.ctaRoute
    if (!sameRoute) {
      await router.push(target)
    }
  }
  if (props.ctaScrollSelector) {
    // Wait a tick so the next-step card has had time to mount before we scroll.
    requestAnimationFrame(() => {
      const target = document.querySelector(props.ctaScrollSelector)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

async function handleSkip() {
  await authStore.skipOnboarding('pro')
}
</script>
