<template>
  <div class="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900 text-white p-8">
    <div class="text-center space-y-6 animate-fade-in w-full max-w-3xl">
      <div class="text-lg sm:text-xl text-white/70 font-light">
        Your journey through {{ data.year }}
      </div>

      <!-- Monthly P&L Chart -->
      <div class="bg-white/5 rounded-xl p-4 sm:p-6">
        <div class="h-48 sm:h-64 flex items-end justify-between gap-1 sm:gap-2">
          <div
            v-for="month in data.monthlyBreakdown"
            :key="month.month"
            class="flex-1 flex flex-col items-center gap-1"
          >
            <!-- Bar -->
            <div class="w-full flex flex-col items-center justify-end h-40 sm:h-52">
              <div
                class="w-full rounded-t transition-all duration-500"
                :class="month.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'"
                :style="{ height: getBarHeight(month.pnl) + '%' }"
              />
            </div>
            <!-- Month label -->
            <div class="text-xs text-white/50">
              {{ getMonthAbbr(month.month) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Best and Worst Month -->
      <div class="flex justify-center gap-6 sm:gap-12 pt-4">
        <div v-if="bestMonth" class="text-center">
          <div class="text-sm text-white/60">Best month</div>
          <div class="text-xl sm:text-2xl font-bold text-green-400">
            {{ bestMonth.monthName }}
          </div>
          <div class="text-sm text-green-300">
            +{{ formatCurrency(bestMonth.pnl) }}
          </div>
        </div>

        <div v-if="worstMonth && worstMonth.pnl < 0" class="text-center">
          <div class="text-sm text-white/60">Worst month</div>
          <div class="text-xl sm:text-2xl font-bold text-red-400">
            {{ worstMonth.monthName }}
          </div>
          <div class="text-sm text-red-300">
            {{ formatCurrency(worstMonth.pnl) }}
          </div>
        </div>
      </div>

      <!-- Cumulative message -->
      <div class="text-white/50 pt-4">
        {{ profitableMonths }} profitable months out of {{ activeMonths }}
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

const monthAbbrs = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function getMonthAbbr(month) {
  return monthAbbrs[month - 1] || ''
}

const maxAbsPnl = computed(() => {
  if (!props.data.monthlyBreakdown) return 1
  const values = props.data.monthlyBreakdown.map(m => Math.abs(m.pnl))
  return Math.max(...values, 1)
})

function getBarHeight(pnl) {
  if (maxAbsPnl.value === 0) return 0
  // Return percentage of max, with a minimum visible height
  const percentage = (Math.abs(pnl) / maxAbsPnl.value) * 100
  return Math.max(percentage, pnl !== 0 ? 5 : 0)
}

const bestMonth = computed(() => {
  if (!props.data.monthlyBreakdown) return null
  const profitable = props.data.monthlyBreakdown.filter(m => m.pnl > 0)
  if (profitable.length === 0) return null
  return profitable.reduce((best, m) => m.pnl > best.pnl ? m : best)
})

const worstMonth = computed(() => {
  if (!props.data.monthlyBreakdown) return null
  const losses = props.data.monthlyBreakdown.filter(m => m.pnl < 0)
  if (losses.length === 0) return null
  return losses.reduce((worst, m) => m.pnl < worst.pnl ? m : worst)
})

const profitableMonths = computed(() => {
  if (!props.data.monthlyBreakdown) return 0
  return props.data.monthlyBreakdown.filter(m => m.pnl > 0).length
})

const activeMonths = computed(() => {
  if (!props.data.monthlyBreakdown) return 0
  return props.data.monthlyBreakdown.filter(m => m.trades > 0).length
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
