<template>
  <div class="content-wrapper py-8">
    <!-- Hero -->
    <div class="max-w-3xl">
      <p class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">Market conditions</p>
      <h1 class="heading-page mt-1">Market Risk Indicators</h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Seven macro gauges of stock market valuation and stress: the Shiller CAPE ratio, Buffett Indicator,
        Tobin's Q, the 10y-2y yield curve, the S&amp;P 500 relative to M2 money supply, the VIX, and
        high-yield credit spreads. Updated daily from Federal Reserve (FRED) data.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <template v-else>
      <!-- Summary banner -->
      <div
        v-if="data"
        class="mt-6 rounded-lg border px-4 py-3 flex items-start gap-3"
        :class="summaryClasses"
      >
        <span class="mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0" :class="summaryDotClass"></span>
        <div>
          <p class="font-semibold">
            <span class="text-mono-num">{{ summary.red }} red &middot; {{ summary.amber }} amber &middot; {{ summary.green }} green.</span>
            {{ summary.headline }}
          </p>
          <p class="mt-0.5 text-sm opacity-80">As of {{ asOfLabel }}. Macro context, not a trade signal.</p>
        </div>
      </div>

      <div v-else class="mt-6 card">
        <div class="card-body text-center text-gray-600 dark:text-gray-400">
          Live indicator data is temporarily unavailable. The explanations below describe what each gauge measures.
        </div>
      </div>

      <!-- Indicator cards -->
      <div v-if="data" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="indicator in indicators"
          :key="indicator.key"
          class="card-dense px-5 py-4"
        >
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-gray-600 dark:text-gray-400">{{ indicator.name }}</h2>
            <span
              class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium uppercase whitespace-nowrap"
              :class="badgeClasses(indicator.status)"
            >
              {{ indicator.status_label }}
            </span>
          </div>
          <div class="mt-2 flex items-baseline gap-1.5">
            <span class="text-4xl font-semibold text-mono-num text-gray-900 dark:text-white">
              {{ indicator.display_value ?? '—' }}</span>
            <span v-if="indicator.unit" class="text-sm text-gray-500 dark:text-gray-400">{{ indicator.unit }}</span>
          </div>
          <p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{{ indicator.detail }}</p>
          <p v-if="indicator.description" class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ indicator.description }}</p>
        </div>
      </div>

      <!-- How to read this -->
      <section class="mt-12">
        <h2 class="heading-section">How to read this dashboard</h2>
        <p class="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
          Each gauge is scored against its own long-run history, not against opinion. No single measure calls a top
          or a bottom; what matters is how many are stretched at the same time.
        </p>
        <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="card-dense px-5 py-4">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>
              <h3 class="font-semibold text-gray-900 dark:text-white">Red</h3>
            </div>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The measure is at a historically extreme level. Extremes can persist for years, but forward returns
              from these levels have historically been poor.
            </p>
          </div>
          <div class="card-dense px-5 py-4">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              <h3 class="font-semibold text-gray-900 dark:text-white">Amber</h3>
            </div>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The measure is elevated or in a historically risky window, such as the two years after a yield-curve
              un-inversion or an unusually low VIX.
            </p>
          </div>
          <div class="card-dense px-5 py-4">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-green-500"></span>
              <h3 class="font-semibold text-gray-900 dark:text-white">Green</h3>
            </div>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The measure is within its normal historical range and is not flagging valuation or stress risk on its own.
            </p>
          </div>
        </div>
      </section>

      <!-- What each indicator measures -->
      <section class="mt-12">
        <h2 class="heading-section">What each indicator measures</h2>
        <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="item in explainers" :key="item.title" class="card">
            <div class="card-body">
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ item.title }}</h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{{ item.body }}</p>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-500">Source: {{ item.source }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section class="mt-12 max-w-3xl">
        <h2 class="heading-section">Frequently asked questions</h2>
        <div class="mt-4 space-y-4">
          <div v-for="faq in faqs" :key="faq.q" class="card">
            <div class="card-body">
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ faq.q }}</h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{{ faq.a }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="mt-12 card">
        <div class="card-body md:flex md:items-center md:justify-between">
          <div class="max-w-2xl">
            <h2 class="heading-section">Know your own risk, not just the market's</h2>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              TradeTally is a free, open-source trading journal with behavioral analytics: revenge-trading detection,
              R-multiple tracking, and broker sync for Schwab, IBKR, and more. These indicators are built into the dashboard.
            </p>
          </div>
          <div class="mt-4 md:mt-0 md:ml-6 flex-shrink-0 flex gap-3">
            <router-link to="/register" class="btn-primary">Start free</router-link>
            <router-link to="/public" class="btn-secondary">Browse public trades</router-link>
          </div>
        </div>
      </section>

      <p class="mt-8 text-xs text-gray-400 dark:text-gray-500 max-w-3xl">
        Data sources: Federal Reserve Economic Data (FRED) and multpl.com. Values update daily; quarterly series
        (Buffett Indicator, Tobin's Q) update with each Z.1 flow of funds release. Nothing on this page is
        investment advice.
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'

const loading = ref(true)
const initialLoading = ref(true)
const data = ref(null)

const summary = computed(() => data.value?.summary || { red: 0, amber: 0, green: 0, headline: '' })
const indicators = computed(() => (data.value?.indicators || []).filter(i => i.value !== null))

const asOfLabel = computed(() => {
  if (!data.value?.as_of) return ''
  return new Date(data.value.as_of).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
})

const summaryClasses = computed(() => {
  switch (summary.value.level) {
    case 'elevated':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300'
    case 'caution':
    case 'mixed':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300'
    default:
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-300'
  }
})

const summaryDotClass = computed(() => {
  switch (summary.value.level) {
    case 'elevated':
      return 'bg-red-500'
    case 'caution':
    case 'mixed':
      return 'bg-amber-500'
    default:
      return 'bg-green-500'
  }
})

function badgeClasses(status) {
  switch (status) {
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    case 'amber':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'green':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  }
}

const explainers = [
  {
    title: 'Shiller CAPE ratio',
    body: 'The cyclically-adjusted price-to-earnings ratio divides the S&P 500 price by average inflation-adjusted earnings over the past ten years, smoothing out the business cycle. Its long-term average is about 17. Readings above 30, seen before 1929, 2000, and 2022, have historically preceded weak returns over the following decade.',
    source: 'Robert Shiller / multpl.com'
  },
  {
    title: 'Buffett Indicator',
    body: 'Total US stock market value divided by GDP. Warren Buffett called it "probably the best single measure of where valuations stand at any given moment" and described the 150-200% zone as "playing with fire." Around 100% has historically been fair value.',
    source: 'Federal Reserve Z.1 corporate equities / GDP (FRED)'
  },
  {
    title: "Tobin's Q",
    body: 'The market value of US corporations divided by the replacement cost of their assets. If Q is well above 1, the market prices companies far above what it would cost to rebuild them from scratch. The long-run mean is roughly 0.75.',
    source: 'Federal Reserve Z.1 flow of funds (FRED)'
  },
  {
    title: 'Yield curve (10y-2y spread)',
    body: 'The gap between 10-year and 2-year Treasury yields. An inverted curve (negative spread) has preceded every US recession since the 1970s. Less appreciated: recessions typically begin 6-24 months AFTER the curve un-inverts, so a freshly re-steepened curve is a caution signal, not an all-clear.',
    source: 'FRED series T10Y2Y'
  },
  {
    title: 'S&P 500 relative to M2 money supply',
    body: 'Dividing the index by M2 strips monetary inflation out of nominal "record highs." When this ratio sits in the top decile of its ten-year range, stocks are expensive even after accounting for the amount of money in the system.',
    source: 'FRED series SP500 and M2SL'
  },
  {
    title: 'VIX (volatility index)',
    body: 'The market\'s expectation of 30-day S&P 500 volatility, often called the fear index. Spikes above 30-40 mark panic. A very low VIX is the more subtle warning: sustained complacency is a classic late-bubble tell because protection is cheap exactly when nobody wants it.',
    source: 'Cboe via FRED series VIXCLS'
  },
  {
    title: 'High-yield credit spread',
    body: 'The extra yield investors demand to hold junk bonds instead of Treasuries. Spreads below ~3 percentage points mean credit markets are pricing in near-zero default risk, a sign of froth. Rapidly widening spreads are one of the earliest signs of genuine market stress.',
    source: 'ICE BofA via FRED series BAMLH0A0HYM2'
  }
]

const faqs = [
  {
    q: 'Do these indicators predict market crashes?',
    a: 'No single indicator times the market. Valuation measures like CAPE and the Buffett Indicator say little about the next six months but have historically correlated with returns over the next decade. Stress measures like the VIX and credit spreads move faster. The value is in the combination: when most gauges are red at once, risk is objectively elevated even if prices keep rising.'
  },
  {
    q: 'How often is the data updated?',
    a: 'Daily series (yield curve, VIX, high-yield spread, S&P 500) refresh every trading day. M2 updates monthly. The Buffett Indicator and Tobin\'s Q rely on the Federal Reserve\'s quarterly Z.1 release, so they update four times a year.'
  },
  {
    q: 'Where does the data come from?',
    a: 'Almost everything comes from FRED, the Federal Reserve Bank of St. Louis economic database, including Treasury yields, the VIX, ICE BofA credit spreads, M2, GDP, and the Z.1 flow of funds accounts. The Shiller CAPE ratio comes from Robert Shiller\'s dataset via multpl.com.'
  },
  {
    q: 'Should I stop trading when the dashboard is red?',
    a: 'These are macro context, not trade signals. Overvalued markets can grind higher for years. Traders typically use elevated readings to size positions more conservatively, tighten risk limits, and avoid assuming that dip-buying will always work, rather than to exit the market entirely.'
  }
]

function setMeta(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setJsonLd() {
  const id = 'market-risk-jsonld'
  let script = document.getElementById(id)
  if (!script) {
    script = document.createElement('script')
    script.id = id
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a }
    }))
  })
}

async function fetchIndicators() {
  loading.value = true
  try {
    const response = await api.get('/market-risk')
    data.value = response.data
  } catch (err) {
    console.error('[MARKET-RISK] Failed to load indicators:', err)
    data.value = null
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

onMounted(() => {
  document.title = 'Market Risk Indicators: Shiller CAPE, Buffett Indicator, VIX | TradeTally'
  setMeta('description', 'Live stock market risk dashboard: Shiller CAPE ratio, Buffett Indicator, Tobin\'s Q, 10y-2y yield curve, S&P 500 vs M2, VIX, and high-yield credit spreads, updated daily from FRED data.')
  setMeta('keywords', 'market risk indicators, shiller cape ratio today, buffett indicator today, tobins q ratio, yield curve inversion, vix index, high yield credit spread, stock market valuation')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', 'https://tradetally.io/market-risk')

  setJsonLd()
  fetchIndicators()
})
</script>
