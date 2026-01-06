<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-8 animate-fade-in max-w-2xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Year over year
      </div>

      <div v-if="data.comparison?.hasPreviousYear" class="space-y-8">
        <!-- P&L Comparison -->
        <div class="bg-white/10 rounded-xl p-6 space-y-4">
          <div class="text-white/60 text-sm">Total P&L</div>

          <div class="flex items-center justify-center gap-4">
            <div class="text-center">
              <div class="text-sm text-white/50">{{ data.year - 1 }}</div>
              <div class="text-2xl sm:text-3xl font-bold" :class="data.comparison.previousYearPnL >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ formatCurrency(data.comparison.previousYearPnL) }}
              </div>
            </div>

            <div class="text-2xl text-white/30">-></div>

            <div class="text-center">
              <div class="text-sm text-white/50">{{ data.year }}</div>
              <div class="text-2xl sm:text-3xl font-bold" :class="data.comparison.currentYearPnL >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ formatCurrency(data.comparison.currentYearPnL) }}
              </div>
            </div>
          </div>

          <div v-if="data.comparison.pnlGrowthPercent !== null" class="pt-2">
            <span
              class="text-xl sm:text-2xl font-bold"
              :class="data.comparison.pnlGrowthPercent >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ data.comparison.pnlGrowthPercent >= 0 ? '+' : '' }}{{ data.comparison.pnlGrowthPercent.toFixed(1) }}%
            </span>
            <span class="text-white/60 ml-2">{{ data.comparison.pnlGrowthPercent >= 0 ? 'growth' : 'change' }}</span>
          </div>
        </div>

        <!-- Trade Count Comparison -->
        <div class="bg-white/10 rounded-xl p-6 space-y-4">
          <div class="text-white/60 text-sm">Trade Volume</div>

          <div class="flex items-center justify-center gap-4">
            <div class="text-center">
              <div class="text-sm text-white/50">{{ data.year - 1 }}</div>
              <div class="text-2xl sm:text-3xl font-bold text-primary-300">
                {{ data.comparison.previousYearTrades }}
              </div>
            </div>

            <div class="text-2xl text-white/30">-></div>

            <div class="text-center">
              <div class="text-sm text-white/50">{{ data.year }}</div>
              <div class="text-2xl sm:text-3xl font-bold text-primary-300">
                {{ data.comparison.currentYearTrades }}
              </div>
            </div>
          </div>

          <div v-if="data.comparison.tradeGrowthPercent !== null" class="pt-2">
            <span
              class="text-xl sm:text-2xl font-bold"
              :class="data.comparison.tradeGrowthPercent >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ data.comparison.tradeGrowthPercent >= 0 ? '+' : '' }}{{ data.comparison.tradeGrowthPercent.toFixed(1) }}%
            </span>
            <span class="text-white/60 ml-2">{{ data.comparison.tradeGrowthPercent >= 0 ? 'more active' : 'less active' }}</span>
          </div>
        </div>

        <!-- Win Rate Change -->
        <div v-if="data.comparison.winRateChange !== undefined" class="text-center pt-4">
          <span class="text-white/60">Win rate changed by </span>
          <span
            class="text-xl font-bold"
            :class="data.comparison.winRateChange >= 0 ? 'text-green-400' : 'text-red-400'"
          >
            {{ data.comparison.winRateChange >= 0 ? '+' : '' }}{{ data.comparison.winRateChange.toFixed(1) }}%
          </span>
        </div>
      </div>

      <div v-else class="text-white/60">
        No previous year data to compare
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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

.animate-fade-in {
  animation: fade-in 0.8s ease-out;
}
</style>
