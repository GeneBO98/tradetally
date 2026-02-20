<template>
  <div>
    <section class="bg-white dark:bg-gray-800">
      <div class="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div class="text-center">
          <h1 class="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            TradeTally Free Trading Journal and Investment Tracker for Day Traders
          </h1>
          <p class="mt-5 max-w-3xl mx-auto text-xl text-gray-500 dark:text-gray-400">
            TradeTally is a professional trade tracking platform with automated broker import, advanced analytics, and portfolio tools.
            Use one free trading journal and investment tracker for stocks, options, and long-term positions with unlimited trade storage.
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

    <!-- Pro Features Section -->
    <section class="bg-gradient-to-br from-primary-600 to-primary-800 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <span class="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold bg-white/20 text-white mb-4">
            <SparklesIcon class="h-4 w-4 mr-2" />
            PRO FEATURES
          </span>
          <h2 class="text-3xl font-extrabold text-white sm:text-4xl">
            Take Your Trading to the Next Level
          </h2>
          <p class="mt-4 max-w-3xl mx-auto text-lg text-primary-100">
            Unlock powerful analysis tools and AI-driven insights to make smarter investment decisions.
          </p>
        </div>

        <!-- DCF Stock Analyzer - Featured (standalone row) -->
        <div class="mb-6 bg-white/15 backdrop-blur-sm rounded-xl p-8 hover:bg-white/20 transition-colors border border-white/20">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div class="flex items-center mb-3">
                <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                  <CalculatorIcon class="h-8 w-8 text-white" />
                </div>
                <div class="ml-4">
                  <span class="inline-block px-2 py-0.5 text-xs font-semibold bg-yellow-400 text-yellow-900 rounded mb-1">NEW</span>
                  <h3 class="text-xl font-bold text-white">DCF Stock Valuation Calculator</h3>
                </div>
              </div>
              <p class="text-primary-100 max-w-2xl">
                Calculate fair value for any stock using Discounted Cash Flow analysis. View historical ROIC, revenue growth, profit margins, and FCF metrics.
                Enter your own Bear/Base/Bull assumptions to see if a stock is undervalued or overvalued with margin of safety calculations.
              </p>
            </div>
            <div class="flex-shrink-0">
              <div class="bg-white/10 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold text-white">3</div>
                <div class="text-sm text-primary-200">Scenarios</div>
                <div class="text-xs text-primary-300 mt-1">Bear / Base / Bull</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <!-- 8 Pillars Analysis -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <ShieldCheckIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">8 Pillars Stock Analysis</h3>
            </div>
            <p class="text-primary-100">
              Evaluate any stock against 8 fundamental value investing criteria. Get instant pass/fail ratings with detailed financial breakdowns.
            </p>
          </div>

          <!-- Stock Scanner -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <MagnifyingGlassIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">Russell 2000 Scanner</h3>
            </div>
            <p class="text-primary-100">
              Nightly scans of 2,000+ stocks automatically analyzed. Filter by which value pillars pass to find undervalued opportunities.
            </p>
          </div>

          <!-- AI Insights -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <CpuChipIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">AI-Powered Insights</h3>
            </div>
            <p class="text-primary-100">
              Advanced AI analysis of your trading patterns, personalized recommendations, and actionable suggestions to improve performance.
            </p>
          </div>

          <!-- Behavioral Analytics -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <PresentationChartLineIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">Behavioral Analytics</h3>
            </div>
            <p class="text-primary-100">
              Discover your trading psychology patterns. Track performance by time of day, day of week, hold duration, and more.
            </p>
          </div>

          <!-- Health Correlations -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <HeartIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">Health Correlations</h3>
            </div>
            <p class="text-primary-100">
              Connect Apple Health data to analyze how sleep, exercise, and wellness affect your trading performance.
            </p>
          </div>

          <!-- Real-time Data -->
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-colors">
            <div class="flex items-center mb-4">
              <div class="flex-shrink-0 p-3 bg-white/20 rounded-lg">
                <ChartBarIcon class="h-6 w-6 text-white" />
              </div>
              <h3 class="ml-4 text-lg font-semibold text-white">Live Market Data</h3>
            </div>
            <p class="text-primary-100">
              Real-time stock quotes, company profiles, and financial statements powered by professional market data feeds.
            </p>
          </div>
        </div>

        <div class="mt-12 text-center">
          <router-link
            to="/pricing"
            class="inline-flex items-center px-8 py-3 border-2 border-white text-lg font-semibold rounded-lg text-white hover:bg-white hover:text-primary-700 transition-colors"
          >
            View Pro Plans - Starting at $8/month
          </router-link>
          <p class="mt-4 text-primary-200 text-sm">
            7-day free trial available. Cancel anytime.
          </p>
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
              <h3 class="heading-card">Unlimited Free Trading Journal</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Unlike TraderVue's 100 trades/month limit, get unlimited trade storage completely free. No time limits, no hidden fees.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="heading-card">Works With Your Broker</h3>
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                Auto-sync with Schwab and IBKR, plus CSV import from Lightspeed, Webull, TradingView, TradeStation, and custom mapping for any broker.
              </p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
              <h3 class="heading-card">AI-Powered Analytics</h3>
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
              <li>✓ <strong>Charles Schwab / ThinkorSwim</strong> - <span class="text-primary-600 font-medium">Auto-Sync</span> + CSV import</li>
              <li>✓ <strong>Interactive Brokers (IBKR)</strong> - <span class="text-primary-600 font-medium">Auto-Sync</span> + CSV import</li>
              <li>✓ <strong>Lightspeed Trading</strong> - Direct CSV import</li>
              <li>✓ <strong>Webull</strong> - Direct CSV import</li>
              <li>✓ <strong>TradingView</strong> - Direct CSV import</li>
              <li>✓ <strong>TradeStation</strong> - Direct CSV import</li>
              <li>✓ <strong>Tradovate / Questrade</strong> - Direct CSV import</li>
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
              <li>✓ <strong>Crypto</strong> - Bitcoin, Ethereum, and all major cryptocurrencies</li>
              <li>✓ <strong>Forex</strong> - EUR/USD, GBP/JPY, and all currency pairs</li>
            </ul>
            <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                <strong>Coming Soon:</strong> Futures support
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

    <section class="bg-gray-50 dark:bg-gray-900 py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">Explore TradeTally Resources</h2>
          <p class="mt-4 max-w-3xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Use these pages to compare platforms, review pricing, read common questions, and access documentation for cloud or self-hosted setups.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 max-w-5xl mx-auto">
          <router-link to="/features" class="btn-secondary text-center">Features</router-link>
          <router-link to="/compare" class="btn-secondary text-center">Compare</router-link>
          <router-link to="/pricing" class="btn-secondary text-center">Pricing</router-link>
          <router-link to="/faq" class="btn-secondary text-center">FAQ</router-link>
          <router-link to="/public" class="btn-secondary text-center">Public Trades</router-link>
          <router-link to="/privacy" class="btn-secondary text-center">Privacy</router-link>
          <router-link to="/login" class="btn-secondary text-center">Login</router-link>
          <router-link to="/register" class="btn-primary text-center">Create Account</router-link>
        </div>
        <div class="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          <a
            href="https://docs.tradetally.io"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-600 hover:text-primary-500"
          >
            Documentation
          </a>
          <a
            href="https://github.com/GeneBO98/tradetally"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-600 hover:text-primary-500"
          >
            GitHub Repository
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  ChartBarIcon,
  DocumentTextIcon,
  ArrowUpTrayIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  HeartIcon,
  ShieldCheckIcon,
  CalculatorIcon
} from '@heroicons/vue/24/outline'
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
  document.title = 'TradeTally - Free Trading Journal and Investment Tracker'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Free open-source trading journal and investment tracker. Auto-sync Schwab and IBKR, stock analyzer, real-time holdings P&L, AI insights. Self-host with Docker.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'trading journal software, best trading journal, free trading journal, TraderVue alternative, TraderSync alternative, trade tracking platform, automated trade import, broker auto-sync, Schwab trading journal, IBKR trading journal, Interactive Brokers journal, stock trade journal, options trading journal, day trading journal, trading performance analytics, AI trading insights')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', 'https://tradetally.io/')

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
      "description": "Best free trading journal software with unlimited trade storage, auto-sync with Schwab and IBKR, CSV import from Lightspeed, Webull, TradingView, TradeStation, and more. Advanced analytics and AI-powered insights. The #1 TraderVue alternative for stocks and options trading.",
      "url": "https://tradetally.io",
      "author": {
        "@type": "Organization",
        "name": "TradeTally"
      },
      "softwareVersion": "2.0",
      "datePublished": "2024-01-01",
      "featureList": [
        "Unlimited Free Trade Storage",
        "Auto-Sync with Schwab and Interactive Brokers",
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
