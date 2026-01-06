<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="yearWrappedStore.isModalOpen"
        class="fixed inset-0 z-[9999] bg-black"
        @keydown.escape="handleClose"
        @keydown.left="yearWrappedStore.prevSlide"
        @keydown.right="yearWrappedStore.nextSlide"
        tabindex="0"
        ref="modalRef"
      >
        <!-- Loading State -->
        <div v-if="yearWrappedStore.loading" class="h-full flex items-center justify-center">
          <div class="animate-spin rounded-full h-16 w-16 border-4 border-white/20 border-t-white"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="yearWrappedStore.error" class="h-full flex flex-col items-center justify-center text-white p-8">
          <div class="text-6xl mb-4">[!]</div>
          <h2 class="text-2xl font-bold mb-2">Oops!</h2>
          <p class="text-white/70 mb-6">{{ yearWrappedStore.error }}</p>
          <button @click="handleClose" class="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
            Close
          </button>
        </div>

        <!-- Slides Container -->
        <div v-else-if="yearWrappedStore.wrappedData" class="relative h-full w-full">
          <!-- Progress Dots -->
          <div class="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 px-4 max-w-full overflow-x-auto">
            <button
              v-for="(_, index) in yearWrappedStore.totalSlides"
              :key="index"
              @click="yearWrappedStore.goToSlide(index)"
              class="h-1.5 rounded-full transition-all duration-300 flex-shrink-0"
              :class="[
                yearWrappedStore.currentSlide === index
                  ? 'w-6 bg-white'
                  : 'w-1.5 bg-white/40 hover:bg-white/60'
              ]"
            />
          </div>

          <!-- Close Button -->
          <button
            @click="handleClose"
            class="absolute top-4 right-4 z-10 p-2 text-white/60 hover:text-white transition-colors"
          >
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Slide Content -->
          <div class="h-full w-full overflow-hidden">
            <transition :name="slideDirection" mode="out-in">
              <component
                :is="currentSlideComponent"
                :key="yearWrappedStore.currentSlide"
                :data="yearWrappedStore.wrappedData"
              />
            </transition>
          </div>

          <!-- Navigation Arrows -->
          <button
            v-if="yearWrappedStore.currentSlide > 0"
            @click="handlePrev"
            class="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 text-white/60 hover:text-white transition-colors"
          >
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            v-if="yearWrappedStore.currentSlide < yearWrappedStore.totalSlides - 1"
            @click="handleNext"
            class="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 text-white/60 hover:text-white transition-colors"
          >
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <!-- Skip/Finish Button -->
          <button
            @click="handleClose"
            class="absolute bottom-6 right-6 z-10 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            {{ yearWrappedStore.currentSlide === yearWrappedStore.totalSlides - 1 ? 'Finish' : 'Skip' }}
          </button>
        </div>

        <!-- Confetti Canvas -->
        <canvas ref="confettiCanvas" class="fixed inset-0 pointer-events-none z-20" />
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef, markRaw } from 'vue'
import { useYearWrappedStore } from '@/stores/yearWrapped'

// Import slide components
import IntroSlide from './slides/IntroSlide.vue'
import TotalTradesSlide from './slides/TotalTradesSlide.vue'
import TotalPnLSlide from './slides/TotalPnLSlide.vue'
import WinRateSlide from './slides/WinRateSlide.vue'
import TopTradeSlide from './slides/TopTradeSlide.vue'
import TopSymbolSlide from './slides/TopSymbolSlide.vue'
import TradingPatternsSlide from './slides/TradingPatternsSlide.vue'
import StreaksSlide from './slides/StreaksSlide.vue'
import YoYComparisonSlide from './slides/YoYComparisonSlide.vue'
import MonthlyProgressionSlide from './slides/MonthlyProgressionSlide.vue'
import SummarySlide from './slides/SummarySlide.vue'

const yearWrappedStore = useYearWrappedStore()

const modalRef = ref(null)
const confettiCanvas = ref(null)
const slideDirection = ref('slide-left')
let confettiRafId = null
let particles = []

// Build slides array dynamically based on data
const slides = computed(() => {
  const data = yearWrappedStore.wrappedData
  if (!data) return []

  const slideList = [
    markRaw(IntroSlide),
    markRaw(TotalTradesSlide),
    markRaw(TotalPnLSlide),
    markRaw(WinRateSlide),
    markRaw(TopTradeSlide),
    markRaw(TopSymbolSlide),
    markRaw(TradingPatternsSlide),
    markRaw(StreaksSlide),
  ]

  // Add YoY comparison if previous year data exists
  if (data.comparison?.hasPreviousYear) {
    slideList.push(markRaw(YoYComparisonSlide))
  }

  // Add monthly progression if there's trading data
  if (data.monthlyBreakdown?.some(m => m.trades > 0)) {
    slideList.push(markRaw(MonthlyProgressionSlide))
  }

  // Always end with summary
  slideList.push(markRaw(SummarySlide))

  return slideList
})

const currentSlideComponent = computed(() => {
  return slides.value[yearWrappedStore.currentSlide] || IntroSlide
})

// Handle navigation with animation direction
function handleNext() {
  slideDirection.value = 'slide-left'
  yearWrappedStore.nextSlide()
}

function handlePrev() {
  slideDirection.value = 'slide-right'
  yearWrappedStore.prevSlide()
}

function handleClose() {
  stopConfetti()
  yearWrappedStore.closeModal()
}

// Confetti functions
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
  stopConfetti()

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

      if (p.y < h + 50) {
        activeParticles++
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    if (activeParticles > 0) {
      confettiRafId = requestAnimationFrame(tick)
    } else {
      stopConfetti()
    }
  }

  confettiRafId = requestAnimationFrame(tick)
}

// Expose confetti to slides
defineExpose({ startConfetti })

// Focus modal when opened
watch(() => yearWrappedStore.isModalOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      modalRef.value?.focus()
    })
  }
})

// Trigger confetti on P&L slide if positive
watch(() => yearWrappedStore.currentSlide, (slideIndex) => {
  // Trigger confetti on TotalPnLSlide (index 2) if P&L is positive
  if (slideIndex === 2 && yearWrappedStore.wrappedData?.totalPnL > 0) {
    nextTick(() => {
      startConfetti()
    })
  }
})

// Keyboard handling
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  stopConfetti()
})

function handleKeydown(e) {
  if (!yearWrappedStore.isModalOpen) return

  if (e.key === 'ArrowRight') {
    handleNext()
  } else if (e.key === 'ArrowLeft') {
    handlePrev()
  } else if (e.key === 'Escape') {
    handleClose()
  }
}
</script>

<style scoped>
/* Fade transition for modal */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide transitions */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.4s ease-out;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(50px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-50px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(50px);
}
</style>
