<template>
  <div>
    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-900/20 via-transparent to-transparent"></div>
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Left: Text Content -->
          <div>
            <h1 class="text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl tracking-tight">
              Best Free Trading Journal Software for Day Traders
            </h1>
            <p class="mt-6 text-lg text-gray-300 max-w-xl">
              Professional trade tracking platform with automated trade import, advanced analytics, and broker integration.
              The best TraderVue alternative with unlimited free trade storage for stocks and options trading.
            </p>
            <div class="mt-8 flex flex-wrap gap-4">
              <router-link
                v-if="showRegisterButton"
                to="/register"
                class="btn-primary text-lg px-8 py-3"
              >
                Get Started Free
              </router-link>
              <router-link to="/public" class="inline-flex items-center px-8 py-3 text-lg font-medium text-gray-300 border border-gray-600 rounded-lg hover:bg-white/10 hover:border-gray-400 transition-colors">
                View Public Trades
              </router-link>
            </div>
            <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
              <span class="flex items-center gap-1.5">
                <CheckCircleIcon class="h-4 w-4 text-emerald-400" />
                Free forever
              </span>
              <span class="flex items-center gap-1.5">
                <CheckCircleIcon class="h-4 w-4 text-emerald-400" />
                No credit card required
              </span>
              <span class="flex items-center gap-1.5">
                <CheckCircleIcon class="h-4 w-4 text-emerald-400" />
                Open source
              </span>
            </div>
          </div>
          <!-- Right: Hero Video -->
          <div class="relative lg:ml-4">
            <div class="rounded-xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <video
                autoplay
                loop
                muted
                playsinline
                poster="/images/screenshot-dashboard.png"
                class="w-full h-auto"
              >
                <source src="/images/hero-dashboard.mp4" type="video/mp4" />
                <source src="/images/hero-dashboard.webm" type="video/webm" />
                <img
                  src="/images/screenshot-dashboard.png"
                  alt="TradeTally Dashboard - Trading performance analytics with P&L charts, win rate, and open positions"
                  class="w-full h-auto"
                />
              </video>
            </div>
            <div class="absolute -inset-4 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent rounded-xl pointer-events-none lg:hidden"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Broker Marquee -->
    <section class="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700/50 py-5 overflow-hidden">
      <p class="text-center text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">
        Works with your broker
      </p>
      <div class="marquee relative">
        <div class="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent z-10 pointer-events-none"></div>
        <div class="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent z-10 pointer-events-none"></div>
        <div class="marquee-inner">
          <div class="marquee-set" v-for="n in 3" :key="n" :aria-hidden="n > 1 || undefined">
            <div v-for="broker in brokers" :key="broker.name + '-' + n" class="marquee-item">
              <img
                v-if="broker.logo"
                :src="broker.logo"
                :alt="broker.name"
                class="h-7 w-auto opacity-70 hover:opacity-100 transition-opacity dark:invert"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Showcase: Alternating Sections -->

    <!-- Feature 1: Analytics (image left, text right) -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div class="rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700" data-parallax>
            <img
              src="/images/screenshot-trade-management.png"
              alt="TradeTally Trade Management - R-Multiple performance analysis with cumulative chart"
              class="w-full h-auto"
              loading="lazy"
            />
          </div>
          <div>
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
              ANALYTICS
            </span>
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              Trade Analytics & Performance
            </h2>
            <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Understand your edge with comprehensive performance metrics and visual analytics.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-start gap-3">
                <ChartBarIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Cumulative P&L charts and R-Multiple performance tracking</span>
              </li>
              <li class="flex items-start gap-3">
                <PresentationChartLineIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Win rate, profit factor, average win/loss, and max drawdown</span>
              </li>
              <li class="flex items-start gap-3">
                <CpuChipIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">AI-powered behavioral analytics and pattern recognition</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature 2: Journal (text left, image right) -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-16 sm:py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div class="order-2 lg:order-1">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
              JOURNAL
            </span>
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              Trading Journal with Notes & Charts
            </h2>
            <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Document your trading process with a structured journal that tracks what matters.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-start gap-3">
                <DocumentTextIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Daily entries with market bias, key levels, and watchlists</span>
              </li>
              <li class="flex items-start gap-3">
                <TagIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Tag entries, link trades, and track plan adherence over time</span>
              </li>
              <li class="flex items-start gap-3">
                <LightBulbIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Capture lessons learned and review past decisions with AI analysis</span>
              </li>
            </ul>
          </div>
          <div class="order-1 lg:order-2 rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700" data-parallax>
            <img
              src="/images/screenshot-journal.png"
              alt="TradeTally Trading Journal - Daily entries with market bias, watchlists, and tags"
              class="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Feature 3: Stock Analyzer (image left, text right) -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div class="rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700" data-parallax>
            <img
              src="/images/screenshot-stock-analyzer.png"
              alt="TradeTally Stock Analyzer - DCF valuation calculator with Bear, Base, and Bull scenarios"
              class="w-full h-auto"
              loading="lazy"
            />
          </div>
          <div>
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-4">
              INVESTMENTS
            </span>
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
              DCF Valuation & Stock Analysis
            </h2>
            <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Go beyond trade tracking with built-in fundamental analysis tools for smarter investing.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-start gap-3">
                <CalculatorIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Discounted Cash Flow calculator with Bear/Base/Bull scenarios</span>
              </li>
              <li class="flex items-start gap-3">
                <ShieldCheckIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">8 Pillars value investing analysis with pass/fail grading</span>
              </li>
              <li class="flex items-start gap-3">
                <MagnifyingGlassIcon class="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300">Russell 2000 nightly scanner to find undervalued stocks</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Pro Features Section (kept from original) -->
    <section data-reveal class="bg-gradient-to-br from-primary-600 to-primary-800 py-16">
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

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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

    <!-- SEO: TraderVue Alternative -->
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

    <!-- SEO: Broker & Asset Compatibility -->
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
              <li>&#10003; <strong>Charles Schwab / ThinkorSwim</strong> - <span class="text-primary-600 font-medium">Auto-Sync</span> + CSV import</li>
              <li>&#10003; <strong>Interactive Brokers (IBKR)</strong> - <span class="text-primary-600 font-medium">Auto-Sync</span> + CSV import</li>
              <li>&#10003; <strong>Lightspeed Trading</strong> - Direct CSV import</li>
              <li>&#10003; <strong>Webull</strong> - Direct CSV import</li>
              <li>&#10003; <strong>TradingView</strong> - Direct CSV import</li>
              <li>&#10003; <strong>TradeStation</strong> - Direct CSV import</li>
              <li>&#10003; <strong>Tradovate / Questrade</strong> - Direct CSV import</li>
              <li>&#10003; <strong>Other Brokers</strong> - Custom CSV column mapping</li>
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
              <li>&#10003; <strong>Stocks</strong> - Day trading, swing trading, position trading</li>
              <li>&#10003; <strong>Options</strong> - Calls, puts, spreads, covered calls, iron condors</li>
              <li>&#10003; <strong>ETFs</strong> - Market and sector tracking</li>
              <li>&#10003; <strong>Crypto</strong> - Bitcoin, Ethereum, and all major cryptocurrencies</li>
              <li>&#10003; <strong>Forex</strong> - EUR/USD, GBP/JPY, and all currency pairs</li>
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

    <!-- Stats Bar -->
    <section data-reveal class="bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700/50 py-12">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div class="text-center">
            <div class="text-3xl font-bold text-primary-600">Free</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Forever Plan</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-primary-600">Unlimited</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Trade Storage</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-primary-600">$8/mo</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Pro Features</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-primary-600">Open</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Source Code</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section data-reveal class="bg-gray-50 dark:bg-gray-900 py-16 sm:py-20">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
          Start tracking your trades today
        </h2>
        <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
          Join traders using TradeTally to analyze performance, identify patterns, and improve their edge.
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-4">
          <router-link
            v-if="showRegisterButton"
            to="/register"
            class="btn-primary text-lg px-10 py-3"
          >
            Get Started Free
          </router-link>
          <router-link
            v-if="showSEOPages"
            to="/compare"
            class="btn-secondary text-lg px-8 py-3"
          >
            Compare Platforms
          </router-link>
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
  SparklesIcon,
  MagnifyingGlassIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  HeartIcon,
  ShieldCheckIcon,
  CalculatorIcon,
  CheckCircleIcon,
  TagIcon,
  LightBulbIcon
} from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useScrollReveal } from '@/composables/useScrollReveal'

useScrollReveal()
const authStore = useAuthStore()
const { showSEOPages } = useRegistrationMode()
const showRegisterButton = ref(true)

const brokers = [
  { name: 'Schwab', logo: '/images/brokers/schwab.svg', height: 'h-10' },
  { name: 'Interactive Brokers', logo: '/images/brokers/ibkr.svg', darkInvert: true },
  { name: 'ThinkorSwim', logo: '/images/brokers/thinkorswim.png', height: 'h-10' },
  { name: 'Lightspeed', logo: '/images/brokers/lightspeed.svg', darkInvert: true },
  { name: 'Webull', logo: '/images/brokers/webull.svg', darkInvert: true },
  { name: 'TradingView', logo: '/images/brokers/tradingview.svg', darkInvert: true },
  { name: 'TradeStation', logo: '/images/brokers/tradestation.svg' },
  { name: 'Tastytrade', logo: '/images/brokers/tastytrade.svg', darkInvert: true },
  { name: 'Tradovate', logo: '/images/brokers/tradovate.png', darkInvert: true },
  { name: 'Questrade', logo: '/images/brokers/questrade.svg', height: 'h-10' }
]

onMounted(async () => {
  try {
    const config = await authStore.getRegistrationConfig()
    showRegisterButton.value = config.allowRegistration
  } catch (error) {
    console.error('Failed to fetch registration config:', error)
    showRegisterButton.value = true
  }

  // Update meta tags for SEO
  document.title = 'Best Free Trading Journal Software for Day Traders | TradeTally'

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
    const existingScript = document.getElementById('home-softwareapp-jsonld')
    if (existingScript) {
      existingScript.remove()
    }

    const script = document.createElement('script')
    script.id = 'home-softwareapp-jsonld'
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

<style scoped>
.marquee {
  overflow: hidden;
}

.marquee-inner {
  display: flex;
  width: fit-content;
  animation: scroll 40s linear infinite;
}

.marquee-inner:hover {
  animation-play-state: paused;
}

.marquee-set {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.marquee-item {
  flex-shrink: 0;
  padding: 0 2rem;
}

@keyframes scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-100% / 3));
  }
}

</style>
