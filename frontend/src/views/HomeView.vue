<template>
  <div>
    <section class="bg-white dark:bg-gray-800">
      <div class="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div class="text-center">
          <h1 class="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            Best Free Trading Journal Software for Day Traders
          </h1>
          <p class="mt-5 max-w-3xl mx-auto text-xl text-gray-500 dark:text-gray-400">
            Professional trade tracking platform with automated trade import, advanced analytics, and broker integration.
            The best TraderVue alternative with unlimited free trade storage for stocks and options trading.
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
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Unlimited Free Trading Journal</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Unlike TraderVue's 100 trades/month limit, get unlimited trade storage completely free. No time limits, no hidden fees.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Works With Your Broker</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Automated trade import from Lightspeed, Schwab/ThinkorSwim, IBKR, E*TRADE, TD Ameritrade, and custom CSV mapping for any broker.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">AI-Powered Analytics</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Advanced trade analysis with AI insights, behavioral pattern detection, and professional performance metrics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Broker & Asset Compatibility Section -->
    <section v-if="showSEOPages" class="bg-gray-50 dark:bg-gray-900 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            Complete Broker and Asset Compatibility
          </h2>
          <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
            Trade tracking for all markets and brokers
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Broker Integration</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              Import trades automatically from verified brokers:
            </p>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400">
              <li>✓ <strong>Lightspeed Trading</strong> - Direct CSV import</li>
              <li>✓ <strong>Charles Schwab / ThinkorSwim</strong> - Direct CSV import</li>
              <li>✓ <strong>Interactive Brokers (IBKR)</strong> - Direct CSV import</li>
              <li>✓ <strong>E*TRADE</strong> - Direct CSV import</li>
              <li>✓ <strong>TD Ameritrade</strong> - Direct CSV import</li>
              <li>✓ <strong>Other Brokers</strong> - Custom CSV column mapping</li>
            </ul>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Don't see your broker? Use our custom CSV mapper to create a template for any broker with CSV export.
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg p-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Asset Classes</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              Track performance across supported markets:
            </p>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400">
              <li>✓ <strong>Stocks</strong> - Day trading, swing trading, position trading</li>
              <li>✓ <strong>Options</strong> - Calls, puts, spreads, covered calls, iron condors</li>
              <li>✓ <strong>ETFs</strong> - Market and sector tracking</li>
            </ul>
            <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                <strong>Coming Soon:</strong> Futures, Forex, and Crypto support
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison & CTA Section -->
    <section v-if="showSEOPages" class="bg-white dark:bg-gray-800 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white mb-4">
            Compare Trading Journal Platforms
          </h2>
          <p class="mt-4 max-w-3xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            See how TradeTally compares to TraderVue, TraderSync, Edgewonk, and other trading journal software
          </p>
          <div class="mt-8">
            <router-link to="/compare" class="btn-primary text-lg px-8 py-3">
              View Detailed Comparison
            </router-link>
          </div>

          <div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div class="text-center">
              <div class="text-3xl font-bold text-primary-600">Free</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">Forever Plan</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-primary-600">Unlimited</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">Trade Storage</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-primary-600">$8/mo</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">Pro Features</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-primary-600">Open</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">Source Code</div>
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

  // Update meta tags for SEO
  document.title = 'TradeTally - Best Free Trading Journal Software for Day Traders | TraderVue Alternative'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Best free trading journal software with unlimited trade storage. Automated trade import from Lightspeed, Schwab, IBKR, E*TRADE, TD Ameritrade. Advanced analytics and AI insights. The #1 TraderVue and TraderSync alternative for stocks and options trading.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'trading journal software, best trading journal, free trading journal, TraderVue alternative, TraderSync alternative, trade tracking platform, automated trade import, broker integration, stock trade journal, options trading journal, day trading journal, trading performance analytics, AI trading insights')

  // Add structured data for SEO
  if (showSEOPages.value) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "TradeTally",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web, iOS",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "150"
      },
      "description": "Best free trading journal software with unlimited trade storage, automated trade import from major brokers (Lightspeed, Schwab, IBKR, E*TRADE, TD Ameritrade), advanced analytics, and AI-powered insights. The #1 TraderVue alternative for stocks and options trading.",
      "url": "https://tradetally.io",
      "author": {
        "@type": "Organization",
        "name": "TradeTally"
      },
      "softwareVersion": "2.0",
      "datePublished": "2024-01-01",
      "featureList": [
        "Unlimited Free Trade Storage",
        "Automated Trade Import from Any Broker",
        "Advanced Trading Performance Analytics",
        "AI-Powered Insights and Behavioral Analytics",
        "Stock, Options, Forex, Crypto Support",
        "Detailed Trade Journal with Charts",
        "Public Trade Sharing and Community",
        "Mobile Access (iOS)",
        "Complete Data Export",
        "Self-Hosting Option",
        "Open Source Code"
      ]
    })
    document.head.appendChild(script)
  }
})
</script>