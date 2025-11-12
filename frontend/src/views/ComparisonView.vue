<template>
  <div class="max-w-7xl mx-auto py-8 px-4">
    <!-- Hero Section with SEO Keywords -->
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        Best Trading Journal Software Comparison 2025
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 max-w-4xl mx-auto">
        Compare TradeTally with TraderVue, TraderSync, Edgewonk, and other leading trading journal platforms.
        Find the best trading journal for day traders with automated trade import, advanced analytics, and broker integration.
      </p>
    </div>

    <!-- Platform Selection Tabs -->
    <div class="mb-8">
      <div class="flex flex-wrap gap-2 justify-center">
        <button
          v-for="platform in platforms"
          :key="platform.id"
          @click="togglePlatform(platform.id)"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-all',
            selectedPlatforms.includes(platform.id)
              ? 'bg-primary-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
        >
          {{ platform.name }}
        </button>
      </div>
      <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
        Select platforms to compare (2-4 recommended for best viewing)
      </p>
    </div>

    <!-- Comparison Table -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-x-auto mb-12">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-900">
            <th class="px-4 py-4 text-left text-sm font-medium text-gray-900 dark:text-gray-200 sticky left-0 bg-gray-50 dark:bg-gray-900 z-10">
              Feature
            </th>
            <th
              v-for="platform in visiblePlatforms"
              :key="platform.id"
              class="px-4 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-200 min-w-[150px]"
            >
              {{ platform.name }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <!-- Pricing -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Pricing & Plans
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Free Plan Trade Limit</td>
            <td v-for="platform in visiblePlatforms" :key="`free-${platform.id}`" class="px-4 py-4 text-center text-sm">
              <span :class="platform.features.freeTrades === 'Unlimited' ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-400'">
                {{ platform.features.freeTrades }}
              </span>
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Monthly Price</td>
            <td v-for="platform in visiblePlatforms" :key="`price-${platform.id}`" class="px-4 py-4 text-center text-sm">
              <span :class="getPriceClass(platform.features.price)">
                {{ platform.features.price }}
              </span>
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Annual Discount</td>
            <td v-for="platform in visiblePlatforms" :key="`annual-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.annualDiscount }}
            </td>
          </tr>

          <!-- Trade Import & Broker Support -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Automated Trade Import & Broker Integration
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">CSV Import</td>
            <td v-for="platform in visiblePlatforms" :key="`csv-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.csvImport)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.csvImport)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Broker Integrations</td>
            <td v-for="platform in visiblePlatforms" :key="`brokers-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.brokerIntegrations }}
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">API Integration</td>
            <td v-for="platform in visiblePlatforms" :key="`api-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.apiIntegration)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.apiIntegration)" />
            </td>
          </tr>

          <!-- Asset Classes -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Supported Asset Classes
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Stocks</td>
            <td v-for="platform in visiblePlatforms" :key="`stocks-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.stocks)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.stocks)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Options Trading</td>
            <td v-for="platform in visiblePlatforms" :key="`options-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.options)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.options)" />
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Forex</td>
            <td v-for="platform in visiblePlatforms" :key="`forex-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.forex)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.forex)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Crypto</td>
            <td v-for="platform in visiblePlatforms" :key="`crypto-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.crypto)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.crypto)" />
            </td>
          </tr>

          <!-- Performance Analytics -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Advanced Analytics & Reporting
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Basic Analytics (P&L, Win Rate)</td>
            <td v-for="platform in visiblePlatforms" :key="`basic-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.basicAnalytics)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.basicAnalytics)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Advanced Metrics (Sharpe, SQN, Kelly)</td>
            <td v-for="platform in visiblePlatforms" :key="`advanced-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.advancedMetrics }}
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Trade Chart Visualization</td>
            <td v-for="platform in visiblePlatforms" :key="`charts-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.charting)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.charting)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">AI-Powered Insights</td>
            <td v-for="platform in visiblePlatforms" :key="`ai-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.aiInsights)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.aiInsights)" />
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Behavioral Analytics</td>
            <td v-for="platform in visiblePlatforms" :key="`behavioral-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.behavioral)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.behavioral)" />
            </td>
          </tr>

          <!-- Features -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Features & Functionality
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Trade Journal & Notes</td>
            <td v-for="platform in visiblePlatforms" :key="`journal-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.journal)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.journal)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Screenshot/Image Upload</td>
            <td v-for="platform in visiblePlatforms" :key="`images-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.images)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.images)" />
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Public Trade Sharing</td>
            <td v-for="platform in visiblePlatforms" :key="`sharing-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.sharing)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.sharing)" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Watchlists & Price Alerts</td>
            <td v-for="platform in visiblePlatforms" :key="`alerts-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.alerts }}
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Mobile App</td>
            <td v-for="platform in visiblePlatforms" :key="`mobile-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.mobile }}
            </td>
          </tr>

          <!-- Data & Privacy -->
          <tr class="bg-blue-50 dark:bg-blue-900/20">
            <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-blue-50 dark:bg-blue-900/20 z-10" colspan="100">
              Data Control & Privacy
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Data Export</td>
            <td v-for="platform in visiblePlatforms" :key="`export-${platform.id}`" class="px-4 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {{ platform.features.dataExport }}
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900/50 z-10">Self-Hosted Option</td>
            <td v-for="platform in visiblePlatforms" :key="`selfhost-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.selfHosted)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.selfHosted)" />
            </td>
          </tr>

          <tr>
            <td class="px-4 py-4 text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800 z-10">Open Source</td>
            <td v-for="platform in visiblePlatforms" :key="`opensource-${platform.id}`" class="px-4 py-4 text-center">
              <component :is="getIcon(platform.features.openSource)" class="h-5 w-5 mx-auto" :class="getIconColor(platform.features.openSource)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SEO Content Section -->
    <div class="grid md:grid-cols-2 gap-8 mb-12">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Why TradeTally is the Best Trading Journal for Day Traders
        </h2>
        <div class="space-y-3 text-gray-600 dark:text-gray-400">
          <p>
            Looking for the <strong>best trading journal software</strong> in 2025? TradeTally offers everything serious traders need:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li><strong>Unlimited free trading journal</strong> with no monthly trade limits</li>
            <li><strong>Automated trade import</strong> from Lightspeed, Schwab, ThinkorSwim, IBKR, E*TRADE, TD Ameritrade</li>
            <li><strong>Custom CSV mapping</strong> for any other broker with CSV export</li>
            <li><strong>Advanced trading performance analytics</strong> including Sharpe ratio, Kelly criterion, and more</li>
            <li><strong>AI-powered insights</strong> and behavioral pattern detection</li>
            <li><strong>Stocks and options support</strong> with dedicated features for both</li>
            <li><strong>Self-hosted option</strong> for complete data privacy and control</li>
          </ul>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Free Alternatives to TraderVue & TraderSync
        </h2>
        <div class="space-y-3 text-gray-600 dark:text-gray-400">
          <p>
            Tired of expensive trading journal subscriptions? TradeTally is the <strong>free alternative to TraderVue</strong> that doesn't compromise on features:
          </p>
          <ul class="list-disc list-inside space-y-2 ml-4">
            <li>Free forever plan with unlimited trade storage (vs TraderVue's 100/month limit)</li>
            <li>Pro tier at $8/month (vs TraderVue $29-79/month, TraderSync $49-99/month)</li>
            <li>Open source trading journal software you can audit and trust</li>
            <li>No vendor lock-in - export all your data anytime</li>
            <li>Modern, fast interface built with latest web technologies</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- CTA Section -->
    <div class="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-8 text-center text-white">
      <h2 class="text-3xl font-bold mb-4">
        Start Tracking Your Trades Today
      </h2>
      <p class="text-xl mb-6 opacity-90">
        Join thousands of traders using the best free trading journal platform
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <router-link to="/register" class="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
          Get Started Free
        </router-link>
        <router-link to="/features" class="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors">
          View All Features
        </router-link>
      </div>
    </div>

    <!-- FAQ Section for SEO -->
    <div class="mt-16">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
        Frequently Asked Questions
      </h2>
      <div class="space-y-6 max-w-4xl mx-auto">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            What is the best trading journal for day traders?
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            The best trading journal depends on your specific needs, but TradeTally stands out with unlimited free trade storage,
            advanced analytics, AI-powered insights, and support for all major brokers. Unlike TraderVue and TraderSync,
            TradeTally offers a truly free plan without artificial trade limits.
          </p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Does TradeTally work with my broker?
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            Yes! TradeTally has verified support for Lightspeed, Charles Schwab/ThinkorSwim, Interactive Brokers (IBKR),
            E*TRADE, and TD Ameritrade. For other brokers with CSV export, you can create a custom CSV column mapping
            that saves to your profile for future imports.
          </p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Is TradeTally really free or is it a trial?
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            TradeTally is completely free forever for core features including unlimited trade storage, basic analytics,
            trade journal, and CSV import/export. Our Pro tier ($8/month) unlocks advanced features like AI insights,
            behavioral analytics, watchlists, and advanced metrics - but the free tier has no time limit or hidden fees.
          </p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            What's the difference between TradeTally and TraderVue?
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            TradeTally offers unlimited free trade storage (vs TraderVue's 100/month limit), lower Pro pricing ($8/mo vs $29-79/mo),
            open source code, self-hosting options, and modern features like AI insights and behavioral analytics.
            TradeTally is built for the next generation of traders who want transparency and value.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/solid'

const platforms = [
  {
    id: 'tradetally',
    name: 'TradeTally',
    features: {
      freeTrades: 'Unlimited',
      price: 'Free / $8',
      annualDiscount: '17%',
      csvImport: true,
      brokerIntegrations: '5+ verified + custom mapping',
      apiIntegration: 'Pro',
      stocks: true,
      options: true,
      forex: false,
      crypto: false,
      basicAnalytics: true,
      advancedMetrics: 'Pro ($8/mo)',
      charting: true,
      aiInsights: 'Pro',
      behavioral: 'Pro',
      journal: true,
      images: true,
      sharing: true,
      alerts: 'Pro ($8/mo)',
      mobile: 'iOS',
      dataExport: 'CSV & JSON',
      selfHosted: true,
      openSource: true
    }
  },
  {
    id: 'tradervue',
    name: 'TraderVue',
    features: {
      freeTrades: '100/month',
      price: '$29-79',
      annualDiscount: '~15%',
      csvImport: true,
      brokerIntegrations: '60+',
      apiIntegration: 'Premium',
      stocks: true,
      options: true,
      forex: true,
      crypto: false,
      basicAnalytics: true,
      advancedMetrics: 'All plans',
      charting: true,
      aiInsights: false,
      behavioral: false,
      journal: true,
      images: true,
      sharing: true,
      alerts: 'No',
      mobile: 'No',
      dataExport: 'Limited',
      selfHosted: false,
      openSource: false
    }
  },
  {
    id: 'tradersync',
    name: 'TraderSync',
    features: {
      freeTrades: '20/month',
      price: '$49-99',
      annualDiscount: '~20%',
      csvImport: true,
      brokerIntegrations: '40+',
      apiIntegration: 'Elite',
      stocks: true,
      options: true,
      forex: true,
      crypto: true,
      basicAnalytics: true,
      advancedMetrics: 'Pro+',
      charting: true,
      aiInsights: false,
      behavioral: 'Limited',
      journal: true,
      images: true,
      sharing: true,
      alerts: 'Pro+',
      mobile: 'iOS/Android',
      dataExport: 'CSV',
      selfHosted: false,
      openSource: false
    }
  },
  {
    id: 'edgewonk',
    name: 'Edgewonk',
    features: {
      freeTrades: 'No free',
      price: '$39-79',
      annualDiscount: 'One-time',
      csvImport: true,
      brokerIntegrations: 'Manual/CSV',
      apiIntegration: false,
      stocks: true,
      options: true,
      forex: true,
      crypto: true,
      basicAnalytics: true,
      advancedMetrics: 'All plans',
      charting: 'Limited',
      aiInsights: false,
      behavioral: 'Strong',
      journal: true,
      images: true,
      sharing: false,
      alerts: 'No',
      mobile: 'No',
      dataExport: 'CSV',
      selfHosted: false,
      openSource: false
    }
  },
  {
    id: 'tradesviz',
    name: 'TradesViz',
    features: {
      freeTrades: '50/month',
      price: '$29-69',
      annualDiscount: '~25%',
      csvImport: true,
      brokerIntegrations: '30+',
      apiIntegration: 'Pro+',
      stocks: true,
      options: true,
      forex: true,
      crypto: true,
      basicAnalytics: true,
      advancedMetrics: 'Pro+',
      charting: true,
      aiInsights: false,
      behavioral: 'Limited',
      journal: true,
      images: true,
      sharing: true,
      alerts: 'No',
      mobile: 'Web only',
      dataExport: 'CSV',
      selfHosted: false,
      openSource: false
    }
  }
]

const selectedPlatforms = ref(['tradetally', 'tradervue', 'tradersync'])

const visiblePlatforms = computed(() => {
  return platforms.filter(p => selectedPlatforms.value.includes(p.id))
})

const togglePlatform = (platformId) => {
  if (selectedPlatforms.value.includes(platformId)) {
    // Don't allow removing if it's the last one
    if (selectedPlatforms.value.length > 1) {
      selectedPlatforms.value = selectedPlatforms.value.filter(id => id !== platformId)
    }
  } else {
    selectedPlatforms.value.push(platformId)
  }
}

const getIcon = (value) => {
  if (value === true || value === 'Pro') return CheckIcon
  return XMarkIcon
}

const getIconColor = (value) => {
  if (value === true) return 'text-green-500'
  if (value === 'Pro') return 'text-blue-500'
  return 'text-red-500'
}

const getPriceClass = (price) => {
  if (price.includes('Free')) return 'text-green-600 dark:text-green-400 font-semibold'
  if (price.startsWith('$8')) return 'text-blue-600 dark:text-blue-400 font-semibold'
  return 'text-gray-600 dark:text-gray-400'
}

// SEO Meta Tags
onMounted(() => {
  document.title = 'Best Trading Journal Software 2025 - TradeTally vs TraderVue vs TraderSync Comparison'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Compare the best trading journal software for day traders. TradeTally vs TraderVue vs TraderSync vs Edgewonk vs TradesViz. Free trading journal with automated trade import from major brokers, advanced analytics for stocks and options.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'best trading journal, trading journal software, TraderVue alternative, TraderSync alternative, free trading journal, trading performance analytics, automated trade import, broker integration, stock trade journal app, options trading journal, day trading journal, trade tracking platform, trading journal comparison')
})
</script>
