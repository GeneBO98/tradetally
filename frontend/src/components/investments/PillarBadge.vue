<template>
  <div
    :class="[
      'rounded-lg p-3 text-center',
      passed
        ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
        : 'bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700'
    ]"
  >
    <!-- Pass/Fail Icon -->
    <div class="flex justify-center mb-2">
      <svg
        v-if="passed"
        class="w-6 h-6 text-primary-700 dark:text-primary-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <svg
        v-else
        class="w-6 h-6 text-gray-400 dark:text-gray-500"
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
    <p :class="['text-sm font-bold mt-1', passed ? 'text-primary-700 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400']">
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
