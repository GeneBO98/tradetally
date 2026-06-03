<template>
  <section class="mt-12">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
      {{ heading }}
    </h2>
    <p v-if="intro" class="text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
      {{ intro }}
    </p>

    <div v-if="formula" class="mb-6 p-5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
      <div class="text-xs uppercase tracking-wide font-semibold text-primary-700 dark:text-primary-300 mb-1">Formula</div>
      <div class="text-lg text-gray-900 dark:text-white font-mono">{{ formula }}</div>
    </div>

    <ol class="space-y-4">
      <li
        v-for="(step, idx) in steps"
        :key="idx"
        class="flex gap-4 p-5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800"
      >
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm">
          {{ idx + 1 }}
        </div>
        <div class="flex-1">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">{{ step.name }}</h3>
          <p class="mt-1 text-gray-600 dark:text-gray-300 leading-relaxed">{{ step.text }}</p>
        </div>
      </li>
    </ol>

    <div v-if="example" class="mt-6 p-5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
      <div class="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-2">Worked Example</div>
      <div class="text-gray-700 dark:text-gray-300 leading-relaxed" v-html="example"></div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  heading: { type: String, default: 'How to Calculate' },
  intro: { type: String, default: '' },
  formula: { type: String, default: '' },
  steps: { type: Array, required: true },
  example: { type: String, default: '' }
})
</script>
