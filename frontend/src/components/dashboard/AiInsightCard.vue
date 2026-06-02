<template>
  <div class="card-dense">
    <div class="card-dense-body">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-2 min-w-0">
          <div
            class="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
            :class="iconTintClass"
          >
            <MdiIcon :icon="iconPath" :size="18" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-label">{{ kindLabel }}</span>
              <!-- AI-enhanced badge: tells the user this body has been
                   rewritten by their configured AI provider, not just
                   deterministic data. -->
              <span
                v-if="current?.ai_enhanced"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                title="Refined with your configured AI provider"
              >
                <MdiIcon :icon="mdiAutoFix" :size="10" />
                AI
              </span>
            </div>
            <div class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {{ sourceLabel }}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Carousel navigation when there are 2+ insights -->
          <template v-if="!loading && !errorState && insights.length > 1">
            <button
              type="button"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Previous insight"
              @click="prev"
            >
              <MdiIcon :icon="mdiChevronLeft" :size="18" />
            </button>
            <span class="text-[10px] text-mono-num text-gray-500 dark:text-gray-400 tabular-nums">
              {{ index + 1 }} / {{ insights.length }}
            </span>
            <button
              type="button"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Next insight"
              @click="next"
            >
              <MdiIcon :icon="mdiChevronRight" :size="18" />
            </button>
          </template>
          <button
            v-if="!loading && current && !errorState"
            type="button"
            class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
            title="Refresh insights"
            @click="$emit('refresh')"
          >
            <MdiIcon :icon="mdiRefresh" :size="16" />
          </button>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="mt-3 space-y-2 animate-pulse">
        <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
      </div>

      <!-- Error / unavailable state -->
      <div v-else-if="errorState" class="mt-3">
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">{{ errorHeadline }}</h4>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{{ errorBody }}</p>
      </div>

      <!-- Loaded state — current insight -->
      <div v-else-if="current" class="mt-3">
        <h4 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-snug">
          {{ current.headline }}
        </h4>
        <p class="mt-1.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {{ current.body }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <a
            v-if="current.action_url && current.action_label && current.external_url"
            :href="current.action_url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            {{ current.action_label }}
            <MdiIcon :icon="mdiOpenInNew" :size="14" />
          </a>
          <router-link
            v-else-if="current.action_url && current.action_label"
            :to="current.action_url"
            class="inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            {{ current.action_label }}
            <MdiIcon :icon="mdiArrowRight" :size="14" />
          </router-link>
        </div>

        <!-- Dot navigation for visual feedback on which insight is showing -->
        <div v-if="insights.length > 1" class="mt-4 flex items-center gap-1.5">
          <button
            v-for="(_, i) in insights"
            :key="`dot-${i}`"
            type="button"
            class="h-1.5 rounded-full transition-all"
            :class="i === index
              ? 'w-6 bg-primary-500'
              : 'w-1.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'"
            :title="`Insight ${i + 1}`"
            @click="index = i"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="mt-3">
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">No insight yet</h4>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Trade a bit more and we'll surface a useful observation here.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import MdiIcon from '@/components/MdiIcon.vue'
import {
  mdiLightbulbOnOutline,
  mdiCalendarClockOutline,
  mdiNewspaperVariantOutline,
  mdiTrendingUp,
  mdiTrendingDown,
  mdiRefresh,
  mdiArrowRight,
  mdiOpenInNew,
  mdiChevronLeft,
  mdiChevronRight,
  mdiInformationOutline,
  mdiAutoFix
} from '@mdi/js'

const props = defineProps({
  // Array of insight objects, ordered by backend priority (most urgent first).
  insights: {
    type: Array,
    default: () => []
  },
  loading: { type: Boolean, default: false },
  error: { type: [String, null], default: null }
})

defineEmits(['refresh'])

const index = ref(0)

// Reset to first insight whenever the list changes (e.g. account/date filter
// changed, refresh triggered) so users always start at the highest-priority
// insight rather than stuck on a stale index that's now empty.
watch(
  () => props.insights,
  () => { index.value = 0 },
  { deep: false }
)

const current = computed(() => props.insights[index.value] || null)

function prev() {
  if (props.insights.length === 0) return
  index.value = (index.value - 1 + props.insights.length) % props.insights.length
}
function next() {
  if (props.insights.length === 0) return
  index.value = (index.value + 1) % props.insights.length
}

// Icon + tint based on insight type so the user can tell at a glance whether
// they're looking at a performance edge, an earnings alert, or a news flag.
// News insights additionally surface their tone (positive/negative/neutral)
// via a trending-up/-down icon and green/red tint.
const iconPath = computed(() => {
  const c = current.value
  if (!c) return mdiLightbulbOnOutline
  if (c.type === 'news') {
    if (c.tone === 'positive') return mdiTrendingUp
    if (c.tone === 'negative') return mdiTrendingDown
    return mdiNewspaperVariantOutline
  }
  switch (c.type) {
    case 'earnings': return mdiCalendarClockOutline
    case 'system':   return mdiInformationOutline
    default:         return mdiLightbulbOnOutline
  }
})
const iconTintClass = computed(() => {
  const c = current.value
  if (!c) return 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
  if (c.type === 'news') {
    if (c.tone === 'positive') return 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
    if (c.tone === 'negative') return 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    return 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
  }
  switch (c.type) {
    case 'earnings':
      return 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
    case 'system':
      return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
    default:
      return 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
  }
})
const kindLabel = computed(() => {
  const c = current.value
  if (!c) return 'Insight'
  if (c.type === 'news') {
    if (c.tone === 'positive') return 'News · positive'
    if (c.tone === 'negative') return 'News · negative'
    return 'News'
  }
  switch (c.type) {
    case 'earnings': return 'Earnings'
    case 'system':   return 'Getting started'
    case 'edge':     return 'Edge'
    default:         return 'Insight'
  }
})
const sourceLabel = computed(() => {
  if (!current.value) return ''
  if (current.value.source === 'ai') return 'AI generated'
  if (current.value.source === 'context') return 'Open positions'
  if (current.value.source === 'system') return 'Getting started'
  return 'Data driven'
})

const errorState = computed(() => !!props.error)
const errorHeadline = computed(() => 'Insight unavailable')
const errorBody = computed(() => {
  if (typeof props.error === 'string' && props.error.toLowerCase().includes('ai')) {
    return 'Configure an AI provider in Settings → AI to unlock personalized insights.'
  }
  return 'We could not load an insight right now. Check back in a moment.'
})
</script>
