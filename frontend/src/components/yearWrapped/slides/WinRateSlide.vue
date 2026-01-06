<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your win rate
      </div>

      <!-- Visual Win Rate Gauge -->
      <div class="relative w-48 h-48 sm:w-64 sm:h-64 mx-auto">
        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <!-- Background circle -->
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            stroke-width="10"
          />
          <!-- Win rate arc -->
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            :stroke="winRateColor"
            stroke-width="10"
            stroke-linecap="round"
            :stroke-dasharray="`${data.winRate * 2.83} 283`"
            class="animate-draw"
          />
        </svg>
        <!-- Center text -->
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <div class="text-5xl sm:text-6xl font-black" :class="winRateTextColor">
              {{ Math.round(data.winRate) }}%
            </div>
          </div>
        </div>
      </div>

      <div class="text-xl sm:text-2xl font-semibold" :class="winRateTextColor">
        {{ winRateMessage }}
      </div>

      <div class="flex justify-center gap-8 pt-6 text-base">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-400">{{ data.winningTrades }}</div>
          <div class="text-white/60">wins</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-red-400">{{ data.losingTrades }}</div>
          <div class="text-white/60">losses</div>
        </div>
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

const winRateColor = computed(() => {
  if (props.data.winRate >= 60) return '#4ade80' // green-400
  if (props.data.winRate >= 50) return '#F0812A' // primary-500
  return '#f87171' // red-400
})

const winRateTextColor = computed(() => {
  if (props.data.winRate >= 60) return 'text-green-400'
  if (props.data.winRate >= 50) return 'text-primary-400'
  return 'text-red-400'
})

const winRateMessage = computed(() => {
  if (props.data.winRate >= 70) return 'Exceptional!'
  if (props.data.winRate >= 60) return 'Great performance!'
  if (props.data.winRate >= 50) return 'Above average'
  if (props.data.winRate >= 40) return 'Room for improvement'
  return 'Keep learning!'
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

@keyframes draw {
  from {
    stroke-dasharray: 0 283;
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}

.animate-draw {
  animation: draw 1.5s ease-out forwards;
}
</style>
