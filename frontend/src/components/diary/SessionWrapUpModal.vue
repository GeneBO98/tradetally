<template>
  <BaseModal
    :model-value="modelValue"
    title="Wrap up today's session"
    size="lg"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="spinner spinner-md"></div>
    </div>

    <div v-else-if="loadFailed" class="py-8 text-center space-y-3" role="alert">
      <p class="text-sm font-medium text-red-700 dark:text-red-400">
        {{ errorMessage || "Could not load today's session summary." }}
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Retry loading your session summary before saving so existing entries and trades stay in sync.
      </p>
      <div>
        <button type="button" class="btn-primary btn-sm" @click="loadSummary">
          Retry
        </button>
      </div>
    </div>

    <div v-else class="space-y-5">
      <!-- Date & update notice -->
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Session date: <strong class="text-gray-900 dark:text-white">{{ formattedDate }}</strong></span>
        <span
          v-if="summary?.existingEntry"
          class="badge bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
        >
          Updating today's journal entry
        </span>
      </div>

      <!-- Step 1: Automatic Session Snapshot -->
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 p-4">
        <div v-if="summary && summary.tradeCount > 0" class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <div>
              <div class="text-label">Net P&amp;L</div>
              <div class="mt-0.5 text-lg font-semibold font-mono" :class="pnlClass(summary.netPnl)">
                {{ formatSignedMoney(summary.netPnl) }}
              </div>
            </div>
            <div>
              <div class="text-label">Record</div>
              <div class="mt-0.5 text-lg font-semibold font-mono text-gray-900 dark:text-white">
                {{ summary.wins }}W – {{ summary.losses }}L
              </div>
            </div>
            <div>
              <div class="text-label">Win Rate</div>
              <div class="mt-0.5 text-lg font-semibold font-mono text-gray-900 dark:text-white">
                {{ summary.winRate }}%
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span
              v-if="summary.bestTrade"
              class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
            >
              Best: {{ summary.bestTrade.symbol }} {{ formatSignedMoney(summary.bestTrade.pnl) }}
            </span>
            <span
              v-if="summary.worstTrade"
              class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
            >
              Worst: {{ summary.worstTrade.symbol }} {{ formatSignedMoney(summary.worstTrade.pnl) }}
            </span>
            <span
              v-if="summary.postLossReentries > 0"
              class="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
            >
              {{ summary.postLossReentries }} quick post-loss re-{{ summary.postLossReentries === 1 ? 'entry' : 'entries' }}
            </span>
          </div>
        </div>

        <div v-else class="text-sm text-gray-600 dark:text-gray-400">
          No closed trades logged for {{ formattedDate }} yet. Capture a quick market read or mindset note in 30 seconds.
        </div>
      </div>

      <!-- Step 2: 1-Tap Plan Discipline & Bias -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Followed your plan?</label>
          <div class="mt-1.5 grid grid-cols-3 gap-2">
            <button
              v-for="opt in planOptions"
              :key="opt.value"
              type="button"
              :aria-pressed="planChoice === opt.value"
              @click="planChoice = planChoice === opt.value ? null : opt.value"
              class="rounded-md border px-2.5 py-2 text-xs font-medium transition-colors"
              :class="planChoice === opt.value
                ? 'border-primary-600 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-200'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="label">Market read</label>
          <div class="mt-1.5 grid grid-cols-3 gap-2">
            <button
              v-for="opt in biasOptions"
              :key="opt.value"
              type="button"
              :aria-pressed="marketBias === opt.value"
              @click="marketBias = marketBias === opt.value ? '' : opt.value"
              class="rounded-md border px-2.5 py-2 text-xs font-medium transition-colors"
              :class="marketBias === opt.value
                ? 'border-primary-600 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-200'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 1-Tap Session Tags -->
      <div>
        <label class="label">Execution &amp; mindset tags</label>
        <p v-if="summary.postLossReentries > 0" class="mt-1 text-xs text-gray-500 dark:text-gray-400">The quick re-entry flag uses this session’s closed trades. It describes timing, not motive.</p>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            v-for="tag in quickTags"
            :key="tag.value"
            type="button"
            :aria-pressed="selectedTags.includes(tag.value)"
            @click="toggleTag(tag.value)"
            class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            :class="selectedTags.includes(tag.value)
              ? 'border-primary-700 bg-primary-700 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- Step 3: One-line takeaway -->
      <div>
        <label for="wrapup-lesson" class="label">One lesson for tomorrow's open</label>
        <textarea
          id="wrapup-lesson"
          v-model="lessonsLearned"
          rows="3"
          class="input mt-1.5"
          placeholder="e.g. Wait for the 5-minute candle close before adding, and stop trading after two consecutive losses."
        ></textarea>
      </div>

      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Suggestions from your notes</p>
          <button type="button" class="btn-secondary text-xs" :disabled="tagSuggestionsLoading || !tagInput.trim()"
            @click="suggestTags">{{ tagSuggestionsLoading ? 'Reading notes…' : 'Suggest tags' }}</button>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Sends your journal text and takeaway to the configured AI provider. Review a suggestion to add it; timing alone does not establish mindset.</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Your tag choices help us improve future suggestions.</p>
        <p v-if="tagSuggestionMessage" role="status" class="mt-3 text-sm text-gray-600 dark:text-gray-300">{{ tagSuggestionMessage }}</p>
        <div v-for="suggestion in tagSuggestions" :key="suggestion.tag" class="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
          <button type="button" class="btn-secondary text-xs" :aria-pressed="selectedTags.includes(suggestion.tag)"
            @click="toggleTag(suggestion.tag)">{{ selectedTags.includes(suggestion.tag) ? 'Remove' : 'Add' }} {{ tagLabel(suggestion.tag) }}</button>
          <button v-if="!selectedTags.includes(suggestion.tag)" type="button" class="btn-link ml-3 text-xs"
            @click="dismissSuggestion(suggestion.tag)">Dismiss {{ tagLabel(suggestion.tag) }}</button>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">“{{ suggestion.evidence }}”</p>
        </div>
      </div>

      <p v-if="errorMessage" class="text-sm text-red-700 dark:text-red-400">
        {{ errorMessage }}
      </p>
    </div>

    <template #footer>
      <router-link
        to="/diary"
        class="btn-link mr-auto text-xs"
        @click="$emit('update:modelValue', false)"
      >
        Open full journal
      </router-link>
      <button
        type="button"
        class="btn-secondary"
        :disabled="saving"
        @click="$emit('update:modelValue', false)"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary"
        :disabled="loading || saving || loadFailed || !summary"
        @click="saveWrapUp"
      >
        {{ saving ? 'Saving...' : (summary?.existingEntry ? 'Update journal' : 'Save wrap-up') }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import api from '@/services/api'
import { formatTradeDate } from '@/utils/date'
import { useNotification } from '@/composables/useNotification'

const PARTIALLY_FOLLOWED_TAG = 'partially-followed-plan'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  date: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const { showSuccess, showError } = useNotification()

const loading = ref(false)
const loadFailed = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const summary = ref(null)

// 'yes' | 'mostly' | 'no' | null (unanswered)
const planChoice = ref(null)
const marketBias = ref('')
const selectedTags = ref([])
const lessonsLearned = ref('')
const tagSuggestions = ref([])
const tagSuggestionsLoading = ref(false)
const tagSuggestionMessage = ref('')
const tagRunId = ref(null)
const exposedTagNames = ref([])
let tagRequest = 0
const tagInput = computed(() => [summary.value?.existingEntry?.content, lessonsLearned.value].filter(Boolean).join('\n'))
const tagLabel = tag => quickTags.find(t => t.value === tag)?.label || tag.replaceAll('-', ' ')

function sendTagFeedback(action, fields = {}, requestId = tagRunId.value) {
  if (!requestId) return
  // Feedback failures must not interrupt journaling or tag selection.
  void api.post(`/diary/tag-suggestions/${requestId}/feedback`, {
    eventId: crypto.randomUUID(), action, ...fields
  }).catch(() => {})
}

function dismissSuggestion(tag) {
  sendTagFeedback('dismissed', { tag })
  tagSuggestions.value = tagSuggestions.value.filter(s => s.tag !== tag)
}

async function suggestTags() {
  const request = ++tagRequest
  tagRunId.value = null
  exposedTagNames.value = []
  const text = tagInput.value
  tagSuggestionsLoading.value = true
  tagSuggestions.value = []
  tagSuggestionMessage.value = ''
  try {
    const { data } = await api.post('/diary/tag-suggestions', {
      text, ...(summary.value?.existingEntry?.id ? { entryId: summary.value.existingEntry.id } : {})
    })
    if (request !== tagRequest || text !== tagInput.value) return
    tagSuggestions.value = (data.decisions || []).filter(d => d.suggested && d.evidence)
    tagRunId.value = data.requestId || null
    exposedTagNames.value = tagSuggestions.value.map(s => s.tag)
    sendTagFeedback('shown', { tags: exposedTagNames.value })
    tagSuggestionMessage.value = tagSuggestions.value.length ? 'Choose which suggestions fit your session.' : 'Insufficient evidence for a mindset tag. You can choose one yourself.'
  } catch {
    if (request === tagRequest) tagSuggestionMessage.value = 'Suggestions are unavailable. You can choose tags yourself.'
  } finally {
    if (request === tagRequest) tagSuggestionsLoading.value = false
  }
}

watch(tagInput, () => {
  tagRunId.value = null
  exposedTagNames.value = []
  tagRequest++
  tagSuggestions.value = []
  tagSuggestionMessage.value = ''
  tagSuggestionsLoading.value = false
})
watch(() => props.modelValue, () => {
  tagRunId.value = null
  exposedTagNames.value = []
  tagRequest++
  tagSuggestions.value = []
  tagSuggestionMessage.value = ''
  tagSuggestionsLoading.value = false
})

const planOptions = [
  { value: 'yes', label: 'Yes' },
  { value: 'mostly', label: 'Mostly' },
  { value: 'no', label: 'No' }
]

const biasOptions = [
  { value: 'bullish', label: 'Bullish' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'bearish', label: 'Bearish' }
]

const quickTags = [
  { value: 'quick-reentry-after-loss', label: 'Quick re-entry after loss' },
  { value: 'disciplined', label: 'Disciplined' },
  { value: 'followed-plan', label: 'Followed plan' },
  { value: 'patient', label: 'Patient' },
  { value: 'good-risk-mgmt', label: 'Good risk mgmt' },
  { value: 'revenge-trade', label: 'Revenge trade' },
  { value: 'overtrading', label: 'Overtrading' },
  { value: 'fomo', label: 'FOMO' },
  { value: 'hesitation', label: 'Hesitation' },
  { value: 'plan-deviation', label: 'Plan deviation' },
  { value: 'cut-winners-early', label: 'Cut winners early' }
]

const formattedDate = computed(() => {
  const dateStr = summary.value?.date || props.date
  if (!dateStr) return 'Today'
  return formatTradeDate(dateStr, 'MMM dd, yyyy') || dateStr
})

function formatSignedMoney(value) {
  const num = Number(value) || 0
  const abs = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${num > 0 ? '+' : num < 0 ? '-' : ''}$${abs}`
}

function pnlClass(value) {
  const num = Number(value) || 0
  if (num > 0) return 'text-green-700 dark:text-green-400'
  if (num < 0) return 'text-red-700 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function toggleTag(tag) {
  if (exposedTagNames.value.includes(tag)) sendTagFeedback(
    selectedTags.value.includes(tag) ? 'removed' : 'accepted', { tag })
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter(t => t !== tag)
  } else {
    selectedTags.value = [...selectedTags.value, tag]
  }
}

function buildAutoSummaryContent() {
  const s = summary.value
  if (!s || s.tradeCount === 0) {
    return 'End-of-day session check-in (no closed trades logged).'
  }
  const parts = [
    `Session wrap-up: ${formatSignedMoney(s.netPnl)} across ${s.tradeCount} trade${s.tradeCount === 1 ? '' : 's'} (${s.wins}W-${s.losses}L, ${s.winRate}% win rate).`
  ]
  if (s.bestTrade) {
    parts.push(`Best trade: ${s.bestTrade.symbol} (${formatSignedMoney(s.bestTrade.pnl)}).`)
  }
  if (s.worstTrade) {
    parts.push(`Worst trade: ${s.worstTrade.symbol} (${formatSignedMoney(s.worstTrade.pnl)}).`)
  }
  if (s.postLossReentries > 0) {
    parts.push(`Flagged ${s.postLossReentries} quick post-loss re-${s.postLossReentries === 1 ? 'entry' : 'entries'}.`)
  }
  return parts.join('\n')
}

function localDateString(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// The exact sentences buildAutoSummaryContent writes, joined by a space (older
// entries) or a newline.
const SUMMARY_MONEY = '[+-]?\\$[\\d,]+\\.\\d{2}'
const SUMMARY_BLOCK = new RegExp(
  '(?:Session wrap-up: ' + SUMMARY_MONEY + ' across \\d+ trades? \\(\\d+W-\\d+L, [\\d.]+% win rate\\)\\.' +
  '|End-of-day session check-in \\(no closed trades logged\\)\\.)' +
  '(?:[ \\n](?:(?:Best|Worst) trade: [^\\n(]* \\(' + SUMMARY_MONEY + '\\)\\.' +
  '|Flagged \\d+ quick post-loss re-(?:entry|entries)\\.))*'
)

// Replace the stats sentences a previous wrap-up wrote, or append them when the
// entry was written by hand. Only those sentences are touched; anything the
// user typed before, after, or on the same line stays as it is.
function mergeSummaryIntoContent(existingContent, summaryText) {
  const content = String(existingContent || '')
  if (SUMMARY_BLOCK.test(content)) {
    return content.replace(SUMMARY_BLOCK, () => summaryText)
  }
  const base = content.trimEnd()
  return base ? `${base}\n\n${summaryText}` : summaryText
}

function mergeUnique(...lists) {
  return Array.from(new Set(lists.flat().filter(Boolean)))
}

async function loadSummary() {
  loading.value = true
  loadFailed.value = false
  errorMessage.value = ''
  try {
    // Always send the browser's calendar date: the server only knows the
    // saved profile timezone, which falls back to UTC when unset.
    const params = { date: props.date || localDateString() }
    const response = await api.get('/diary/session-summary', { params })
    summary.value = response.data || null

    const existing = summary.value?.existingEntry
    if (existing) {
      const existingTags = Array.isArray(existing.tags)
        ? existing.tags.filter(t => t !== 'sample')
        : []
      if (existing.followed_plan === true) {
        planChoice.value = 'yes'
      } else if (existing.followed_plan === false) {
        planChoice.value = 'no'
      } else if (existingTags.includes(PARTIALLY_FOLLOWED_TAG)) {
        planChoice.value = 'mostly'
      } else {
        planChoice.value = null
      }
      marketBias.value = existing.market_bias || ''
      selectedTags.value = existingTags.filter(t => t !== PARTIALLY_FOLLOWED_TAG)
      lessonsLearned.value = existing.lessons_learned || ''
    } else {
      planChoice.value = null
      marketBias.value = ''
      selectedTags.value = summary.value?.postLossReentries > 0 ? ['quick-reentry-after-loss'] : []
      lessonsLearned.value = ''
    }
  } catch (error) {
    console.error('Failed to load session summary:', error)
    loadFailed.value = true
    summary.value = null
    errorMessage.value = 'Could not load today\'s trade summary. Please retry before saving.'
  } finally {
    loading.value = false
  }
}

async function saveWrapUp() {
  if (!summary.value || loadFailed.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const entryDate = summary.value.date || props.date
    const existing = summary.value.existingEntry
    const followedPlan = planChoice.value === 'yes'
      ? true
      : planChoice.value === 'no'
        ? false
        : null
    const baseTags = selectedTags.value.filter(t => t !== PARTIALLY_FOLLOWED_TAG && t !== 'sample')
    const finalTags = planChoice.value === 'mostly'
      ? [...baseTags, PARTIALLY_FOLLOWED_TAG]
      : baseTags

    let response
    if (existing?.id) {
      // On update, refresh the stats block and add today's trades and symbols
      // to what the entry already holds. Lists are merged, never replaced, so
      // manual watchlist items and trade links survive.
      const updatePayload = {
        marketBias: marketBias.value || null,
        content: mergeSummaryIntoContent(existing.content, buildAutoSummaryContent()),
        watchlist: mergeUnique(existing.watchlist || [], summary.value.symbols || []),
        linkedTrades: mergeUnique(existing.linked_trades || [], summary.value.linkedTradeIds || []),
        tags: finalTags,
        followedPlan,
        lessonsLearned: lessonsLearned.value.trim() || null
      }
      response = await api.put(`/diary/${existing.id}`, updatePayload)
    } else {
      const createPayload = {
        entryDate,
        entryType: 'diary',
        title: `Session Wrap-Up · ${formattedDate.value}`,
        marketBias: marketBias.value || null,
        content: buildAutoSummaryContent(),
        watchlist: summary.value.symbols || [],
        linkedTrades: summary.value.linkedTradeIds || [],
        tags: finalTags,
        followedPlan,
        lessonsLearned: lessonsLearned.value.trim() || null
      }
      response = await api.post('/diary', createPayload)
    }

    showSuccess(
      existing?.id ? 'Session wrap-up updated' : 'Session wrapped up',
      'Saved to your Trading Journal.'
    )
    const savedEntryId = response.data?.entry?.id || existing?.id
    if (savedEntryId) sendTagFeedback('saved', { entryId: savedEntryId })
    emit('saved', response.data?.entry || null)
    emit('update:modelValue', false)
  } catch (error) {
    console.error('Failed to save session wrap-up:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to save your session wrap-up.'
    showError('Error', errorMessage.value)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  open => {
    if (open) {
      loadSummary()
    }
  },
  { immediate: true }
)
</script>
