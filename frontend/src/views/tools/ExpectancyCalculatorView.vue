<template>
  <ToolPageLayout
    title="Trade Expectancy Calculator"
    breadcrumb="Trade Expectancy Calculator"
    subtitle="Find the expected dollar value of your trading edge. Combines win rate, average win, and average loss into a single number that tells you if your strategy is profitable."
    cta-metric="expectancy, win rate, average R, and per-trade edge"
    :related="related"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Inputs</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Win rate (%)</label>
            <input v-model.number="state.winRate" type="number" min="0" max="100" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Average winning trade ($)</label>
            <input v-model.number="state.avgWin" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Average losing trade ($)</label>
            <input v-model.number="state.avgLoss" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Enter as a positive number.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trades per month (optional)</label>
            <input v-model.number="state.tradesPerMonth" type="number" min="0" step="1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Projects monthly and annual P&amp;L.</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>
        <div v-if="!isValid" class="text-gray-500 dark:text-gray-400">
          Enter your win rate, average win, and average loss to see your expectancy.
        </div>
        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg" :class="expectancy >= 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'">
            <div class="text-sm font-medium" :class="expectancy >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">Expectancy per trade</div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">
              {{ expectancy >= 0 ? '+' : '' }}${{ formatMoney(expectancy) }}
            </div>
            <div class="mt-2 text-sm" :class="expectancy >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
              {{ expectancyLabel }}
            </div>
          </div>
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Reward-to-risk ratio</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ rrRatio.toFixed(2) }} : 1</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Breakeven win rate</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ breakevenWinRate.toFixed(1) }}%</dd>
            </div>
            <div v-if="state.tradesPerMonth > 0">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Expected monthly</dt>
              <dd class="text-lg font-semibold" :class="monthly >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                {{ monthly >= 0 ? '+' : '' }}${{ formatMoney(monthly) }}
              </dd>
            </div>
            <div v-if="state.tradesPerMonth > 0">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Expected annual</dt>
              <dd class="text-lg font-semibold" :class="annual >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                {{ annual >= 0 ? '+' : '' }}${{ formatMoney(annual) }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How to Calculate Trade Expectancy"
      intro="Expectancy is what you expect to earn (or lose) per trade on average. It combines win rate with the size of your wins and losses into a single number &mdash; positive means a profitable edge, negative means a losing strategy."
      formula="expectancy = (win % × avg win) − (loss % × avg loss)"
      :steps="howToSteps"
      example="Win rate 45%, average win $300, average loss $200. Expectancy = (0.45 × $300) − (0.55 × $200) = $135 − $110 = <strong>+$25 per trade</strong>. Over 200 trades a year, that's a $5,000 expected profit. Even though you lose more often than you win, the larger wins make the strategy profitable."
    />

    <ToolFAQ :faqs="faqs" />
  </ToolPageLayout>
</template>

<script setup>
import { computed } from 'vue'
import ToolPageLayout from '@/components/tools/ToolPageLayout.vue'
import ToolHowTo from '@/components/tools/ToolHowTo.vue'
import ToolFAQ from '@/components/tools/ToolFAQ.vue'
import { useToolMeta } from '@/composables/useToolMeta'
import { useStructuredData, buildHowToSchema, buildFAQSchema, buildCalculatorSchema } from '@/composables/useStructuredData'
import { useToolFormState } from '@/composables/useToolFormState'

const { state } = useToolFormState('tt:tool:expectancy', {
  winRate: 45,
  avgWin: 300,
  avgLoss: 200,
  tradesPerMonth: 20
})

const isValid = computed(() => {
  return state.winRate >= 0 && state.winRate <= 100 &&
    state.avgWin > 0 && state.avgLoss > 0
})

const winProb = computed(() => state.winRate / 100)
const lossProb = computed(() => 1 - winProb.value)
const expectancy = computed(() => isValid.value ? (winProb.value * state.avgWin) - (lossProb.value * state.avgLoss) : 0)
const rrRatio = computed(() => state.avgLoss > 0 ? state.avgWin / state.avgLoss : 0)
const breakevenWinRate = computed(() => rrRatio.value > 0 ? (1 / (1 + rrRatio.value)) * 100 : 0)
const monthly = computed(() => expectancy.value * (state.tradesPerMonth || 0))
const annual = computed(() => monthly.value * 12)

const expectancyLabel = computed(() => {
  if (expectancy.value > 50) return 'Strong positive edge &mdash; this is a real strategy'
  if (expectancy.value > 0) return 'Positive expectancy &mdash; profitable over time'
  if (expectancy.value === 0) return 'Breakeven &mdash; you make and lose the same on average'
  return 'Negative expectancy &mdash; this strategy will lose money over time'
})

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const howToSteps = [
  { name: 'Get an honest win rate', text: 'Use at least 30 trades of real data, ideally 50+. Demo trading and short samples produce inflated win rates that don\'t hold up live. The more trades, the more reliable the number.' },
  { name: 'Calculate average win', text: 'Sum the dollar amount of every winning trade and divide by the number of wins. Don\'t exclude outliers &mdash; they are part of your strategy.' },
  { name: 'Calculate average loss', text: 'Sum the dollar amount of every losing trade (as positive numbers) and divide by the number of losses. Include scratches and small losses.' },
  { name: 'Plug into the formula', text: 'Expectancy = (win % × avg win) − (loss % × avg loss). A positive result means each trade has positive expected value. Multiply by your trade frequency to estimate monthly and annual P&L.' }
]

const faqs = [
  {
    question: 'Why does expectancy matter more than win rate?',
    answer: 'A trader with a 70% win rate can be unprofitable if their average loss is much larger than their average win. A trader with a 35% win rate can be very profitable if their average win is 3x their average loss. Expectancy is the only number that ties win rate, win size, and loss size together &mdash; it tells you the truth about your edge.'
  },
  {
    question: 'How many trades do I need to trust my expectancy number?',
    answer: 'At least 30 trades for a rough sense, 50+ for moderate confidence, 100+ to start trusting it for position sizing decisions. Sample size matters: a 60% win rate over 10 trades is statistically meaningless, but the same rate over 100 is starting to be a real signal.'
  },
  {
    question: 'Can a trader with negative expectancy ever be profitable?',
    answer: 'In the short term, yes &mdash; variance can produce profitable streaks. Over enough trades, no. Negative expectancy means each trade has a negative expected value, and the law of large numbers will eventually catch up. Find what\'s pulling expectancy down (oversized losses? cutting winners short?) and fix that before scaling up.'
  },
  {
    question: 'What is a "good" expectancy?',
    answer: 'Expectancy is most usefully expressed in R-multiples (multiples of risk) rather than dollars. A common benchmark: 0.2R is acceptable, 0.5R is solid, 1.0R+ is excellent. So if you risk $200 per trade, an expectancy of $100 (0.5R) is a healthy edge.'
  },
  {
    question: 'Should I include commissions in my averages?',
    answer: 'Yes &mdash; always include all costs in your win and loss amounts. Net P&L is the only number that matters. Commissions can quietly turn a positive-expectancy strategy negative, especially for high-frequency traders.'
  },
  {
    question: 'How does TradeTally calculate this for me?',
    answer: 'TradeTally tracks your win rate, average win, average loss, and full expectancy automatically as you log trades. It also breaks expectancy down by symbol, strategy, day of week, and account &mdash; so you can spot which slices of your trading are actually profitable and which are dragging the average down.'
  }
]

const related = [
  { slug: 'risk-reward-calculator', title: 'Risk/Reward Calculator', description: 'See the R:R ratio of any individual trade.' },
  { slug: 'required-win-rate-calculator', title: 'Required Win Rate Calculator', description: 'Minimum win rate to break even at any R:R.' },
  { slug: 'position-size-calculator', title: 'Position Size Calculator', description: 'Translate your edge into shares per trade.' }
]

useToolMeta({
  title: 'Trade Expectancy Calculator',
  description: 'Free trade expectancy calculator. Enter your win rate, average win, and average loss to see your expected dollar value per trade and projected monthly P&L.',
  canonical: 'https://tradetally.io/tools/trade-expectancy-calculator'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'Trade Expectancy Calculator',
    description: 'Free trade expectancy calculator for traders.',
    url: 'https://tradetally.io/tools/trade-expectancy-calculator'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Trade Expectancy',
    description: 'Combine win rate, average win, and average loss into a per-trade expectancy.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
