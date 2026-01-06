<template>
  <div
    :class="[
      'rounded-lg p-3 text-center',
      passed
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
    ]"
  >
    <!-- Pass/Fail Icon -->
    <div class="flex justify-center mb-2">
      <svg
        v-if="passed"
        class="w-6 h-6 text-green-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <svg
        v-else
        class="w-6 h-6 text-red-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </div>

    <!-- Name -->
    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{{ name }}</p>

    <!-- Value -->
    <p :class="['text-sm font-bold mt-1', passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400']">
      {{ value }}
    </p>
  </div>
</template>

<script setup>
defineProps({
  passed: {
    type: Boolean,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    default: 'N/A'
  }
})
</script>
