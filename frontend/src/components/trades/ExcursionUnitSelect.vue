<template>
  <label class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
    MAE/MFE units
    <select v-model="excursion_display_unit" class="input py-1.5 text-xs w-auto" title="R requires a stop loss defining positive risk. Points measure price movement per share or contract.">
      <option value="auto">Default</option>
      <option value="dollars">Currency</option>
      <option value="points">Points</option>
      <option value="r">R multiples</option>
    </select>
  </label>
</template>

<script setup>
import { useExcursionDisplay } from '@/composables/useExcursionDisplay'
const { excursion_display_unit } = useExcursionDisplay()
</script>
