<template>
  <section class="bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
    <div class="content-wrapper py-10">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">
        Related Free Trader Tools
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <router-link
          v-for="tool in tools"
          :key="tool.slug"
          :to="`/tools/${tool.slug}`"
          class="group block p-5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
        >
          <h3 class="text-base font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
            {{ tool.title }}
          </h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ tool.description }}
          </p>
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  tools: { type: Array, required: true }
})
</script>
