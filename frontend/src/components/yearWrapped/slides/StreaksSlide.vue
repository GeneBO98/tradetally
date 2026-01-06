<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in max-w-3xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your streaks &amp; dedication
      </div>

      <!-- Flame icon -->
      <div class="text-primary-400">
        <svg class="w-12 h-12 sm:w-16 sm:h-16 mx-auto animate-pulse-slow" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2c-5.33 4-8 8-8 12a8 8 0 1 0 16 0c0-4-2.67-8-8-12zm0 18a6 6 0 0 1-6-6c0-2.97 1.89-6.04 6-9.58 4.11 3.54 6 6.61 6 9.58a6 6 0 0 1-6 6zm-1-5.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/>
        </svg>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <!-- Trading Day Streak -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Trading day streak</div>
          <div class="text-3xl sm:text-4xl font-black text-primary-400">
            {{ data.streaks?.longestTradingStreak || 0 }}
          </div>
          <div class="text-white/50 text-xs">consecutive days</div>
        </div>

        <!-- Win Streak -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Best win streak</div>
          <div class="text-3xl sm:text-4xl font-black text-green-400">
            {{ data.streaks?.longestWinStreak || 0 }}
          </div>
          <div class="text-white/50 text-xs">wins in a row</div>
        </div>

        <!-- Loss Streak -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Worst loss streak</div>
          <div class="text-3xl sm:text-4xl font-black text-red-400">
            {{ data.streaks?.longestLossStreak || 0 }}
          </div>
          <div class="text-white/50 text-xs">losses in a row</div>
        </div>

        <!-- Login Stats -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Days logged in</div>
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.streaks?.loginDaysTotal || 0 }}
          </div>
          <div class="text-white/50 text-xs">this year</div>
        </div>

        <!-- Login Streak -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Login streak</div>
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.streaks?.longestLoginStreak || 0 }}
          </div>
          <div class="text-white/50 text-xs">days in a row</div>
        </div>

        <!-- Trading Days -->
        <div class="bg-white/10 rounded-xl p-4 sm:p-5 space-y-2">
          <div class="text-white/60 text-xs sm:text-sm">Trading days</div>
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.streaks?.tradingDaysTotal || data.tradingDays || 0 }}
          </div>
          <div class="text-white/50 text-xs">this year</div>
        </div>
      </div>

      <div v-if="streakMessage" class="text-lg sm:text-xl font-semibold text-primary-300 pt-2">
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
  const tradingStreak = props.data.streaks?.longestTradingStreak || 0
  const winStreak = props.data.streaks?.longestWinStreak || 0

  if (tradingStreak >= 20) return 'Incredible trading consistency!'
  if (winStreak >= 10) return 'Amazing win streak!'
  if (tradingStreak >= 10) return 'Great trading discipline!'
  if (winStreak >= 5) return 'Solid winning momentum!'
  if (tradingStreak >= 5) return 'Building good habits!'
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
