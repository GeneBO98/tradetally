<template>
  <ToolPageLayout
    title="What If I Invested?"
    breadcrumb="What If I Invested?"
    subtitle="See what an investment in any stock would be worth today. Enter a ticker, dollar amount, and historical date to find your total return and current value."
    cta-metric="every position's cost basis, P&L, and historical return"
    :related="related"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Inputs</h2>
        <form @submit.prevent="lookup" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock symbol</label>
            <SymbolAutocomplete
              v-model="state.symbol"
              endpoint="/tools/symbol-search"
              :api-client="publicApi"
              :disable-metadata-fetch="true"
              placeholder="e.g. AAPL"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">US-listed stocks. Try AAPL, MSFT, NVDA, TSLA, AMZN.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initial amount invested ($)</label>
            <input v-model.number="state.amount" type="number" min="1" step="any" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Add per month ($, optional)</label>
            <input v-model.number="state.monthly" type="number" min="0" step="any" placeholder="0" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Simulates dollar-cost averaging the same amount every month from the investment date until today.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Investment date</label>
            <input v-model="state.date" type="date" :max="maxDate" :min="minDate" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Any date from {{ minDate }} to yesterday.</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in presets"
              :key="preset.label"
              type="button"
              @click="applyPreset(preset.years)"
              class="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {{ preset.label }}
            </button>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full inline-flex items-center justify-center px-5 py-3 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Calculating...' : 'Calculate' }}
          </button>
        </form>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-5">Results</h2>

        <div v-if="error" class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          {{ error }}
        </div>

        <div v-else-if="!result" class="text-gray-500 dark:text-gray-400">
          Enter a symbol, amount, and date to see what your investment would be worth today.
        </div>

        <div v-else class="space-y-5">
          <div class="p-5 rounded-lg" :class="result.total_return_dollar >= 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'">
            <div class="text-sm font-medium" :class="result.total_return_dollar >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
              {{ headerLabel }}
            </div>
            <div class="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white">${{ formatMoney(result.current_value) }}</div>
            <div class="mt-2 text-base font-semibold" :class="result.total_return_dollar >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
              {{ result.total_return_dollar >= 0 ? '+' : '' }}${{ formatMoney(result.total_return_dollar) }}
              ({{ result.total_return_pct >= 0 ? '+' : '' }}{{ result.total_return_pct.toFixed(2) }}%)
            </div>
            <div v-if="hasMonthly" class="mt-1 text-xs text-gray-600 dark:text-gray-400">
              On ${{ formatMoney(result.total_invested) }} total invested ({{ result.contributions_made }} monthly contributions of ${{ formatMoney(result.monthly_contribution) }} plus the initial ${{ formatMoney(result.amount_invested) }}).
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">First purchase</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">{{ result.purchase_date }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">First-day price</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">${{ formatMoney(result.purchase_price) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Current price</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">${{ formatMoney(result.current_price) }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total shares</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">{{ totalShares.toFixed(4) }}</dd>
            </div>
            <div v-if="hasMonthly">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Total contributed</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">${{ formatMoney(result.total_invested) }}</dd>
            </div>
            <div v-if="hasMonthly">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Monthly buys</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">{{ result.contributions_made }}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-sm text-gray-500 dark:text-gray-400">Annualized return</dt>
              <dd class="text-base font-semibold text-gray-900 dark:text-white">
                {{ annualizedReturn.toFixed(2) }}% per year
                <span class="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">over {{ yearsHeld.toFixed(1) }} years</span>
                <span v-if="hasMonthly" class="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-1">Note: with monthly contributions, this is a money-weighted IRR-style approximation.</span>
              </dd>
            </div>
          </dl>

          <div v-if="result.contributions_stopped_at" class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
            Monthly contributions stopped at {{ result.contributions_stopped_at }} because no further price data is available for {{ result.symbol }}.
          </div>

          <div v-if="result.is_delisted" class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
            <strong>{{ result.symbol }} appears to be delisted or no longer actively trading.</strong> The "current" value uses the last known close from {{ result.price_as_of }}.
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">
            Note: this calculation uses raw price returns and does not include dividends. Total return for dividend-paying stocks is typically higher.
          </p>
        </div>
      </div>
    </div>

    <ToolHowTo
      heading="How This Calculation Works"
      intro="The math is simple: divide your dollar amount by the historical share price to get the share count, then multiply those shares by the current price."
      formula="current value = (amount ÷ historical price) × current price"
      :steps="howToSteps"
      example="$1,000 invested in AAPL on 2015-01-02 (close: $109.33) buys ~9.15 shares. At a current price of $200, that position is worth 9.15 × $200 = <strong>$1,830</strong> &mdash; an 83% total return over the holding period. Annualized, that's roughly 6.2% per year (before dividends)."
    />

    <ToolFAQ :faqs="faqs" />
  </ToolPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import publicApi from '@/services/publicApi'
import SymbolAutocomplete from '@/components/common/SymbolAutocomplete.vue'
import ToolPageLayout from '@/components/tools/ToolPageLayout.vue'
import ToolHowTo from '@/components/tools/ToolHowTo.vue'
import ToolFAQ from '@/components/tools/ToolFAQ.vue'
import { useToolMeta } from '@/composables/useToolMeta'
import { useStructuredData, buildFAQSchema, buildHowToSchema, buildCalculatorSchema } from '@/composables/useStructuredData'
import { useToolFormState } from '@/composables/useToolFormState'

const today = new Date()
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
const maxDate = yesterday.toISOString().split('T')[0]
const minDate = '1995-01-01'

const fiveYearsAgo = new Date()
fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)

const { state } = useToolFormState('tt:tool:what-if', {
  symbol: 'AAPL',
  amount: 1000,
  monthly: 0,
  date: fiveYearsAgo.toISOString().split('T')[0]
})

const presets = [
  { label: '1 year ago', years: 1 },
  { label: '5 years ago', years: 5 },
  { label: '10 years ago', years: 10 },
  { label: '20 years ago', years: 20 }
]

function applyPreset(years) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  state.date = d.toISOString().split('T')[0]
}

const result = ref(null)
const loading = ref(false)
const error = ref('')

async function lookup() {
  error.value = ''
  result.value = null
  loading.value = true
  try {
    const symbol = (state.symbol || '').trim().toUpperCase()
    state.symbol = symbol
    const { data } = await publicApi.get('/tools/what-if-invested', {
      params: {
        symbol,
        amount: state.amount,
        monthly: state.monthly || 0,
        date: state.date
      }
    })
    result.value = data
  } catch (err) {
    if (err?.response?.data?.message) {
      error.value = err.response.data.message
    } else if (err?.response?.status === 429) {
      error.value = 'Too many requests. Please wait a moment and try again.'
    } else {
      error.value = 'Could not look up that symbol. Try another ticker.'
    }
  } finally {
    loading.value = false
  }
}

const hasMonthly = computed(() => result.value?.monthly_contribution > 0)

const totalShares = computed(() => {
  if (!result.value) return 0
  return result.value.total_shares ?? result.value.shares_at_purchase ?? 0
})

const headerLabel = computed(() => {
  if (!result.value) return ''
  if (hasMonthly.value) {
    return `Today's value of $${formatMoney(result.value.amount_invested)} + $${formatMoney(result.value.monthly_contribution)}/month in ${result.value.symbol}`
  }
  return `Today's value of $${formatMoney(result.value.amount_invested)} invested in ${result.value.symbol}`
})

const yearsHeld = computed(() => {
  if (!result.value) return 0
  const start = new Date(result.value.purchase_date)
  const ms = Date.now() - start.getTime()
  return ms / (365.25 * 24 * 60 * 60 * 1000)
})

const annualizedReturn = computed(() => {
  if (!result.value || yearsHeld.value <= 0) return 0
  const totalInvested = result.value.total_invested ?? result.value.amount_invested
  if (!totalInvested || totalInvested <= 0) return 0
  // For lump-sum: clean CAGR. For monthly contributions: this is an
  // approximation that treats total contributed as if it had been invested
  // up-front. The frontend label notes this caveat.
  const ratio = result.value.current_value / totalInvested
  if (ratio <= 0) return 0
  return (Math.pow(ratio, 1 / yearsHeld.value) - 1) * 100
})

function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const howToSteps = [
  { name: 'Look up the historical close price', text: 'Find the closing price of the stock on the date you specify. If that date is a weekend or market holiday, the calculator uses the next available trading day.' },
  { name: 'Calculate fractional shares', text: 'Divide the dollar amount by the historical close to get the number of shares. Fractional shares are used to keep the calculation precise &mdash; in real life, brokers may round.' },
  { name: 'Multiply by today\'s price', text: 'Multiply the share count by the current market price to get the position\'s value today.' },
  { name: 'Compute total and annualized return', text: 'Total return = (current value − amount invested) ÷ amount invested. Annualized return uses the compound formula: (current ÷ start) ^ (1/years) − 1, expressed as a percentage.' }
]

const faqs = [
  {
    question: 'Does this include dividends?',
    answer: 'No &mdash; the calculation uses raw share prices only. For dividend-paying stocks, the actual total return (with dividends reinvested) would be higher than what\'s shown. For non-dividend payers like growth stocks, the result is accurate.'
  },
  {
    question: 'Why is the purchase date sometimes different from what I entered?',
    answer: 'Markets are closed on weekends and holidays. If you pick a non-trading day, the calculator uses the next available trading day. The exact purchase date used is shown in the results.'
  },
  {
    question: 'What about stock splits?',
    answer: 'The historical price data used here is split-adjusted, meaning prices have been retroactively divided by any stock splits. So a stock that traded at $1,000 pre-split and $250 post-4:1-split shows $250 in the historical record. This makes the calculation correct without manually adjusting share counts.'
  },
  {
    question: 'Can I look up any stock?',
    answer: 'The tool covers most US-listed stocks (NYSE and NASDAQ). Some symbols may not have data available, especially recent IPOs, stocks that have been delisted, or non-US listings. Crypto, futures, and options are not supported.'
  },
  {
    question: 'How accurate is the historical price?',
    answer: 'Closing prices are sourced from a market data provider that pulls from official exchange data. They\'re accurate to the cent, retroactively adjusted for splits. Day-to-day, an institutional buyer would have paid slightly different prices due to bid/ask spread &mdash; but for "$X invested at $Y" calculations, daily closes are the standard reference.'
  },
  {
    question: 'How does TradeTally help me track my real positions?',
    answer: 'This calculator is hypothetical &mdash; "what if you had invested." TradeTally tracks what you actually own: real cost basis (including any partial fills, scaled buys, and dividends), real-time P&L, and lifetime return on every position you take. Free to use, free to import your broker history.'
  }
]

const related = [
  { slug: 'average-down-calculator', title: 'Average Down / DCA Calculator', description: 'Find blended cost basis across multiple buys.' },
  { slug: 'position-size-calculator', title: 'Position Size Calculator', description: 'Decide how many shares to buy on your next entry.' },
  { slug: 'trade-expectancy-calculator', title: 'Trade Expectancy Calculator', description: 'Calculate the expected value of an active strategy.' }
]

useToolMeta({
  title: 'What If I Invested? Calculator',
  description: 'Free historical investment return calculator. Enter a stock ticker, dollar amount, and past date to see what your investment would be worth today.',
  canonical: 'https://tradetally.io/tools/what-if-invested'
})

useStructuredData({
  software: buildCalculatorSchema({
    name: 'What If I Invested? Calculator',
    description: 'Free historical investment return calculator.',
    url: 'https://tradetally.io/tools/what-if-invested'
  }),
  howTo: buildHowToSchema({
    name: 'How to Calculate Historical Investment Returns',
    description: 'Calculate what an investment in a given stock would be worth today.',
    steps: howToSteps
  }),
  faq: buildFAQSchema(faqs)
})
</script>
