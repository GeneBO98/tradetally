<template>
  <div class="bg-gray-50 dark:bg-gray-950 min-h-screen">
    <section class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="content-wrapper py-14 sm:py-20 text-center">
        <h1 class="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Free Trader Tools and Calculators
        </h1>
        <p class="mt-5 text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Free calculators for active traders. Position sizing, risk/reward, expectancy, win rate, dollar-cost averaging, and historical investment returns. No signup required.
        </p>
      </div>
    </section>

    <div class="content-wrapper py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <router-link
          v-for="tool in tools"
          :key="tool.slug"
          :to="`/tools/${tool.slug}`"
          class="group block p-6 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all"
        >
          <div class="flex items-center justify-center w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 mb-4">
            <component :is="tool.icon" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
            {{ tool.title }}
          </h2>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {{ tool.description }}
          </p>
          <div class="mt-4 inline-flex items-center text-sm font-semibold text-primary-600 dark:text-primary-400">
            Open calculator
            <svg class="ml-1 w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </router-link>
      </div>

      <div class="mt-14 p-8 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">Why use these tools?</h2>
        <p class="text-gray-600 dark:text-gray-400 leading-relaxed max-w-3xl">
          Every consistently profitable trader runs the same calculations on every trade: how many shares to buy at a given risk, what the reward-to-risk ratio is, and what their long-term expectancy looks like. These free calculators do that math instantly. When you're ready to track results across hundreds of trades and see your real edge, <router-link to="/register" class="text-primary-600 dark:text-primary-400 hover:underline font-medium">create a free TradeTally account</router-link> &mdash; the journal does it automatically.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { h } from 'vue'
import { useToolMeta } from '@/composables/useToolMeta'
import { useStructuredData } from '@/composables/useStructuredData'

const PositionIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z' })])
const RatioIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' })])
const ChartIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' })])
const TargetIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' }), h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' })])
const TrendIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' })])
const HistoryIcon = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': 2, d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' })])

const tools = [
  {
    slug: 'position-size-calculator',
    title: 'Position Size Calculator',
    description: 'Calculate exactly how many shares to buy based on your account size, risk tolerance, and stop-loss placement. The single most important calculation in risk management.',
    icon: PositionIcon
  },
  {
    slug: 'risk-reward-calculator',
    title: 'Risk/Reward Calculator',
    description: 'Calculate the risk-to-reward ratio for any trade setup. Enter your entry, stop, and target to see your R:R and the win rate needed to break even.',
    icon: RatioIcon
  },
  {
    slug: 'trade-expectancy-calculator',
    title: 'Trade Expectancy Calculator',
    description: 'Find out the expected dollar value of your trading edge. Combines win rate, average win, and average loss into a single number you can compound.',
    icon: ChartIcon
  },
  {
    slug: 'required-win-rate-calculator',
    title: 'Required Win Rate Calculator',
    description: 'Given your reward-to-risk ratio, find the minimum win rate you need to break even &mdash; or the win rate that would make a strategy profitable.',
    icon: TargetIcon
  },
  {
    slug: 'average-down-calculator',
    title: 'Average Down / DCA Calculator',
    description: 'Calculate your blended cost basis after multiple buys. See your new breakeven price and how much your average changes with each additional lot.',
    icon: TrendIcon
  },
  {
    slug: 'what-if-i-invested',
    title: 'What If I Invested?',
    description: 'See what an investment in any stock would be worth today. Enter a symbol, dollar amount, and historical date to find the total return and current value.',
    icon: HistoryIcon
  }
]

useToolMeta({
  title: 'Free Trader Tools and Calculators',
  description: 'Free position size, risk/reward, expectancy, win rate, DCA, and historical return calculators for active traders. No signup required.',
  canonical: 'https://tradetally.io/tools'
})

useStructuredData({
  itemList: {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Free Trader Tools and Calculators',
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://tradetally.io/tools/${t.slug}`,
      name: t.title
    }))
  }
})
</script>
