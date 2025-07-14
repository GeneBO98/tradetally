<template>
  <div class="max-w-6xl mx-auto py-8 px-4">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        TradeTally vs TraderVue Comparison
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400">
        See why traders are switching from TraderVue to TradeTally
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
              <span class="text-green-600 dark:text-green-400 font-semibold">Unlimited</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">100 trades/month</td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Price (Monthly)</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free Forever</span>
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
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Advanced Analytics</td>
            <td class="px-6 py-4 text-center">
              <CheckIcon class="h-5 w-5 text-green-500 mx-auto" />
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
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">API Access</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Free</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">Premium only</td>
          </tr>
          
          <tr class="bg-gray-50 dark:bg-gray-900/50">
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">Data Export</td>
            <td class="px-6 py-4 text-center">
              <span class="text-green-600 dark:text-green-400 font-semibold">Unlimited</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-600 dark:text-gray-400">Limited on free</td>
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
              <h3 class="font-semibold text-gray-900 dark:text-white">No Artificial Limits</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Track unlimited trades on our free plan. No monthly limits or feature restrictions.
              </p>
            </div>
          </div>
          
          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Complete Data Control</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Self-host on your own servers or export all your data anytime. Your trades, your control.
              </p>
            </div>
          </div>
          
          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Modern Technology</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Built with Vue 3 and modern web standards for superior performance and user experience.
              </p>
            </div>
          </div>
          
          <div class="flex items-start">
            <CheckCircleIcon class="h-6 w-6 text-green-500 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">Open Source Transparency</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Review our code, verify our privacy claims, and even contribute to development.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Easy Migration from TraderVue
        </h2>
        
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 class="font-semibold text-blue-900 dark:text-blue-200 mb-3">
            Switch in 3 Simple Steps:
          </h3>
          <ol class="space-y-3 text-blue-800 dark:text-blue-300">
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

    <!-- Testimonial Section -->
    <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        Join Traders Who Made the Switch
      </h2>
      <p class="text-lg text-gray-600 dark:text-gray-400 mb-6 max-w-3xl mx-auto">
        "After hitting TraderVue's monthly limit again, I discovered TradeTally. The unlimited free plan and self-hosting option sealed the deal. 
        It has all the features I need without the artificial restrictions."
      </p>
      <p class="text-gray-500 dark:text-gray-500">
        - Active Day Trader
      </p>
    </div>
  </div>
</template>

<script setup>
import { CheckIcon, XMarkIcon, CheckCircleIcon, ArrowRightIcon } from '@heroicons/vue/24/solid'
import { onMounted } from 'vue'

// Set document title and meta tags
onMounted(() => {
  document.title = 'TradeTally vs TraderVue - Detailed Comparison'
  
  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', 'Compare TradeTally and TraderVue trading journals. See why traders choose TradeTally for unlimited free trades, self-hosting, and open-source transparency.')
  }
  
  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (metaKeywords) {
    metaKeywords.setAttribute('content', 'TradeTally vs TraderVue, TraderVue alternative, trading journal comparison, free trading journal')
  }
})
</script>