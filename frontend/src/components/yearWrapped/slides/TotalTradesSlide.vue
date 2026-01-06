<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        This year you made
      </div>

      <div class="text-7xl sm:text-9xl font-black text-primary-400 animate-count-up">
        {{ formatNumber(data.totalTrades) }}
      </div>

      <div class="text-2xl sm:text-3xl font-semibold text-primary-300">
        trades
      </div>

      <div class="flex flex-wrap justify-center gap-6 pt-8 text-base sm:text-lg">
        <div class="text-center">
          <div class="text-3xl sm:text-4xl font-bold text-green-400">{{ data.winningTrades }}</div>
          <div class="text-white/60">winners</div>
        </div>
        <div class="text-center">
          <div class="text-3xl sm:text-4xl font-bold text-red-400">{{ data.losingTrades }}</div>
          <div class="text-white/60">losers</div>
        </div>
        <div v-if="data.breakevenTrades > 0" class="text-center">
          <div class="text-3xl sm:text-4xl font-bold text-gray-400">{{ data.breakevenTrades }}</div>
          <div class="text-white/60">breakeven</div>
        </div>
      </div>

      <div class="text-white/50 pt-4">
        Across {{ data.tradingDays }} trading days
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  data: {
    type: Object,
    required: true
  }
})

function formatNumber(num) {
  return new Intl.NumberFormat().format(num)
}
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

@keyframes count-up {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}

.animate-count-up {
  animation: count-up 0.6s ease-out;
}
</style>
