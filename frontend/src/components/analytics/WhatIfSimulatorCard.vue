<template>
  <div v-if="isTierResolved">
    <!-- Pro user: full interactive What-If Mistake Simulator -->
    <div v-if="isProUser" class="card">
      <div class="card-body">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="heading-card">What-If Mistake Simulator</h3>
              <span
                v-if="simulationDelta > 0"
                class="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                +{{ formatMoney(simulationDelta) }} upside
              </span>
            </div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Turn on rules you could follow tomorrow, or remove patterns from your history, and compare the equity curves.
            </p>
          </div>
          <button
            v-if="hasActiveSelection"
            type="button"
            class="btn-link text-xs text-gray-500 dark:text-gray-400 self-start"
            @click="clearScenarios"
          >
            Reset
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-14">
          <div class="spinner spinner-md"></div>
        </div>

        <!-- Load Error -->
        <div
          v-else-if="loadError"
          role="alert"
          class="mt-6 rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50/70 dark:bg-red-900/20 px-6 py-8 text-center"
        >
          <p class="text-sm font-medium text-red-800 dark:text-red-200">
            {{ loadError }}
          </p>
          <button
            type="button"
            class="btn-secondary btn-sm mt-3"
            @click="fetchData"
          >
            Try again
          </button>
        </div>

        <!-- Not enough data -->
        <div
          v-else-if="trades.length < 2"
          class="mt-6 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-6 py-10 text-center"
        >
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            Need at least 2 closed trades to simulate
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Import or close a few trades to compare your actual curve against a disciplined counterfactual.
          </p>
        </div>

        <!-- Interactive Simulator -->
        <template v-else>
          <p
            v-if="hasActiveSelection"
            class="mt-4 text-sm text-gray-700 dark:text-gray-300"
            data-testid="what-if-summary"
          >
            Net P&amp;L
            <span class="font-mono font-semibold" :class="pnlTextClass(actual.totalPnl)">{{ formatSignedMoney(actual.totalPnl) }}</span>
            <span class="text-gray-400" aria-hidden="true">→</span>
            <span class="sr-only">becomes</span>
            <span class="font-mono font-semibold" :class="pnlTextClass(simulated.totalPnl)">{{ formatSignedMoney(simulated.totalPnl) }}</span>
            with {{ activeSelectionCount }} {{ activeSelectionCount === 1 ? 'change' : 'changes' }} applied.
          </p>

          <!-- Rules you could follow -->
          <section class="mt-5" aria-labelledby="what-if-rules-heading">
            <div class="flex items-baseline justify-between gap-2">
              <h4 id="what-if-rules-heading" class="heading-sub">Rules you could follow</h4>
              <span class="text-xs text-gray-500 dark:text-gray-400">Impact shown for each rule on its own</span>
            </div>

            <div class="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              <!-- Daily loss limit -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5" :class="ruleRowClass(lossLimitOn)">
                <button
                  type="button"
                  class="flex items-center gap-2 text-left text-sm font-medium"
                  :aria-pressed="lossLimitOn"
                  @click="lossLimitOn = !lossLimitOn"
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs font-bold leading-none" :class="checkboxClass(lossLimitOn)" aria-hidden="true">
                    <span v-if="lossLimitOn">✓</span>
                  </span>
                  Daily loss limit
                </button>
                <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  Stop after losing $
                  <input
                    v-model.number="lossLimitAmount"
                    type="number"
                    min="1"
                    step="10"
                    inputmode="decimal"
                    class="input input-sm w-24 font-mono"
                    aria-label="Daily loss limit in dollars"
                    @focus="lossLimitOn = true"
                  />
                </label>
                <span class="ml-auto font-mono text-xs font-semibold" :class="impactClass(ruleImpacts.lossLimit)">{{ formatImpact(ruleImpacts.lossLimit) }}</span>
                <p v-if="lossLimitHint" class="basis-full text-xs text-gray-500 dark:text-gray-400">{{ lossLimitHint }}</p>
              </div>

              <!-- Max trades per day -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5" :class="ruleRowClass(maxTradesOn)">
                <button
                  type="button"
                  class="flex items-center gap-2 text-left text-sm font-medium"
                  :aria-pressed="maxTradesOn"
                  @click="maxTradesOn = !maxTradesOn"
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs font-bold leading-none" :class="checkboxClass(maxTradesOn)" aria-hidden="true">
                    <span v-if="maxTradesOn">✓</span>
                  </span>
                  Max trades per day
                </button>
                <div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  Stop after
                  <button type="button" class="btn-secondary btn-sm px-2" aria-label="Fewer trades per day" :disabled="maxTradesValue <= 1" @click="adjustMaxTrades(-1)">−</button>
                  <span class="w-6 text-center font-mono font-semibold text-gray-900 dark:text-white" aria-live="polite">{{ maxTradesValue }}</span>
                  <button type="button" class="btn-secondary btn-sm px-2" aria-label="More trades per day" @click="adjustMaxTrades(1)">+</button>
                  {{ maxTradesValue === 1 ? 'trade' : 'trades' }}
                </div>
                <span class="ml-auto font-mono text-xs font-semibold" :class="impactClass(ruleImpacts.maxTrades)">{{ formatImpact(ruleImpacts.maxTrades) }}</span>
              </div>

              <!-- Entry cutoff -->
              <div
                v-if="cutoffOptions.length > 0"
                class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5"
                :class="ruleRowClass(cutoffOn)"
              >
                <button
                  type="button"
                  class="flex items-center gap-2 text-left text-sm font-medium"
                  :aria-pressed="cutoffOn"
                  @click="cutoffOn = !cutoffOn"
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs font-bold leading-none" :class="checkboxClass(cutoffOn)" aria-hidden="true">
                    <span v-if="cutoffOn">✓</span>
                  </span>
                  Time cutoff
                </button>
                <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  No new entries from
                  <select
                    v-model.number="cutoffMinute"
                    class="input input-sm w-auto py-1"
                    aria-label="Entry cutoff time"
                    @change="cutoffOn = true"
                  >
                    <option v-for="opt in cutoffOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </label>
                <span class="ml-auto font-mono text-xs font-semibold" :class="impactClass(ruleImpacts.cutoff)">{{ formatImpact(ruleImpacts.cutoff) }}</span>
              </div>

              <!-- Broken playbook -->
              <div
                v-if="playbookRule.reviewedCount > 0"
                class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5"
                :class="ruleRowClass(brokenPlaybookOn)"
              >
                <button
                  type="button"
                  class="flex items-center gap-2 text-left text-sm font-medium"
                  :aria-pressed="brokenPlaybookOn"
                  @click="brokenPlaybookOn = !brokenPlaybookOn"
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs font-bold leading-none" :class="checkboxClass(brokenPlaybookOn)" aria-hidden="true">
                    <span v-if="brokenPlaybookOn">✓</span>
                  </span>
                  Skip broken-playbook trades
                </button>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ playbookRule.brokenCount }} of {{ playbookRule.reviewedCount }} reviewed trades
                </span>
                <span class="ml-auto font-mono text-xs font-semibold" :class="impactClass(ruleImpacts.playbook)">{{ formatImpact(ruleImpacts.playbook) }}</span>
                <p class="basis-full text-xs text-gray-500 dark:text-gray-400">
                  Plan marked as not followed, or adherence score under {{ playbookRule.scoreThreshold }}.
                </p>
              </div>
            </div>

            <p v-if="playbookRule.reviewedCount === 0" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Review trades against a playbook to simulate skipping trades where you broke your plan.
            </p>

            <!-- Tags -->
            <div class="mt-4">
              <div class="text-xs font-medium text-gray-700 dark:text-gray-300">Skip trades tagged</div>
              <div v-if="tagOptions.length > 0" class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tags to skip">
                <button
                  v-for="opt in tagOptions"
                  :key="opt.tag"
                  type="button"
                  :aria-pressed="activeTags.includes(opt.tag)"
                  class="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                  :class="pillClass(activeTags.includes(opt.tag))"
                  @click="toggleTag(opt.tag)"
                >
                  <span class="font-medium">#{{ opt.tag }}</span>
                  <span class="font-mono font-semibold" :class="impactClass(tagImpacts[opt.tag])">{{ formatImpact(tagImpacts[opt.tag]) }}</span>
                  <span class="text-gray-500 dark:text-gray-400">({{ opt.tradeCount }})</span>
                </button>
              </div>
              <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Tag at least two trades with the same mistake (for example #fomo or #chased) to simulate skipping them.
              </p>
            </div>
          </section>

          <!-- Patterns found in your history -->
          <section class="mt-6" aria-labelledby="what-if-patterns-heading">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h4 id="what-if-patterns-heading" class="heading-sub">Patterns found in your history</h4>
              <span class="text-xs text-gray-500 dark:text-gray-400">Hindsight: chosen after seeing the results</span>
            </div>
            <div v-if="scenarios.length > 0" class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Mistake filters to remove">
              <button
                v-for="scenario in scenarios"
                :key="scenario.key"
                type="button"
                :aria-pressed="activeScenarioKeys.includes(scenario.key)"
                :title="scenario.detail"
                @click="toggleScenario(scenario.key)"
                class="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all"
                :class="pillClass(activeScenarioKeys.includes(scenario.key))"
              >
                <span
                  class="flex h-4 w-4 items-center justify-center rounded border text-xs font-bold leading-none"
                  :class="checkboxClass(activeScenarioKeys.includes(scenario.key))"
                  aria-hidden="true"
                >
                  <span v-if="activeScenarioKeys.includes(scenario.key)">✓</span>
                </span>
                <span class="font-medium">{{ scenario.label }}</span>
                <span class="font-mono font-semibold text-green-700 dark:text-green-400">
                  +{{ formatMoney(scenario.recoverablePnl) }}
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  ({{ scenario.tradeCount }})
                </span>
              </button>
            </div>
            <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              No net-losing repeat patterns in this range.
            </p>
          </section>

          <!-- KPI Comparison Strip -->
          <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 px-3.5 py-2.5">
              <div class="text-label">Actual P&amp;L</div>
              <div class="mt-1 text-lg font-semibold font-mono" :class="pnlTextClass(actual.totalPnl)">
                {{ formatSignedMoney(actual.totalPnl) }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ actual.tradeCount }} trades
              </div>
            </div>

            <div class="rounded-lg border border-primary-200 dark:border-primary-800/60 bg-primary-50/40 dark:bg-primary-900/15 px-3.5 py-2.5">
              <div class="text-label">Simulated P&amp;L</div>
              <div class="mt-1 text-lg font-semibold font-mono" :class="pnlTextClass(simulated.totalPnl)">
                {{ formatSignedMoney(simulated.totalPnl) }}
              </div>
              <div class="text-xs font-medium" :class="simulationDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'">
                {{ formatSignedMoney(simulationDelta) }} vs actual
              </div>
            </div>

            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 px-3.5 py-2.5">
              <div class="text-label">Win Rate</div>
              <div class="mt-1 text-lg font-semibold font-mono text-gray-900 dark:text-white">
                {{ simulated.winRate.toFixed(1) }}%
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                from {{ actual.winRate.toFixed(1) }}%
              </div>
            </div>

            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 px-3.5 py-2.5">
              <div class="text-label">Trades Skipped</div>
              <div class="mt-1 text-lg font-semibold font-mono text-gray-900 dark:text-white">
                {{ removedCount }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ simulated.tradeCount }} remaining
              </div>
            </div>
          </div>

          <!-- Dual Equity Curve Chart -->
          <div class="mt-5 h-72 w-full">
            <canvas ref="chartCanvas"></canvas>
          </div>
        </template>
      </div>
    </div>

    <!-- Without Pro access: the standard lock panel -->
    <ProLockedSection
      v-else-if="showProLock"
      title="What-If Mistake Simulator"
      description="Test a daily loss limit, a max number of trades per day, a time cutoff or skipping your own mistake tags, and compare your equity curve with and without them."
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Chart } from '@/lib/chartSetup'
import api from '@/services/api'
import { useProAccess } from '@/composables/useProAccess'
import { useDarkMode } from '@/composables/useDarkMode'
import ProLockedSection from '@/components/common/ProLockedSection.vue'
import {
  summarizeSimulation,
  ruleImpact,
  buildEquitySeries,
  formatMinuteOfDay
} from '@/utils/whatIfRules'

const props = defineProps({
  filterParams: {
    type: Object,
    default: () => ({})
  }
})

const FALLBACK_LOSS_LIMIT = 200
const FALLBACK_MAX_TRADES = 3
const FALLBACK_CUTOFF_MINUTE = 11 * 60
const CUTOFF_STEP_MINUTES = 30

const { isProUser, isTierResolved, showProLock } = useProAccess()
const { isDark } = useDarkMode()

const loading = ref(false)
const loadError = ref('')
const actual = ref({ tradeCount: 0, totalPnl: 0, winCount: 0, lossCount: 0, winRate: 0, profitFactor: 0 })
const scenarios = ref([])
const trades = ref([])
const rules = ref(null)
const activeScenarioKeys = ref([])
let fetchSeq = 0

// Rule state
const lossLimitOn = ref(false)
const lossLimitAmount = ref(FALLBACK_LOSS_LIMIT)
const maxTradesOn = ref(false)
const maxTradesValue = ref(FALLBACK_MAX_TRADES)
const cutoffOn = ref(false)
const cutoffMinute = ref(FALLBACK_CUTOFF_MINUTE)
const brokenPlaybookOn = ref(false)
const activeTags = ref([])
// Once the trader changes a rule, keep their settings when filters refetch.
const userAdjustedRules = ref(false)
let applyingDefaults = false

const chartCanvas = ref(null)
let chartInstance = null

const tagOptions = computed(() => Array.isArray(rules.value?.tags) ? rules.value.tags : [])

const playbookRule = computed(() => ({
  reviewedCount: Number(rules.value?.playbook?.reviewedCount) || 0,
  brokenCount: Number(rules.value?.playbook?.brokenCount) || 0,
  scoreThreshold: Number(rules.value?.playbook?.scoreThreshold) || 70
}))

const lossLimitHint = computed(() => {
  const info = rules.value?.dailyLossLimit
  if (!info?.default) return ''
  if (info.source === 'account_rule') return `Default ${formatMoney(info.default)} comes from your prop-firm account rules.`
  if (info.source === 'avg_loss') return `Default ${formatMoney(info.default)} is about two of your average losses (${formatMoney(info.avgLoss)}).`
  return ''
})

const cutoffOptions = computed(() => {
  const info = rules.value?.entryCutoff
  const earliest = Number(info?.earliestEntryMinute)
  const latest = Number(info?.latestEntryMinute)
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return []
  // Options start after the first entry and run to the last entry, so every
  // choice removes at least something and never removes everything.
  const start = Math.floor(earliest / CUTOFF_STEP_MINUTES) * CUTOFF_STEP_MINUTES + CUTOFF_STEP_MINUTES
  const end = Math.floor(latest / CUTOFF_STEP_MINUTES) * CUTOFF_STEP_MINUTES
  const options = []
  for (let minute = start; minute <= end && minute < 1440; minute += CUTOFF_STEP_MINUTES) {
    options.push({ value: minute, label: formatMinuteOfDay(minute) })
  }
  return options
})

const lossLimitConfigValue = computed(() => {
  const amount = Number(lossLimitAmount.value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
})

const ruleConfig = computed(() => ({
  patternKeys: activeScenarioKeys.value,
  tags: activeTags.value,
  entryCutoffMinute: cutoffOn.value ? cutoffMinute.value : null,
  skipBrokenPlaybook: brokenPlaybookOn.value,
  maxTradesPerDay: maxTradesOn.value ? maxTradesValue.value : null,
  dailyLossLimit: lossLimitOn.value ? lossLimitConfigValue.value : null
}))

const activeSelectionCount = computed(() =>
  activeScenarioKeys.value.length +
  activeTags.value.length +
  (cutoffOn.value ? 1 : 0) +
  (brokenPlaybookOn.value ? 1 : 0) +
  (maxTradesOn.value ? 1 : 0) +
  (lossLimitOn.value && lossLimitConfigValue.value !== null ? 1 : 0)
)
const hasActiveSelection = computed(() => activeSelectionCount.value > 0)

const simulation = computed(() => summarizeSimulation(trades.value, ruleConfig.value))
const simulated = computed(() => simulation.value.simulated)
const removedCount = computed(() => simulation.value.removedCount)
const simulationDelta = computed(() => Math.round((simulated.value.totalPnl - actual.value.totalPnl) * 100) / 100)

// Each rule's effect on its own, so the trader can compare them side by side.
const ruleImpacts = computed(() => {
  const list = trades.value
  return {
    lossLimit: lossLimitConfigValue.value !== null ? ruleImpact(list, { dailyLossLimit: lossLimitConfigValue.value }) : null,
    maxTrades: ruleImpact(list, { maxTradesPerDay: maxTradesValue.value }),
    cutoff: cutoffOptions.value.length > 0 ? ruleImpact(list, { entryCutoffMinute: cutoffMinute.value }) : null,
    playbook: playbookRule.value.reviewedCount > 0 ? ruleImpact(list, { skipBrokenPlaybook: true }) : null
  }
})

const tagImpacts = computed(() => {
  const out = {}
  for (const opt of tagOptions.value) {
    out[opt.tag] = ruleImpact(trades.value, { tags: [opt.tag] })
  }
  return out
})

function toggleScenario(key) {
  if (activeScenarioKeys.value.includes(key)) {
    activeScenarioKeys.value = activeScenarioKeys.value.filter(k => k !== key)
  } else {
    activeScenarioKeys.value = [...activeScenarioKeys.value, key]
  }
}

function toggleTag(tag) {
  if (activeTags.value.includes(tag)) {
    activeTags.value = activeTags.value.filter(t => t !== tag)
  } else {
    activeTags.value = [...activeTags.value, tag]
  }
}

function adjustMaxTrades(step) {
  maxTradesValue.value = Math.max(1, (Number(maxTradesValue.value) || FALLBACK_MAX_TRADES) + step)
  maxTradesOn.value = true
}

function clearScenarios() {
  applyingDefaults = true
  activeScenarioKeys.value = []
  activeTags.value = []
  lossLimitOn.value = false
  maxTradesOn.value = false
  cutoffOn.value = false
  brokenPlaybookOn.value = false
  userAdjustedRules.value = false
  applyingDefaults = false
}

function snapCutoffToOptions(target) {
  const options = cutoffOptions.value
  if (options.length === 0) return target
  return options.reduce((best, opt) =>
    Math.abs(opt.value - target) < Math.abs(best - target) ? opt.value : best
  , options[0].value)
}

function applyRuleDefaults(ruleData) {
  applyingDefaults = true
  if (userAdjustedRules.value) {
    // Keep the trader's settings; only drop tags that no longer exist and keep
    // the cutoff on a time that exists in the new range.
    const available = new Set(tagOptions.value.map(opt => opt.tag))
    activeTags.value = activeTags.value.filter(tag => available.has(tag))
    cutoffMinute.value = snapCutoffToOptions(cutoffMinute.value)
    if (playbookRule.value.reviewedCount === 0) brokenPlaybookOn.value = false
    applyingDefaults = false
    return
  }

  lossLimitAmount.value = Number(ruleData?.dailyLossLimit?.default) > 0
    ? Number(ruleData.dailyLossLimit.default)
    : FALLBACK_LOSS_LIMIT
  maxTradesValue.value = Number(ruleData?.maxTradesPerDay?.default) >= 1
    ? Number(ruleData.maxTradesPerDay.default)
    : FALLBACK_MAX_TRADES

  const preferred = Number(ruleData?.entryCutoff?.defaultMinute)
  // Snap to the option closest to the conventional default (11:00 AM).
  cutoffMinute.value = snapCutoffToOptions(Number.isFinite(preferred) ? preferred : FALLBACK_CUTOFF_MINUTE)

  activeTags.value = []
  lossLimitOn.value = false
  maxTradesOn.value = false
  cutoffOn.value = false
  brokenPlaybookOn.value = false
  applyingDefaults = false
}

watch(
  [lossLimitOn, lossLimitAmount, maxTradesOn, maxTradesValue, cutoffOn, cutoffMinute, brokenPlaybookOn, activeTags],
  () => {
    if (!applyingDefaults) userAdjustedRules.value = true
  },
  { flush: 'sync' }
)

function formatMoney(value) {
  const abs = Math.abs(Number(value) || 0)
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatSignedMoney(value) {
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : num < 0 ? '-' : ''
  return `${prefix}${formatMoney(num)}`
}

function formatImpact(impact) {
  if (!impact) return ''
  if (impact.removedCount === 0) return 'no trades affected'
  return formatSignedMoney(impact.delta)
}

function impactClass(impact) {
  if (!impact || impact.removedCount === 0 || impact.delta === 0) return 'text-gray-500 dark:text-gray-400'
  return impact.delta > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
}

function pnlTextClass(value) {
  const num = Number(value) || 0
  if (num > 0) return 'text-green-700 dark:text-green-400'
  if (num < 0) return 'text-red-700 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function ruleRowClass(active) {
  return active
    ? 'border-primary-500 bg-primary-50/60 text-primary-900 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-100'
    : 'border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
}

function pillClass(active) {
  return active
    ? 'border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-100 shadow-sm'
    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
}

function checkboxClass(active) {
  return active
    ? 'border-primary-600 bg-primary-600 text-white'
    : 'border-gray-300 dark:border-gray-600'
}

function renderChart() {
  if (!chartCanvas.value || trades.value.length < 2) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  const dark = isDark.value || document.documentElement.classList.contains('dark')
  const textColor = dark ? '#D1D5DB' : '#4B5563'
  const gridColor = dark ? 'rgba(75, 85, 99, 0.35)' : 'rgba(229, 231, 235, 0.9)'

  const { labels, actualSeries, simSeries } = buildEquitySeries(trades.value, simulation.value.removed)

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'With selected changes',
          data: simSeries,
          borderColor: '#15803d',
          backgroundColor: 'rgba(21, 128, 61, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.25,
          pointRadius: labels.length > 50 ? 0 : 2.5,
          pointHoverRadius: 4
        },
        {
          label: 'Actual equity curve',
          data: actualSeries,
          borderColor: dark ? '#9CA3AF' : '#6B7280',
          borderDash: [5, 4],
          borderWidth: 2,
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: textColor, boxWidth: 14, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const val = context.parsed.y
              return `${context.dataset.label}: ${formatSignedMoney(val)}`
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, maxTicksLimit: 8 },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            callback: value => formatSignedMoney(value)
          },
          grid: { color: gridColor }
        }
      }
    }
  })
}

async function fetchData() {
  if (!isTierResolved.value) return
  const seq = ++fetchSeq
  loading.value = true
  loadError.value = ''
  try {
    if (isProUser.value) {
      const response = await api.get('/analytics/what-if', { params: props.filterParams })
      if (seq !== fetchSeq) return
      const data = response.data || {}
      actual.value = data.actual || { tradeCount: 0, totalPnl: 0, winCount: 0, lossCount: 0, winRate: 0, profitFactor: 0 }
      scenarios.value = Array.isArray(data.scenarios) ? data.scenarios : []
      trades.value = Array.isArray(data.trades) ? data.trades : []
      rules.value = data.rules || null
      applyRuleDefaults(rules.value)
      // Default to highlighting the highest-impact pattern first so the curve separation is immediately obvious
      activeScenarioKeys.value = scenarios.value.length > 0 ? [scenarios.value[0].key] : []
    }
  } catch (error) {
    if (seq !== fetchSeq) return
    console.error('Failed to load What-If simulator data:', error)
    if (isProUser.value) {
      loadError.value = 'Unable to load What-If simulation right now. Please try again.'
    }
  } finally {
    if (seq === fetchSeq) {
      loading.value = false
      if (isProUser.value && !loadError.value) {
        await nextTick()
        renderChart()
      }
    }
  }
}

watch(
  () => [isTierResolved.value, isProUser.value],
  ([resolved]) => {
    if (resolved) fetchData()
  },
  { immediate: true }
)

watch(
  () => JSON.stringify(props.filterParams || {}),
  () => {
    if (isTierResolved.value) fetchData()
  }
)

watch(
  () => [simulation.value, isDark.value],
  async () => {
    if (isProUser.value && !loading.value && !loadError.value) {
      await nextTick()
      renderChart()
    }
  }
)

onMounted(() => {
  if (isProUser.value && !loading.value && !loadError.value) {
    renderChart()
  }
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>
