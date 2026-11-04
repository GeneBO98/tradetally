<template>
  <!-- One rendering of a 1-10 confidence value everywhere: ten dots plus the number. -->
  <div class="inline-flex items-center gap-2" :title="`Confidence ${value}/10`">
    <div class="flex gap-1" aria-hidden="true">
      <div v-for="i in 10" :key="i" class="dot" :class="i <= value ? 'dot-on' : ''"></div>
    </div>
    <span class="text-sm text-gray-900 dark:text-white text-mono-num" :class="compact ? '' : 'font-medium'">{{ value }}/10</span>
  </div>
</template>

<script setup>
defineProps({
  value: { type: Number, required: true },
  compact: { type: Boolean, default: false }
})
</script>
