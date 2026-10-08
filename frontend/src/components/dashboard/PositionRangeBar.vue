<template>
  <div class="min-w-0">
    <div class="relative h-3.5">
      <div class="absolute inset-x-0 top-[5px] h-1 rounded-full bg-gray-200 dark:bg-gray-700"></div>
      <template v-if="showEnds">
        <div class="absolute left-0 top-0.5 h-2.5 w-0.5 bg-red-600 dark:bg-red-400"></div>
        <div class="absolute right-0 top-0.5 h-2.5 w-0.5 bg-green-600 dark:bg-green-400"></div>
      </template>
      <div
        class="absolute top-[5px] h-1 rounded-full"
        :class="inProfit ? 'bg-green-400 dark:bg-green-500' : 'bg-red-400 dark:bg-red-500'"
        :style="{ left: `${Math.min(entryPct, currentPct)}%`, width: `${Math.abs(currentPct - entryPct)}%` }"
      ></div>
      <div
        class="absolute top-0.5 h-2.5 w-2.5 -ml-[5px] rounded-full border-2 border-gray-500 bg-white dark:border-gray-400 dark:bg-gray-800"
        :style="{ left: `${entryPct}%` }"
        title="Avg entry"
      ></div>
      <div
        class="absolute top-px h-3 w-3 -ml-1.5 rounded-full bg-gray-900 ring-2 ring-white dark:bg-white dark:ring-gray-800"
        :style="{ left: `${currentPct}%` }"
        title="Current price"
      ></div>
    </div>
    <div class="mt-1 flex justify-between gap-2 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
      <span>{{ startLabel }}</span>
      <span class="text-gray-700 dark:text-gray-300">{{ caption }}</span>
      <span>{{ endLabel }}</span>
    </div>
    <div v-if="startNote || endNote" class="flex justify-between gap-2 text-[11px] leading-4">
      <span class="text-red-600 dark:text-red-400" title="Change from here if the stop is hit">{{ startNote }}</span>
      <span class="text-green-600 dark:text-green-400" title="Change from here if the target is reached">{{ endNote }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  entryPct: { type: Number, required: true },
  currentPct: { type: Number, required: true },
  inProfit: { type: Boolean, default: true },
  startLabel: { type: String, default: '' },
  endLabel: { type: String, default: '' },
  caption: { type: String, default: '' },
  startNote: { type: String, default: '' },
  endNote: { type: String, default: '' },
  showEnds: { type: Boolean, default: false }
})
</script>
