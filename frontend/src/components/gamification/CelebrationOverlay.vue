<template>
  <transition name="fade">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div class="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 text-center">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2">
          <div class="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center text-2xl">[SUCCESS]</div>
        </div>

        <div class="mt-6">
          <div v-if="currentItem?.type === 'achievement'" class="space-y-3">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">Achievement Unlocked!</div>
            <div class="text-lg text-primary-600 dark:text-primary-400 font-semibold">{{ currentItem.payload.achievement.name }}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">{{ currentItem.payload.achievement.description }}</div>
            <div class="text-xl mt-2 font-bold text-yellow-600">+{{ currentItem.payload.achievement.points }} XP</div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                class="bg-primary-500 h-3 rounded-full transition-all duration-150 ease-out"
                :style="{ width: levelProgressPercent + '%' }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              Level {{ xpState.level }}
              <span v-if="justLeveledUp" class="ml-1 text-green-600 dark:text-green-400 font-semibold">+1 Level!</span>
            </div>
          </div>

          <div v-else-if="currentItem?.type === 'level_up'" class="space-y-2">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">Level Up!</div>
            <div class="text-lg text-primary-600 dark:text-primary-400 font-semibold">Level {{ currentItem.payload.newLevel }}</div>
          </div>

          <div v-else-if="currentItem?.type === 'xp_update'" class="space-y-3">
            <div class="text-xl font-semibold text-gray-900 dark:text-white">XP Progress</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">+{{ currentItem.payload.deltaXP }} XP</div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                class="bg-primary-500 h-3 rounded-full transition-all duration-200 ease-out"
                :style="{ width: progressPercent + '%' }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              Level {{ currentItem.payload.oldLevel }} → {{ currentItem.payload.newLevel }}
            </div>
          </div>
        </div>

        <button @click="next" class="mt-6 btn-primary w-full">Continue</button>
      </div>

      <!-- Simple confetti canvas -->
      <canvas ref="confettiCanvas" class="fixed inset-0 pointer-events-none" :style="{ opacity: confettiOpacity, transition: 'opacity 500ms ease' }" />
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'

const props = defineProps({
  queue: {
    type: Array,
    required: true
  }
})

const visible = ref(false)
const currentItem = ref(null)
const confettiCanvas = ref(null)
let rafId = null
let particles = []
const confettiOpacity = ref(0)

// XP state for per-achievement progress animation
const xpState = ref({ xp: null, level: 1, min: 0, next: 100 })
const justLeveledUp = ref(false)

const levelProgressPercent = computed(() => {
  if (xpState.value.xp === null) return 0
  const inLevel = Math.max(0, xpState.value.xp - xpState.value.min)
  const span = Math.max(1, xpState.value.next - xpState.value.min)
  return Math.min(100, Math.round((inLevel / span) * 100))
})

function calcLevelFromXP(xp) {
  if (xp < 100) {
    return { level: 1, min: 0, next: 100 }
  }
  let level = 1
  let currentMin = 0
  let nextMin = 100
  while (xp >= nextMin) {
    level++
    currentMin = nextMin
    const xpForNext = 100 + (level - 2) * 50
    nextMin = currentMin + xpForNext
  }
  return { level, min: currentMin, next: nextMin }
}

function setXPBaselineFromPayload(p) {
  const startXP = p.oldXP
  const info = calcLevelFromXP(startXP)
  xpState.value = { xp: startXP, level: info.level, min: info.min, next: info.next }
}

async function animateXPIncrease(points) {
  if (xpState.value.xp === null) return
  justLeveledUp.value = false
  let remaining = points
  while (remaining > 0) {
    const toLevelUp = xpState.value.next - xpState.value.xp
    const step = Math.min(remaining, toLevelUp)
    await animateValue(xpState.value.xp, xpState.value.xp + step, 300)
    xpState.value.xp += step
    remaining -= step
    if (xpState.value.xp >= xpState.value.next) {
      const info = calcLevelFromXP(xpState.value.xp)
      xpState.value.level = info.level
      xpState.value.min = info.min
      xpState.value.next = info.next
      justLeveledUp.value = true
      await wait(150)
      justLeveledUp.value = false
    }
  }
}

function animateValue(from, to, duration) {
  return new Promise(resolve => {
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = from + (to - from) * eased
      xpState.value.xp = value
      rafId = requestAnimationFrame(tick)
      if (t >= 1) {
        cancelAnimationFrame(rafId)
        resolve()
      }
    }
    rafId = requestAnimationFrame(tick)
  })
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function popConfetti() {
  const canvas = confettiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { innerWidth: w, innerHeight: h } = window
  canvas.width = w
  canvas.height = h
  particles = Array.from({ length: 120 }).map(() => ({
    x: Math.random() * w,
    y: -20,
    r: 4 + Math.random() * 4,
    c: `hsl(${Math.random() * 360}, 80%, 60%)`,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 3,
    a: 0.98
  }))
  confettiOpacity.value = 1
  cancelAnimationFrame(rafId)
  const tick = () => {
    ctx.clearRect(0, 0, w, h)
    particles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      p.vy *= p.a
      ctx.fillStyle = p.c
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    })
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
  // Auto stop after 3s
  setTimeout(() => {
    cancelAnimationFrame(rafId)
    confettiOpacity.value = 0
    setTimeout(() => {
      ctx.clearRect(0, 0, w, h)
      particles = []
    }, 600)
  }, 3000)
}

function next() {
  if (props.queue.length > 0) {
    currentItem.value = props.queue.shift()
    // xp_update: establish baseline for XP animation, skip showing its card
    if (currentItem.value?.type === 'xp_update') {
      setXPBaselineFromPayload(currentItem.value.payload)
      currentItem.value = null
      return next()
    }
    visible.value = true
    popConfetti()
    if (currentItem.value?.type === 'achievement') {
      const pts = Number(currentItem.value.payload.achievement.points || 0)
      if (xpState.value.xp === null) {
        const info = calcLevelFromXP(0)
        xpState.value = { xp: 0, level: info.level, min: info.min, next: info.next }
      }
      animateXPIncrease(pts)
    }
  } else {
    visible.value = false
    currentItem.value = null
  }
}

watch(() => props.queue.length, (len) => {
  if (!visible.value && len > 0) {
    next()
  }
})

onMounted(() => {
  if (props.queue.length > 0) next()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.btn-primary { @apply bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors; }
</style>


