<template>
  <ToolPageLayout
    title="Risk/Reward Calculator"
    breadcrumb="Risk/Reward Calculator"
    subtitle="Calculate the reward-to-risk ratio for any trade. Enter your entry, stop, and target to see your R-multiple and the win rate needed to break even."
    cta-metric="risk/reward, R-multiples, and target hit rate"
    :related="related"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Inputs</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Direction</label>
            <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
              <button type="button" @click="state.direction = 'long'" :class="state.direction === 'long' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 text-sm font-medium">Long</button>
              <button type="button" @click="state.direction = 'short'" :class="state.direction === 'short' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'" class="px-4 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-700">Short</button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry price ($)</label>
            <input v-model.number="state.entry" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stop-loss price ($)</label>
            <input v-model.number="state.stop" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target price ($)</label>
            <input v-model.number="state.target" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shares (optional)</label>
            <input v-model.number="state.shares" type="number" min="0" step="1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Adds total risk and reward in dollars.</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>
        <div v-if="!isValid" class="text-gray-500 dark:text-gray-400">
          Enter your entry, stop, and target to see the risk/reward ratio.
        </div>
        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <div class="text-sm font-medium text-primary-700 dark:text-primary-300">Reward-to-risk ratio</div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">{{ rrRatio.toFixed(2) }} : 1</div>
            <div class="mt-2 text-sm" :class="rrQualityClass">{{ rrQualityLabel }}</div>
          </div>
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Risk per share</dt>
              <dd class="text-lg font-semibold text-red-600 dark:text-red-400">${{ formatMoney(riskPerShare) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Reward per share</dt>
              <dd class="text-lg font-semibold text-green-600 dark:text-green-400">${{ formatMoney(rewardPerShare) }}</dd>
            </div>
            <div v-if="state.shares > 0">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total risk</dt>
              <dd class="text-lg font-semibold text-red-600 dark:text-red-400">${{ formatMoney(totalRisk) }}</dd>
            </div>
            <div v-if="state.shares > 0">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total reward</dt>
              <dd class="text-lg font-semibold text-green-600 dark:text-green-400">${{ formatMoney(totalReward) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Breakeven win rate</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ breakevenWinRate.toFixed(1) }}%</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Risk %</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ riskPercent.toFixed(2) }}%</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How to Calculate Risk/Reward Ratio"
      intro="Risk/reward (R:R) is the ratio between how much you stand to make if a trade hits your target versus how much you'll lose if it hits your stop. A 2:1 ratio means you make $2 for every $1 risked."
      formula="R:R = (target − entry) ÷ (entry − stop)    ←  for long trades"
      :steps="howToSteps"
      example="Entry $100, stop $95, target $115. Risk per share = $100 − $95 = $5. Reward per share = $115 − $100 = $15. R:R = $15 ÷ $5 = <strong>3:1</strong>. With a 3:1 ratio, you only need to win 25% of the time to break even &mdash; meaning you can be wrong 3 trades for every 1 winner and still come out flat."
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

const { state } = useToolFormState('tt:tool:risk-reward', {
  direction: 'long',
  entry: 100,
  stop: 95,
  target: 115,
  shares: 100
})

const isValid = computed(() => {
  if (!(state.entry > 0 && state.stop > 0 && state.target > 0)) return false
  if (state.direction === 'long') return state.stop < state.entry && state.target > state.entry
  return state.stop > state.entry && state.target < state.entry
})

const riskPerShare = computed(() => Math.abs(state.entry - state.stop))
const rewardPerShare = computed(() => Math.abs(state.target - state.entry))
const rrRatio = computed(() => isValid.value && riskPerShare.value > 0 ? rewardPerShare.value / riskPerShare.value : 0)
const totalRisk = computed(() => riskPerShare.value * (state.shares || 0))
const totalReward = computed(() => rewardPerShare.value * (state.shares || 0))
const breakevenWinRate = computed(() => isValid.value ? (1 / (1 + rrRatio.value)) * 100 : 0)
const riskPercent = computed(() => state.entry > 0 ? (riskPerShare.value / state.entry) * 100 : 0)

const rrQualityClass = computed(() => {
  if (rrRatio.value >= 3) return 'text-green-600 dark:text-green-400 font-medium'
  if (rrRatio.value >= 2) return 'text-primary-600 dark:text-primary-400 font-medium'
  if (rrRatio.value >= 1) return 'text-yellow-600 dark:text-yellow-400 font-medium'
  return 'text-red-600 dark:text-red-400 font-medium'
})
const rrQualityLabel = computed(() => {
  if (rrRatio.value >= 3) return 'Excellent &mdash; favorable asymmetric setup'
  if (rrRatio.value >= 2) return 'Solid &mdash; the minimum most traders accept'
  if (rrRatio.value >= 1) return 'Marginal &mdash; needs a high win rate to be profitable'
  return 'Unfavorable &mdash; you risk more than you stand to gain'
})

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const howToSteps = [
  { name: 'Define entry, stop, and target before entering', text: 'A real R:R calculation only works if all three levels are decided before the trade. Setting them after entry &mdash; or worse, moving them mid-trade &mdash; defeats the discipline of the calculation.' },
  { name: 'Calculate risk per share', text: 'For longs: entry − stop. For shorts: stop − entry. Use the absolute value to avoid negative numbers.' },
  { name: 'Calculate reward per share', text: 'For longs: target − entry. For shorts: entry − target. Again, use the absolute distance.' },
  { name: 'Divide reward by risk', text: 'R:R = reward per share ÷ risk per share. A result of 2 means 2:1, 3 means 3:1, and so on. Most professional traders look for 2:1 or better &mdash; and many require 3:1 to take the trade.' },
  { name: 'Cross-check against your win rate', text: 'A 2:1 setup needs at least a 33.3% win rate to break even. A 3:1 setup needs only 25%. If your historical win rate is higher than the breakeven rate for your typical R:R, you have a positive expectancy edge.' }
]

const faqs = [
  {
    question: 'What is a good risk/reward ratio?',
    answer: 'Most professional traders set a minimum threshold of 2:1, meaning they only take trades where the potential reward is at least twice the risk. Many discretionary traders look for 3:1 or higher. Below 1:1, you need an extremely high win rate to be profitable, which is hard to maintain consistently.'
  },
  {
    question: 'How does R:R relate to win rate?',
    answer: 'They\'re inversely related: the higher your R:R, the lower the win rate you need to break even. The breakeven formula is: <code>1 ÷ (1 + R:R)</code>. So 1:1 needs 50%, 2:1 needs 33.3%, 3:1 needs 25%, 4:1 needs 20%. Knowing your historical win rate tells you the minimum R:R that makes a strategy viable.'
  },
  {
    question: 'Should I always wait for high-R:R setups?',
    answer: 'Not necessarily. A high-R:R setup is only valuable if you actually hit the target consistently. A 5:1 setup that fails 90% of the time is worse than a 2:1 setup that wins 60% of the time. The combination of R:R and win rate &mdash; called expectancy &mdash; is what matters.'
  },
  {
    question: 'How do I count partial exits in R:R?',
    answer: 'For partial exits, calculate the weighted-average R achieved. If you exit 50% at 1R and let the rest run to 3R, your weighted R is (0.5 × 1) + (0.5 × 3) = 2R. TradeTally calculates this automatically as "weighted target R" on every trade.'
  },
  {
    question: 'Why does my actual P&L not match the calculator?',
    answer: 'Real-world P&L includes commissions, slippage, and the fact that prices rarely fill exactly at your stop or target. The calculator gives you the theoretical R:R; logging real fills in a journal shows what you actually capture. The gap between the two is one of the most useful things to track.'
  }
]

const related = [
  { slug: 'position-size-calculator', title: 'Position Size Calculator', description: 'Find how many shares to buy at your risk %.' },
  { slug: 'required-win-rate-calculator', title: 'Required Win Rate Calculator', description: 'See the minimum win rate for any R:R.' },
  { slug: 'trade-expectancy-calculator', title: 'Trade Expectancy Calculator', description: 'Combine win rate and R:R into expected value.' }
]

useToolMeta({
  title: 'Risk/Reward Ratio Calculator',
  description: 'Free risk/reward calculator. Enter entry, stop, and target prices to see your R:R ratio and the breakeven win rate. Works for long and short trades.',
  canonical: 'https://tradetally.io/tools/risk-reward-calculator'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'Risk/Reward Calculator',
    description: 'Free risk/reward ratio calculator for stock traders.',
    url: 'https://tradetally.io/tools/risk-reward-calculator'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Risk/Reward Ratio',
    description: 'Calculate the reward-to-risk ratio of a trade and the win rate needed to break even.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
