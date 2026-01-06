<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your best trade of the year
      </div>

      <div v-if="data.bestTrade" class="space-y-4">
        <!-- Star icon -->
        <div class="text-5xl sm:text-6xl text-primary-400 animate-pulse-slow">
          <svg class="w-16 h-16 sm:w-20 sm:h-20 mx-auto" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>

        <div class="text-4xl sm:text-6xl font-black text-primary-300">
          {{ data.bestTrade.symbol }}
        </div>

        <div class="text-5xl sm:text-7xl font-black text-green-400 animate-count-up">
          +{{ formatCurrency(data.bestTrade.pnl) }}
        </div>

        <div v-if="data.bestTrade.percentGain" class="text-xl sm:text-2xl text-green-300">
          +{{ data.bestTrade.percentGain.toFixed(2) }}% return
        </div>

        <div class="text-white/60 pt-4">
          {{ formatDate(data.bestTrade.date) }}
        </div>
      </div>

      <div v-else class="text-white/60">
        No trade data available
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

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
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

.animate-count-up {
  animation: count-up 0.6s ease-out;
}

.animate-pulse-slow {
  animation: pulse-slow 2s ease-in-out infinite;
}
</style>
