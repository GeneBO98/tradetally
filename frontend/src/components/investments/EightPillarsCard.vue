<template>
  <div class="card overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div class="flex items-center">
        <img v-if="analysis.logo" :src="analysis.logo" :alt="analysis.symbol" class="w-10 h-10 rounded-lg mr-3" />
        <div>
          <h3 class="heading-card">{{ analysis.symbol }}</h3>
          <p v-if="analysis.companyName" class="text-sm text-gray-500 dark:text-gray-400">{{ analysis.companyName }}</p>
        </div>
      </div>
      <div class="text-right">
        <p class="stat-value text-gray-900 dark:text-white">{{ analysis.pillarsPassed }}/8</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">Pillars Passed</p>
      </div>
    </div>

    <!-- Pillars Grid -->
    <div class="p-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <!-- Pillar 1 -->
        <PillarBadge
          :passed="analysis.pillars.pillar1.passed"
          :name="analysis.pillars.pillar1.name"
          :value="formatPillarValue(analysis.pillars.pillar1)"
        />

        <!-- Pillar 2 -->
        <PillarBadge
          :passed="analysis.pillars.pillar2.passed"
          :name="analysis.pillars.pillar2.name"
          :value="analysis.pillars.pillar2.displayValue || formatPillarValue(analysis.pillars.pillar2)"
        />

        <!-- Pillar 3 -->
        <PillarBadge
          :passed="analysis.pillars.pillar3.passed"
          :name="analysis.pillars.pillar3.name"
          :value="analysis.pillars.pillar3.displayValue || formatPillarValue(analysis.pillars.pillar3)"
        />

        <!-- Pillar 4 -->
        <PillarBadge
          :passed="analysis.pillars.pillar4.passed"
          :name="analysis.pillars.pillar4.name"
          :value="analysis.pillars.pillar4.displayValue || (analysis.pillars.pillar4.passed ? 'Growing' : 'Declining')"
        />

        <!-- Pillar 5 -->
        <PillarBadge
          :passed="analysis.pillars.pillar5.passed"
          :name="analysis.pillars.pillar5.name"
          :value="analysis.pillars.pillar5.displayValue || (analysis.pillars.pillar5.passed ? 'Growing' : 'Declining')"
        />

        <!-- Pillar 6 -->
        <PillarBadge
          :passed="analysis.pillars.pillar6.passed"
          :name="analysis.pillars.pillar6.name"
          :value="analysis.pillars.pillar6.displayValue || formatPillarValue(analysis.pillars.pillar6)"
        />

        <!-- Pillar 7 -->
        <PillarBadge
          :passed="analysis.pillars.pillar7.passed"
          :name="analysis.pillars.pillar7.name"
          :value="analysis.pillars.pillar7.displayValue || formatPillarValue(analysis.pillars.pillar7)"
        />

        <!-- Pillar 8 -->
        <PillarBadge
          :passed="analysis.pillars.pillar8.passed"
          :name="analysis.pillars.pillar8.name"
          :value="formatPillarValue(analysis.pillars.pillar8)"
        />
      </div>
    </div>

    <!-- Actions -->
    <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {{ analysis.currentPrice ? formatCurrency(analysis.currentPrice, { currency: 'USD' }) : '' }}
        {{ analysis.industry ? ` | ${analysis.industry}` : '' }}
      </span>
      <div class="flex items-center space-x-3">
        <button
          @click="$emit('view-details', analysis)"
          class="btn-link"
        >
          View Details
        </button>
        <button
          @click="$emit('add-to-watchlist', analysis)"
          class="btn-ghost btn-sm"
        >
          Add to Watchlist
        </button>
        <button
          @click="$emit('add-to-holdings', analysis)"
          class="btn-link"
        >
          Add to Holdings
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import PillarBadge from './PillarBadge.vue'
import { formatDecimal } from '@/utils/formatters'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const { formatCurrency } = useCurrencyFormatter()

defineProps({
  analysis: {
    type: Object,
    required: true
  }
})

defineEmits(['view-details', 'add-to-holdings', 'add-to-watchlist'])

function formatPillarValue(pillar) {
  // Always return a number - use 0 as fallback if value is null/undefined
  const value = pillar.value !== null && pillar.value !== undefined 
    ? pillar.value 
    : 0
  
  if (typeof value === 'number') {
    return formatDecimal(value, { digits: 2 })
  }
  return String(value)
}
</script>
