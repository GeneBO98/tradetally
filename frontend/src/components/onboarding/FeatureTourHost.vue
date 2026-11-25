<template>
  <!-- "What's new" prompt: offers the next unseen feature tour -->
  <section
    v-if="showPrompt"
    class="popover feature-tour-enter fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] p-4"
    role="region"
    aria-labelledby="feature-tour-prompt-title"
    data-testid="feature-tour-prompt"
  >
    <div class="flex items-start gap-3">
      <SparklesIcon class="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-700 dark:text-primary-400" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-primary-700 dark:text-primary-400">What's new</p>
        <h2 id="feature-tour-prompt-title" class="heading-card mt-0.5">{{ pendingTour.title }}</h2>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{{ pendingTour.summary }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" class="btn-primary btn-sm" @click="startPending">
            Show me ({{ pendingStepCount }} {{ pendingStepCount === 1 ? 'stop' : 'stops' }})
          </button>
          <button type="button" class="btn-ghost btn-sm" @click="dismissPending">
            Dismiss
          </button>
        </div>
      </div>
      <button
        type="button"
        class="-mr-1 -mt-1 flex-shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        aria-label="Dismiss what's new"
        @click="dismissPending"
      >
        <XMarkIcon class="h-4 w-4" />
      </button>
    </div>
  </section>

  <!-- Active tour: spotlight on the feature plus the step card -->
  <template v-if="activeTour && currentStep">
    <div
      v-if="targetRect"
      class="feature-tour-spotlight pointer-events-none fixed z-40 rounded-lg outline outline-2 outline-primary-500"
      :style="spotlightStyle"
      aria-hidden="true"
      data-testid="feature-tour-spotlight"
    ></div>

    <section
      ref="cardEl"
      class="popover fixed z-40 p-4"
      :class="cardPlacement.className"
      :style="cardPlacement.style"
      role="dialog"
      aria-modal="false"
      aria-labelledby="feature-tour-step-title"
      data-testid="feature-tour-step"
    >
      <div class="flex items-center gap-2">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
          What's new &middot; {{ stepIndex + 1 }} of {{ steps.length }}
        </p>
        <button
          type="button"
          class="-mr-1 ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close tour"
          @click="dismissActive"
        >
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>

      <h2 id="feature-tour-step-title" ref="titleEl" tabindex="-1" class="heading-card mt-1 focus:outline-none">
        {{ currentStep.title }}
      </h2>

      <div v-if="locating" class="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span class="spinner spinner-xs"></span>
        Finding it…
      </div>
      <p v-else class="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {{ stepBody }}
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          v-if="stepIndex > 0"
          type="button"
          class="btn-ghost btn-sm"
          @click="goTo(stepIndex - 1)"
        >
          Back
        </button>
        <button
          v-if="canReturnToStepPage"
          type="button"
          class="btn-secondary btn-sm"
          @click="locateStep"
        >
          Take me there
        </button>
        <button
          type="button"
          class="btn-primary btn-sm ml-auto"
          @click="isLastStep ? completeActive() : goTo(stepIndex + 1)"
        >
          {{ isLastStep ? 'Done' : 'Next' }}
        </button>
      </div>
      <button
        v-if="!isLastStep"
        type="button"
        class="btn-link mt-2 text-xs"
        @click="dismissActive"
      >
        Skip tour
      </button>
    </section>
  </template>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SparklesIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { useFeatureTourStore } from '@/stores/featureTour'
import { useProAccess } from '@/composables/useProAccess'
import { useAnalytics } from '@/composables/useAnalytics'
import { findFeatureTour, stepsForUser } from '@/constants/featureTours'

const TARGET_WAIT_MS = 5000
const TARGET_POLL_MS = 150
const SPOTLIGHT_PADDING = 6
const VIEWPORT_MARGIN = 16
const CARD_GAP = 12
const CARD_WIDTH = 352
const NARROW_VIEWPORT = 640
const MOBILE_HEADER_OFFSET = 72

const route = useRoute()
const router = useRouter()
const tourStore = useFeatureTourStore()
const { isProUser } = useProAccess()
const { track } = useAnalytics()

const targetRect = ref(null)
const locating = ref(false)
const stepRouteLocation = ref(null)
const stepUnavailable = ref(false)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const cardEl = ref(null)
const titleEl = ref(null)
let targetEl = null
let locateSeq = 0
let resizeObserver = null
let frame = 0

const pendingTour = computed(() => tourStore.pendingTour)
const pendingStepCount = computed(() => stepsForUser(pendingTour.value, { isPro: isProUser.value }).length)
const showPrompt = computed(() => !!pendingTour.value && pendingStepCount.value > 0 && !tourStore.active)

const activeTour = computed(() => tourStore.activeTour)
const steps = computed(() => stepsForUser(activeTour.value, { isPro: isProUser.value }))
const stepIndex = computed(() => Math.min(tourStore.active?.stepIndex || 0, Math.max(0, steps.value.length - 1)))
const currentStep = computed(() => steps.value[stepIndex.value] || null)
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1)

const stepBody = computed(() => {
  const step = currentStep.value
  if (!step) return ''
  if ((stepUnavailable.value || (step.target && !targetRect.value)) && step.fallbackBody) {
    return step.fallbackBody
  }
  return step.body
})

// Offer to go back when the user wandered off the step's page mid-tour.
const canReturnToStepPage = computed(() => {
  if (locating.value || targetRect.value || !stepRouteLocation.value) return false
  try {
    return router.resolve(stepRouteLocation.value).path !== route.path
  } catch (_) {
    return false
  }
})

const spotlightStyle = computed(() => {
  const r = targetRect.value
  if (!r) return {}
  return {
    top: `${r.top - SPOTLIGHT_PADDING}px`,
    left: `${r.left - SPOTLIGHT_PADDING}px`,
    width: `${r.width + SPOTLIGHT_PADDING * 2}px`,
    height: `${r.height + SPOTLIGHT_PADDING * 2}px`
  }
})

const cardPlacement = computed(() => {
  const { width: vw, height: vh } = viewport.value
  const r = targetRect.value
  // Phones, and steps without a spotlight: dock the card at the bottom.
  if (vw < NARROW_VIEWPORT || !r) {
    return {
      className: 'bottom-4 left-4 right-4 sm:left-auto sm:w-[22rem]',
      style: {}
    }
  }
  const width = Math.min(CARD_WIDTH, vw - VIEWPORT_MARGIN * 2)
  const left = Math.min(Math.max(r.left, VIEWPORT_MARGIN), vw - width - VIEWPORT_MARGIN)
  const spaceBelow = vh - (r.top + r.height + SPOTLIGHT_PADDING)
  const style = { width: `${width}px`, left: `${left}px` }
  if (spaceBelow >= 220) {
    style.top = `${r.top + r.height + SPOTLIGHT_PADDING + CARD_GAP}px`
  } else if (r.top - SPOTLIGHT_PADDING >= 220) {
    style.bottom = `${vh - r.top + SPOTLIGHT_PADDING + CARD_GAP}px`
  } else {
    // Target fills the screen: keep the card readable in the corner.
    style.bottom = `${VIEWPORT_MARGIN}px`
    style.left = `${vw - width - VIEWPORT_MARGIN}px`
  }
  return { className: '', style }
})

function isVisible(el) {
  if (!el || !el.isConnected) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findTarget(name) {
  // Registry targets are validated as [a-z0-9-] in featureTours.test.js.
  const matches = document.querySelectorAll(`[data-tour="${name}"]`)
  for (const el of matches) {
    if (isVisible(el)) return el
  }
  return null
}

function measure() {
  if (!targetEl || !isVisible(targetEl)) {
    targetRect.value = null
    return
  }
  const rect = targetEl.getBoundingClientRect()
  targetRect.value = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function scheduleMeasure() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    viewport.value = { width: window.innerWidth, height: window.innerHeight }
    measure()
  })
}

function releaseTarget() {
  targetEl = null
  targetRect.value = null
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

async function waitForTarget(name, seq) {
  const deadline = Date.now() + TARGET_WAIT_MS
  while (Date.now() < deadline) {
    if (seq !== locateSeq) return null
    const el = findTarget(name)
    if (el) return el
    await new Promise(resolve => setTimeout(resolve, TARGET_POLL_MS))
  }
  return null
}

async function resolveStepLocation(step) {
  if (step.route) return step.route
  if (typeof step.resolveRoute === 'function') {
    try {
      return await step.resolveRoute({ api })
    } catch (error) {
      console.error('Feature tour step could not resolve its page:', error)
      return null
    }
  }
  return null
}

async function locateStep() {
  const step = currentStep.value
  if (!step) return
  const seq = ++locateSeq
  releaseTarget()
  locating.value = true
  stepUnavailable.value = false

  const location = await resolveStepLocation(step)
  if (seq !== locateSeq) return
  stepRouteLocation.value = location
  if (!location && (step.route || step.resolveRoute)) {
    stepUnavailable.value = true
  }

  if (location) {
    try {
      if (router.resolve(location).path !== route.path) {
        await router.push(location)
      }
    } catch (error) {
      console.error('Feature tour navigation failed:', error)
    }
  }
  if (seq !== locateSeq) return

  if (step.target && !stepUnavailable.value) {
    const el = await waitForTarget(step.target, seq)
    if (seq !== locateSeq) return
    if (el) {
      targetEl = el
      if (window.innerWidth < NARROW_VIEWPORT) {
        // The card docks at the bottom on phones, so put the feature at the
        // top, clear of the sticky mobile header.
        el.scrollIntoView({ block: 'start', behavior: 'auto' })
        window.scrollBy(0, -MOBILE_HEADER_OFFSET)
      } else {
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
      }
      await nextTick()
      measure()
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleMeasure)
        resizeObserver.observe(el)
      }
    }
  }

  locating.value = false
  track('feature_tour_step_viewed', {
    tour_id: activeTour.value?.id,
    step_id: step.id,
    step_index: stepIndex.value,
    anchored: !!targetRect.value
  })
  await nextTick()
  titleEl.value?.focus({ preventScroll: true })
}

function goTo(index) {
  tourStore.goToStep(index)
}

function startPending() {
  const tour = pendingTour.value
  if (!tour) return
  track('feature_tour_started', { tour_id: tour.id })
  tourStore.start(tour.id)
}

function dismissPending() {
  const tour = pendingTour.value
  if (!tour) return
  track('feature_tour_dismissed', { tour_id: tour.id, step_index: null, from: 'prompt' })
  tourStore.finish(tour.id, 'dismissed', null)
}

function dismissActive() {
  const tour = activeTour.value
  if (!tour) return
  track('feature_tour_dismissed', { tour_id: tour.id, step_index: stepIndex.value, from: 'tour' })
  locateSeq++
  releaseTarget()
  tourStore.finish(tour.id, 'dismissed', stepIndex.value)
}

function completeActive() {
  const tour = activeTour.value
  if (!tour) return
  track('feature_tour_completed', { tour_id: tour.id })
  locateSeq++
  releaseTarget()
  tourStore.finish(tour.id, 'completed', stepIndex.value)
}

function onKeydown(event) {
  if (event.key === 'Escape' && activeTour.value && !document.querySelector('.modal-overlay, .modal-backdrop')) {
    dismissActive()
  }
}

// Re-locate whenever the tour or step changes.
watch(
  () => [tourStore.active?.tourId, stepIndex.value, steps.value.length],
  ([tourId]) => {
    if (tourId && currentStep.value) {
      locateStep()
    } else {
      locateSeq++
      releaseTarget()
      locating.value = false
    }
  },
  { immediate: true }
)

// The user navigated somewhere else mid-step: drop the stale spotlight and
// look for the target again on the new page.
watch(
  () => route.fullPath,
  () => {
    if (activeTour.value && currentStep.value && !locating.value) {
      releaseTarget()
      const step = currentStep.value
      if (step.target) {
        const seq = ++locateSeq
        waitForTarget(step.target, seq).then(el => {
          if (seq !== locateSeq || !el) return
          targetEl = el
          measure()
        })
      }
    }
  }
)

// ?tour=<id> replays a tour (clears the user's record first).
watch(
  () => route.query.tour,
  async (tourId) => {
    if (typeof tourId !== 'string' || !findFeatureTour(tourId)) return
    const { tour: _tour, ...query } = route.query
    await router.replace({ path: route.path, query, hash: route.hash })
    await tourStore.replay(tourId)
  },
  { immediate: true }
)

watch(showPrompt, (visible) => {
  if (visible) track('feature_tour_prompt_shown', { tour_id: pendingTour.value?.id })
}, { immediate: true })

onMounted(() => {
  window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true })
  window.addEventListener('resize', scheduleMeasure, { passive: true })
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', scheduleMeasure, { capture: true })
  window.removeEventListener('resize', scheduleMeasure)
  document.removeEventListener('keydown', onKeydown)
  if (frame) cancelAnimationFrame(frame)
  locateSeq++
  releaseTarget()
})
</script>

<style scoped>
.feature-tour-spotlight {
  /* Dims everything except the feature; clicks still pass through. */
  box-shadow: 0 0 0 9999px rgba(17, 24, 39, 0.45);
  transition: top 160ms ease-out, left 160ms ease-out, width 160ms ease-out, height 160ms ease-out;
}

.feature-tour-enter {
  animation: feature-tour-in 220ms ease-out both;
}

@keyframes feature-tour-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-tour-spotlight {
    transition: none;
  }
  .feature-tour-enter {
    animation: none;
  }
}
</style>
