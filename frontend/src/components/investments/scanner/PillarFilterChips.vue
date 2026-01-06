<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Filter by Pillars (select which must pass):
      </label>
      <button
        v-if="selectedPillars.length > 0"
        @click="clearFilters"
        class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
      >
        Clear filters
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="pillar in 8"
        :key="pillar"
        @click="togglePillar(pillar)"
        :class="[
          'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
          selectedPillars.includes(pillar)
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        ]"
      >
        <span class="mr-1.5 text-xs opacity-75">{{ pillar }}.</span>
        {{ pillarShortNames[pillar] }}
        <svg
          v-if="selectedPillars.includes(pillar)"
          class="ml-1.5 w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    </div>

    <!-- Selected summary -->
    <p v-if="selectedPillars.length > 0" class="text-xs text-gray-500 dark:text-gray-400">
      Showing stocks where {{ selectedPillars.length === 1 ? 'pillar' : 'pillars' }}
      {{ formatSelectedPillars() }} must pass
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useScannerStore } from '@/stores/scanner'

const scannerStore = useScannerStore()

const selectedPillars = computed(() => scannerStore.selectedPillars)
const pillarShortNames = scannerStore.pillarShortNames

function togglePillar(pillar) {
  scannerStore.togglePillar(pillar)
}

function clearFilters() {
  scannerStore.clearFilters()
}

function formatSelectedPillars() {
  const sorted = [...selectedPillars.value].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  if (sorted.length === 2) return `${sorted[0]} and ${sorted[1]}`
  const last = sorted.pop()
  return `${sorted.join(', ')}, and ${last}`
}
</script>
