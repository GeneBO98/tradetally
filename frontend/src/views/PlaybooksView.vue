<template>
  <div class="content-wrapper py-8 space-y-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="heading-page">Playbooks</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Define structured setups, review trades against them, and measure plan adherence.
        </p>
      </div>
      <div class="flex gap-3">
        <button @click="resetForm" class="btn-secondary">
          New Playbook
        </button>
        <button @click="loadData" class="btn-primary" :disabled="loading">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="loading && playbooks.length === 0" class="card">
      <div class="card-body py-12 text-center text-gray-500 dark:text-gray-400">
        Loading playbooks...
      </div>
    </div>

    <div v-else class="grid gap-8 xl:grid-cols-[1.1fr_1.2fr]">
      <div class="space-y-6">
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Saved Playbooks</h2>
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ playbooks.length }} total</span>
            </div>

            <div v-if="playbooks.length === 0" class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
              No structured playbooks yet. Create one to start scoring trades against a defined setup.
            </div>

            <div v-else class="space-y-3">
              <button
                v-for="playbook in playbooks"
                :key="playbook.id"
                @click="selectPlaybook(playbook)"
                class="w-full text-left rounded-xl border px-4 py-4 transition"
                :class="selectedPlaybookId === playbook.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="font-semibold text-gray-900 dark:text-white">{{ playbook.name }}</h3>
                      <span
                        class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        :class="playbook.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'"
                      >
                        {{ playbook.isActive ? 'Active' : 'Archived' }}
                      </span>
                    </div>
                    <p v-if="playbook.description" class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {{ playbook.description }}
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2 text-xs">
                      <span v-if="playbook.side && playbook.side !== 'both'" class="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {{ formatEnum(playbook.side) }}
                      </span>
                      <span v-if="playbook.timeframe" class="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {{ formatEnum(playbook.timeframe) }}
                      </span>
                      <span class="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {{ playbook.checklistItems.length }} checklist item{{ playbook.checklistItems.length === 1 ? '' : 's' }}
                      </span>
                      <span v-if="playbook.requireStopLoss" class="rounded-full bg-orange-100 px-2 py-1 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                        Stop required
                      </span>
                      <span v-if="playbook.minimumTargetR !== null" class="rounded-full bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        Min {{ Number(playbook.minimumTargetR).toFixed(1) }}R
                      </span>
                    </div>
                  </div>

                  <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                    <div>{{ playbookAnalyticsMap[playbook.id]?.reviewed_trade_count || 0 }} reviews</div>
                    <div>{{ playbookAnalyticsMap[playbook.id]?.adherence_average || '0.00' }} avg adherence</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Adherence Analytics</h2>
              <router-link to="/trades" class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                Review trades
              </router-link>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Active playbooks</div>
                <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ analytics.overview.active_playbook_count || 0 }}</div>
              </div>
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Reviewed trades</div>
                <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ analytics.overview.reviewed_trade_count || 0 }}</div>
              </div>
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg adherence</div>
                <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ analytics.overview.adherence_average || '0.00' }}</div>
              </div>
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Followed vs broken</div>
                <div class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {{ analytics.overview.followed_trade_count || 0 }} / {{ analytics.overview.broken_trade_count || 0 }}
                </div>
              </div>
            </div>

            <div v-if="analytics.playbooks.length > 0" class="mt-6 overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th class="py-3 pr-4">Playbook</th>
                    <th class="py-3 pr-4">Reviewed</th>
                    <th class="py-3 pr-4">Win Rate</th>
                    <th class="py-3 pr-4">Profit Factor</th>
                    <th class="py-3 pr-4">Avg R</th>
                    <th class="py-3">Adherence</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-800 text-sm text-gray-700 dark:text-gray-300">
                  <tr v-for="row in analytics.playbooks" :key="row.id">
                    <td class="py-3 pr-4 font-medium text-gray-900 dark:text-white">{{ row.name }}</td>
                    <td class="py-3 pr-4">{{ row.reviewed_trade_count }}</td>
                    <td class="py-3 pr-4">{{ Number(row.win_rate || 0).toFixed(1) }}%</td>
                    <td class="py-3 pr-4">{{ Number(row.profit_factor || 0).toFixed(2) }}</td>
                    <td class="py-3 pr-4">{{ Number(row.avg_r || 0).toFixed(2) }}R</td>
                    <td class="py-3">{{ Number(row.adherence_average || 0).toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="analytics.recentTrades.length > 0" class="mt-6">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Reviews</h3>
              <div class="space-y-3">
                <div
                  v-for="review in analytics.recentTrades"
                  :key="review.trade_id"
                  class="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm"
                >
                  <div>
                    <router-link :to="`/trades/${review.trade_id}`" class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                      {{ review.symbol }}
                    </router-link>
                    <div class="text-gray-500 dark:text-gray-400">{{ formatDate(review.trade_date) }}</div>
                  </div>
                  <div class="text-right">
                    <div class="font-semibold text-gray-900 dark:text-white">{{ Number(review.adherence_score || 0).toFixed(2) }}</div>
                    <div :class="review.followed_plan ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                      {{ review.followed_plan ? 'Followed plan' : 'Broke plan' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card h-fit">
        <div class="card-body space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ form.id ? 'Edit Playbook' : 'Create Playbook' }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Set a checklist and a few hard rules that should always hold for this setup.
              </p>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="form.id"
                type="button"
                @click="archivePlaybook({ id: form.id, name: form.name })"
                class="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Archive
              </button>
              <button v-if="form.id" @click="resetForm" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                Clear
              </button>
            </div>
          </div>

          <form @submit.prevent="savePlaybook" class="space-y-6">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input v-model="form.name" type="text" class="input" maxlength="120" required />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea v-model="form.description" rows="3" class="input"></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Market</label>
                <input v-model="form.market" type="text" class="input" placeholder="Small caps, options, etc." maxlength="50" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Side</label>
                <BaseSelect
                  v-model="form.side"
                  :options="[
                    { value: 'both', label: 'Both' },
                    { value: 'long', label: 'Long' },
                    { value: 'short', label: 'Short' },
                  ]"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timeframe</label>
                <BaseSelect
                  v-model="form.timeframe"
                  placeholder="Any"
                  :options="[
                    { value: 'scalper', label: 'Scalper' },
                    { value: 'day_trading', label: 'Day Trading' },
                    { value: 'swing', label: 'Swing' },
                    { value: 'position', label: 'Position' },
                  ]"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Target R</label>
                <input v-model.number="form.minimumTargetR" type="number" min="0" step="0.25" class="input" placeholder="Optional" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Required Strategy</label>
                <input
                  v-if="showStrategyInput"
                  v-model="form.requiredStrategy"
                  type="text"
                  class="input"
                  maxlength="100"
                  placeholder="Enter strategy name"
                  @keydown.enter.prevent="showStrategyInput = false"
                  @blur="showStrategyInput = false"
                />
                <BaseSelect
                  v-else
                  :model-value="form.requiredStrategy"
                  placeholder="Any strategy"
                  :options="strategySelectOptions"
                  @change="handleStrategySelect"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Required Setup</label>
                <input
                  v-if="showSetupInput"
                  v-model="form.requiredSetup"
                  type="text"
                  class="input"
                  maxlength="100"
                  placeholder="Enter setup name"
                  @keydown.enter.prevent="showSetupInput = false"
                  @blur="showSetupInput = false"
                />
                <BaseSelect
                  v-else
                  :model-value="form.requiredSetup"
                  placeholder="Any setup"
                  :options="setupSelectOptions"
                  @change="handleSetupSelect"
                />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Required Tags</label>
                <div class="flex flex-wrap gap-1.5 mb-2" v-if="selectedTags.length > 0">
                  <span
                    v-for="tag in selectedTags"
                    :key="tag"
                    class="inline-flex items-center gap-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2.5 py-1 text-xs font-medium"
                  >
                    {{ tag }}
                    <button
                      type="button"
                      @click="removeTagFromRequired(tag)"
                      class="hover:text-primary-900 dark:hover:text-primary-100"
                      :aria-label="`Remove ${tag}`"
                    >
                      &times;
                    </button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <BaseSelect
                    v-if="!showTagInput"
                    :model-value="''"
                    :placeholder="availableTagSuggestions.length > 0 ? 'Add a tag…' : 'No existing tags — add a new one'"
                    :options="tagSelectOptions"
                    @change="handleTagSelect"
                  />
                  <input
                    v-else
                    v-model="newTagDraft"
                    type="text"
                    class="input"
                    placeholder="Type new tag and press Enter"
                    @keydown.enter.prevent="commitNewTag"
                    @blur="commitNewTag"
                  />
                </div>
              </div>
              <label class="inline-flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 md:col-span-2">
                <input v-model="form.requireStopLoss" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Require stop loss for a passing review</span>
              </label>
            </div>

            <div>
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Checklist</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">These items are scored directly before hard-rule penalties are applied.</p>
                </div>
                <button type="button" @click="addChecklistItem" class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  Add item
                </button>
              </div>

              <div class="space-y-3">
                <div
                  v-for="(item, index) in form.checklistItems"
                  :key="`${item.localId}-${index}`"
                  class="rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div class="grid gap-3 md:grid-cols-[1fr_120px_120px_auto]">
                    <div>
                      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Label</label>
                      <input v-model="item.label" type="text" class="input" maxlength="255" required />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Weight</label>
                      <input v-model.number="item.weight" type="number" min="0.25" step="0.25" class="input" required />
                    </div>
                    <label class="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mt-6">
                      <input v-model="item.isRequired" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                      Required
                    </label>
                    <div class="flex items-end justify-end">
                      <button type="button" @click="removeChecklistItem(index)" class="text-sm text-red-600 hover:text-red-700 dark:text-red-400">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Hard rules evaluate side, timeframe, stop loss, minimum target R, and optional strategy/setup/tag matching.
              </p>
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : (form.id ? 'Save Playbook' : 'Create Playbook') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import BaseSelect from '@/components/common/BaseSelect.vue'

const { showSuccess, showError, showConfirmation } = useNotification()

const loading = ref(true)
const saving = ref(false)
const playbooks = ref([])
const analytics = ref({
  overview: {},
  playbooks: [],
  recentTrades: []
})
const selectedPlaybookId = ref(null)
const requiredTagsInput = ref('')
const strategiesList = ref([])
const setupsList = ref([])
const tagsList = ref([])
const showStrategyInput = ref(false)
const showSetupInput = ref(false)
const showTagInput = ref(false)
const newTagDraft = ref('')

const selectedTags = computed(() =>
  requiredTagsInput.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
)

const availableTagSuggestions = computed(() => {
  const current = new Set(selectedTags.value.map(tag => tag.toLowerCase()))
  return tagsList.value.filter(tag => !current.has(tag.toLowerCase()))
})

function handleStrategySelect(value) {
  if (value === '__custom__') {
    form.requiredStrategy = ''
    showStrategyInput.value = true
    return
  }
  form.requiredStrategy = value
}

function handleSetupSelect(value) {
  if (value === '__custom__') {
    form.requiredSetup = ''
    showSetupInput.value = true
    return
  }
  form.requiredSetup = value
}

function handleTagSelect(value) {
  if (!value) return
  if (value === '__custom__') {
    newTagDraft.value = ''
    showTagInput.value = true
    return
  }
  addTagToRequired(value)
}

const strategySelectOptions = computed(() => {
  const options = []
  if (form.requiredStrategy && !strategiesList.value.includes(form.requiredStrategy)) {
    options.push({ value: form.requiredStrategy, label: form.requiredStrategy })
  }
  strategiesList.value.forEach(strategy => {
    options.push({ value: strategy, label: strategy })
  })
  options.push({ value: '__custom__', label: '+ Add New Strategy' })
  return options
})

const setupSelectOptions = computed(() => {
  const options = []
  if (form.requiredSetup && !setupsList.value.includes(form.requiredSetup)) {
    options.push({ value: form.requiredSetup, label: form.requiredSetup })
  }
  setupsList.value.forEach(setup => {
    options.push({ value: setup, label: setup })
  })
  options.push({ value: '__custom__', label: '+ Add New Setup' })
  return options
})

const tagSelectOptions = computed(() => {
  const options = availableTagSuggestions.value.map(tag => ({ value: tag, label: tag }))
  options.push({ value: '__custom__', label: '+ Add New Tag' })
  return options
})

function addTagToRequired(tag) {
  const trimmed = String(tag || '').trim()
  if (!trimmed) return
  if (selectedTags.value.some(part => part.toLowerCase() === trimmed.toLowerCase())) {
    return
  }
  const next = [...selectedTags.value, trimmed]
  requiredTagsInput.value = next.join(', ')
}

function removeTagFromRequired(tag) {
  requiredTagsInput.value = selectedTags.value
    .filter(part => part.toLowerCase() !== tag.toLowerCase())
    .join(', ')
}

function commitNewTag() {
  const value = newTagDraft.value.trim()
  if (value) {
    addTagToRequired(value)
  }
  newTagDraft.value = ''
  showTagInput.value = false
}

let checklistLocalId = 0

function createChecklistItem() {
  checklistLocalId += 1
  return {
    localId: checklistLocalId,
    label: '',
    itemOrder: null,
    weight: 1,
    isRequired: false
  }
}

const form = reactive({
  id: null,
  name: '',
  description: '',
  market: '',
  timeframe: '',
  side: 'both',
  requiredStrategy: '',
  requiredSetup: '',
  requireStopLoss: false,
  minimumTargetR: null,
  checklistItems: [createChecklistItem()]
})

const playbookAnalyticsMap = computed(() => {
  return analytics.value.playbooks.reduce((map, row) => {
    map[row.id] = row
    return map
  }, {})
})

function resetForm() {
  selectedPlaybookId.value = null
  requiredTagsInput.value = ''
  form.id = null
  form.name = ''
  form.description = ''
  form.market = ''
  form.timeframe = ''
  form.side = 'both'
  form.requiredStrategy = ''
  form.requiredSetup = ''
  form.requireStopLoss = false
  form.minimumTargetR = null
  form.checklistItems = [createChecklistItem()]
  showStrategyInput.value = false
  showSetupInput.value = false
  showTagInput.value = false
  newTagDraft.value = ''
}

function selectPlaybook(playbook) {
  selectedPlaybookId.value = playbook.id
  requiredTagsInput.value = (playbook.requiredTags || []).join(', ')
  showStrategyInput.value = false
  showSetupInput.value = false
  showTagInput.value = false
  newTagDraft.value = ''
  form.id = playbook.id
  form.name = playbook.name
  form.description = playbook.description || ''
  form.market = playbook.market || ''
  form.timeframe = playbook.timeframe || ''
  form.side = playbook.side || 'both'
  form.requiredStrategy = playbook.requiredStrategy || ''
  form.requiredSetup = playbook.requiredSetup || ''
  form.requireStopLoss = playbook.requireStopLoss === true
  form.minimumTargetR = playbook.minimumTargetR
  form.checklistItems = (playbook.checklistItems || []).map((item, index) => ({
    localId: item.id || `${playbook.id}-${index}`,
    label: item.label,
    itemOrder: item.itemOrder ?? index,
    weight: item.weight ?? 1,
    isRequired: item.isRequired === true
  }))

  if (form.checklistItems.length === 0) {
    form.checklistItems = [createChecklistItem()]
  }
}

function addChecklistItem() {
  form.checklistItems.push(createChecklistItem())
}

function removeChecklistItem(index) {
  if (form.checklistItems.length === 1) {
    form.checklistItems = [createChecklistItem()]
    return
  }

  form.checklistItems.splice(index, 1)
}

async function loadData() {
  try {
    loading.value = true
    const [playbookResponse, analyticsResponse, strategiesResponse, setupsResponse, tagsResponse] = await Promise.all([
      api.get('/playbooks', { params: { includeArchived: true } }),
      api.get('/playbooks/analytics'),
      api.get('/trades/strategies').catch(() => ({ data: { strategies: [] } })),
      api.get('/trades/setups').catch(() => ({ data: { setups: [] } })),
      api.get('/tags').catch(() => ({ data: { tags: [] } }))
    ])

    playbooks.value = playbookResponse.data.playbooks || []
    analytics.value = analyticsResponse.data
    strategiesList.value = strategiesResponse.data?.strategies || []
    setupsList.value = setupsResponse.data?.setups || []
    tagsList.value = Array.from(
      new Set(
        (tagsResponse.data?.tags || [])
          .map(tag => (typeof tag === 'string' ? tag : tag?.name))
          .filter(name => typeof name === 'string' && name.trim().length > 0)
      )
    ).sort((a, b) => a.localeCompare(b))

    if (selectedPlaybookId.value) {
      const selected = playbooks.value.find(playbook => playbook.id === selectedPlaybookId.value)
      if (selected) {
        selectPlaybook(selected)
      }
    }
  } catch (error) {
    console.error('Failed to load playbooks:', error)
    showError('Error', 'Failed to load playbooks')
  } finally {
    loading.value = false
  }
}

async function savePlaybook() {
  if (!form.name.trim()) {
    showError('Validation', 'Playbook name is required')
    return
  }

  const checklistItems = form.checklistItems
    .map((item, index) => ({
      label: item.label.trim(),
      itemOrder: index,
      weight: Number(item.weight) || 1,
      isRequired: item.isRequired === true
    }))
    .filter(item => item.label)

  if (checklistItems.length === 0) {
    showError('Validation', 'Add at least one checklist item')
    return
  }

  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    market: form.market.trim() || null,
    timeframe: form.timeframe || null,
    side: form.side || 'both',
    requiredStrategy: form.requiredStrategy.trim() || null,
    requiredSetup: form.requiredSetup.trim() || null,
    requiredTags: requiredTagsInput.value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean),
    requireStopLoss: form.requireStopLoss === true,
    minimumTargetR: form.minimumTargetR === null || form.minimumTargetR === '' ? null : Number(form.minimumTargetR),
    checklistItems
  }

  try {
    saving.value = true

    if (form.id) {
      await api.put(`/playbooks/${form.id}`, payload)
      showSuccess('Success', 'Playbook updated')
    } else {
      const response = await api.post('/playbooks', payload)
      selectedPlaybookId.value = response.data.playbook?.id || null
      showSuccess('Success', 'Playbook created')
    }

    await loadData()
  } catch (error) {
    console.error('Failed to save playbook:', error)
    showError('Error', error.response?.data?.error || 'Failed to save playbook')
  } finally {
    saving.value = false
  }
}

function archivePlaybook(playbook) {
  showConfirmation(
    'Archive Playbook',
    `Archive "${playbook.name}"? It will stay in analytics and existing reviews but won’t be selectable for new reviews.`,
    async () => {
      try {
        await api.delete(`/playbooks/${playbook.id}`)
        showSuccess('Success', 'Playbook archived')
        if (selectedPlaybookId.value === playbook.id) {
          resetForm()
        }
        await loadData()
      } catch (error) {
        console.error('Failed to archive playbook:', error)
        showError('Error', error.response?.data?.error || 'Failed to archive playbook')
      }
    }
  )
}

function formatEnum(value) {
  return String(value || '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDate(value) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleDateString()
}

onMounted(loadData)
</script>
