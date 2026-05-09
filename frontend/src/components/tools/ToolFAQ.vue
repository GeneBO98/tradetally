<template>
  <section class="mt-12">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
      {{ heading }}
    </h2>
    <div class="space-y-3">
      <details
        v-for="(faq, idx) in faqs"
        :key="idx"
        class="group bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800"
      >
        <summary class="flex items-center justify-between p-5 cursor-pointer list-none">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white pr-6">
            {{ faq.question }}
          </h3>
          <svg
            class="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div class="px-5 pb-5 text-gray-600 dark:text-gray-300 leading-relaxed" v-html="faq.answer"></div>
      </details>
    </div>
  </section>
</template>

<script setup>
defineProps({
  heading: { type: String, default: 'Frequently Asked Questions' },
  faqs: { type: Array, required: true }
})
</script>

<style scoped>
summary::-webkit-details-marker { display: none; }
</style>
