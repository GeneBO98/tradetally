<template>
  <div>
    <section class="bg-white dark:bg-gray-800">
      <div class="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div class="text-center">
          <h1 class="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            Track, Analyze, and Improve Your Trading
          </h1>
          <p class="mt-5 max-w-xl mx-auto text-xl text-gray-500 dark:text-gray-400">
            Professional trade journaling and analytics platform to help you become a better trader.
          </p>
          <div class="mt-8 flex justify-center space-x-4">
            <router-link 
              v-if="showRegisterButton" 
              to="/register" 
              class="btn-primary text-lg px-8 py-3"
            >
              Get Started Free
            </router-link>
            <router-link to="/public" class="btn-secondary text-lg px-8 py-3">
              View Public Trades
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-gray-50 dark:bg-gray-900 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div class="text-center">
            <div class="flex justify-center">
              <ChartBarIcon class="h-12 w-12 text-primary-600" />
            </div>
            <h2 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Advanced Analytics</h2>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              Visualize your trading performance with comprehensive charts and statistics.
            </p>
          </div>
          
          <div class="text-center">
            <div class="flex justify-center">
              <DocumentTextIcon class="h-12 w-12 text-primary-600" />
            </div>
            <h2 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Trade Journal</h2>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              Keep detailed records of all your trades with notes, tags, and attachments.
            </p>
          </div>
          
          <div class="text-center">
            <div class="flex justify-center">
              <ArrowUpTrayIcon class="h-12 w-12 text-primary-600" />
            </div>
            <h2 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Easy Import</h2>
            <p class="mt-2 text-gray-500 dark:text-gray-400">
              Import trades from major brokers with CSV support for seamless integration.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ChartBarIcon, DocumentTextIcon, ArrowUpTrayIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const showRegisterButton = ref(true)

onMounted(async () => {
  try {
    const config = await authStore.getRegistrationConfig()
    showRegisterButton.value = config.allowRegistration
  } catch (error) {
    console.error('Failed to fetch registration config:', error)
    // Default to showing the button if we can't determine the config
    showRegisterButton.value = true
  }
})
</script>