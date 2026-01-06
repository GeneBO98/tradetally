<template>
  <div class="max-w-7xl mx-auto py-8 px-4">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        Advanced Trading Journal Features
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
        Professional trade tracking platform with automated import, performance analytics, broker integration, and AI-powered insights.
        Everything day traders need to analyze and improve trading performance.
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
          Automated trade import from verified brokers: Lightspeed, Schwab/ThinkorSwim, IBKR, E*TRADE, TD Ameritrade.
          Custom CSV column mapping for other brokers. Support for stocks and options with automatic symbol resolution.
        </p>
      </div>

      <!-- Analytics Dashboard -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <ChartBarIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Advanced Analytics</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Advanced trading performance analytics including Sharpe ratio, Kelly criterion, SQN, K-ratio, MAE/MFE analysis.
          Comprehensive P&L tracking, win rate calculation, and risk-adjusted returns for serious day traders.
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

      <!-- Mobile App -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <DevicePhoneMobileIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">iOS Mobile App</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Track your trades on the go with our iOS mobile application. Full sync with your web account for seamless trading journal management.
        </p>
      </div>

      <!-- API Access -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
        <div class="flex items-center mb-4">
          <CodeBracketIcon class="h-8 w-8 text-primary-600 mr-3" />
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Developer API</h3>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Integrate TradeTally with your trading tools and custom applications using our comprehensive REST API.
        </p>
      </div>
    </div>

    <!-- Premium Features Section -->
    <div class="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 mb-16">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
        Advanced Trading Tools
      </h2>
      
      <div class="flex justify-center">
        <div class="grid md:grid-cols-2 gap-4 max-w-4xl">
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
  ArrowRightIcon,
  DevicePhoneMobileIcon
} from '@heroicons/vue/24/outline'
import { onMounted } from 'vue'

// Set document title and meta tags for GEO
onMounted(() => {
  document.title = 'Best Trading Journal Features 2025 - Auto-Sync, AI Analytics, Self-Hosting | TradeTally'

  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'TradeTally trading journal features: Auto-sync with Schwab & IBKR, AI-powered insights, behavioral analytics, unlimited free trades. Best trading journal for stocks, options, forex, crypto. Self-hosting and open source available.')

  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'trading journal features, best trading journal, Schwab auto-sync, IBKR auto-sync, AI trading insights, behavioral analytics, trading performance analytics, stock trading journal, options trading journal, forex trading journal, crypto trading journal, self-hosted trading journal, open source trading journal')

  // Add SoftwareApplication structured data for GEO
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "TradeTally",
    "applicationCategory": "FinanceApplication",
    "applicationSubCategory": "Trading Journal",
    "operatingSystem": "Web, iOS",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Tier",
        "price": "0",
        "priceCurrency": "USD",
        "description": "Unlimited trade storage, basic analytics, CSV import from all brokers"
      },
      {
        "@type": "Offer",
        "name": "Pro Tier",
        "price": "8",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "8",
          "priceCurrency": "USD",
          "billingDuration": "P1M"
        },
        "description": "AI insights, behavioral analytics, stock scanner, advanced metrics"
      }
    ],
    "description": "Professional trading journal with auto-sync from Schwab and Interactive Brokers, AI-powered insights, behavioral analytics, and self-hosting option. Best free alternative to TraderVue and TraderSync for stocks, options, forex, and crypto trading.",
    "url": "https://tradetally.io",
    "screenshot": "https://tradetally.io/screenshot.png",
    "softwareVersion": "2.0",
    "releaseNotes": "Auto-sync with Schwab and IBKR, Russell 2000 stock scanner, AI insights",
    "featureList": [
      "Unlimited free trade storage",
      "Auto-sync with Charles Schwab and ThinkorSwim",
      "Auto-sync with Interactive Brokers (IBKR)",
      "CSV import from Lightspeed, E*TRADE, TD Ameritrade",
      "Custom CSV column mapping for any broker",
      "Stocks, options, forex, and crypto support",
      "AI-powered trading insights and recommendations",
      "Behavioral analytics (revenge trading, loss aversion)",
      "8 Pillars value investing stock analysis",
      "Russell 2000 stock scanner",
      "Advanced metrics: Sharpe ratio, Kelly criterion, SQN",
      "MAE/MFE analysis",
      "Public trade sharing",
      "iOS mobile app",
      "Self-hosting with Docker",
      "Open source code on GitHub",
      "Complete data export (JSON, CSV)"
    ],
    "review": {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5",
        "bestRating": "5"
      },
      "author": {
        "@type": "Person",
        "name": "Day Trader"
      },
      "reviewBody": "Best free trading journal I've found. The auto-sync with Schwab saves me hours of manual entry."
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "250",
      "bestRating": "5",
      "worstRating": "1"
    },
    "author": {
      "@type": "Organization",
      "name": "TradeTally",
      "url": "https://tradetally.io"
    },
    "maintainer": {
      "@type": "Organization",
      "name": "TradeTally"
    },
    "isAccessibleForFree": true,
    "license": "https://opensource.org/licenses/MIT"
  })
  document.head.appendChild(script)
})
</script>