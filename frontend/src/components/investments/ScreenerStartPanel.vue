<template>
  <div>
    <!-- Panel header -->
    <div class="flex items-end justify-between mb-4">
      <div>
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Start here</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Ideas pulled from the latest 8 Pillars scan. Select any stock to run a fresh analysis.
        </p>
      </div>
      <button
        v-if="hasScanData"
        type="button"
        class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 whitespace-nowrap"
        @click="emit('open-scanner')"
      >
        Open full scanner
      </button>
    </div>

    <!-- Loading skeleton (initial load only) -->
    <div v-if="!discover && !loadFailed" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div
        v-for="n in 3"
        :key="n"
        class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6"
      >
        <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        <div class="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-2"></div>
        <div class="mt-5 space-y-4">
          <div v-for="r in 6" :key="r" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div class="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div class="w-12 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Starter lists -->
    <template v-else-if="hasScanData">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section
          v-for="list in lists"
          :key="list.key"
          class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden flex flex-col"
        >
          <header class="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ list.title }}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ list.subtitle }}</p>
          </header>

          <ul
            v-if="list.items.length > 0"
            class="divide-y divide-gray-100 dark:divide-gray-700/60 flex-1"
          >
            <li v-for="item in list.items" :key="item.symbol">
              <button
                type="button"
                class="w-full px-5 py-2.5 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                @click="emit('select', item.symbol)"
              >
                <StockLogo :symbol="item.symbol" :logo-url="item.logo" size-class="w-8 h-8" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 min-w-0">
                    <span class="text-sm font-medium text-primary-600 dark:text-primary-400">
                      {{ item.symbol }}
                    </span>
                    <span class="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {{ item.companyName || item.industry || '' }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {{ secondaryLine(list.key, item) }}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {{ primaryMetric(list.key, item) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ primaryCaption(list.key, item) }}
                  </p>
                </div>
              </button>
            </li>
          </ul>

          <div v-else class="px-5 py-8 text-center flex-1">
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ list.emptyText }}</p>
          </div>
        </section>
      </div>

      <p v-if="coverageText" class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {{ coverageText }}
      </p>
    </template>

    <!-- No scan data yet (fresh install) -->
    <div v-else class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
      <div class="lg:flex lg:items-start lg:justify-between lg:gap-8">
        <div class="max-w-xl">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ fallbackTitle }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <template v-if="loadFailed">
              We could not load the starter lists.
              <button
                type="button"
                class="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
                @click="load(true)"
              >Try again</button>
              or analyze a well-known name to get going.
            </template>
            <template v-else-if="rescanReason === 'outdated_formula'">
              The 8 Pillars formula changed since the last scan, so its results no longer
              match what a stock's page shows. A fresh scan runs at the next daily check,
              and admins can start one now from the Stock Scanner tab. In the meantime,
              analyze a well-known name to see how the 8 Pillars work.
            </template>
            <template v-else-if="rescanReason === 'too_old'">
              The last scan is more than a quarter old. A fresh scan runs at the next daily
              check, and admins can start one now from the Stock Scanner tab. In the
              meantime, analyze a well-known name to see how the 8 Pillars work.
            </template>
            <template v-else>
              Starter lists appear here once the 8 Pillars scanner has run. Admins can
              trigger a scan from the Stock Scanner tab. In the meantime, analyze a
              well-known name to see how the 8 Pillars work.
            </template>
          </p>
        </div>
        <div class="mt-4 lg:mt-0 flex flex-wrap gap-2 shrink-0">
          <button
            v-for="symbol in starterSymbols"
            :key="symbol"
            type="button"
            class="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            @click="emit('select', symbol)"
          >
            {{ symbol }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { format } from 'date-fns'
import { useInvestmentsStore } from '@/stores/investments'
import StockLogo from '@/components/common/StockLogo.vue'

const emit = defineEmits(['select', 'open-scanner'])

const investmentsStore = useInvestmentsStore()

const discover = computed(() => investmentsStore.screenerDiscover)
const hasScanData = computed(() => Boolean(discover.value?.meta?.hasScanData))
const rescanReason = computed(() => (discover.value?.meta?.rescanPending ? discover.value.meta.rescanReason : null))
const loadFailed = ref(false)

const fallbackTitle = computed(() => {
  if (loadFailed.value) return 'Starter lists are unavailable right now'
  if (rescanReason.value === 'outdated_formula' || rescanReason.value === 'too_old') return 'Scan results are being refreshed'
  return 'Nothing to browse yet'
})

// Household names shown on a fresh install before any scan has populated
// the shared analysis cache.
const starterSymbols = ['AAPL', 'MSFT', 'GOOGL', 'COST', 'V', 'UNH']

const lists = computed(() => {
  const d = discover.value || {}
  const t = d.meta?.thresholds || {}
  return [
    {
      key: 'lowestPe',
      title: 'Value picks',
      subtitle: `Pass ${t.lowestPeMinPillars ?? 6}+ pillars, lowest 5-year P/E`,
      items: d.lowestPe || [],
      emptyText: 'No strong-pillar stocks with a usable P/E in the latest scan.'
    },
    {
      key: 'mostPillars',
      title: 'Most pillars passed',
      subtitle: `${t.mostPillarsMin ?? 7} or 8 of 8, largest companies first`,
      items: d.mostPillars || [],
      emptyText: 'No stock in the latest scan passes 7 or more pillars.'
    },
    {
      key: 'upcomingEarnings',
      title: 'Earnings in the next two weeks',
      subtitle: `Stocks passing ${t.earningsMinPillars ?? 5}+ pillars, soonest first`,
      items: d.upcomingEarnings || [],
      emptyText: 'No quality names report in the next two weeks, or the earnings calendar is unavailable.'
    }
  ]
})

const coverageText = computed(() => {
  const meta = discover.value?.meta
  if (!meta?.analyzedSymbols) return ''
  const count = Number(meta.analyzedSymbols).toLocaleString()
  const when = meta.latestAnalysisDate
    ? format(new Date(meta.latestAnalysisDate), 'MMM d, yyyy')
    : null
  return when
    ? `Based on ${count} analyzed stocks. Latest analysis ${when}.`
    : `Based on ${count} analyzed stocks.`
})

function primaryMetric(listKey, item) {
  if (listKey === 'lowestPe') return item.fiveYearPe !== null ? Number(item.fiveYearPe).toFixed(1) : '-'
  if (listKey === 'mostPillars') return `${item.pillarsPassed}/8`
  if (listKey === 'upcomingEarnings') return formatEarningsDate(item.earningsDate)
  return ''
}

function primaryCaption(listKey, item) {
  if (listKey === 'lowestPe') return '5-yr P/E'
  if (listKey === 'mostPillars') return 'pillars'
  if (listKey === 'upcomingEarnings') return earningsHourLabel(item.earningsHour)
  return ''
}

function secondaryLine(listKey, item) {
  const parts = []
  if (listKey !== 'mostPillars') parts.push(`${item.pillarsPassed}/8 pillars`)
  if (listKey === 'mostPillars' && item.fiveYearPe !== null) {
    parts.push(`5-yr P/E ${Number(item.fiveYearPe).toFixed(1)}`)
  }
  const cap = formatMarketCap(item.marketCap)
  if (cap) parts.push(cap)
  return parts.join(' · ')
}

function formatMarketCap(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

// Earnings dates arrive as YYYY-MM-DD. Build a local date from the parts so
// the day does not shift in US timezones.
function formatEarningsDate(value) {
  if (!value) return '-'
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return String(value)
  return format(new Date(y, m - 1, d), 'EEE, MMM d')
}

function earningsHourLabel(hour) {
  if (hour === 'bmo') return 'Before open'
  if (hour === 'amc') return 'After close'
  if (hour === 'dmh') return 'During market'
  return 'Time TBD'
}

async function load(force = false) {
  loadFailed.value = false
  try {
    await investmentsStore.fetchScreenerDiscover({ force })
  } catch (err) {
    loadFailed.value = true
    console.error('[SCREENER-START] Failed to load starter lists:', err.response?.data || err)
  }
}

onMounted(() => {
  load()
})
</script>
