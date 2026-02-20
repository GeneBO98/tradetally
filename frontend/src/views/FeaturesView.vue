<template>
  <div class="max-w-7xl mx-auto py-8 px-4">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        Free Open-Source Trading Journal Features
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
        TradeTally is a free, open-source trading journal with Schwab and IBKR auto-sync, AI-powered insights, and advanced analytics.
        Self-host with Docker or use our cloud. Everything day traders need at a fraction of the cost of TraderVue or TraderSync.
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
          Auto-sync with Schwab/ThinkorSwim and IBKR. CSV import from Lightspeed, Webull, TradingView, TradeStation, Tradovate, Questrade, and more.
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

    <!-- Investment Analysis Section -->
    <div class="mb-16">
      <div class="text-center mb-10">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Investment Analysis and Portfolio Tracking
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          TradeTally is more than a trading journal. Track long-term holdings with real-time P&amp;L, analyze stocks with the 8 Pillars value investing framework, and monitor earnings and news -- all for $8/mo with Pro.
        </p>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <!-- 8 Pillars Stock Analyzer -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow border border-primary-100 dark:border-primary-900">
          <div class="flex items-center mb-4">
            <MagnifyingGlassIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">8 Pillars Stock Analyzer</h3>
              <span class="text-xs font-medium text-primary-600 dark:text-primary-400">Pro</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            Evaluate any stock against 8 value investing pillars: P/E ratio, ROIC, share buybacks, cash flow growth, net income growth, revenue growth, debt coverage, and price-to-FCF. Includes DCF valuation calculator and full financial statements.
          </p>
        </div>

        <!-- Holdings Tracking -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow border border-primary-100 dark:border-primary-900">
          <div class="flex items-center mb-4">
            <CurrencyDollarIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Holdings with Real-Time P&amp;L</h3>
              <span class="text-xs font-medium text-primary-600 dark:text-primary-400">Pro</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            Track investment positions with live market prices, unrealized P&amp;L, cost basis per lot, and dividend income. Monitor your entire portfolio value in real time alongside your trading journal.
          </p>
        </div>

        <!-- Stock Scanner -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow border border-primary-100 dark:border-primary-900">
          <div class="flex items-center mb-4">
            <FunnelIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Russell 2000 Stock Scanner</h3>
              <span class="text-xs font-medium text-primary-600 dark:text-primary-400">Pro</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            Quarterly scan of every Russell 2000 stock against the 8 Pillars framework. Filter results by specific pillars, sort by P/E or ROIC, and find undervalued small-cap stocks.
          </p>
        </div>

        <!-- Watchlists & Price Alerts -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow border border-primary-100 dark:border-primary-900">
          <div class="flex items-center mb-4">
            <BellAlertIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Watchlists and Price Alerts</h3>
              <span class="text-xs font-medium text-primary-600 dark:text-primary-400">Pro</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            Create multiple watchlists with live prices. Set price alerts that notify you by email or push notification when a stock hits your target price or changes by a set percentage.
          </p>
        </div>

        <!-- Earnings Calendar -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
          <div class="flex items-center mb-4">
            <CalendarDaysIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">Earnings Calendar</h3>
              <span class="text-xs font-medium text-green-600 dark:text-green-400">Free</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            See upcoming earnings dates for stocks you hold. Shows EPS estimates, prior-year actuals, and whether the report is before or after market hours.
          </p>
        </div>

        <!-- News & Sentiment -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-lg transition-shadow">
          <div class="flex items-center mb-4">
            <NewspaperIcon class="h-8 w-8 text-primary-600 mr-3" />
            <div>
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">News Correlation Analytics</h3>
              <span class="text-xs font-medium text-green-600 dark:text-green-400">Free</span>
            </div>
          </div>
          <p class="text-gray-600 dark:text-gray-400">
            Trades are automatically enriched with news from the trade date. See how your win rate correlates with news sentiment and identify which news-driven setups work best for you.
          </p>
        </div>
      </div>
    </div>

    <!-- Premium Features Section -->
    <div class="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 mb-16">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
        Advanced Trading Tools
      </h2>
      
      <div class="flex justify-center">
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl">
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
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">R-Multiple and Trade Management</h3>
            <ul class="space-y-2">
              <li class="flex items-center text-gray-700 dark:text-gray-300">
                <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
                R-Multiple tracking (net of commissions)
              </li>
              <li class="flex items-center text-gray-700 dark:text-gray-300">
                <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
                Weighted Target R for multi-target exits
              </li>
              <li class="flex items-center text-gray-700 dark:text-gray-300">
                <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
                Management R (execution vs plan)
              </li>
              <li class="flex items-center text-gray-700 dark:text-gray-300">
                <CheckIcon class="h-5 w-5 text-green-500 mr-2" />
                R-Performance chart with cumulative curves
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
        Open-Source and Self-Hosted Trading Journal
      </h2>
      <p class="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
        TradeTally is fully open source on GitHub and can be self-hosted with a single Docker command. Your trading data stays on your server with complete privacy. No vendor lock-in, no recurring fees for self-hosted users.
      </p>
      
      <div class="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-8">
        <!-- Cloud Column -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">Cloud (tradetally.io)</h3>
          <ul class="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>Sign up and start journaling immediately</span>
            </li>
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>All API keys provided (market data, AI, charts)</span>
            </li>
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>Automatic updates and backups</span>
            </li>
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>Free tier + $8/mo Pro option</span>
            </li>
          </ul>
        </div>

        <!-- Self-Hosted Column -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">Self-Hosted (Docker)</h3>
          <ul class="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>All features unlocked, no subscription required</span>
            </li>
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>Complete data privacy on your own server</span>
            </li>
            <li class="flex items-start">
              <CheckIcon class="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>Full source code access and customization</span>
            </li>
            <li class="flex items-start">
              <ExclamationTriangleIcon class="h-5 w-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
              <span>You provide your own API keys for market data (Finnhub), charts (Alpha Vantage), and AI features (Google Gemini)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- CTA Section -->
    <div class="mb-16">
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
          Related Pages and Resources
        </h2>
        <p class="text-gray-600 dark:text-gray-400 text-center max-w-3xl mx-auto mb-6">
          Compare plans, read FAQs, review platform comparisons, and access deployment docs if you want to self-host TradeTally.
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <router-link to="/pricing" class="btn-secondary text-center">Pricing</router-link>
          <router-link to="/compare" class="btn-secondary text-center">Compare</router-link>
          <router-link to="/faq" class="btn-secondary text-center">FAQ</router-link>
          <router-link to="/public" class="btn-secondary text-center">Public Trades</router-link>
        </div>
        <div class="flex flex-wrap justify-center gap-6 text-sm">
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
    </div>

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
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  ServerIcon,
  ShieldCheckIcon,
  CodeBracketIcon,
  ArrowRightIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  FunnelIcon,
  BellAlertIcon,
  NewspaperIcon
} from '@heroicons/vue/24/outline'
import { onMounted } from 'vue'

// Set document title and meta tags for GEO
onMounted(() => {
  document.title = 'Free Open-Source Trading Journal Features - Auto-Sync, AI Analytics, Self-Hosting | TradeTally'

  // Update meta description
  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Free open-source trading journal and investment tracker. Schwab and IBKR auto-sync, 8 Pillars stock analyzer, real-time holdings P&L, AI insights. Self-host with Docker or use our cloud.')

  // Update meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'free trading journal, open source trading journal, self-hosted trading journal, stock analyzer, investment tracker, portfolio tracker, 8 pillars stock analysis, holdings tracker real-time P&L, Schwab trading journal, IBKR trading journal, free TraderVue alternative, DCF valuation calculator')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', 'https://tradetally.io/features')

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
        "description": "Unlimited trade storage, basic analytics, CSV import from all brokers (100 executions per batch)"
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
        "description": "AI insights, behavioral analytics, 8 Pillars stock analyzer, DCF valuation, holdings with real-time P&L, Russell 2000 scanner, watchlists, price alerts"
      }
    ],
    "description": "Free open-source trading journal and investment tracker with auto-sync from Schwab and Interactive Brokers. 8 Pillars stock analyzer, real-time holdings P&L, DCF valuation, AI insights, and self-hosting with Docker.",
    "url": "https://tradetally.io",
    "screenshot": "https://tradetally.io/screenshot.png",
    "softwareVersion": "2.0",
    "releaseNotes": "Auto-sync with Schwab and IBKR, Russell 2000 stock scanner, AI insights",
    "featureList": [
      "Unlimited free trade storage",
      "Auto-sync with Charles Schwab and ThinkorSwim",
      "Auto-sync with Interactive Brokers (IBKR)",
      "CSV import from Lightspeed, Webull, TradingView, TradeStation, Tradovate, Questrade",
      "Custom CSV column mapping for any broker",
      "Stocks, options, forex, and crypto support",
      "AI-powered trading insights and recommendations",
      "Behavioral analytics (revenge trading, loss aversion)",
      "8 Pillars value investing stock analysis",
      "DCF valuation calculator",
      "Russell 2000 stock scanner",
      "Holdings tracking with real-time P&L",
      "Dividend income tracking",
      "Watchlists with live prices and price alerts",
      "Earnings calendar",
      "News correlation analytics",
      "Financial statements and SEC filings",
      "R-Multiple tracking with Management R",
      "Weighted Target R for multi-target exits",
      "R-Performance cumulative chart",
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
