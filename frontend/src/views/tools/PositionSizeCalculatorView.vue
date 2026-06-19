<template>
  <ToolPageLayout
    title="Position Size Calculator"
    breadcrumb="Position Size Calculator"
    subtitle="Calculate how many shares to buy on any trade based on your account size, risk tolerance, and stop-loss distance. Free, instant, no signup required."
    cta-metric="position size, risk per trade, R-multiple, and account drawdown"
    :related="related"
  >
    <!-- Calculator -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Inputs</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account size ($)</label>
            <input v-model.number="accountSize" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Risk per trade (%)</label>
            <input v-model.number="riskPercent" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Most professional traders risk 0.5% to 2% per trade.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry price ($)</label>
            <input v-model.number="entryPrice" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stop-loss price ($)</label>
            <input v-model.number="stopPrice" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>
        <div v-if="!isValid" class="text-gray-500 dark:text-gray-400">
          Enter your account size, risk %, entry, and stop-loss to see the recommended position size.
        </div>
        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <div class="text-sm font-medium text-primary-700 dark:text-primary-300">Shares to buy</div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">{{ shares.toLocaleString() }}</div>
          </div>
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total position</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatMoney(positionValue) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Risk amount</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatMoney(riskAmount) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Risk per share</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatMoney(riskPerShare) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">% of account</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ percentOfAccount.toFixed(1) }}%</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How to Calculate Position Size"
      intro="Position sizing is a two-step calculation. First, decide how much money you're willing to lose if the trade hits your stop. Second, divide that risk by the per-share loss to get the number of shares."
      formula="shares = (account size × risk %) ÷ (entry price − stop price)"
      :steps="howToSteps"
      example="Account size $50,000. Risk 1% per trade ($500). Entry $100, stop $95 (per-share risk $5). Shares = $500 ÷ $5 = <strong>100 shares</strong>. Total position = $10,000 (20% of account). If the trade hits the stop, you lose exactly $500 &mdash; your predefined 1% risk."
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

const { state } = useToolFormState('tt:tool:position-size', {
  accountSize: 50000,
  riskPercent: 1,
  entryPrice: 100,
  stopPrice: 95
})

const accountSize = computed({ get: () => state.accountSize, set: v => state.accountSize = v })
const riskPercent = computed({ get: () => state.riskPercent, set: v => state.riskPercent = v })
const entryPrice = computed({ get: () => state.entryPrice, set: v => state.entryPrice = v })
const stopPrice = computed({ get: () => state.stopPrice, set: v => state.stopPrice = v })

const isValid = computed(() => {
  return accountSize.value > 0 &&
    riskPercent.value > 0 &&
    entryPrice.value > 0 &&
    stopPrice.value > 0 &&
    entryPrice.value !== stopPrice.value
})

const riskPerShare = computed(() => Math.abs(entryPrice.value - stopPrice.value))
const riskAmount = computed(() => accountSize.value * (riskPercent.value / 100))
const shares = computed(() => isValid.value ? Math.floor(riskAmount.value / riskPerShare.value) : 0)
const positionValue = computed(() => shares.value * entryPrice.value)
const percentOfAccount = computed(() => accountSize.value > 0 ? (positionValue.value / accountSize.value) * 100 : 0)

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const howToSteps = [
  { name: 'Pick your risk percentage', text: 'Decide what percentage of your account you are willing to lose on this single trade. Most professional traders use 0.5% to 2%. Risking more than 2% on one trade gives you very few losing trades before you have a serious drawdown.' },
  { name: 'Calculate dollar risk', text: 'Multiply account size × risk %. With a $50,000 account and 1% risk, your dollar risk is $500. This is the maximum loss you accept on this trade.' },
  { name: 'Find risk per share', text: 'Subtract your stop-loss price from your entry price (for longs). If you enter at $100 and stop at $95, you risk $5 per share.' },
  { name: 'Divide to get share count', text: 'Divide dollar risk by per-share risk: $500 ÷ $5 = 100 shares. Round down so you never exceed your intended risk.' }
]

const faqs = [
  {
    question: 'Why is position sizing more important than picking good trades?',
    answer: 'A trader with a 50% win rate and disciplined position sizing usually outperforms a trader with a 70% win rate and inconsistent sizing. Position size determines how big each loss is in dollar terms &mdash; and a string of losses with oversized positions is what blows up most accounts.'
  },
  {
    question: 'What risk percentage should I use per trade?',
    answer: 'Most full-time traders risk 0.5% to 1% per trade. New traders often start at 0.25% to 0.5% while building data. Risking 2% or more is aggressive and assumes you have proven, tested setups. The math: with 2% risk per trade, ten consecutive losses (which happens) draws your account down ~18%.'
  },
  {
    question: 'Does this work for short trades?',
    answer: 'Yes. The calculator uses the absolute distance between entry and stop, so it works whether you enter long (stop below) or short (stop above). For shorts, your stop is higher than your entry &mdash; the per-share risk is calculated the same way.'
  },
  {
    question: 'Should I include commissions and slippage?',
    answer: 'For typical retail commissions (often $0), no. If you trade through a high-cost broker or in instruments with wide spreads, add an estimated round-trip cost to the per-share risk: <code>(entry − stop) + slippage_per_share</code>. This makes the calculation slightly more conservative.'
  },
  {
    question: 'What if my position size is too large to actually buy?',
    answer: 'If the calculated position exceeds your buying power or you would not be comfortable with the size, your stop is too tight relative to your risk percentage. You can either move the stop wider (reducing share count) or accept a smaller risk %. Never increase your risk % just to make a trade fit.'
  },
  {
    question: 'How does TradeTally use this?',
    answer: 'When you log trades in TradeTally, the journal tracks your actual risk per trade, R-multiple distribution, and how disciplined your position sizing has been over time. You can spot patterns like "I size up after a loss and that costs me X dollars per year" &mdash; insights that come from real journaled data, not theoretical calculations.'
  }
]

const related = [
  { slug: 'risk-reward-calculator', title: 'Risk/Reward Calculator', description: 'Find your R:R ratio and breakeven win rate.' },
  { slug: 'required-win-rate-calculator', title: 'Required Win Rate Calculator', description: 'How often you need to win to be profitable.' },
  { slug: 'trade-expectancy-calculator', title: 'Trade Expectancy Calculator', description: 'Calculate the expected dollar value of your edge.' }
]

useToolMeta({
  title: 'Position Size Calculator',
  description: 'Free position size calculator for traders. Enter account size, risk %, entry, and stop-loss to find exactly how many shares to buy on any trade.',
  canonical: 'https://tradetally.io/tools/position-size-calculator'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'Position Size Calculator',
    description: 'Free position size calculator for stock traders.',
    url: 'https://tradetally.io/tools/position-size-calculator'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Position Size',
    description: 'Calculate the correct number of shares to buy based on account size, risk tolerance, and stop-loss distance.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
