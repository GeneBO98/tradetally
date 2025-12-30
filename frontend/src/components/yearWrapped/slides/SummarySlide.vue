<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-primary-950 to-gray-900 text-white p-8">
    <div class="text-center space-y-8 animate-fade-in max-w-2xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your {{ data.year }} at a glance
      </div>

      <!-- Summary Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black" :class="data.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ formatCurrencyShort(data.totalPnL) }}
          </div>
          <div class="text-xs sm:text-sm text-white/60">Total P&L</div>
        </div>

        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.totalTrades }}
          </div>
          <div class="text-xs sm:text-sm text-white/60">Trades</div>
        </div>

        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black text-primary-400">
            {{ Math.round(data.winRate) }}%
          </div>
          <div class="text-xs sm:text-sm text-white/60">Win Rate</div>
        </div>

        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.topSymbol?.symbol || '-' }}
          </div>
          <div class="text-xs sm:text-sm text-white/60">Top Symbol</div>
        </div>

        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black text-primary-400">
            {{ data.streaks?.longestTradingStreak || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-white/60">Best Streak</div>
        </div>

        <div class="bg-white/10 rounded-xl p-4 space-y-1">
          <div class="text-3xl sm:text-4xl font-black text-primary-300">
            {{ data.uniqueSymbolsTraded }}
          </div>
          <div class="text-xs sm:text-sm text-white/60">Symbols</div>
        </div>
      </div>

      <!-- Closing Message -->
      <div class="pt-6 space-y-4">
        <div class="text-xl sm:text-2xl font-semibold">
          {{ closingMessage }}
        </div>
        <div class="text-white/60">
          Here's to an even better {{ data.year + 1 }}!
        </div>
      </div>

      <!-- TradeTally branding -->
      <div class="pt-8 text-white/40 text-sm">
        Generated with TradeTally
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

function formatCurrencyShort(value) {
  const absValue = Math.abs(value)
  const sign = value >= 0 ? '+' : '-'

  if (absValue >= 1000000) {
    return sign + '$' + (absValue / 1000000).toFixed(1) + 'M'
  }
  if (absValue >= 1000) {
    return sign + '$' + (absValue / 1000).toFixed(1) + 'K'
  }
  return sign + '$' + absValue.toFixed(0)
}

const closingMessage = computed(() => {
  const pnl = props.data.totalPnL
  const winRate = props.data.winRate
  const trades = props.data.totalTrades

  if (pnl > 10000 && winRate >= 55) {
    return 'What an incredible year!'
  }
  if (pnl > 0 && winRate >= 50) {
    return 'A profitable year - well done!'
  }
  if (pnl > 0) {
    return 'You finished in the green!'
  }
  if (trades >= 100) {
    return 'A year of experience gained!'
  }
  return 'Every trade is a lesson learned!'
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

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}
</style>
