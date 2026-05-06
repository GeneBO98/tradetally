<template>
  <div class="content-wrapper py-8">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-8">
      <div>
        <h1 class="heading-page">Web Mentions</h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">
          Pro alerts for curated financial/news feeds, holdings, watchlists, sectors, and custom terms.
        </p>
      </div>
      <button @click="resetForm" class="btn-secondary">New Rule</button>
    </div>

    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="relative space-y-6">
      <div v-if="loading" class="absolute top-0 right-0 z-10">
        <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
          <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section class="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ editingRuleId ? 'Edit Rule' : 'Rule Builder' }}</h2>
          </div>
          <form @submit.prevent="saveRule" class="p-6 space-y-5">
            <div class="grid grid-cols-1 gap-4">
              <label class="block">
                <span class="label">Rule name</span>
                <input v-model="form.name" class="input" placeholder="Apple and Nvidia mentions" required />
              </label>
            </div>

            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Start with holdings</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Choose one or more current holdings to monitor, or switch to a custom symbol set.
                  </p>
                </div>
                <button
                  type="button"
                  @click="enableCustomMonitoring"
                  class="btn-secondary text-sm"
                >
                  Monitor Custom
                </button>
              </div>

              <div v-if="holdingsLoading" class="text-sm text-gray-500 dark:text-gray-400">
                Loading holdings...
              </div>
              <div
                v-else-if="availableHoldings.length > 0"
                class="space-y-3"
              >
                <div ref="holdingsMenuRef" class="relative">
                  <button
                    type="button"
                    @click="holdingsMenuOpen = !holdingsMenuOpen"
                    class="input w-full flex items-center justify-between text-left"
                  >
                    <span class="truncate text-sm text-gray-900 dark:text-white">
                      {{ selectedHoldingSummary }}
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ holdingsMenuOpen ? 'Close' : 'Choose' }}
                    </span>
                  </button>

                  <div
                    v-if="holdingsMenuOpen"
                    class="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
                  >
                    <div class="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto p-2 md:grid-cols-2">
                      <label
                        v-for="holding in availableHoldings"
                        :key="holding.id || holding.symbol"
                        class="flex gap-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-3 cursor-pointer"
                      >
                        <input
                          v-model="selectedHoldingSymbols"
                          :value="holding.symbol"
                          type="checkbox"
                          class="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          @change="applyHoldingSelection"
                        />
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ holding.symbol }}</span>
                            <span v-if="holding.account_name || holding.account_identifier" class="text-[11px] text-gray-500 dark:text-gray-400">
                              {{ holding.account_name || holding.account_identifier }}
                            </span>
                          </div>
                          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {{ holding.company_name || 'Current holding' }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div v-if="selectedHoldingSymbols.length > 0" class="flex flex-wrap gap-2">
                  <span
                    v-for="symbol in selectedHoldingSymbols"
                    :key="symbol"
                    class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  >
                    {{ symbol }}
                    <button type="button" class="text-primary-700 dark:text-primary-300" @click="removeHoldingSymbol(symbol)">×</button>
                  </span>
                </div>
                <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                  No holdings selected yet.
                </div>
              </div>
              <div v-else class="text-sm text-gray-500 dark:text-gray-400">
                No holdings available yet. Use custom monitoring to create a symbol-based rule.
              </div>

              <label v-if="form.scope_type === 'custom'" class="block">
                <span class="label">Symbols</span>
                <textarea v-model="symbolsText" class="input min-h-[90px]" placeholder="AAPL, XOM, URA"></textarea>
              </label>
            </div>

            <div v-if="showRuleDetails" class="space-y-5">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label v-if="form.scope_type === 'sector'" class="block">
                  <span class="label">Sector</span>
                  <input v-model="form.sector" class="input" placeholder="Energy" />
                </label>
              </div>

              <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Trusted sources</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Choose which curated feeds this rule can monitor.
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" @click="selectAllSources" class="text-xs text-primary-600 hover:text-primary-800">Select all</button>
                    <button type="button" @click="clearSources" class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Clear</button>
                  </div>
                </div>
                <div class="space-y-3">
                  <div ref="sourcesMenuRef" class="relative">
                    <button
                      type="button"
                      @click="sourcesMenuOpen = !sourcesMenuOpen"
                      class="input w-full flex items-center justify-between text-left"
                    >
                      <span class="truncate text-sm text-gray-900 dark:text-white">
                        {{ selectedSourceSummary }}
                      </span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ sourcesMenuOpen ? 'Close' : 'Choose' }}
                      </span>
                    </button>

                    <div
                      v-if="sourcesMenuOpen"
                      class="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
                    >
                      <div class="max-h-80 overflow-y-auto p-2 space-y-2">
                        <label
                          v-for="source in trustedSources"
                          :key="source.id"
                          class="flex gap-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-3 cursor-pointer"
                        >
                          <input
                            v-model="form.source_ids"
                            :value="source.id"
                            type="checkbox"
                            class="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ source.name }}</span>
                              <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                                Trusted
                              </span>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ source.trust_note }}</p>
                            <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                              {{ source.domain || source.source_type }} · every {{ source.fetch_interval_minutes }} min
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div v-if="selectedSourceNames.length > 0" class="flex flex-wrap gap-2">
                    <span
                      v-for="source in selectedSourceNames"
                      :key="source.id"
                      class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    >
                      {{ source.name }}
                      <button type="button" class="text-primary-700 dark:text-primary-300" @click="removeSource(source.id)">×</button>
                    </span>
                  </div>
                  <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                    No trusted sources selected yet.
                  </div>
                </div>
              </div>

              <div class="space-y-4">
                <div class="block">
                  <span class="label">Terms</span>
                  <textarea v-model="termsText" class="input min-h-[90px]" placeholder="oil, nuclear fusion, grid"></textarea>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Use the helper to pull in company-name phrases from the ticker so building a rule is less manual.
                  </p>
                </div>
                <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-end">
                  <button type="button" @click="suggestTermsFromSymbols" class="btn-secondary text-sm" :disabled="suggestingTerms">
                    {{ suggestingTerms ? 'Generating...' : 'Fill terms from symbols' }}
                  </button>
                  <div ref="presetMenuRef" class="relative w-full md:w-80">
                    <button
                      type="button"
                      @click="togglePresetMenu"
                      class="input w-full flex items-center justify-between text-left text-sm"
                    >
                      <span class="truncate text-gray-900 dark:text-white">
                        {{ presetMenuLabel }}
                      </span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ presetMenuOpen ? 'Close' : 'Choose' }}
                      </span>
                    </button>

                    <div
                      v-if="presetMenuOpen"
                      class="absolute right-0 z-20 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
                    >
                      <div class="max-h-80 overflow-y-auto p-2 space-y-2">
                        <button
                          type="button"
                          @click="startSavingPreset"
                          class="flex w-full items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-sm text-gray-900 dark:text-white"
                        >
                          <span>Save as new preset</span>
                          <span class="text-xs text-gray-500 dark:text-gray-400">New</span>
                        </button>

                        <div
                          v-if="presetSaveMode"
                          class="rounded-md border border-gray-200 dark:border-gray-700 p-2"
                        >
                          <div class="flex items-center gap-2">
                            <input
                              v-model="presetName"
                              class="input w-full text-sm"
                              placeholder="Apple event terms"
                              @keydown.enter.prevent="savePreset"
                            />
                            <button
                              type="button"
                              @click="savePreset"
                              class="btn-secondary text-sm"
                              :disabled="savingPreset || !presetName.trim()"
                            >
                              {{ savingPreset ? 'Saving...' : '✓' }}
                            </button>
                          </div>
                        </div>

                        <button
                          v-for="preset in presets"
                          :key="preset.id"
                          type="button"
                          @click="selectPreset(preset.id)"
                          class="flex w-full items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-sm"
                          :class="selectedPresetId === preset.id ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'text-gray-900 dark:text-white'"
                        >
                          <span class="truncate">{{ preset.name }}</span>
                          <span v-if="selectedPresetId === preset.id" class="text-xs">Applied</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <label class="block">
                  <span class="label">Article threshold</span>
                  <input v-model.number="form.threshold_count" type="number" min="1" max="100" class="input" />
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">How many distinct articles must match before the rule sends an alert.</p>
                </label>
                <label class="block">
                  <span class="label">Term matches required</span>
                  <input v-model.number="form.term_match_threshold" type="number" min="1" max="25" class="input" />
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">How many of your rule terms must appear in one article for it to qualify.</p>
                </label>
                <label class="block">
                  <span class="label">Window hours</span>
                  <input v-model.number="form.window_hours" type="number" min="1" max="168" class="input" />
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">How far back the rule looks when counting matching articles.</p>
                </label>
                <label class="block">
                  <span class="label">Cooldown hours</span>
                  <input v-model.number="form.cooldown_hours" type="number" min="1" max="168" class="input" />
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">How long the rule waits after firing before it can alert again.</p>
                </label>
              </div>

              <div class="flex gap-2 justify-end">
                <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Saving...' : 'Save Rule' }}</button>
                <button v-if="editingRuleId" type="button" @click="cancelEdit" class="btn-secondary">Cancel</button>
              </div>
            </div>
          </form>
        </section>

        <aside class="space-y-6">
          <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Active Rules</h2>
            </div>
            <div v-if="rules.length === 0" class="p-6 text-sm text-gray-500 dark:text-gray-400">No Web Mention rules yet.</div>
            <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
              <button
                v-for="rule in rules"
                :key="rule.id"
                @click="selectRule(rule)"
                class="relative w-full text-left p-5 transition-colors"
                :class="selectedRule?.id === rule.id
                  ? 'z-10 rounded-md bg-primary-50/80 ring-1 ring-primary-500/55 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_18px_rgba(251,146,60,0.18)] dark:bg-primary-900/20 dark:ring-primary-400/50 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_0_20px_rgba(251,146,60,0.14)]'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'"
              >
                <div class="flex items-center justify-between">
                  <p class="font-medium text-gray-900 dark:text-white">{{ rule.name }}</p>
                  <span class="text-xs" :class="rule.enabled ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'">
                    {{ rule.enabled ? 'On' : 'Off' }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {{ rule.scope_type }} · {{ rule.threshold_count }} articles / {{ rule.window_hours }}h · {{ rule.term_match_threshold || 1 }} term match{{ (rule.term_match_threshold || 1) === 1 ? '' : 'es' }} · {{ rule.source_ids?.length || 0 }} sources
                </p>
                <div class="mt-3 flex gap-2">
                  <button
                    @click.stop="toggleRuleEnabled(rule)"
                    class="text-xs"
                    :class="rule.enabled ? 'text-amber-600 hover:text-amber-800' : 'text-primary-600 hover:text-primary-800'"
                  >
                    {{ rule.enabled ? 'Disable' : 'Enable' }}
                  </button>
                  <button @click.stop="testExistingRule(rule)" class="text-xs text-primary-600 hover:text-primary-800">Preview</button>
                  <button @click.stop="editRule(rule)" class="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Edit</button>
                  <button @click.stop="removeRule(rule)" class="text-xs text-red-600 hover:text-red-800">Delete</button>
                </div>
              </button>
            </div>
          </section>

          <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Mentions</h2>
              <span v-if="selectedRule" class="text-sm text-gray-500 dark:text-gray-400">{{ selectedRule.name }}</span>
            </div>
            <div v-if="mentions.length === 0" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No matching articles in the current rule window.
            </div>
            <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
              <article
                v-for="mention in mentions"
                :key="mention.id"
                class="p-5 space-y-3"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 space-y-2">
                    <a
                      :href="mention.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block text-sm font-semibold leading-6 text-primary-600 hover:text-primary-800 break-words"
                    >
                      {{ mention.title }}
                    </a>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ mention.source_name }}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Published</p>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {{ formatDate(mention.published_at || mention.discovered_at) }}
                    </p>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Matched symbols</p>
                    <p class="mt-1 text-sm text-gray-700 dark:text-gray-200 break-words">
                      {{ (mention.matched_symbols || []).join(', ') || 'None' }}
                    </p>
                  </div>
                  <div class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Matched terms</p>
                    <p class="mt-1 text-sm text-gray-700 dark:text-gray-200 break-words">
                      {{ (mention.matched_terms || []).join(', ') || 'None' }}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Trusted Sources</h2>
            </div>
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">Connection health</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Only failing sources are expandable here.</p>
                </div>
                <span
                  class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium"
                  :class="sourceErrorCount === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'"
                >
                  {{ connectedSourceCount }}/{{ sources.length }}
                </span>
              </div>

              <div v-if="sourceErrorCount === 0" class="text-sm text-gray-500 dark:text-gray-400">
                All trusted sources are connected.
              </div>

              <div v-else class="space-y-3">
                <button
                  type="button"
                  @click="showSourceErrors = !showSourceErrors"
                  class="text-sm text-primary-600 hover:text-primary-800"
                >
                  {{ showSourceErrors ? 'Hide source errors' : `Show ${sourceErrorCount} source error${sourceErrorCount === 1 ? '' : 's'}` }}
                </button>
                <div v-if="showSourceErrors" class="space-y-3">
                  <div
                    v-for="source in failingSources"
                    :key="source.id"
                    class="rounded-md border border-red-200 dark:border-red-900/40 px-3 py-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{ source.name }}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ source.domain || source.source_type }}</p>
                        <p class="text-xs text-red-600 dark:text-red-300 mt-2">{{ source.last_fetch_error || 'Fetch failed' }}</p>
                      </div>
                      <span class="inline-flex px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        error
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { useWebMentionsStore } from '@/stores/webMentions'
import { useNotification } from '@/composables/useNotification'

const route = useRoute()
const store = useWebMentionsStore()
const { showError, showSuccess, showWarning } = useNotification()
const rules = computed(() => store.rules)
const mentions = computed(() => store.mentions)
const sources = computed(() => store.sources)
const trustedSources = computed(() => sources.value.filter(source => source.enabled))
const failingSources = computed(() => sources.value.filter(source => source.last_fetch_status === 'error'))
const sourceErrorCount = computed(() => failingSources.value.length)
const connectedSourceCount = computed(() => Math.max(sources.value.length - sourceErrorCount.value, 0))
const presets = computed(() => store.presets)
const loading = computed(() => store.loading)
const initialLoading = ref(true)
const saving = ref(false)
const suggestingTerms = ref(false)
const savingPreset = ref(false)
const holdingsLoading = ref(false)
const holdingsMenuOpen = ref(false)
const sourcesMenuOpen = ref(false)
const presetMenuOpen = ref(false)
const holdingsMenuRef = ref(null)
const sourcesMenuRef = ref(null)
const presetMenuRef = ref(null)
const editingRuleId = ref(null)
const selectedRule = ref(null)
const watchlists = ref([])
const availableHoldings = ref([])
const selectedHoldingSymbols = ref([])
const selectedPresetId = ref('')
const presetName = ref('')
const presetSaveMode = ref(false)
const showSourceErrors = ref(false)
const appliedPresetState = ref({
  terms: [],
  symbols: [],
  sector: ''
})

const form = ref(defaultForm())
const symbolsText = ref('')
const termsText = ref('')
const showRuleDetails = computed(() => editingRuleId.value !== null || form.value.scope_type === 'custom' || selectedHoldingSymbols.value.length > 0)
const selectedSourceNames = computed(() => trustedSources.value.filter(source => (form.value.source_ids || []).includes(source.id)))
const selectedHoldingSummary = computed(() => {
  if (selectedHoldingSymbols.value.length === 0) return 'Choose holdings to monitor'
  if (selectedHoldingSymbols.value.length === 1) return selectedHoldingSymbols.value[0]
  return `${selectedHoldingSymbols.value.length} holdings selected`
})
const selectedSourceSummary = computed(() => {
  if (selectedSourceNames.value.length === 0) return 'Choose trusted sources'
  if (selectedSourceNames.value.length === 1) return selectedSourceNames.value[0].name
  return `${selectedSourceNames.value.length} sources selected`
})
const presetMenuLabel = computed(() => {
  if (presetSaveMode.value) return 'Save as new preset'
  if (!selectedPresetId.value) return 'Apply preset or save'
  const preset = presets.value.find(item => item.id === selectedPresetId.value)
  return preset?.name || 'Apply preset or save'
})

function defaultForm() {
  return {
    name: '',
    scope_type: '',
    watchlist_id: '',
    account_identifier: '',
    sector: '',
    source_ids: [],
    threshold_count: 1,
    term_match_threshold: 1,
    window_hours: 24,
    cooldown_hours: 12,
    enabled: true
  }
}

function csvToArray(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function resetForm() {
  editingRuleId.value = null
  form.value = defaultForm()
  holdingsMenuOpen.value = false
  sourcesMenuOpen.value = false
  presetMenuOpen.value = false
  selectedHoldingSymbols.value = []
  symbolsText.value = ''
  termsText.value = ''
  selectedPresetId.value = ''
  presetName.value = ''
  presetSaveMode.value = false
  appliedPresetState.value = { terms: [], symbols: [], sector: '' }
}

function cancelEdit() {
  resetForm()
}

function handleDocumentClick(event) {
  if (holdingsMenuOpen.value && holdingsMenuRef.value && !holdingsMenuRef.value.contains(event.target)) {
    holdingsMenuOpen.value = false
  }

  if (sourcesMenuOpen.value && sourcesMenuRef.value && !sourcesMenuRef.value.contains(event.target)) {
    sourcesMenuOpen.value = false
  }

  if (presetMenuOpen.value && presetMenuRef.value && !presetMenuRef.value.contains(event.target)) {
    presetMenuOpen.value = false
    presetSaveMode.value = false
  }
}

function buildPayload() {
  return {
    ...form.value,
    watchlist_id: form.value.watchlist_id || null,
    account_identifier: form.value.account_identifier || null,
    sector: form.value.sector || null,
    source_ids: form.value.source_ids,
    symbols: csvToArray(symbolsText.value),
    terms: csvToArray(termsText.value),
    term_match_threshold: form.value.term_match_threshold
  }
}

async function saveRule() {
  if ((form.value.source_ids || []).length === 0) {
    showError('Validation', 'Select at least one trusted source for this rule')
    return
  }

  saving.value = true
  try {
    const payload = buildPayload()
    const rule = editingRuleId.value
      ? await store.updateRule(editingRuleId.value, payload)
      : await store.createRule(payload)
    selectedRule.value = rule
    await store.fetchMentions({ rule_id: rule.id })
    resetForm()
    showSuccess('Saved', 'Web Mention rule updated')
  } catch (error) {
    showError('Save Failed', error.response?.data?.error || 'Failed to save Web Mention rule')
  } finally {
    saving.value = false
  }
}

function editRule(rule) {
  editingRuleId.value = rule.id
  form.value = {
    name: rule.name,
    scope_type: rule.scope_type,
    watchlist_id: rule.watchlist_id || '',
    account_identifier: rule.account_identifier || '',
    sector: rule.sector || '',
    source_ids: rule.source_ids || [],
    threshold_count: rule.threshold_count,
    term_match_threshold: rule.term_match_threshold || 1,
    window_hours: rule.window_hours,
    cooldown_hours: rule.cooldown_hours,
    enabled: rule.enabled
  }
  selectedHoldingSymbols.value = rule.scope_type === 'custom' ? [] : (rule.symbols || [])
  symbolsText.value = (rule.symbols || []).join(', ')
  termsText.value = (rule.terms || []).join(', ')
  selectedPresetId.value = ''
  presetMenuOpen.value = false
  presetSaveMode.value = false
  appliedPresetState.value = { terms: [], symbols: [], sector: '' }
}

async function removeRule(rule) {
  if (!window.confirm(`Delete Web Mention rule "${rule.name}"?`)) return
  try {
    await store.deleteRule(rule.id)
    if (selectedRule.value?.id === rule.id) {
      selectedRule.value = rules.value[0] || null
      await store.fetchMentions(selectedRule.value ? { rule_id: selectedRule.value.id } : {})
    }
    showSuccess('Deleted', 'Web Mention rule removed')
  } catch (error) {
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete Web Mention rule')
  }
}

async function toggleRuleEnabled(rule) {
  try {
    const updatedRule = await store.updateRule(rule.id, {
      ...rule,
      enabled: !rule.enabled
    })

    if (selectedRule.value?.id === rule.id) {
      selectedRule.value = updatedRule
    }

    showSuccess(
      updatedRule.enabled ? 'Rule Enabled' : 'Rule Disabled',
      `"${updatedRule.name}" is now ${updatedRule.enabled ? 'enabled' : 'disabled'}`
    )
  } catch (error) {
    showError('Update Failed', error.response?.data?.error || 'Failed to update Web Mention rule')
  }
}

async function selectRule(rule) {
  selectedRule.value = rule
  await store.fetchMentions({ rule_id: rule.id })
}

async function testExistingRule(rule) {
  selectedRule.value = rule
  try {
    const result = await store.testRule(rule.id)
    store.mentions = result.matches || []
    if ((result.matches || []).length === 0) {
      showWarning('No Matches', 'No recent articles matched this rule in the current window')
    }
  } catch (error) {
    showError('Preview Failed', error.response?.data?.error || 'Failed to preview Web Mention rule')
  }
}

function applyPreset(presetId) {
  const currentTerms = csvToArray(termsText.value)
    .filter(term => !appliedPresetState.value.terms.includes(term))
  const currentSymbols = csvToArray(symbolsText.value)
    .filter(symbol => !appliedPresetState.value.symbols.includes(symbol))

  if (appliedPresetState.value.sector && form.value.sector === appliedPresetState.value.sector) {
    form.value.sector = ''
  }

  const preset = presets.value.find(item => item.id === presetId)
  if (!preset) {
    termsText.value = currentTerms.join(', ')
    symbolsText.value = currentSymbols.join(', ')
    appliedPresetState.value = { terms: [], symbols: [], sector: '' }
    return
  }

  const presetTerms = preset.terms || []
  const presetSymbols = preset.symbols || []
  termsText.value = [...new Set([...currentTerms, ...presetTerms])].join(', ')
  symbolsText.value = [...new Set([...currentSymbols, ...presetSymbols])].join(', ')
  if (preset.sector) form.value.sector = preset.sector
  selectedPresetId.value = presetId
  appliedPresetState.value = {
    terms: presetTerms,
    symbols: presetSymbols,
    sector: preset.sector || ''
  }
}

function togglePresetMenu() {
  presetMenuOpen.value = !presetMenuOpen.value
  if (!presetMenuOpen.value) {
    presetSaveMode.value = false
  }
}

function startSavingPreset() {
  presetSaveMode.value = true
  selectedPresetId.value = ''
  presetName.value = ''
}

function selectPreset(presetId) {
  presetSaveMode.value = false
  presetName.value = ''
  selectedPresetId.value = presetId
  applyPreset(presetId)
  presetMenuOpen.value = false
}

async function savePreset() {
  if (!presetName.value.trim()) return

  const payload = {
    name: presetName.value.trim(),
    sector: form.value.sector || null,
    symbols: csvToArray(symbolsText.value),
    terms: csvToArray(termsText.value)
  }

  savingPreset.value = true
  try {
    const preset = await store.createPreset(payload)
    selectedPresetId.value = preset.id
    presetName.value = ''
    presetSaveMode.value = false
    presetMenuOpen.value = false
    showSuccess('Preset Saved', 'Custom Web Mention preset created')
  } catch (error) {
    showError('Preset Failed', error.response?.data?.error || 'Failed to save custom preset')
  } finally {
    savingPreset.value = false
  }
}

function selectAllSources() {
  form.value.source_ids = trustedSources.value.map(source => source.id)
}

function clearSources() {
  form.value.source_ids = []
}

function removeSource(sourceId) {
  form.value.source_ids = (form.value.source_ids || []).filter(id => id !== sourceId)
}

function enableCustomMonitoring() {
  selectedHoldingSymbols.value = []
  holdingsMenuOpen.value = false
  form.value.scope_type = 'custom'
  if (!symbolsText.value) {
    termsText.value = termsText.value
  }
}

function applyHoldingSelection() {
  const symbols = [...new Set(selectedHoldingSymbols.value)]
  form.value.scope_type = symbols.length > 0 ? 'holdings' : form.value.scope_type
  symbolsText.value = symbols.join(', ')

  if (!form.value.name && symbols.length > 0) {
    form.value.name = symbols.length === 1 ? `${symbols[0]} mentions` : `${symbols.length} holdings mentions`
  }
}

function removeHoldingSymbol(symbol) {
  selectedHoldingSymbols.value = selectedHoldingSymbols.value.filter(item => item !== symbol)
  applyHoldingSelection()
}

function formatAiDiagnosticMessage(diagnostics = []) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return 'AI diagnostics were not returned.'
  }

  const first = diagnostics[0]
  const symbol = first.symbol ? `${first.symbol}: ` : ''

  switch (first.ai_status) {
    case 'skipped':
      if (first.ai_skip_reason === 'no_provider_configured') {
        return `${symbol}no AI provider is configured for this request.`
      }
      if (first.ai_skip_reason === 'provider_not_configured') {
        return `${symbol}${first.ai_provider || 'selected provider'} is missing required credentials or URL.`
      }
      return `${symbol}AI was skipped.`
    case 'failed':
      return `${symbol}${first.ai_error || 'AI provider request failed.'}`
    case 'empty':
      return `${symbol}AI responded, but no parsable terms were returned.`
    case 'requested':
      return `${symbol}AI request was sent, but no usable term output was recorded.`
    default:
      return `${symbol}AI did not contribute new terms.`
  }
}

async function suggestTermsFromSymbols() {
  const symbols = csvToArray(symbolsText.value)
  if (symbols.length === 0) {
    showWarning('No Symbols', 'Add at least one symbol before generating terms')
    return
  }

  suggestingTerms.value = true
  try {
    const beforeTerms = new Set(csvToArray(termsText.value))
    const result = await store.suggestTerms(symbols)
    termsText.value = [...new Set([
      ...csvToArray(termsText.value),
      ...(result.terms || []),
      ...(result.aliases || [])
    ])].join(', ')

    const afterTerms = csvToArray(termsText.value)
    const addedCount = afterTerms.filter(term => !beforeTerms.has(term)).length

    if (!form.value.name && result.suggestions?.length === 1) {
      const suggestion = result.suggestions[0]
      form.value.name = suggestion.company_name ? `${suggestion.company_name} mentions` : `${suggestion.symbol} mentions`
    }
    if (addedCount > 0) {
      const aiBackedCount = (result.diagnostics || []).filter(item => item.ai_used).length
      if (aiBackedCount > 0) {
        showSuccess('Terms Added', `Added ${addedCount} symbol-based terms (${aiBackedCount} symbol${aiBackedCount === 1 ? '' : 's'} used AI suggestions)`)
      } else {
        showWarning('Fallback Terms Added', `Added ${addedCount} profile and ticker terms. ${formatAiDiagnosticMessage(result.diagnostics)}`)
      }
    } else {
      showWarning('No New Terms', formatAiDiagnosticMessage(result.diagnostics))
    }
  } catch (error) {
    showError('Suggestion Failed', error.response?.data?.error || 'Failed to generate terms from symbols')
  } finally {
    suggestingTerms.value = false
  }
}

function formatDate(value) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleString()
}

async function fetchWatchlists() {
  const response = await api.get('/watchlists')
  watchlists.value = response.data?.data || response.data || []
}

async function fetchHoldings() {
  holdingsLoading.value = true
  try {
    const response = await api.get('/investments/holdings')
    availableHoldings.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    availableHoldings.value = []
    showWarning('Holdings Unavailable', error.response?.data?.error || 'Failed to load current holdings')
  } finally {
    holdingsLoading.value = false
  }
}

function applyQuickCreateQuery() {
  if (route.query.watchlist_id) {
    form.value.scope_type = 'watchlist'
    form.value.watchlist_id = route.query.watchlist_id
    form.value.name = route.query.name ? `${route.query.name} mentions` : 'Watchlist mentions'
  }
  if (route.query.symbol) {
    form.value.scope_type = 'custom'
    form.value.name = `${route.query.symbol} mentions`
    symbolsText.value = route.query.symbol
  }
}

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)
  try {
    await Promise.all([
      store.fetchRules(),
      store.fetchSources(),
      store.fetchPresets(),
      fetchWatchlists(),
      fetchHoldings()
    ])
    selectedRule.value = rules.value[0] || null
    if (selectedRule.value) {
      await store.fetchMentions({ rule_id: selectedRule.value.id })
    }
    applyQuickCreateQuery()
    if (route.query.symbol) {
      await suggestTermsFromSymbols()
    }
  } finally {
    initialLoading.value = false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>
