<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your most profitable symbol
      </div>

      <div v-if="data.topSymbol" class="space-y-4">
        <!-- Trophy icon -->
        <div class="text-primary-400">
          <svg class="w-16 h-16 sm:w-20 sm:h-20 mx-auto" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 3h14c.55 0 1 .45 1 1v3c0 2.21-1.79 4-4 4h-1.23c-.76 1.19-2.01 2.08-3.52 2.39V17h3v2H9v-2h3v-3.61c-1.51-.31-2.76-1.2-3.52-2.39H7c-2.21 0-4-1.79-4-4V4c0-.55.45-1 1-1zm13 4V5H6v2c0 1.1.9 2 2 2h1c.23 0 .45-.03.66-.09C9.25 7.54 9 6.03 9 5h2c0 1.1.25 2.12.67 3H7c-1.1 0-2-.9-2-2V5h2v2h10c0-1.1.9-2 2-2v2c0 1.1-.9 2-2 2h-2.67c.42-.88.67-1.9.67-3h2c0 1.03-.25 2.54-.66 3.91.21.06.43.09.66.09h1c1.1 0 2-.9 2-2zM5 16h14v2H5z"/>
          </svg>
        </div>

        <div class="text-5xl sm:text-7xl font-black text-primary-300 animate-count-up">
          {{ data.topSymbol.symbol }}
        </div>

        <div
          class="text-4xl sm:text-5xl font-bold"
          :class="data.topSymbol.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'"
        >
          {{ data.topSymbol.totalPnL >= 0 ? '+' : '' }}{{ formatCurrency(data.topSymbol.totalPnL) }}
        </div>

        <div class="flex justify-center gap-8 pt-4 text-base sm:text-lg">
          <div class="text-center">
            <div class="text-2xl sm:text-3xl font-bold text-white">{{ data.topSymbol.tradeCount }}</div>
            <div class="text-white/60">trades</div>
          </div>
          <div class="text-center">
            <div class="text-2xl sm:text-3xl font-bold text-white">{{ Math.round(data.topSymbol.winRate) }}%</div>
            <div class="text-white/60">win rate</div>
          </div>
        </div>

        <div class="text-white/50 pt-4">
          You traded {{ data.uniqueSymbolsTraded }} different symbols this year
        </div>
      </div>

      <div v-else class="text-white/60">
        No symbol data available
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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
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
