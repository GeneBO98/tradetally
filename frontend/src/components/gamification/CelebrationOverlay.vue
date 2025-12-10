<template>
  <transition name="fade">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div class="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 text-center">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2">
          <div class="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center">
            <svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
            </svg>
          </div>
        </div>

        <div class="mt-6">
          <div v-if="currentItem?.type === 'achievement'" class="space-y-3">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">Achievement Unlocked!</div>
            <div class="text-lg text-primary-600 dark:text-primary-400 font-semibold">{{ currentItem.payload.achievement.name }}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">{{ currentItem.payload.achievement.description }}</div>
            <div class="text-xl mt-2 font-bold text-yellow-600">+{{ currentItem.payload.achievement.points }} XP</div>
          </div>

          <div v-else-if="currentItem?.type === 'level_up'" class="space-y-2">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">Level Up!</div>
            <div class="text-lg text-primary-600 dark:text-primary-400 font-semibold">Level {{ currentItem.payload.newLevel }}</div>
          </div>
        </div>

        <button
          @click="handleContinue"
          :disabled="isAnimating"
          class="mt-6 btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ isAnimating ? 'Please wait...' : (remainingCount > 0 ? `Continue (${remainingCount} more)` : 'Done') }}
        </button>
      </div>

      <!-- Confetti canvas -->
      <canvas ref="confettiCanvas" class="fixed inset-0 pointer-events-none" />
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'

const props = defineProps({
  queue: {
    type: Array,
    required: true
  }
})

const visible = ref(false)
const currentItem = ref(null)
const confettiCanvas = ref(null)
const isAnimating = ref(false)
const remainingCount = ref(0)

let confettiRafId = null
let particles = []

function stopConfetti() {
  if (confettiRafId) {
    cancelAnimationFrame(confettiRafId)
    confettiRafId = null
  }
  const canvas = confettiCanvas.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  particles = []
}

function startConfetti() {
  stopConfetti() // Clear any existing confetti first

  const canvas = confettiCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const { innerWidth: w, innerHeight: h } = window
  canvas.width = w
  canvas.height = h

  // Create particles
  particles = Array.from({ length: 150 }).map(() => ({
    x: Math.random() * w,
    y: -20 - Math.random() * 100,
    r: 4 + Math.random() * 4,
    c: `hsl(${Math.random() * 360}, 80%, 60%)`,
    vx: -2 + Math.random() * 4,
    vy: 3 + Math.random() * 4,
    gravity: 0.1,
    friction: 0.99
  }))

  const tick = () => {
    ctx.clearRect(0, 0, w, h)

    let activeParticles = 0
    particles.forEach(p => {
      p.x += p.vx
      p.vy += p.gravity
      p.y += p.vy
      p.vx *= p.friction

      // Only draw if on screen
      if (p.y < h + 50) {
        activeParticles++
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    // Keep animating while particles are visible
    if (activeParticles > 0) {
      confettiRafId = requestAnimationFrame(tick)
    } else {
      stopConfetti()
    }
  }

  confettiRafId = requestAnimationFrame(tick)
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function showNextItem() {
  console.log('[CELEBRATION] showNextItem called, queue length:', props.queue.length)

  // If already showing something, don't interrupt
  if (visible.value) {
    console.log('[CELEBRATION] Already visible, skipping')
    return
  }

  // Skip any xp_update items (we don't show them anymore)
  while (props.queue.length > 0 && props.queue[0]?.type === 'xp_update') {
    props.queue.shift()
  }

  // Update remaining count
  remainingCount.value = props.queue.length > 0 ? props.queue.length - 1 : 0

  // Now show the next visible item
  if (props.queue.length > 0) {
    const item = props.queue.shift()
    currentItem.value = item
    console.log('[CELEBRATION] Showing item:', item.type, item.payload?.achievement?.name || '')

    visible.value = true
    nextTick(() => {
      startConfetti()
    })
  } else {
    console.log('[CELEBRATION] Queue empty, nothing to show')
    visible.value = false
    currentItem.value = null
  }
}

async function handleContinue() {
  // Prevent double-clicks
  if (isAnimating.value) {
    console.log('[CELEBRATION] Already animating, ignoring click')
    return
  }

  console.log('[CELEBRATION] handleContinue called')
  isAnimating.value = true

  // Stop confetti immediately when clicking continue
  stopConfetti()

  visible.value = false
  currentItem.value = null

  // Small delay for fade transition, then show next
  await wait(200)

  isAnimating.value = false
  showNextItem()
}

// Watch for new items added to the queue
watch(() => props.queue.length, (newLen, oldLen) => {
  console.log('[CELEBRATION] Queue length changed:', oldLen, '->', newLen)
  // Only start processing if we're not already showing something
  if (newLen > 0 && !visible.value && !isAnimating.value) {
    showNextItem()
  }
}, { immediate: true })

onMounted(() => {
  console.log('[CELEBRATION] Mounted, queue length:', props.queue.length)
  if (props.queue.length > 0 && !visible.value) {
    showNextItem()
  }
})

onBeforeUnmount(() => {
  stopConfetti()
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.btn-primary { @apply bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors; }
</style>
