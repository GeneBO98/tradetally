<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in">
      <div class="text-lg sm:text-xl text-white/70 font-light tracking-wider uppercase">
        Your
      </div>

      <div class="relative">
        <div class="text-7xl sm:text-9xl font-black bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 bg-clip-text text-transparent animate-glow">
          {{ data.year }}
        </div>
      </div>

      <div class="text-2xl sm:text-4xl font-bold tracking-tight">
        Trading Wrapped
      </div>

      <div class="text-base sm:text-lg text-white/60 max-w-md mx-auto">
        Let's take a look at your trading journey this year
      </div>

      <div class="pt-8 flex items-center justify-center gap-2 text-white/40">
        <span>Swipe or use arrows to continue</span>
        <svg class="w-5 h-5 animate-bounce-right" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
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

@keyframes glow {
  0%, 100% {
    filter: drop-shadow(0 0 20px rgba(240, 129, 42, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 40px rgba(240, 129, 42, 0.7));
  }
}

@keyframes bounce-right {
  0%, 100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(5px);
  }
}

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}

.animate-glow {
  animation: glow 2s ease-in-out infinite;
}

.animate-bounce-right {
  animation: bounce-right 1s ease-in-out infinite;
}
</style>
