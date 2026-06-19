<template>
  <div class="card-dense h-full">
    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="flex items-center justify-center w-6 h-6 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
          <MdiIcon :icon="mdiShieldAlertOutline" :size="14" />
        </div>
        <h3 class="heading-card">Risk Signals</h3>
      </div>
      <span
        v-if="riskSignalCount > 0"
        class="text-xs text-mono-num font-semibold px-2 py-0.5 rounded-full"
        :class="riskSignalCount >= 3
          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'"
      >
        {{ riskSignalCount }}
      </span>
    </div>

    <div class="card-dense-body">
      <!-- Loading -->
      <div v-if="loading" class="space-y-2 animate-pulse">
        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
      </div>

      <!-- Fetch failed (e.g. 404 from stale backend) — make it obvious so
           the user doesn't mistake a missing endpoint for "all clear." -->
      <div v-else-if="fetchStatus === 'error'" class="text-center py-4">
        <p class="text-sm text-gray-700 dark:text-gray-200 font-medium">Risk signals unavailable</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ error || 'Could not load risk signals.' }}</p>
      </div>

      <!-- Not enough trade history yet -->
      <div v-else-if="notEnoughData" class="text-center py-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">Trade more to unlock risk signals.</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Need at least 10 closed trades in the last 90 days.
        </p>
      </div>

      <!-- All clear: signals computed and zero fired. Show how many trades
           were analyzed so the user can see the check actually ran. -->
      <div v-else-if="allClear" class="text-center py-4">
        <div class="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
          <MdiIcon :icon="mdiCheckCircleOutline" :size="22" />
        </div>
        <div class="mt-2 text-sm font-medium text-gray-900 dark:text-white">All clear</div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span v-if="analyzedTradeCount > 0">
            No risk patterns detected across {{ analyzedTradeCount }} closed trades in the last 180 days.
          </span>
          <span v-else>
            No risk patterns detected.
          </span>
        </p>
      </div>

      <!-- Signals to show (formal Pro alerts + trade-derived) -->
      <div v-else class="space-y-3">
        <!-- Pro behavioral alert (highest priority when present) -->
        <div
          v-if="proAlert"
          class="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
        >
          <div class="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
              {{ proAlert.title || formatPatternType(proAlert.pattern_type) || 'Behavioral alert' }}
            </div>
            <div v-if="proAlert.message" class="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
              {{ proAlert.message }}
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 text-mono-num">
              Pro · {{ relativeTime(proAlert.created_at) }}
            </div>
          </div>
        </div>

        <!-- Trade-derived signals (always-on, no Pro pipeline required) -->
        <div
          v-for="signal in derivedSignals"
          :key="signal.key"
          class="rounded-md border px-3 py-2.5"
          :class="severityClass(signal.severity)"
        >
          <div class="flex items-start gap-2">
            <div
              class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
              :class="severityDotClass(signal.severity)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ signal.label }}</span>
                <span v-if="signal.value !== undefined" class="text-mono-num text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {{ signal.value }}<span v-if="signal.unit" class="ml-0.5">{{ signal.unit ? '' : '' }}</span>
                </span>
              </div>
              <p v-if="signal.unit" class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                {{ signal.unit }}
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                {{ signal.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Pro pattern signal counts (only when there are patterns logged) -->
        <div v-if="proPatternSignals.length > 0" class="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Behavioral analysis · last 90 days</div>
          <div class="space-y-1">
            <div
              v-for="signal in proPatternSignals"
              :key="signal.pattern_type"
              class="flex items-center justify-between text-xs"
            >
              <span class="text-gray-700 dark:text-gray-300">{{ formatPatternType(signal.pattern_type) }}</span>
              <span class="text-mono-num text-gray-500 dark:text-gray-400">
                {{ signal.total_occurrences }}
                <span v-if="signal.high_severity_count > 0" class="text-red-600 dark:text-red-400 ml-1">
                  ({{ signal.high_severity_count }} high)
                </span>
              </span>
            </div>
          </div>
          <router-link
            to="/analytics"
            class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
          >
            View behavioral analysis
            <MdiIcon :icon="mdiArrowRight" :size="12" />
          </router-link>
        </div>

        <!-- Pro upsell when user is free tier and derived signals are showing -->
        <div
          v-if="proUpgradeRequired && derivedSignals.length > 0"
          class="mt-2 p-2.5 rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800/40"
        >
          <div class="flex items-start gap-2">
            <MdiIcon :icon="mdiLockOutline" :size="14" class="text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-gray-900 dark:text-white">Pro adds revenge-trade detection, overconfidence tracking, and real-time alerts</div>
              <router-link
                to="/billing"
                class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700"
              >
                Upgrade to Pro
                <MdiIcon :icon="mdiArrowRight" :size="12" />
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MdiIcon from '@/components/MdiIcon.vue'
import {
  mdiShieldAlertOutline,
  mdiLockOutline,
  mdiCheckCircleOutline,
  mdiArrowRight
} from '@mdi/js'

const props = defineProps({
  summary: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  upgradeRequired: { type: Boolean, default: false },
  // 'idle' before the first fetch; 'ok' after a successful response;
  // 'error' on a non-403 failure (e.g. 404 from old backend); 'forbidden' on 403.
  fetchStatus: { type: String, default: 'idle' },
  error: { type: [String, null], default: null }
})

// Derived (trade-based) signals — always present once user has ≥10 closed trades.
const derivedSignals = computed(() => {
  const d = props.summary?.derived
  if (!d || !Array.isArray(d.signals)) return []
  return d.signals
})

// Trade count the backend used when computing the derived signals — gives
// the "all clear" state proof that the analysis actually ran.
const analyzedTradeCount = computed(() => {
  return parseInt(props.summary?.derived?.summary?.recent_trades) || 0
})

const notEnoughData = computed(() => {
  const d = props.summary?.derived
  // Only show "not enough data" when we have a clean derived response saying
  // ready: false AND no Pro alerts/signals fell through.
  if (!d) return false
  if (d.summary && d.summary.ready === false) {
    return !proAlert.value && proPatternSignals.value.length === 0
  }
  return false
})

// Pro alert (highest priority when shown)
const proAlert = computed(() => props.summary?.pro?.active_alert || props.summary?.active_alert || null)

// Pro pattern signals (occurrences)
const proPatternSignals = computed(() => {
  const proSignals = props.summary?.pro?.signals || props.summary?.signals || []
  return Array.isArray(proSignals) ? proSignals : []
})

// Pro upsell — user is free tier (per backend) OR the original middleware
// path 403'd. Both indicate the deeper pipeline isn't available to them.
const proUpgradeRequired = computed(() => {
  if (props.upgradeRequired) return true
  return props.summary?.pro?.upgrade_required === true
})

// Header badge: only count actual risk signals, not info snapshots.
const riskSignalCount = computed(() => {
  const riskDerived = derivedSignals.value.filter(s => s.severity !== 'info').length
  return riskDerived + (proAlert.value ? 1 : 0) + proPatternSignals.value.length
})

// Total visible rows in the body — used to decide whether to render "all clear"
// vs the signal list. Info signals count here because they're a real row.
const totalSignalCount = computed(() => {
  return derivedSignals.value.length + (proAlert.value ? 1 : 0) + proPatternSignals.value.length
})

const allClear = computed(() => {
  if (notEnoughData.value) return false
  return totalSignalCount.value === 0
})

function severityClass(severity) {
  switch (severity) {
    case 'high':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
    case 'medium':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
    case 'low':
      return 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700'
    case 'info':
    default:
      // Informational rows get a subtle primary-tinted background so they
      // read as "context" rather than "warning."
      return 'bg-primary-50/40 dark:bg-primary-900/10 border-primary-200/60 dark:border-primary-800/30'
  }
}
function severityDotClass(severity) {
  switch (severity) {
    case 'high':   return 'bg-red-500'
    case 'medium': return 'bg-amber-500'
    case 'low':    return 'bg-gray-400'
    case 'info':
    default:       return 'bg-primary-500'
  }
}

function formatPatternType(type) {
  if (!type) return ''
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!then) return ''
  const diff = Math.floor((Date.now() - then) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
</script>
