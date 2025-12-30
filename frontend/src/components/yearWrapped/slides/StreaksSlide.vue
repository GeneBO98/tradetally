<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900 text-white p-8">
    <div class="text-center space-y-8 animate-fade-in max-w-2xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your dedication
      </div>

      <!-- Flame icon -->
      <div class="text-primary-400">
        <svg class="w-16 h-16 sm:w-20 sm:h-20 mx-auto animate-pulse-slow" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2c-5.33 4-8 8-8 12a8 8 0 1 0 16 0c0-4-2.67-8-8-12zm0 18a6 6 0 0 1-6-6c0-2.97 1.89-6.04 6-9.58 4.11 3.54 6 6.61 6 9.58a6 6 0 0 1-6 6zm-1-5.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/>
        </svg>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <!-- Login Stats -->
        <div class="bg-white/10 rounded-xl p-6 space-y-3">
          <div class="text-white/60 text-sm">Days logged in</div>
          <div class="text-4xl sm:text-5xl font-black text-primary-300">
            {{ data.streaks?.loginDaysTotal || 0 }}
          </div>
        </div>

        <div class="bg-white/10 rounded-xl p-6 space-y-3">
          <div class="text-white/60 text-sm">Longest login streak</div>
          <div class="text-4xl sm:text-5xl font-black text-primary-400">
            {{ data.streaks?.longestLoginStreak || 0 }}
          </div>
          <div class="text-white/50 text-sm">days in a row</div>
        </div>

        <!-- Trading Stats -->
        <div class="bg-white/10 rounded-xl p-6 space-y-3">
          <div class="text-white/60 text-sm">Trading days</div>
          <div class="text-4xl sm:text-5xl font-black text-primary-300">
            {{ data.streaks?.tradingDaysTotal || data.tradingDays || 0 }}
          </div>
        </div>

        <div class="bg-white/10 rounded-xl p-6 space-y-3">
          <div class="text-white/60 text-sm">Longest trading streak</div>
          <div class="text-4xl sm:text-5xl font-black text-primary-400">
            {{ data.streaks?.longestTradingStreak || 0 }}
          </div>
          <div class="text-white/50 text-sm">days in a row</div>
        </div>
      </div>

      <div v-if="streakMessage" class="text-xl sm:text-2xl font-semibold text-primary-300 pt-4">
        {{ streakMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    required: true
  }
})

const streakMessage = computed(() => {
  const loginStreak = props.data.streaks?.longestLoginStreak || 0
  const tradingStreak = props.data.streaks?.longestTradingStreak || 0
  const maxStreak = Math.max(loginStreak, tradingStreak)

  if (maxStreak >= 30) return 'Incredible consistency!'
  if (maxStreak >= 14) return 'Building great habits!'
  if (maxStreak >= 7) return 'Solid dedication!'
  if (maxStreak >= 3) return 'Keep it going!'
  return ''
})
</script>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse-slow {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}

.animate-pulse-slow {
  animation: pulse-slow 2s ease-in-out infinite;
}
</style>
