<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white p-8">
    <div class="text-center space-y-8 animate-fade-in max-w-2xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your trading patterns
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <!-- Most Traded Day -->
        <div v-if="data.patterns?.mostTradedDay" class="bg-white/10 rounded-xl p-6 space-y-2">
          <div class="text-white/60 text-sm">Favorite trading day</div>
          <div class="text-3xl sm:text-4xl font-bold text-primary-300">
            {{ data.patterns.mostTradedDay.day }}
          </div>
          <div class="text-white/50 text-sm">
            {{ data.patterns.mostTradedDay.count }} trades
          </div>
        </div>

        <!-- Most Active Hour -->
        <div v-if="data.patterns?.mostTradedHour" class="bg-white/10 rounded-xl p-6 space-y-2">
          <div class="text-white/60 text-sm">Most active hour</div>
          <div class="text-3xl sm:text-4xl font-bold text-primary-400">
            {{ formatHour(data.patterns.mostTradedHour.hour) }}
          </div>
          <div class="text-white/50 text-sm">
            {{ data.patterns.mostTradedHour.count }} trades
          </div>
        </div>

        <!-- Favorite Strategy -->
        <div v-if="data.patterns?.favoriteStrategy" class="bg-white/10 rounded-xl p-6 space-y-2">
          <div class="text-white/60 text-sm">Go-to strategy</div>
          <div class="text-2xl sm:text-3xl font-bold text-primary-300 truncate">
            {{ data.patterns.favoriteStrategy.name }}
          </div>
          <div class="text-white/50 text-sm">
            {{ data.patterns.favoriteStrategy.count }} trades
            <span :class="data.patterns.favoriteStrategy.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'">
              ({{ data.patterns.favoriteStrategy.totalPnL >= 0 ? '+' : '' }}{{ formatCurrency(data.patterns.favoriteStrategy.totalPnL) }})
            </span>
          </div>
        </div>

        <!-- Average Hold Time -->
        <div v-if="data.patterns?.avgHoldTimeHours" class="bg-white/10 rounded-xl p-6 space-y-2">
          <div class="text-white/60 text-sm">Average hold time</div>
          <div class="text-3xl sm:text-4xl font-bold text-primary-400">
            {{ formatHoldTime(data.patterns.avgHoldTimeHours) }}
          </div>
          <div class="text-white/50 text-sm">
            per trade
          </div>
        </div>
      </div>

      <div v-if="!hasPatternData" class="text-white/50">
        Not enough data to show patterns
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

const hasPatternData = computed(() => {
  const p = props.data.patterns
  return p?.mostTradedDay || p?.mostTradedHour || p?.favoriteStrategy || p?.avgHoldTimeHours
})

function formatHour(hour) {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}

function formatHoldTime(hours) {
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return `${minutes}m`
  }
  if (hours < 24) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }
  const days = Math.round(hours / 24)
  return `${days}d`
}

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
