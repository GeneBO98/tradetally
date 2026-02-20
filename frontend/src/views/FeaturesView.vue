<template>
  <div class="bg-gray-100 dark:bg-gray-950">
    <!-- Hero -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-14 sm:py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 class="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl tracking-tight">
          Everything You Need to Trade Smarter
        </h1>
        <p class="mt-5 text-xl text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
          Free, open-source trading journal with auto-sync, AI analytics, and advanced performance tools.
          Self-host with Docker or use our cloud.
        </p>
        <!-- Stats -->
        <div class="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          <div data-reveal>
            <div class="text-2xl font-bold text-primary-600">10+</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Supported Brokers</div>
          </div>
          <div data-reveal="delay-1">
            <div class="text-2xl font-bold text-primary-600">Unlimited</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Free Trade Storage</div>
          </div>
          <div data-reveal="delay-2">
            <div class="text-2xl font-bold text-primary-600">50+</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Performance Metrics</div>
          </div>
          <div data-reveal="delay-3">
            <div class="text-2xl font-bold text-primary-600">Open Source</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">Self-Host with Docker</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Spacer between sections -->
    <div class="h-3"></div>

    <!-- Tabbed Feature Showcase -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-10">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            See It in Action
          </h2>
          <p class="mt-3 text-lg text-gray-500 dark:text-gray-400">
            Click a tab to explore each area of TradeTally
          </p>
        </div>

        <!-- Tab Pills -->
        <div class="flex flex-wrap justify-center gap-2 mb-10">
          <button
            v-for="tab in featureTabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200"
            :class="activeTab === tab.id
              ? 'bg-primary-600 text-white shadow-md shadow-primary-600/25 scale-105'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab Content -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
          <div class="lg:col-span-3 rounded-xl overflow-hidden shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-all duration-300" data-parallax="-0.06">
            <img
              :key="activeTab"
              :src="currentTab.image"
              :alt="currentTab.alt"
              class="w-full h-auto tab-image-enter"
            />
          </div>
          <div class="lg:col-span-2" :key="activeTab + '-text'">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mb-3"
              :class="currentTab.badgeClass">
              {{ currentTab.badge }}
            </span>
            <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ currentTab.title }}
            </h3>
            <p class="mt-3 text-gray-500 dark:text-gray-400">
              {{ currentTab.description }}
            </p>
            <ul class="mt-5 space-y-3">
              <li v-for="point in currentTab.points" :key="point" class="flex items-start gap-2.5">
                <CheckIcon class="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span class="text-gray-600 dark:text-gray-300 text-sm">{{ point }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <div class="h-3"></div>

    <!-- Feature Card Grid -->
    <section class="bg-white dark:bg-gray-800 py-16 sm:py-20 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-reveal class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            Full Feature Breakdown
          </h2>
          <p class="mt-3 text-lg text-gray-500 dark:text-gray-400">
            From trade import to advanced analytics, everything is included
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="(feature, index) in features" :key="feature.title"
            :data-reveal="index % 3 === 1 ? 'delay-1' : index % 3 === 2 ? 'delay-2' : undefined"
            data-reveal-item
            class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50 hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-600 transition-all duration-200">
            <div class="flex items-start gap-4 mb-3">
              <div class="flex-shrink-0 p-2.5 rounded-lg" :class="feature.iconBg">
                <component :is="feature.icon" class="h-5 w-5" :class="feature.iconColor" />
              </div>
              <div>
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider mb-1"
                  :class="feature.badgeClass">
                  {{ feature.badge }}
                </span>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ feature.title }}</h3>
              </div>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="h-3"></div>

    <!-- Advanced Trading Tools -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            Advanced Trading Tools
          </h2>
        </div>

        <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div data-reveal class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-5">Performance Metrics</h3>
            <ul class="space-y-3">
              <li v-for="item in performanceMetrics" :key="item" class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <CheckIcon class="h-4 w-4 text-emerald-500 mr-2.5 flex-shrink-0" />
                {{ item }}
              </li>
            </ul>
          </div>
          <div data-reveal="delay-1" class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-5">R-Multiple & Trade Management</h3>
            <ul class="space-y-3">
              <li v-for="item in rMultipleItems" :key="item" class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <CheckIcon class="h-4 w-4 text-emerald-500 mr-2.5 flex-shrink-0" />
                {{ item }}
              </li>
            </ul>
          </div>
          <div data-reveal="delay-2" class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-5">Trade Analysis</h3>
            <ul class="space-y-3">
              <li v-for="item in tradeAnalysisItems" :key="item" class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                <CheckIcon class="h-4 w-4 text-emerald-500 mr-2.5 flex-shrink-0" />
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <div class="h-3"></div>

    <!-- Self-Hosting Section -->
    <section data-reveal class="bg-white dark:bg-gray-800 py-16 sm:py-20 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-10">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            Cloud or Self-Hosted
          </h2>
          <p class="mt-3 text-lg text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
            TradeTally is fully open source and can be self-hosted with a single Docker command.
            Your data, your server, your rules.
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div data-reveal class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-5 text-center">Cloud (tradetally.io)</h3>
            <ul class="space-y-3">
              <li v-for="item in cloudBenefits" :key="item" class="flex items-start text-sm text-gray-600 dark:text-gray-300">
                <CheckIcon class="h-4 w-4 text-emerald-500 mr-2.5 mt-0.5 flex-shrink-0" />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
          <div data-reveal="delay-1" class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-5 text-center">Self-Hosted (Docker)</h3>
            <ul class="space-y-3">
              <li v-for="(item, i) in selfHostBenefits" :key="i" class="flex items-start text-sm text-gray-600 dark:text-gray-300">
                <component :is="item.warning ? ExclamationTriangleIcon : CheckIcon"
                  :class="item.warning ? 'h-4 w-4 text-yellow-500 mr-2.5 mt-0.5 flex-shrink-0' : 'h-4 w-4 text-emerald-500 mr-2.5 mt-0.5 flex-shrink-0'" />
                <span>{{ item.text }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <div class="h-3"></div>

    <!-- CTA -->
    <section data-reveal class="bg-gradient-to-br from-primary-600 to-primary-800 py-16 sm:py-20">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-extrabold text-white">
          Ready to Elevate Your Trading?
        </h2>
        <p class="mt-4 text-lg text-primary-100">
          Join traders using TradeTally to improve their performance.
        </p>
        <router-link to="/register" class="mt-8 inline-flex items-center bg-white text-primary-700 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors">
          Start Free Today
          <ArrowRightIcon class="ml-2 h-5 w-5" />
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, markRaw } from 'vue'
import {
  ArrowUpTrayIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ShareIcon,
  CalendarIcon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  CodeBracketIcon,
  ArrowRightIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  FunnelIcon,
  BellAlertIcon,
  NewspaperIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  CalculatorIcon,
  ShieldCheckIcon
} from '@heroicons/vue/24/outline'
import { useScrollReveal } from '@/composables/useScrollReveal'

useScrollReveal()

const activeTab = ref('dashboard')

const featureTabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'journal', label: 'Trading Journal' },
  { id: 'trade-mgmt', label: 'Trade Management' },
  { id: 'stock-analyzer', label: 'Stock Analyzer' }
]

const tabContent = {
  dashboard: {
    image: '/images/screenshot-dashboard.png',
    alt: 'TradeTally Dashboard with P&L charts, win rate, and open positions',
    badge: 'ANALYTICS',
    badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    title: 'Performance Dashboard',
    description: 'See your entire trading performance at a glance. Open positions with live P&L, cumulative charts, win/loss distribution, and key stats all in one view.',
    points: [
      'Cumulative P&L chart with daily breakdown',
      'Win/Loss distribution and win rate tracking',
      'Open positions with real-time market prices',
      'Total P&L, profit factor, average win/loss, max drawdown',
      'Latest news for your held positions'
    ]
  },
  journal: {
    image: '/images/screenshot-journal.png',
    alt: 'TradeTally Trading Journal with daily entries, market bias, and watchlists',
    badge: 'JOURNAL',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    title: 'Daily Trading Journal',
    description: 'Document your trading process with structured entries. Track market bias, key levels, watchlists, and lessons learned for every trading day.',
    points: [
      'Daily entries with market bias (bullish/bearish/neutral)',
      'Key levels and watchlist tracking per session',
      'Tags, linked trades, and plan adherence tracking',
      'Lessons learned and post-market reflections',
      'AI-powered analysis of your journal entries'
    ]
  },
  'trade-mgmt': {
    image: '/images/screenshot-trade-management.png',
    alt: 'TradeTally Trade Management with R-Multiple performance chart',
    badge: 'RISK MANAGEMENT',
    badgeClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    title: 'R-Multiple Trade Analysis',
    description: 'Measure execution quality with R-Multiple analysis. Compare actual performance vs. target, track management R, and visualize cumulative R performance.',
    points: [
      'Actual R, Target R, and Management R tracking',
      'Cumulative R-Performance chart across all trades',
      'Individual trade analysis with candlestick charts',
      'Stop loss and take profit management',
      'R left on table analysis for trade improvement'
    ]
  },
  'stock-analyzer': {
    image: '/images/screenshot-stock-analyzer.png',
    alt: 'TradeTally Stock Analyzer with DCF valuation calculator',
    badge: 'INVESTMENTS',
    badgeClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    title: 'DCF Valuation Calculator',
    description: 'Go beyond trade tracking. Analyze any stock with historical financial data and calculate fair value using Discounted Cash Flow with Bear/Base/Bull scenarios.',
    points: [
      'Historical ROIC, revenue growth, margins, and FCF',
      'Bear / Base / Bull scenario modeling',
      'Margin of safety calculation vs. current price',
      '8 Pillars value investing pass/fail grading',
      'Save and compare multiple valuations'
    ]
  }
}

const currentTab = computed(() => tabContent[activeTab.value])

const badgeStyles = {
  import: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  analytics: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  journal: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  community: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
  tools: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  invest: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  data: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  ai: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
}

const iconBgMap = {
  import: 'bg-blue-50 dark:bg-blue-900/20',
  analytics: 'bg-purple-50 dark:bg-purple-900/20',
  journal: 'bg-emerald-50 dark:bg-emerald-900/20',
  community: 'bg-pink-50 dark:bg-pink-900/20',
  tools: 'bg-amber-50 dark:bg-amber-900/20',
  invest: 'bg-teal-50 dark:bg-teal-900/20',
  data: 'bg-gray-50 dark:bg-gray-800',
  ai: 'bg-violet-50 dark:bg-violet-900/20'
}

const iconColorMap = {
  import: 'text-blue-600 dark:text-blue-400',
  analytics: 'text-purple-600 dark:text-purple-400',
  journal: 'text-emerald-600 dark:text-emerald-400',
  community: 'text-pink-600 dark:text-pink-400',
  tools: 'text-amber-600 dark:text-amber-400',
  invest: 'text-teal-600 dark:text-teal-400',
  data: 'text-gray-600 dark:text-gray-400',
  ai: 'text-violet-600 dark:text-violet-400'
}

const features = [
  {
    icon: markRaw(ArrowUpTrayIcon),
    badge: 'IMPORT',
    badgeClass: badgeStyles.import,
    iconBg: iconBgMap.import,
    iconColor: iconColorMap.import,
    title: 'Universal Trade Import',
    description: 'Auto-sync with Schwab/ThinkorSwim and IBKR. CSV import from Lightspeed, Webull, TradingView, TradeStation, Tradovate, Questrade, and more. Custom CSV column mapping for any broker.'
  },
  {
    icon: markRaw(ChartBarIcon),
    badge: 'ANALYTICS',
    badgeClass: badgeStyles.analytics,
    iconBg: iconBgMap.analytics,
    iconColor: iconColorMap.analytics,
    title: 'Advanced Analytics',
    description: 'Sharpe ratio, Kelly criterion, SQN, K-ratio, MAE/MFE analysis. Comprehensive P&L tracking, win rate calculation, and risk-adjusted returns.'
  },
  {
    icon: markRaw(DocumentTextIcon),
    badge: 'JOURNAL',
    badgeClass: badgeStyles.journal,
    iconBg: iconBgMap.journal,
    iconColor: iconColorMap.journal,
    title: 'Detailed Trade Journal',
    description: 'Add notes, tags, and screenshots to every trade. Build a comprehensive record of your trading decisions and learnings with markdown support.'
  },
  {
    icon: markRaw(ShareIcon),
    badge: 'COMMUNITY',
    badgeClass: badgeStyles.community,
    iconBg: iconBgMap.community,
    iconColor: iconColorMap.community,
    title: 'Public Trade Sharing',
    description: 'Share successful trades with the community. Get feedback, discuss strategies, and learn from other traders on the public leaderboard.'
  },
  {
    icon: markRaw(CalendarIcon),
    badge: 'ANALYTICS',
    badgeClass: badgeStyles.analytics,
    iconBg: iconBgMap.analytics,
    iconColor: iconColorMap.analytics,
    title: 'Calendar View',
    description: 'Visual calendar showing daily P&L at a glance. Quickly identify profitable and losing days in your trading month.'
  },
  {
    icon: markRaw(MagnifyingGlassIcon),
    badge: 'INVEST',
    badgeClass: badgeStyles.invest,
    iconBg: iconBgMap.invest,
    iconColor: iconColorMap.invest,
    title: '8 Pillars Stock Analyzer',
    description: 'Evaluate any stock against 8 value investing pillars: P/E ratio, ROIC, share buybacks, cash flow growth, net income growth, revenue growth, debt coverage, and price-to-FCF.'
  },
  {
    icon: markRaw(CurrencyDollarIcon),
    badge: 'INVEST',
    badgeClass: badgeStyles.invest,
    iconBg: iconBgMap.invest,
    iconColor: iconColorMap.invest,
    title: 'Holdings with Real-Time P&L',
    description: 'Track investment positions with live market prices, unrealized P&L, cost basis per lot, and dividend income. Monitor your entire portfolio in real time.'
  },
  {
    icon: markRaw(FunnelIcon),
    badge: 'INVEST',
    badgeClass: badgeStyles.invest,
    iconBg: iconBgMap.invest,
    iconColor: iconColorMap.invest,
    title: 'Russell 2000 Stock Scanner',
    description: 'Quarterly scan of every Russell 2000 stock against the 8 Pillars framework. Filter by specific pillars, sort by P/E or ROIC, and find undervalued small-cap stocks.'
  },
  {
    icon: markRaw(CpuChipIcon),
    badge: 'AI',
    badgeClass: badgeStyles.ai,
    iconBg: iconBgMap.ai,
    iconColor: iconColorMap.ai,
    title: 'AI-Powered Insights',
    description: 'Advanced AI analysis of your trading patterns. Personalized recommendations, behavioral pattern detection, and actionable suggestions to improve performance.'
  },
  {
    icon: markRaw(PresentationChartLineIcon),
    badge: 'ANALYTICS',
    badgeClass: badgeStyles.analytics,
    iconBg: iconBgMap.analytics,
    iconColor: iconColorMap.analytics,
    title: 'Behavioral Analytics',
    description: 'Discover your trading psychology patterns. Track performance by time of day, day of week, hold duration, and identify revenge trading or loss aversion tendencies.'
  },
  {
    icon: markRaw(BellAlertIcon),
    badge: 'TOOLS',
    badgeClass: badgeStyles.tools,
    iconBg: iconBgMap.tools,
    iconColor: iconColorMap.tools,
    title: 'Watchlists & Price Alerts',
    description: 'Create multiple watchlists with live prices. Set price alerts that notify you by email or push notification when a stock hits your target.'
  },
  {
    icon: markRaw(NewspaperIcon),
    badge: 'ANALYTICS',
    badgeClass: badgeStyles.analytics,
    iconBg: iconBgMap.analytics,
    iconColor: iconColorMap.analytics,
    title: 'News Correlation Analytics',
    description: 'Trades are automatically enriched with news from the trade date. See how your win rate correlates with news sentiment and identify which setups work best.'
  },
  {
    icon: markRaw(CalendarDaysIcon),
    badge: 'TOOLS',
    badgeClass: badgeStyles.tools,
    iconBg: iconBgMap.tools,
    iconColor: iconColorMap.tools,
    title: 'Earnings Calendar',
    description: 'See upcoming earnings dates for stocks you hold. Shows EPS estimates, prior-year actuals, and whether the report is before or after market hours.'
  },
  {
    icon: markRaw(DevicePhoneMobileIcon),
    badge: 'TOOLS',
    badgeClass: badgeStyles.tools,
    iconBg: iconBgMap.tools,
    iconColor: iconColorMap.tools,
    title: 'iOS Mobile App',
    description: 'Track your trades on the go with our iOS mobile application. Full sync with your web account for seamless trading journal management.'
  },
  {
    icon: markRaw(ArrowDownTrayIcon),
    badge: 'DATA',
    badgeClass: badgeStyles.data,
    iconBg: iconBgMap.data,
    iconColor: iconColorMap.data,
    title: 'Complete Data Export',
    description: 'Export all your data as JSON or CSV. Perfect for migrating between instances, backups, or custom analysis in your own tools.'
  },
  {
    icon: markRaw(CodeBracketIcon),
    badge: 'DATA',
    badgeClass: badgeStyles.data,
    iconBg: iconBgMap.data,
    iconColor: iconColorMap.data,
    title: 'Developer API',
    description: 'Integrate TradeTally with your trading tools and custom applications using our comprehensive REST API.'
  }
]

const performanceMetrics = [
  'Win rate and profit factor analysis',
  'Average win/loss calculations',
  'Maximum drawdown tracking',
  'Risk/reward ratio analysis',
  'Sharpe ratio and Kelly criterion',
  'SQN and K-ratio metrics'
]

const rMultipleItems = [
  'R-Multiple tracking (net of commissions)',
  'Weighted Target R for multi-target exits',
  'Management R (execution vs. plan)',
  'R-Performance chart with cumulative curves',
  'R left on table analysis'
]

const tradeAnalysisItems = [
  'Symbol performance breakdown',
  'Strategy effectiveness tracking',
  'Time-based performance analysis',
  'MAE/MFE calculations',
  'Trade quality grading (A-F)',
  'Execution analysis per trade'
]

const cloudBenefits = [
  'Sign up and start journaling immediately',
  'All API keys provided (market data, AI, charts)',
  'Automatic updates and backups',
  'Free tier + $8/mo Pro option'
]

const selfHostBenefits = [
  { text: 'All features unlocked, no subscription required' },
  { text: 'Complete data privacy on your own server' },
  { text: 'Full source code access and customization' },
  { text: 'You provide your own API keys for market data, charts, and AI features', warning: true }
]

onMounted(() => {
  document.title = 'Everything You Need to Trade Smarter | TradeTally Features'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Free open-source trading journal and investment tracker. Schwab and IBKR auto-sync, 8 Pillars stock analyzer, real-time holdings P&L, AI insights. Self-host with Docker or use our cloud.')

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

  const existingScript = document.getElementById('features-softwareapp-jsonld')
  if (existingScript) {
    existingScript.remove()
  }

  const script = document.createElement('script')
  script.id = 'features-softwareapp-jsonld'
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
        "description": "AI insights, behavioral analytics, 8 Pillars stock analyzer, DCF valuation, holdings with real-time P&L, Russell 2000 scanner, watchlists, price alerts"
      }
    ],
    "description": "Free open-source trading journal and investment tracker with auto-sync from Schwab and Interactive Brokers. 8 Pillars stock analyzer, real-time holdings P&L, DCF valuation, AI insights, and self-hosting with Docker.",
    "url": "https://tradetally.io",
    "softwareVersion": "2.0",
    "featureList": [
      "Unlimited free trade storage",
      "Auto-sync with Charles Schwab and ThinkorSwim",
      "Auto-sync with Interactive Brokers (IBKR)",
      "CSV import from Lightspeed, Webull, TradingView, TradeStation, Tradovate, Questrade",
      "Custom CSV column mapping for any broker",
      "Stocks, options, forex, and crypto support",
      "AI-powered trading insights and recommendations",
      "Behavioral analytics",
      "8 Pillars value investing stock analysis",
      "DCF valuation calculator",
      "Russell 2000 stock scanner",
      "Holdings tracking with real-time P&L",
      "Watchlists with live prices and price alerts",
      "R-Multiple tracking with Management R",
      "Advanced metrics: Sharpe ratio, Kelly criterion, SQN",
      "MAE/MFE analysis",
      "Public trade sharing",
      "iOS mobile app",
      "Self-hosting with Docker",
      "Open source code on GitHub",
      "Complete data export"
    ],
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
    "isAccessibleForFree": true,
    "license": "https://opensource.org/licenses/MIT"
  })
  document.head.appendChild(script)
})
</script>

<style scoped>
.tab-image-enter {
  animation: tabFadeIn 0.3s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0.4;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
