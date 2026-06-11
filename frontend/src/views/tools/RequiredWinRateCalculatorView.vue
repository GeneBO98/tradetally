<template>
  <ToolPageLayout
    title="Required Win Rate Calculator"
    breadcrumb="Required Win Rate Calculator"
    subtitle="Find the minimum win rate you need at any reward-to-risk ratio. See what win rate makes any strategy profitable, breakeven, or unprofitable."
    cta-metric="actual win rate, R-multiples, and breakeven thresholds"
    :related="related"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Inputs</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reward-to-risk ratio (e.g. 2 means 2:1)</label>
            <input v-model.number="state.rrRatio" type="number" min="0.1" step="0.1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target profit margin (% above breakeven)</label>
            <input v-model.number="state.profitMargin" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">How much edge above pure breakeven you want to require.</p>
          </div>
        </div>

        <h3 class="mt-8 text-base font-bold text-gray-900 dark:text-white mb-3">Reference table</h3>
        <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">R:R</th>
                <th class="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">Breakeven win rate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="row in referenceTable" :key="row.rr" class="text-gray-900 dark:text-gray-100">
                <td class="px-3 py-2">{{ row.rr }} : 1</td>
                <td class="px-3 py-2 text-right font-mono">{{ row.winRate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>
        <div v-if="!isValid" class="text-gray-500 dark:text-gray-400">
          Enter a reward-to-risk ratio greater than 0 to see the required win rate.
        </div>
        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <div class="text-sm font-medium text-primary-700 dark:text-primary-300">Breakeven win rate</div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">{{ breakevenWinRate.toFixed(1) }}%</div>
            <div class="mt-2 text-sm text-primary-700 dark:text-primary-300">
              Win this often at {{ state.rrRatio }}:1 to break even (before fees).
            </div>
          </div>

          <div v-if="state.profitMargin > 0" class="p-5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div class="text-sm font-medium text-green-700 dark:text-green-300">Profitable win rate target</div>
            <div class="mt-1 text-3xl font-extrabold text-gray-900 dark:text-white">{{ targetWinRate.toFixed(1) }}%</div>
            <div class="mt-2 text-sm text-green-700 dark:text-green-300">
              Win at this rate to clear breakeven with a {{ state.profitMargin }}% margin.
            </div>
          </div>

          <dl class="grid grid-cols-1 gap-3">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Loss rate at breakeven</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">{{ (100 - breakevenWinRate).toFixed(1) }}%</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Wins per loss at breakeven</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">{{ winsPerLoss.toFixed(2) }} : 1</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How to Calculate Required Win Rate"
      intro="The breakeven win rate is the percentage of wins you need given a fixed reward-to-risk ratio, ignoring commissions. The relationship is purely mathematical: as R:R goes up, the win rate you need goes down."
      formula="breakeven win rate = 1 ÷ (1 + R:R)"
      :steps="howToSteps"
      example="With a 3:1 reward-to-risk ratio: breakeven win rate = 1 ÷ (1 + 3) = <strong>25%</strong>. You only need to win 1 out of every 4 trades to break even. If your historical win rate is 35%, you have a clear positive edge with this setup."
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

const { state } = useToolFormState('tt:tool:required-win-rate', {
  rrRatio: 2,
  profitMargin: 5
})

const isValid = computed(() => state.rrRatio > 0)
const breakevenWinRate = computed(() => isValid.value ? (1 / (1 + state.rrRatio)) * 100 : 0)
const targetWinRate = computed(() => Math.min(100, breakevenWinRate.value + (state.profitMargin || 0)))
const winsPerLoss = computed(() => isValid.value && breakevenWinRate.value < 100 ? breakevenWinRate.value / (100 - breakevenWinRate.value) : 0)

const referenceTable = [
  { rr: 0.5, winRate: '66.7%' },
  { rr: 1, winRate: '50.0%' },
  { rr: 1.5, winRate: '40.0%' },
  { rr: 2, winRate: '33.3%' },
  { rr: 2.5, winRate: '28.6%' },
  { rr: 3, winRate: '25.0%' },
  { rr: 4, winRate: '20.0%' },
  { rr: 5, winRate: '16.7%' }
]

const howToSteps = [
  { name: 'Identify your typical R:R', text: 'Look at the trades you actually take. Most strategies have a stable, identifiable R:R &mdash; e.g. "I usually risk 1R for a 2R target." Use that number, not an aspirational one.' },
  { name: 'Apply the breakeven formula', text: 'Breakeven win rate = 1 ÷ (1 + R:R). At 2:1, that\'s 33.3%. At 3:1, 25%. At 1:1, 50%. The math is simple but the implications are huge: high-R:R strategies tolerate lower win rates and vice versa.' },
  { name: 'Add a margin for fees and slippage', text: 'Real-world breakeven is a few percentage points higher than the math says. For active traders, add 2–5% on top of the formula\'s answer to account for commissions, spread, and the gap between theoretical and actual fills.' },
  { name: 'Compare to your actual win rate', text: 'If your actual win rate is meaningfully above the required win rate, you have an edge. If it\'s below, the strategy is losing money over time and should be modified, scaled down, or scrapped.' }
]

const faqs = [
  {
    question: 'Why does a 2:1 reward-to-risk ratio only need a 33.3% win rate?',
    answer: 'Because winning trades pay you 2 units while losing trades cost you 1 unit. Over 100 trades: 33 wins × 2 = 66 units gained; 67 losses × 1 = 67 units lost. That\'s essentially even (the exact breakeven is 33.3%, not 33%). Higher R:R lets you tolerate more losing trades.'
  },
  {
    question: 'Should I aim for 50% as a comfort win rate?',
    answer: 'Not necessarily. A 50% win rate at 1:1 is breakeven; at 2:1 it\'s very profitable. Win rate is meaningless without R:R context. Many of the best systematic strategies have 35–45% win rates with 2:1+ ratios.'
  },
  {
    question: 'What if my R:R varies trade to trade?',
    answer: 'Use your weighted average R-multiple instead of a fixed ratio. TradeTally calculates this automatically: it weights each trade by actual outcome and shows you both your average target R and your average realized R. The gap between the two reveals how often you\'re hitting full targets.'
  },
  {
    question: 'How much margin should I add for commissions?',
    answer: 'For typical retail brokers offering free stock commissions, add ~1–2% to account for spread/slippage. For futures or options with per-contract fees, add 3–5%. For high-frequency strategies, fees can require an additional 5–10% margin.'
  },
  {
    question: 'How is this different from expectancy?',
    answer: 'Required win rate tells you the threshold needed for breakeven. Expectancy tells you the actual dollar value of each trade given your real win rate. Use this calculator to set the bar; use the <a href="/tools/trade-expectancy-calculator" class="text-primary-600 dark:text-primary-400 hover:underline">expectancy calculator</a> to see how far over the bar you actually are.'
  }
]

const related = [
  { slug: 'risk-reward-calculator', title: 'Risk/Reward Calculator', description: 'Find R:R for any specific trade setup.' },
  { slug: 'trade-expectancy-calculator', title: 'Trade Expectancy Calculator', description: 'Combine win rate and R:R into expected value.' },
  { slug: 'position-size-calculator', title: 'Position Size Calculator', description: 'Convert your edge into shares to buy.' }
]

useToolMeta({
  title: 'Required Win Rate Calculator',
  description: 'Free required win rate calculator. Find the minimum win rate you need at any reward-to-risk ratio to break even or be profitable.',
  canonical: 'https://tradetally.io/tools/required-win-rate-calculator'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'Required Win Rate Calculator',
    description: 'Free win rate calculator for traders.',
    url: 'https://tradetally.io/tools/required-win-rate-calculator'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Required Win Rate',
    description: 'Find the breakeven win rate for any reward-to-risk ratio.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
