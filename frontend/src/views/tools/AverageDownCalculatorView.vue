<template>
  <ToolPageLayout
    title="Average Down / DCA Calculator"
    breadcrumb="Average Down / DCA Calculator"
    subtitle="Calculate your blended cost basis when you buy a stock at multiple prices. See your new breakeven price, total shares, and how much each lot moves your average."
    cta-metric="cost basis, average price, and breakeven for every position"
    :related="related"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">Buy lots</h2>
          <button
            type="button"
            @click="addLot"
            class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            + Add Lot
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="(lot, idx) in state.lots"
            :key="idx"
            class="grid grid-cols-12 gap-2 items-center"
          >
            <div class="col-span-1 text-sm font-mono text-gray-500 dark:text-gray-400">#{{ idx + 1 }}</div>
            <div class="col-span-5">
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Shares</label>
              <input v-model.number="lot.shares" type="number" min="0" step="any" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            </div>
            <div class="col-span-5">
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Price ($)</label>
              <input v-model.number="lot.price" type="number" min="0" step="any" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            </div>
            <div class="col-span-1 flex items-end justify-end">
              <button
                type="button"
                @click="removeLot(idx)"
                :disabled="state.lots.length <= 1"
                class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Remove lot"
              >
                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current price ($, optional)</label>
          <input v-model.number="state.currentPrice" type="number" min="0" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Adds unrealized P&amp;L and % return.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>
        <div v-if="!isValid" class="text-gray-500 dark:text-gray-400">
          Enter at least one buy lot with a positive share count and price.
        </div>
        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <div class="text-sm font-medium text-primary-700 dark:text-primary-300">Average cost / breakeven</div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">${{ formatMoney(averagePrice) }}</div>
            <div class="mt-2 text-sm text-primary-700 dark:text-primary-300">
              You break even on the position when the price reaches this level.
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total shares</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">{{ totalShares.toLocaleString() }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total invested</dt>
              <dd class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatMoney(totalCost) }}</dd>
            </div>
            <template v-if="state.currentPrice > 0">
              <div>
                <dt class="text-sm text-gray-500 dark:text-gray-400">Current value</dt>
                <dd class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatMoney(currentValue) }}</dd>
              </div>
              <div>
                <dt class="text-sm text-gray-500 dark:text-gray-400">Unrealized P&amp;L</dt>
                <dd class="text-lg font-semibold" :class="unrealizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                  {{ unrealizedPnL >= 0 ? '+' : '' }}${{ formatMoney(unrealizedPnL) }}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-gray-500 dark:text-gray-400">Return %</dt>
                <dd class="text-lg font-semibold" :class="returnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                  {{ returnPercent >= 0 ? '+' : '' }}{{ returnPercent.toFixed(2) }}%
                </dd>
              </div>
              <div>
                <dt class="text-sm text-gray-500 dark:text-gray-400">% to breakeven</dt>
                <dd class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ pctToBreakeven > 0 ? '+' : '' }}{{ pctToBreakeven.toFixed(2) }}%
                </dd>
              </div>
            </template>
          </dl>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How to Calculate Average Cost Basis"
      intro="When you buy the same stock at multiple prices &mdash; whether by averaging down on a loser, dollar-cost averaging into a position, or scaling in &mdash; your effective cost basis is a weighted average of every purchase, not a simple average of the prices."
      formula="average price = total dollars invested ÷ total shares purchased"
      :steps="howToSteps"
      example="Buy 100 shares at $50 (cost: $5,000). Stock drops, buy 100 more at $30 (cost: $3,000). Total: 200 shares, $8,000 invested. Average price = $8,000 ÷ 200 = <strong>$40</strong>. The stock now needs to climb 33% from $30 to $40 just to break even &mdash; and to make a 10% return on your invested capital, it needs to reach $44 (10% above your $40 average)."
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

const { state } = useToolFormState('tt:tool:average-down', {
  lots: [
    { shares: 100, price: 50 },
    { shares: 100, price: 30 }
  ],
  currentPrice: 35
})

function addLot() {
  state.lots.push({ shares: 0, price: 0 })
}
function removeLot(idx) {
  if (state.lots.length > 1) state.lots.splice(idx, 1)
}

const validLots = computed(() => state.lots.filter(l => l.shares > 0 && l.price > 0))
const isValid = computed(() => validLots.value.length > 0)

const totalShares = computed(() => validLots.value.reduce((sum, l) => sum + Number(l.shares), 0))
const totalCost = computed(() => validLots.value.reduce((sum, l) => sum + Number(l.shares) * Number(l.price), 0))
const averagePrice = computed(() => totalShares.value > 0 ? totalCost.value / totalShares.value : 0)
const currentValue = computed(() => totalShares.value * (state.currentPrice || 0))
const unrealizedPnL = computed(() => currentValue.value - totalCost.value)
const returnPercent = computed(() => totalCost.value > 0 ? (unrealizedPnL.value / totalCost.value) * 100 : 0)
const pctToBreakeven = computed(() => state.currentPrice > 0 ? ((averagePrice.value - state.currentPrice) / state.currentPrice) * 100 : 0)

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const howToSteps = [
  { name: 'Multiply each lot by its share count', text: 'For every separate purchase, multiply the share count by the price you paid. This gives the dollars invested for that lot. Repeat for every buy you\'ve made in the position.' },
  { name: 'Sum the dollars invested', text: 'Add the dollars from every lot together. This is your total cost basis for the position. Don\'t forget to include reinvested dividends if you\'re tracking long-term holdings.' },
  { name: 'Sum the shares', text: 'Add up the share count from every lot. This is your total share position.' },
  { name: 'Divide total cost by total shares', text: 'Average price = total dollars ÷ total shares. This is the price you need the stock to reach for the entire position to be at breakeven, ignoring fees and taxes.' }
]

const faqs = [
  {
    question: 'Is averaging down a good strategy?',
    answer: 'It depends entirely on what you\'re averaging down on. Averaging down on a fundamentally strong company in a temporary drawdown can work. Averaging down on a stock in a sustained downtrend &mdash; "trying to catch a falling knife" &mdash; is one of the most common ways traders blow up accounts. Have a maximum drawdown rule before you start adding to losers.'
  },
  {
    question: 'How is this different from dollar-cost averaging (DCA)?',
    answer: 'Mechanically, they\'re the same calculation. The difference is intent. DCA is a planned strategy of buying at fixed intervals regardless of price &mdash; common with index funds and long-term holdings. Averaging down is reactive: you bought, the price fell, and you\'re buying more to lower your basis. The math works the same; the psychology is very different.'
  },
  {
    question: 'Can I average down on a short position?',
    answer: 'Yes &mdash; the calculation is identical, just reversed. If you short at $100 and the price rises, "averaging up" by shorting more at $110 raises your average short price. Your breakeven becomes the higher blended average. Be aware that adding to losing shorts is dangerous because losses are theoretically unlimited.'
  },
  {
    question: 'Does this account for fees?',
    answer: 'Not directly. For commission-free brokers (most US retail brokers for stocks), the calculation is accurate. If you pay per-trade commissions, add them to the cost of each lot before computing the average. For example, $50 per share × 100 + $5 commission = $5,005 for that lot, making the per-share cost $50.05.'
  },
  {
    question: 'How does TradeTally help with cost basis tracking?',
    answer: 'TradeTally automatically tracks cost basis across multiple buys, partial exits, and lot-level fills imported from your broker. It calculates your average price, unrealized P&L, and realized P&L per position &mdash; with tax-aware lot accounting (FIFO/LIFO) when needed. No manual spreadsheet upkeep.'
  }
]

const related = [
  { slug: 'position-size-calculator', title: 'Position Size Calculator', description: 'Decide how much to buy on the next lot.' },
  { slug: 'risk-reward-calculator', title: 'Risk/Reward Calculator', description: 'Set entry, stop, and target on any trade.' },
  { slug: 'what-if-i-invested', title: 'What If I Invested?', description: 'See historical returns for any stock.' }
]

useToolMeta({
  title: 'Average Down / DCA Calculator',
  description: 'Free average down and dollar-cost averaging calculator. Enter multiple buy lots to see your blended cost basis, breakeven price, and unrealized P&L.',
  canonical: 'https://tradetally.io/tools/average-down-calculator'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'Average Down / DCA Calculator',
    description: 'Free cost basis calculator for stock traders.',
    url: 'https://tradetally.io/tools/average-down-calculator'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Average Cost Basis',
    description: 'Calculate the blended cost basis of a position with multiple buys.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
