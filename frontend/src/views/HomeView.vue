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

    <section v-if="showSEOPages" class="bg-white dark:bg-gray-800 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            The Modern Alternative to TraderVue
          </h2>
          <p class="mt-4 max-w-3xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Looking for a TraderVue alternative? TradeTally offers all the trade journaling features you need with a modern interface, 
            advanced analytics, and competitive pricing. Switch from TraderVue to TradeTally and experience the next generation of trade tracking.
          </p>
          <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Free Forever Plan</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Unlike TraderVue's limited free tier, enjoy comprehensive features without cost constraints.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Modern Tech Stack</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Built with Vue 3 and modern web technologies for a faster, more responsive experience.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Self-Hosted Option</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Full control over your data with our open-source self-hosted deployment option.
              </p>
            </div>
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
import { useRegistrationMode } from '@/composables/useRegistrationMode'

const authStore = useAuthStore()
const { showSEOPages } = useRegistrationMode()
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
  
  // Add structured data for SEO
  if (showSEOPages.value) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "TradeTally",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "description": "Professional trading journal and analytics platform. Track trades, analyze performance, and improve your trading with comprehensive charts, multi-broker support, and real-time insights.",
      "url": "https://tradetally.io",
      "author": {
        "@type": "Organization",
        "name": "TradeTally"
      },
      "softwareVersion": "2.0",
      "datePublished": "2024-01-01",
      "featureList": [
        "Trade Import from Any Broker",
        "Advanced Analytics Dashboard",
        "Detailed Trade Journal",
        "Public Trade Sharing",
        "Calendar View",
        "Unlimited Data Export",
        "Self-Hosting Option"
      ]
    })
    document.head.appendChild(script)
  }
})
</script>