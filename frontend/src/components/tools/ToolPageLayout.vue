<template>
  <div class="bg-gray-50 dark:bg-gray-950 min-h-screen">
    <!-- Hero -->
    <section class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="content-wrapper py-12 sm:py-16">
        <nav class="text-sm text-gray-500 dark:text-gray-400 mb-4" aria-label="Breadcrumb">
          <router-link to="/tools" class="hover:text-primary-600 dark:hover:text-primary-400">Free Trader Tools</router-link>
          <span class="mx-2">/</span>
          <span class="text-gray-700 dark:text-gray-300">{{ breadcrumb }}</span>
        </nav>
        <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-3xl">
          {{ subtitle }}
        </p>
      </div>
    </section>

    <!-- Body slot -->
    <div class="content-wrapper py-10 sm:py-12">
      <slot />
    </div>

    <!-- CTA -->
    <section class="bg-primary-600 dark:bg-primary-700">
      <div class="content-wrapper py-12 text-center">
        <h2 class="text-2xl sm:text-3xl font-bold text-white">
          Stop Calculating. Start Tracking.
        </h2>
        <p class="mt-3 text-primary-100 max-w-2xl mx-auto">
          TradeTally calculates {{ ctaMetric || 'every metric like this' }} automatically across every trade you take. Free trading journal, broker auto-sync, real performance analytics.
        </p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <router-link
            to="/register"
            class="inline-flex items-center px-6 py-3 rounded-lg bg-white text-primary-700 font-semibold shadow-sm hover:bg-gray-50 transition-colors"
          >
            Get Started Free
          </router-link>
          <router-link
            to="/features"
            class="inline-flex items-center px-6 py-3 rounded-lg bg-primary-700 dark:bg-primary-800 text-white font-semibold border border-primary-400 hover:bg-primary-800 dark:hover:bg-primary-900 transition-colors"
          >
            See Features
          </router-link>
        </div>
      </div>
    </section>

    <!-- Related Tools -->
    <RelatedTools v-if="related && related.length" :tools="related" />
  </div>
</template>

<script setup>
import RelatedTools from './RelatedTools.vue'

defineProps({
  title: { type: String, required: true },
  breadcrumb: { type: String, required: true },
  subtitle: { type: String, default: '' },
  ctaMetric: { type: String, default: '' },
  related: { type: Array, default: () => [] }
})
</script>
