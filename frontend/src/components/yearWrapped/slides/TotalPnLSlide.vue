<template>
  <div
    class="h-full flex flex-col items-center justify-center text-white p-8"
    :class="[
      data.totalPnL >= 0
        ? 'bg-gradient-to-br from-gray-900 via-green-950 to-gray-900'
        : 'bg-gradient-to-br from-gray-900 via-red-950 to-gray-900'
    ]"
  >
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your total P&L for {{ data.year }}
      </div>

      <div
        class="text-6xl sm:text-8xl font-black animate-count-up"
        :class="data.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'"
      >
        {{ data.totalPnL >= 0 ? '+' : '' }}{{ formatCurrency(data.totalPnL) }}
      </div>

      <div class="text-xl sm:text-2xl text-white/70">
        across {{ formatNumber(data.totalTrades) }} trades
      </div>

      <div class="pt-6 space-y-2">
        <div class="text-base sm:text-lg text-white/60">
          Average per trade:
          <span :class="data.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'" class="font-semibold">
            {{ data.avgPnL >= 0 ? '+' : '' }}{{ formatCurrency(data.avgPnL) }}
          </span>
        </div>
      </div>

      <div v-if="data.totalPnL >= 0" class="pt-8 text-4xl sm:text-5xl text-green-400">
        <!-- Celebration icons -->
        <span class="inline-block animate-bounce-delayed-1">[+]</span>
        <span class="inline-block animate-bounce-delayed-2 ml-2">[+]</span>
        <span class="inline-block animate-bounce-delayed-3 ml-2">[+]</span>
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

@keyframes bounce-custom {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}

.animate-count-up {
  animation: count-up 0.6s ease-out;
}

.animate-bounce-delayed-1 {
  animation: bounce-custom 1s ease-in-out infinite;
  animation-delay: 0s;
}

.animate-bounce-delayed-2 {
  animation: bounce-custom 1s ease-in-out infinite;
  animation-delay: 0.2s;
}

.animate-bounce-delayed-3 {
  animation: bounce-custom 1s ease-in-out infinite;
  animation-delay: 0.4s;
}
</style>
