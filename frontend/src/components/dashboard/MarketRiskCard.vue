<template>
  <div ref="card_element" class="card-dense h-full flex flex-col">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <h3 class="heading-card">Market Risk</h3>
      <router-link
        to="/market-risk"
        class="text-xs text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
      >
        Full breakdown
      </router-link>
    </div>

    <div class="card-dense-body flex-1 flex flex-col">
      <div v-if="initialLoading" class="flex-1 flex items-center justify-center py-8">
        <div class="spinner spinner-md"></div>
      </div>

      <div v-else-if="error" class="flex-1 flex items-center justify-center py-8">
        <p class="text-sm text-gray-600 dark:text-gray-400 text-center">
          Market risk data is temporarily unavailable.
        </p>
      </div>

      <template v-else>
        <!-- Summary strip -->
        <div
          class="rounded-md px-3 py-2 mb-3 text-sm font-medium border"
          :class="summaryClasses"
        >
          <span class="text-mono-num">{{ summary.red }} red &middot; {{ summary.amber }} amber &middot; {{ summary.green }} green.</span>
          {{ summary.headline }}
        </div>

        <!-- Indicator tiles -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          <div
            v-for="indicator in availableIndicators"
            :key="indicator.key"
            :data-market-risk-indicator="indicator.key"
            class="relative rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2"
            @mouseenter="active_indicator = indicator.key"
            @mouseleave="active_indicator = null"
          >
            <button
              type="button"
              class="flex w-full items-center gap-1 rounded text-left text-xs text-gray-500 dark:text-gray-400 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              :aria-label="`${indicator.name} definition`"
              :aria-describedby="active_indicator === indicator.key ? `${tooltip_id}-${indicator.key}` : undefined"
              @focus="active_indicator = indicator.key"
              @blur="active_indicator = null"
              @click="active_indicator = indicator.key"
            >
              <span class="truncate">{{ indicator.name }}</span>
              <InformationCircleIcon class="h-3.5 w-3.5 shrink-0 text-primary-700 dark:text-primary-400" aria-hidden="true" />
            </button>
            <div class="mt-0.5 flex items-baseline gap-1">
              <span class="text-lg font-semibold text-mono-num text-gray-900 dark:text-white">
                {{ indicator.display_value }}</span>
              <span v-if="indicator.unit" class="text-xs text-gray-500 dark:text-gray-400">{{ indicator.unit }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 min-w-0">
              <span
                class="badge uppercase"
                :class="badgeClasses(indicator.status)"
              >
                {{ indicator.status_label }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ indicator.detail }}</span>
            </div>
            <div
              v-if="active_indicator === indicator.key"
              :id="`${tooltip_id}-${indicator.key}`"
              role="tooltip"
              class="absolute inset-x-0 top-full z-30 pt-2"
            >
              <div class="dropdown-menu p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {{ definitions[indicator.key] || indicator.description }}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Macro context, not a trade signal. Updated {{ asOfLabel }}.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { InformationCircleIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const card_element = ref(null)
const active_indicator = ref(null)
const tooltip_id = useId()
const definitions = {
  shiller_cape: 'The S&P 500 price divided by its average inflation-adjusted annual earnings over the past 10 years. This smooths out earnings cycles; higher values mean stocks cost more relative to earnings.',
  buffett_indicator: 'The total value of US stocks divided by annual US gross domestic product (GDP), expressed as a percentage. It compares the size of the stock market with the economy.',
  tobins_q: 'The market value of companies divided by the estimated cost to replace their assets. A ratio above 1 means the market values companies above that replacement cost.',
  yield_curve: 'The 10-year US Treasury yield minus the 2-year yield, in percentage points (pp). A negative spread is an inverted yield curve: short-term yields are higher than long-term yields.',
  sp500_m2: 'The S&P 500 index level divided by M2, a broad measure of money supply including cash and bank deposits. It compares stock prices with the amount of money in the economy.',
  vix: 'The Cboe Volatility Index measures expected S&P 500 volatility over the next 30 days, based on options prices. Higher values mean larger expected price swings, without indicating their direction.',
  hy_spread: 'The extra yield on lower-rated corporate bonds compared with US Treasuries, in percentage points (pp). Wider spreads indicate investors demand more compensation for credit risk.'
}

function dismiss_definition(event) {
  if (event.type === 'keydown') {
    if (event.key === 'Escape') active_indicator.value = null
    return
  }

  const tile = event.target.closest?.('[data-market-risk-indicator]')
  if (!tile || !card_element.value?.contains(tile)) active_indicator.value = null
}

const loading = ref(true)
const initialLoading = ref(true)
const error = ref(null)
const data = ref(null)

const summary = computed(() => data.value?.summary || { red: 0, amber: 0, green: 0, headline: '' })
const availableIndicators = computed(() =>
  (data.value?.indicators || []).filter(i => i.value !== null)
)

const asOfLabel = computed(() => {
  if (!data.value?.as_of) return ''
  return new Date(data.value.as_of).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

const summaryClasses = computed(() => {
  switch (summary.value.level) {
    case 'elevated':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300'
    case 'caution':
    case 'mixed':
      return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/40 text-yellow-700 dark:text-yellow-300'
    default:
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-300'
  }
})

function badgeClasses(status) {
  switch (status) {
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    case 'amber':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
    case 'green':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  }
}

async function fetchIndicators() {
  loading.value = true
  try {
    const response = await api.get('/market-risk')
    data.value = response.data
    error.value = null
  } catch (err) {
    console.error('[MARKET-RISK-CARD] Failed to load indicators:', err)
    error.value = err
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', dismiss_definition)
  document.addEventListener('pointerdown', dismiss_definition)
  fetchIndicators()
})

onUnmounted(() => {
  document.removeEventListener('keydown', dismiss_definition)
  document.removeEventListener('pointerdown', dismiss_definition)
})
</script>
