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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="block">
                <span class="label">Rule name</span>
                <input v-model="form.name" class="input" placeholder="Energy basket mentions" required />
              </label>
              <label class="block">
                <span class="label">Scope</span>
                <select v-model="form.scope_type" class="input">
                  <option value="watchlist">Watchlist</option>
                  <option value="holdings">All holdings</option>
                  <option value="sector">Sector holdings</option>
                  <option value="custom">Custom symbols and terms</option>
                </select>
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label v-if="form.scope_type === 'watchlist'" class="block">
                <span class="label">Watchlist</span>
                <select v-model="form.watchlist_id" class="input">
                  <option value="">Select watchlist</option>
                  <option v-for="watchlist in watchlists" :key="watchlist.id" :value="watchlist.id">
                    {{ watchlist.name }}
                  </option>
                </select>
              </label>
              <label v-if="form.scope_type === 'sector'" class="block">
                <span class="label">Sector</span>
                <input v-model="form.sector" class="input" placeholder="Energy" />
              </label>
              <label v-if="form.scope_type === 'holdings' || form.scope_type === 'sector'" class="block">
                <span class="label">Account filter</span>
                <input v-model="form.account_identifier" class="input" placeholder="Optional account identifier" />
              </label>
              <label class="block">
                <span class="label">Preset terms</span>
                <select @change="applyPreset($event.target.value)" class="input">
                  <option value="">Apply preset</option>
                  <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
                </select>
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label class="block">
                <span class="label">Symbols</span>
                <textarea v-model="symbolsText" class="input min-h-[90px]" placeholder="AAPL, XOM, URA"></textarea>
              </label>
              <label class="block">
                <span class="label">Terms</span>
                <textarea v-model="termsText" class="input min-h-[90px]" placeholder="oil, nuclear fusion, grid"></textarea>
              </label>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="block">
                <span class="label">Article threshold</span>
                <input v-model.number="form.threshold_count" type="number" min="1" max="100" class="input" />
              </label>
              <label class="block">
                <span class="label">Window hours</span>
                <input v-model.number="form.window_hours" type="number" min="1" max="168" class="input" />
              </label>
              <label class="block">
                <span class="label">Cooldown hours</span>
                <input v-model.number="form.cooldown_hours" type="number" min="1" max="168" class="input" />
              </label>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input v-model="form.enabled" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                Enabled
              </label>
              <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Saving...' : 'Save Rule' }}</button>
              <button v-if="editingRuleId" type="button" @click="cancelEdit" class="btn-secondary">Cancel</button>
            </div>
          </form>
        </section>

        <aside class="space-y-6">
          <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Source Health</h2>
            </div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              <div v-for="source in sources" :key="source.id" class="p-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{ source.name }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ source.domain || source.source_type }}</p>
                  </div>
                  <span class="inline-flex px-2 py-1 rounded text-xs font-medium" :class="source.last_fetch_status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'">
                    {{ source.last_fetch_status || 'pending' }}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
              class="w-full text-left p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div class="flex items-center justify-between">
                <p class="font-medium text-gray-900 dark:text-white">{{ rule.name }}</p>
                <span class="text-xs" :class="rule.enabled ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'">
                  {{ rule.enabled ? 'On' : 'Off' }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ rule.scope_type }} · {{ rule.threshold_count }} articles / {{ rule.window_hours }}h
              </p>
              <div class="mt-3 flex gap-2">
                <button @click.stop="testExistingRule(rule)" class="text-xs text-primary-600 hover:text-primary-800">Preview</button>
                <button @click.stop="editRule(rule)" class="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Edit</button>
                <button @click.stop="removeRule(rule)" class="text-xs text-red-600 hover:text-red-800">Delete</button>
              </div>
            </button>
          </div>
        </section>

        <section class="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Mentions</h2>
            <span v-if="selectedRule" class="text-sm text-gray-500 dark:text-gray-400">{{ selectedRule.name }}</span>
          </div>
          <div v-if="mentions.length === 0" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No matching articles in the current rule window.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Article</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Matches</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Published</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="mention in mentions" :key="mention.id">
                  <td class="px-6 py-4">
                    <a :href="mention.url" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-primary-600 hover:text-primary-800">
                      {{ mention.title }}
                    </a>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ mention.source_name }}</p>
                  </td>
                  <td class="px-6 py-4 text-xs text-gray-600 dark:text-gray-300">
                    <div>{{ (mention.matched_symbols || []).join(', ') || 'No symbols' }}</div>
                    <div>{{ (mention.matched_terms || []).join(', ') || 'No terms' }}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(mention.published_at || mention.discovered_at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { useWebMentionsStore } from '@/stores/webMentions'

const route = useRoute()
const store = useWebMentionsStore()
const rules = computed(() => store.rules)
const mentions = computed(() => store.mentions)
const sources = computed(() => store.sources)
const presets = computed(() => store.presets)
const loading = computed(() => store.loading)
const initialLoading = ref(true)
const saving = ref(false)
const editingRuleId = ref(null)
const selectedRule = ref(null)
const watchlists = ref([])

const form = ref(defaultForm())
const symbolsText = ref('')
const termsText = ref('')

function defaultForm() {
  return {
    name: '',
    scope_type: 'custom',
    watchlist_id: '',
    account_identifier: '',
    sector: '',
    threshold_count: 3,
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
  symbolsText.value = ''
  termsText.value = ''
}

function cancelEdit() {
  resetForm()
}

function buildPayload() {
  return {
    ...form.value,
    watchlist_id: form.value.watchlist_id || null,
    account_identifier: form.value.account_identifier || null,
    sector: form.value.sector || null,
    symbols: csvToArray(symbolsText.value),
    terms: csvToArray(termsText.value)
  }
}

async function saveRule() {
  saving.value = true
  try {
    const payload = buildPayload()
    const rule = editingRuleId.value
      ? await store.updateRule(editingRuleId.value, payload)
      : await store.createRule(payload)
    selectedRule.value = rule
    await store.fetchMentions({ rule_id: rule.id })
    resetForm()
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
    threshold_count: rule.threshold_count,
    window_hours: rule.window_hours,
    cooldown_hours: rule.cooldown_hours,
    enabled: rule.enabled
  }
  symbolsText.value = (rule.symbols || []).join(', ')
  termsText.value = (rule.terms || []).join(', ')
}

async function removeRule(rule) {
  if (!window.confirm(`Delete Web Mention rule "${rule.name}"?`)) return
  await store.deleteRule(rule.id)
  if (selectedRule.value?.id === rule.id) {
    selectedRule.value = rules.value[0] || null
    await store.fetchMentions(selectedRule.value ? { rule_id: selectedRule.value.id } : {})
  }
}

async function selectRule(rule) {
  selectedRule.value = rule
  await store.fetchMentions({ rule_id: rule.id })
}

async function testExistingRule(rule) {
  selectedRule.value = rule
  const result = await store.testRule(rule.id)
  store.mentions = result.matches || []
}

function applyPreset(presetId) {
  const preset = presets.value.find(item => item.id === presetId)
  if (!preset) return
  termsText.value = [...new Set([...csvToArray(termsText.value), ...(preset.terms || [])])].join(', ')
  symbolsText.value = [...new Set([...csvToArray(symbolsText.value), ...(preset.symbols || [])])].join(', ')
  if (!form.value.sector && preset.sector) form.value.sector = preset.sector
}

function formatDate(value) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleString()
}

async function fetchWatchlists() {
  const response = await api.get('/watchlists')
  watchlists.value = response.data?.data || response.data || []
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
  try {
    await Promise.all([
      store.fetchRules(),
      store.fetchSources(),
      store.fetchPresets(),
      fetchWatchlists()
    ])
    selectedRule.value = rules.value[0] || null
    if (selectedRule.value) {
      await store.fetchMentions({ rule_id: selectedRule.value.id })
    }
    applyQuickCreateQuery()
  } finally {
    initialLoading.value = false
  }
})
</script>
