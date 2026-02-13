<template>
  <div class="max-w-6xl mx-auto py-8 px-4">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        TradeTally vs TraderVue 2026 -- Free Alternative Comparison
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400">
        Compare features and pricing: free unlimited trades with TradeTally ($0-$8/mo) vs TraderVue ($29-$79/mo)
      </p>
    </div>

    <!-- Comparison Table -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden mb-12">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-900">
            <th class="px-6 py-4 text-left text-sm font-medium text-gray-900 dark:text-gray-200">Feature</th>
            <th class="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-200">TradeTally</th>
            <th class="px-6 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-200">TraderVue</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Free Plan Trade Limit</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Unlimited storage</span>
              <div class="text-xs text-gray-500">(import in batches of 100)</div>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">100 trades/month</td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Price (Monthly)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free or $8/mo</span>
              <div class="text-xs text-gray-500">(Pro for advanced features)</div>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">$29-$79/month</td>
          </tr>
          
          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Self-Hosted Option</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Open Source</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>
          
          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Trade Import</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Basic Analytics (P/L, Win Rate, Charts)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free</span>
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Advanced Analytics (SQN, Kelly, K-Ratio, MAE/MFE)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>
          
          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Public Trade Sharing</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Options Trading Support</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Crypto Trading Support</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Forex Trading Support</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">API Access</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">Premium only</td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Data Export</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">CSV Export Free</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">Limited on free</td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">R-Multiple Tracking</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free</span>
            </td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Trade Management Analysis (Management R, Target R)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Behavioral Analytics (Revenge Trading, Loss Aversion)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Watchlists & Price Alerts</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">AI-Powered Insights</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Earnings Calendar</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">8 Pillars Stock Analyzer & DCF Valuation</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>

          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Holdings Tracking with Real-Time P&amp;L</td>
            <td class="px-6 py-4 text-center">
              <span class="text-primary-600 dark:text-primary-400 font-semibold">Pro ($8/mo)</span>
            </td>
            <td class="px-6 py-4 text-center">
              <XMarkIcon class="h-5 w-5 text-red-500 mx-auto" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Key Advantages -->
    <div class="grid md:grid-cols-2 gap-8 mb-12">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Why Choose TradeTally?
        </h2>
        
        <div class="space-y-4">
          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Free Tier with Unlimited Storage</h3>
              <p class="text-gray-600 dark:text-gray-400">
                The free plan includes unlimited trade storage, basic analytics, R-Multiple tracking, earnings calendar, and CSV import. No time limit, no trial -- it stays free.
              </p>
            </div>
          </div>

          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Pro at $8/mo vs TraderVue at $29-$79/mo</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Pro unlocks AI insights, behavioral analytics, trade management analysis, 8 Pillars stock analyzer, holdings tracking, watchlists, and price alerts -- all at a fraction of TraderVue's cost.
              </p>
            </div>
          </div>

          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Open Source and Self-Hosted Option</h3>
              <p class="text-gray-600 dark:text-gray-400">
                TradeTally is fully open source. Self-host with Docker for complete data privacy and all features included -- you just provide your own API keys for market data and AI.
              </p>
            </div>
          </div>

          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Export Your Data Anytime</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Full JSON and CSV export from settings. No lock-in -- your trading data is always yours to take.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Easy Migration from TraderVue
        </h2>
        
        <div class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-6">
          <h3 class="font-semibold text-primary-900 dark:text-primary-200 mb-3">
            Switch in 3 Simple Steps:
          </h3>
          <ol class="space-y-3 text-primary-800 dark:text-primary-300">
            <li class="flex items-start">
              <span class="font-bold mr-2">1.</span>
              Export your trades from TraderVue as CSV
            </li>
            <li class="flex items-start">
              <span class="font-bold mr-2">2.</span>
              Format CSV to match our Generic CSV template
            </li>
            <li class="flex items-start">
              <span class="font-bold mr-2">3.</span>
              Create your free TradeTally account and import
            </li>
          </ol>
          
          <div class="mt-6">
            <router-link to="/register" class="btn-primary inline-flex items-center">
              Start Free Now
              <ArrowRightIcon class="ml-2 h-4 w-4" />
            </router-link>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { CheckIcon, XMarkIcon, CheckCircleIcon, ArrowRightIcon } from '@heroicons/vue/24/solid'
import { onMounted } from 'vue'

// Set document title and meta tags
onMounted(() => {
  document.title = 'TradeTally vs TraderVue 2026 - Free Trading Journal Alternative Comparison'
  
  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', 'TradeTally vs TraderVue: free unlimited trades and $8/mo Pro vs $29-$79/mo. Open-source, self-hosted, with Schwab and IBKR auto-sync. The best free TraderVue alternative in 2026.')
  }
  
  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (metaKeywords) {
    metaKeywords.setAttribute('content', 'TradeTally vs TraderVue, TraderVue alternative, free trading journal, open source trading journal, self-hosted trading journal, trading journal comparison, Schwab trading journal, IBKR trading journal')
  }
})
</script>