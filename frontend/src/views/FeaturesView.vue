<template>
  <div class="max-w-7xl mx-auto py-8 px-4">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        Powerful Features for Serious Traders
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
        Everything you need to track, analyze, and improve your trading performance in one comprehensive platform.
      </p>
    </div>

    <!-- Feature Grid -->
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
      <!-- Trade Import -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <ArrowUpTrayIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Universal Trade Import</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Import trades from any broker via CSV. Support for stocks, options, futures, and forex with automatic symbol resolution.
        </p>
      </div>

      <!-- Analytics Dashboard -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <ChartBarIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Advanced Analytics</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Comprehensive performance metrics, win/loss analysis, and custom date ranges. Track P&L, win rate, and risk metrics.
        </p>
      </div>

      <!-- Trade Journal -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <DocumentTextIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Detailed Trade Journal</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Add notes, tags, and screenshots to every trade. Build a comprehensive record of your trading decisions and learnings.
        </p>
      </div>

      <!-- Public Sharing -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <ShareIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Public Trade Sharing</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Share successful trades with the community. Get feedback, discuss strategies, and learn from other traders.
        </p>
      </div>

      <!-- Calendar View -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <CalendarIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Calendar View</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Visual calendar showing daily P&L at a glance. Quickly identify profitable and losing days in your trading month.
        </p>
      </div>

      <!-- Data Export -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <ArrowDownTrayIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Complete Data Export</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Export all your TradeTally data as JSON from the Settings page. Perfect for migrating between instances or backup purposes.
        </p>
      </div>
    </div>

    <!-- Premium Features Section -->
    <div class="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 mb-16">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
        Advanced Trading Tools
      </h2>
      
      <div class="grid md:grid-cols-2 gap-8">
        <div>
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Performance Metrics</h3>
          <ul class="space-y-2">
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Win rate and profit factor analysis
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Average win/loss calculations
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Maximum drawdown tracking
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Risk/reward ratio analysis
            </li>
          </ul>
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Trade Analysis</h3>
          <ul class="space-y-2">
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Symbol performance breakdown
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Strategy effectiveness tracking
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              Time-based performance analysis
            </li>
            <li class="flex items-center text-gray-700 dark:text-gray-300">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
              MAE/MFE calculations
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Self-Hosting Section -->
    <div class="text-center mb-16">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Self-Hosting for Ultimate Control
      </h2>
      <p class="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
        Deploy TradeTally on your own infrastructure for complete data sovereignty. Perfect for traders who prioritize privacy and customization.
      </p>
      
      <div class="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <ServerIcon class="h-12 w-12 text-primary-600 mx-auto mb-4" />
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Your Server</h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            Run on any VPS, dedicated server, or even locally on your machine.
          </p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <ShieldCheckIcon class="h-12 w-12 text-primary-600 mx-auto mb-4" />
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Your Data</h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            Complete control over your trading data with no third-party access.
          </p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <CodeBracketIcon class="h-12 w-12 text-primary-600 mx-auto mb-4" />
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Your Rules</h3>
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            Customize features, add integrations, and modify to your needs.
          </p>
        </div>
      </div>
    </div>

    <!-- CTA Section -->
    <div class="bg-primary-600 rounded-2xl p-8 text-center text-white">
      <h2 class="text-3xl font-bold mb-4">
        Ready to Elevate Your Trading?
      </h2>
      <p class="text-xl mb-8 opacity-90">
        Join traders using TradeTally to improve their performance.
      </p>
      <router-link to="/register" class="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center">
        Start Free Today
        <ArrowRightIcon class="ml-2 h-5 w-5" />
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { 
  ArrowUpTrayIcon, 
  ChartBarIcon, 
  DocumentTextIcon, 
  ShareIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  ServerIcon,
  ShieldCheckIcon,
  CodeBracketIcon,
  ArrowRightIcon
} from '@heroicons/vue/24/outline'
import { onMounted } from 'vue'

// Set document title and meta tags
onMounted(() => {
  document.title = 'Features - TradeTally Trading Journal'
  
  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', 'Explore TradeTally features: trade import, advanced analytics, detailed journaling, public sharing, calendar view, and self-hosting options for serious traders.')
  }
  
  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (metaKeywords) {
    metaKeywords.setAttribute('content', 'trading journal features, trade tracking tools, trading analytics, trade import, self-hosted trading journal')
  }
})
</script>