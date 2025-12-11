<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="heading-page">
            {{ isEditing ? 'Edit Entry' : 'New Journal Entry' }}
          </h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ isEditing ? 'Update your journal entry' : 'Document your trading thoughts and plans' }}
          </p>
        </div>
        
        <router-link
          to="/diary"
          class="btn-secondary"
        >
          <ArrowLeftIcon class="w-4 h-4 mr-2" />
          Back to Journal
        </router-link>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && isEditing" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
      <div class="flex">
        <ExclamationTriangleIcon class="w-5 h-5 text-red-400 mr-2" />
        <p class="text-red-800 dark:text-red-200">{{ error }}</p>
      </div>
    </div>

    <!-- Duplicate Entry Modal -->
    <div v-if="showDuplicateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Entry Already Exists
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          An entry for {{ form.entryDate }} already exists. Would you like to append to the existing entry or overwrite it?
        </p>
        <div class="flex flex-col space-y-3">
          <button
            @click="handleDuplicateChoice('append')"
            class="btn-primary"
          >
            Append to Existing Entry
          </button>
          <button
            @click="handleDuplicateChoice('overwrite')"
            class="btn-secondary"
          >
            Overwrite Existing Entry
          </button>
          <button
            @click="showDuplicateModal = false"
            class="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Form -->
    <div v-else class="space-y-8">
      <form @submit.prevent="saveEntry" class="space-y-6">
        <!-- Template Selector -->
        <div v-if="!isEditing" class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-4 rounded-lg">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center">
              <DocumentTextIcon class="w-5 h-5 text-primary-600 dark:text-primary-400 mr-2" />
              <h3 class="text-sm font-medium text-primary-900 dark:text-primary-200">Use a Template</h3>
            </div>
            <button
              type="button"
              @click="showTemplates = !showTemplates"
              class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {{ showTemplates ? 'Hide' : 'Show' }}
            </button>
          </div>

          <div v-if="showTemplates" class="space-y-3">
            <div v-if="availableTemplates.length === 0" class="text-sm text-primary-700 dark:text-primary-300">
              No templates available. Create one from the Templates section in your journal.
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                v-for="template in availableTemplates"
                :key="template.id"
                type="button"
                @click="applyTemplate(template)"
                class="text-left p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {{ template.name }}
                    </div>
                    <div v-if="template.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {{ template.description }}
                    </div>
                  </div>
                  <span
                    v-if="template.is_default"
                    class="ml-2 flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  >
                    Default
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Basic Information -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Basic Information</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Entry Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Entry Date *
              </label>
              <input
                type="date"
                v-model="form.entryDate"
                required
                class="input"
              />
            </div>

            <!-- Entry Type -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Entry Type
              </label>
              <select v-model="form.entryType" class="input">
                <option value="diary">Diary Entry</option>
                <option value="playbook">Playbook Setup</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ form.entryType === 'diary' ? 'Daily thoughts and reflections' : 'Trade setups and strategies' }}
              </p>
            </div>
          </div>

          <!-- Title -->
          <div class="mt-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Title
              <span v-if="form.entryType === 'playbook'" class="text-red-500">*</span>
            </label>
            <input
              type="text"
              v-model="form.title"
              :required="form.entryType === 'playbook'"
              placeholder="Enter a title for your entry..."
              class="input"
            />
          </div>

          <!-- Market Bias -->
          <div class="mt-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Market Bias
            </label>
            <div class="flex space-x-4">
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.marketBias"
                  value="bullish"
                  class="form-radio text-green-600"
                />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  <ArrowTrendingUpIcon class="w-4 h-4 inline mr-1 text-green-600" />
                  Bullish
                </span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.marketBias"
                  value="bearish"
                  class="form-radio text-red-600"
                />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  <ArrowTrendingDownIcon class="w-4 h-4 inline mr-1 text-red-600" />
                  Bearish
                </span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.marketBias"
                  value="neutral"
                  class="form-radio text-gray-600"
                />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  <MinusIcon class="w-4 h-4 inline mr-1 text-gray-600" />
                  Neutral
                </span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.marketBias"
                  value=""
                  class="form-radio text-gray-400"
                />
                <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">No bias</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Content</h2>
          
          <!-- Main Content -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ form.entryType === 'diary' ? 'Journal Entry' : 'Setup Description' }}
            </label>
            <div class="border border-gray-300 dark:border-gray-600 rounded-lg">
              <!-- Enhanced markdown toolbar -->
              <div class="flex items-center flex-wrap gap-1 p-3 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
                <!-- Text formatting -->
                <div class="flex items-center space-x-1 mr-3 border-r border-gray-300 dark:border-gray-600 pr-3">
                  <button
                    type="button"
                    @click="formatText('bold')"
                    class="toolbar-btn"
                    title="Bold (Ctrl/Cmd + B)"
                  >
                    <strong class="text-sm font-bold">B</strong>
                  </button>
                  <button
                    type="button"
                    @click="formatText('italic')"
                    class="toolbar-btn"
                    title="Italic (Ctrl/Cmd + I)"
                  >
                    <em class="text-sm italic">I</em>
                  </button>
                  <button
                    type="button"
                    @click="formatText('code')"
                    class="toolbar-btn"
                    title="Inline Code"
                  >
                    <CodeBracketIcon class="w-4 h-4" />
                  </button>
                </div>

                <!-- Headings -->
                <div class="flex items-center space-x-1 mr-3 border-r border-gray-300 dark:border-gray-600 pr-3">
                  <button
                    type="button"
                    @click="formatText('h1')"
                    class="toolbar-btn"
                    title="Heading 1"
                  >
                    <span class="text-xs font-bold">H1</span>
                  </button>
                  <button
                    type="button"
                    @click="formatText('h2')"
                    class="toolbar-btn"
                    title="Heading 2"
                  >
                    <span class="text-xs font-semibold">H2</span>
                  </button>
                  <button
                    type="button"
                    @click="formatText('h3')"
                    class="toolbar-btn"
                    title="Heading 3"
                  >
                    <span class="text-xs font-medium">H3</span>
                  </button>
                </div>

                <!-- Lists and structure -->
                <div class="flex items-center space-x-1 mr-3 border-r border-gray-300 dark:border-gray-600 pr-3">
                  <button
                    type="button"
                    @click="insertList('bullet')"
                    class="toolbar-btn"
                    title="Bullet List"
                  >
                    <ListBulletIcon class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="insertList('numbered')"
                    class="toolbar-btn"
                    title="Numbered List"
                  >
                    <span class="text-xs font-semibold">1.</span>
                  </button>
                  <button
                    type="button"
                    @click="formatText('quote')"
                    class="toolbar-btn"
                    title="Quote"
                  >
                    <ChatBubbleLeftRightIcon class="w-4 h-4" />
                  </button>
                </div>

                <!-- Links and others -->
                <div class="flex items-center space-x-1">
                  <button
                    type="button"
                    @click="formatText('link')"
                    class="toolbar-btn"
                    title="Link"
                  >
                    <LinkIcon class="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    @click="formatText('strikethrough')"
                    class="toolbar-btn"
                    title="Strikethrough"
                  >
                    <span class="text-sm line-through">S</span>
                  </button>
                </div>
              </div>
              
              <textarea
                ref="contentEditor"
                v-model="form.content"
                rows="8"
                placeholder="Write your thoughts, observations, and plans..."
                class="w-full p-3 border-0 focus:ring-0 focus:outline-none bg-transparent resize-none"
                @input="adjustTextareaHeight"
                @keydown="handleKeyDown"
              ></textarea>
            </div>
          </div>

          <!-- Key Levels -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Key Levels
            </label>
            <textarea
              v-model="form.keyLevels"
              rows="3"
              placeholder="Support: 150.50, Resistance: 155.25..."
              class="input resize-none"
            ></textarea>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Important price levels to watch during the trading session
            </p>
          </div>
        </div>

        <!-- Trading Information -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trading Information</h2>
          
          <!-- Watchlist -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Watchlist
            </label>
            <div class="flex items-center space-x-2 mb-2">
              <input
                type="text"
                v-model="newWatchlistSymbol"
                @keydown.enter.prevent="addWatchlistSymbol"
                placeholder="Enter symbol (e.g., AAPL)"
                class="input flex-1"
              />
              <button
                type="button"
                @click="addWatchlistSymbol"
                class="btn-secondary"
              >
                <PlusIcon class="w-4 h-4" />
              </button>
            </div>
            <div v-if="form.watchlist.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="(symbol, index) in form.watchlist"
                :key="symbol"
                class="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-sm"
              >
                {{ symbol }}
                <button
                  type="button"
                  @click="removeWatchlistSymbol(index)"
                  class="ml-2 text-blue-600 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                >
                  <XMarkIcon class="w-3 h-3" />
                </button>
              </span>
            </div>
          </div>

          <!-- Linked Trades -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Linked Trades
            </label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Link trades from {{ form.entryDate }} to this journal entry
            </p>
            <TradeSelector
              v-model="form.linkedTrades"
              :entry-date="form.entryDate"
            />
          </div>

          <!-- Tags -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags
            </label>
            <div class="flex items-center space-x-2 mb-2">
              <input
                type="text"
                v-model="newTag"
                @keydown.enter.prevent="addTag"
                placeholder="Add a tag..."
                class="input flex-1"
              />
              <button
                type="button"
                @click="addTag"
                class="btn-secondary"
              >
                <PlusIcon class="w-4 h-4" />
              </button>
            </div>
            <div v-if="form.tags.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="(tag, index) in form.tags"
                :key="tag"
                class="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
              >
                #{{ tag }}
                <button
                  type="button"
                  @click="removeTag(index)"
                  class="ml-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <XMarkIcon class="w-3 h-3" />
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- Post-Market Reflection -->
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Post-Market Reflection
            <span class="text-sm font-normal text-gray-500 dark:text-gray-400">(Optional)</span>
          </h2>
          
          <!-- Followed Plan -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Did you follow your plan?
            </label>
            <div class="flex space-x-4">
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.followedPlan"
                  :value="true"
                  class="form-radio text-green-600"
                />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Yes</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.followedPlan"
                  :value="false"
                  class="form-radio text-red-600"
                />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">No</span>
              </label>
              <label class="flex items-center">
                <input
                  type="radio"
                  v-model="form.followedPlan"
                  :value="null"
                  class="form-radio text-gray-400"
                />
                <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Not applicable</span>
              </label>
            </div>
          </div>

          <!-- Lessons Learned -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lessons Learned
            </label>
            <textarea
              ref="lessonsLearnedEditor"
              v-model="form.lessonsLearned"
              rows="8"
              placeholder="What went well? What could be improved? Key takeaways..."
              class="input resize-none"
              @input="adjustLessonsTextareaHeight"
            ></textarea>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
          <router-link
            to="/diary"
            class="btn-secondary"
          >
            Cancel
          </router-link>
          <button
            type="submit"
            :disabled="saving"
            class="btn-primary"
          >
            {{ saving ? 'Saving...' : (isEditing ? 'Update Entry' : 'Create Entry') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDiaryStore } from '@/stores/diary'
import { useDiaryTemplateStore } from '@/stores/diaryTemplate'
import TradeSelector from '@/components/diary/TradeSelector.vue'
import {
  ArrowLeftIcon,
  PlusIcon,
  XMarkIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ListBulletIcon,
  ExclamationTriangleIcon,
  CodeBracketIcon,
  LinkIcon,
  ChatBubbleLeftRightIcon,
  HashtagIcon,
  DocumentTextIcon
} from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()
const diaryStore = useDiaryStore()
const templateStore = useDiaryTemplateStore()

// Component state
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const showTemplates = ref(false)
const availableTemplates = ref([])

const contentEditor = ref(null)
const lessonsLearnedEditor = ref(null)
const newWatchlistSymbol = ref('')
const newTag = ref('')

// Form data
const form = ref({
  entryDate: new Date().toISOString().split('T')[0],
  entryType: 'diary',
  title: '',
  marketBias: '',
  content: '',
  keyLevels: '',
  watchlist: [],
  linkedTrades: [],
  tags: [],
  followedPlan: null,
  lessonsLearned: ''
})

// Computed properties
const isEditing = computed(() => !!route.params.id)

// Template methods
const loadTemplates = async () => {
  try {
    await templateStore.fetchTemplates({ entryType: form.value.entryType })
    availableTemplates.value = templateStore.templates

    // Auto-show templates if there's a default one
    const defaultTemplate = availableTemplates.value.find(t => t.is_default)
    if (defaultTemplate && !isEditing.value) {
      showTemplates.value = true
    }
  } catch (err) {
    console.error('Failed to load templates:', err)
  }
}

const applyTemplate = async (template) => {
  try {
    // Apply template fields to form
    if (template.title) form.value.title = template.title
    if (template.market_bias) form.value.marketBias = template.market_bias
    if (template.content) form.value.content = template.content
    if (template.key_levels) form.value.keyLevels = template.key_levels
    if (template.watchlist && template.watchlist.length > 0) {
      form.value.watchlist = [...template.watchlist]
    }
    if (template.tags && template.tags.length > 0) {
      form.value.tags = [...template.tags]
    }
    if (template.followed_plan !== undefined && template.followed_plan !== null) {
      form.value.followedPlan = template.followed_plan
    }
    if (template.lessons_learned) form.value.lessonsLearned = template.lessons_learned

    // Increment use count
    await templateStore.applyTemplate(template.id)

    // Auto-resize textarea if needed
    await nextTick()
    if (contentEditor.value) {
      adjustTextareaHeight()
    }

    // Hide template selector
    showTemplates.value = false
  } catch (err) {
    console.error('Failed to apply template:', err)
  }
}

// Methods
const formatText = (command) => {
  const textarea = contentEditor.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = textarea.value.substring(start, end)
  
  let formattedText = ''
  let newCursorPos = start
  
  if (selectedText) {
    // Format selected text
    switch (command) {
      case 'bold':
        formattedText = `**${selectedText}**`
        newCursorPos = start + formattedText.length
        break
      case 'italic':
        formattedText = `*${selectedText}*`
        newCursorPos = start + formattedText.length
        break
      case 'code':
        formattedText = `\`${selectedText}\``
        newCursorPos = start + formattedText.length
        break
      case 'strikethrough':
        formattedText = `~~${selectedText}~~`
        newCursorPos = start + formattedText.length
        break
      case 'link':
        formattedText = `[${selectedText}](url)`
        newCursorPos = start + formattedText.length - 4 // Position cursor before "url"
        break
      default:
        return
    }
    
    const newValue = 
      textarea.value.substring(0, start) + 
      formattedText + 
      textarea.value.substring(end)
    
    form.value.content = newValue
    
    nextTick(() => {
      textarea.focus()
      if (command === 'link') {
        // Select "url" placeholder
        textarea.setSelectionRange(newCursorPos - 3, newCursorPos)
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      }
    })
  } else {
    // Insert at cursor position
    const cursorPos = textarea.selectionStart
    let insertText = ''
    
    switch (command) {
      case 'h1':
        insertText = '\n# '
        newCursorPos = cursorPos + 3
        break
      case 'h2':
        insertText = '\n## '
        newCursorPos = cursorPos + 4
        break
      case 'h3':
        insertText = '\n### '
        newCursorPos = cursorPos + 5
        break
      case 'quote':
        insertText = '\n> '
        newCursorPos = cursorPos + 3
        break
      case 'link':
        insertText = '[text](url)'
        newCursorPos = cursorPos + 1 // Position cursor after '['
        break
      case 'code':
        insertText = '``'
        newCursorPos = cursorPos + 1 // Position cursor between backticks
        break
      default:
        return
    }
    
    const newValue = 
      form.value.content.substring(0, cursorPos) + 
      insertText + 
      form.value.content.substring(cursorPos)
    
    form.value.content = newValue
    
    nextTick(() => {
      textarea.focus()
      if (command === 'link') {
        // Select "text" placeholder
        textarea.setSelectionRange(newCursorPos, newCursorPos + 4)
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      }
    })
  }
}

const insertList = (type = 'bullet') => {
  const textarea = contentEditor.value
  const cursorPos = textarea.selectionStart
  
  let listPrefix = ''
  if (type === 'bullet') {
    listPrefix = '\n• '
  } else if (type === 'numbered') {
    listPrefix = '\n1. '
  }
  
  const newValue = 
    form.value.content.substring(0, cursorPos) + 
    listPrefix + 
    form.value.content.substring(cursorPos)
  
  form.value.content = newValue
  
  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorPos + listPrefix.length, cursorPos + listPrefix.length)
  })
}

const handleKeyDown = (event) => {
  if (event.key === 'Enter') {
    const textarea = contentEditor.value
    const cursorPos = textarea.selectionStart
    const textBeforeCursor = form.value.content.substring(0, cursorPos)
    
    // Check if we're at the end of a bullet list item
    const bulletMatch = textBeforeCursor.match(/.*(\n|^)• (.*)$/)
    const numberedMatch = textBeforeCursor.match(/.*(\n|^)(\d+)\. (.*)$/)
    
    if (bulletMatch) {
      const listContent = bulletMatch[2]
      if (listContent.trim() === '') {
        // Empty list item - remove it and don't continue list
        event.preventDefault()
        const lineStart = textBeforeCursor.lastIndexOf('\n• ')
        const newValue = 
          form.value.content.substring(0, lineStart) + 
          '\n\n' +
          form.value.content.substring(cursorPos)
        form.value.content = newValue
        
        nextTick(() => {
          textarea.setSelectionRange(lineStart + 2, lineStart + 2)
        })
      } else {
        // Continue bullet list
        event.preventDefault()
        const newValue = 
          form.value.content.substring(0, cursorPos) + 
          '\n• ' + 
          form.value.content.substring(cursorPos)
        form.value.content = newValue
        
        nextTick(() => {
          textarea.setSelectionRange(cursorPos + 3, cursorPos + 3)
        })
      }
    } else if (numberedMatch) {
      const listContent = numberedMatch[3]
      const currentNumber = parseInt(numberedMatch[2])
      
      if (listContent.trim() === '') {
        // Empty numbered list item - remove it and don't continue list
        event.preventDefault()
        const lineStart = textBeforeCursor.lastIndexOf(`\n${currentNumber}. `)
        const newValue = 
          form.value.content.substring(0, lineStart) + 
          '\n\n' +
          form.value.content.substring(cursorPos)
        form.value.content = newValue
        
        nextTick(() => {
          textarea.setSelectionRange(lineStart + 2, lineStart + 2)
        })
      } else {
        // Continue numbered list
        event.preventDefault()
        const nextNumber = currentNumber + 1
        const newValue = 
          form.value.content.substring(0, cursorPos) + 
          `\n${nextNumber}. ` + 
          form.value.content.substring(cursorPos)
        form.value.content = newValue
        
        nextTick(() => {
          textarea.setSelectionRange(cursorPos + `\n${nextNumber}. `.length, cursorPos + `\n${nextNumber}. `.length)
        })
      }
    }
  }
}

const adjustTextareaHeight = () => {
  const textarea = contentEditor.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px'
  }
}

const adjustLessonsTextareaHeight = () => {
  const textarea = lessonsLearnedEditor.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px'
  }
}

const addWatchlistSymbol = () => {
  const symbol = newWatchlistSymbol.value.trim().toUpperCase()
  if (symbol && !form.value.watchlist.includes(symbol)) {
    form.value.watchlist.push(symbol)
    newWatchlistSymbol.value = ''
  }
}

const removeWatchlistSymbol = (index) => {
  form.value.watchlist.splice(index, 1)
}

const addTag = () => {
  const tag = newTag.value.trim().toLowerCase()
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag)
    newTag.value = ''
  }
}

const removeTag = (index) => {
  form.value.tags.splice(index, 1)
}

const loadEntry = async () => {
  if (!isEditing.value) return
  
  try {
    loading.value = true
    error.value = null
    
    const entry = await diaryStore.fetchEntry(route.params.id)
    
    if (entry) {
      // Ensure entry_date is properly formatted for date input (YYYY-MM-DD)
      let entryDate = entry.entry_date
      if (entryDate && entryDate.includes('T')) {
        // Handle datetime format - extract just the date part
        entryDate = entryDate.split('T')[0]
      } else if (entryDate) {
        // Handle other date formats - convert to YYYY-MM-DD
        const date = new Date(entryDate)
        if (!isNaN(date.getTime())) {
          entryDate = date.toISOString().split('T')[0]
        }
      }
      
      form.value = {
        entryDate: entryDate || new Date().toISOString().split('T')[0],
        entryType: entry.entry_type || 'diary',
        title: entry.title || '',
        marketBias: entry.market_bias || '',
        content: entry.content || '',
        keyLevels: entry.key_levels || '',
        watchlist: entry.watchlist || [],
        linkedTrades: entry.linked_trades || [],
        tags: entry.tags || [],
        followedPlan: entry.followed_plan,
        lessonsLearned: entry.lessons_learned || ''
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load diary entry'
  } finally {
    loading.value = false
  }
}

const showDuplicateModal = ref(false)
const existingEntry = ref(null)
const pendingEntryData = ref(null)

const saveEntry = async () => {
  try {
    saving.value = true
    error.value = null

    // Prepare form data
    const entryData = {
      entryDate: form.value.entryDate,
      entryType: form.value.entryType,
      title: form.value.title.trim() || null,
      marketBias: form.value.marketBias || null,
      content: form.value.content.trim() || null,
      keyLevels: form.value.keyLevels.trim() || null,
      watchlist: form.value.watchlist,
      linkedTrades: form.value.linkedTrades,
      tags: form.value.tags,
      followedPlan: form.value.followedPlan,
      lessonsLearned: form.value.lessonsLearned.trim() || null
    }

    if (isEditing.value) {
      await diaryStore.updateEntry(route.params.id, entryData)
      router.push('/diary')
    } else {
      // Check for existing entry on the same date
      try {
        const existing = await diaryStore.fetchEntryByDate(form.value.entryDate, form.value.entryType)
        if (existing) {
          // Entry exists - show modal
          existingEntry.value = existing
          pendingEntryData.value = entryData
          showDuplicateModal.value = true
          saving.value = false
          return
        }
      } catch (err) {
        // No existing entry found - continue with save
      }

      await diaryStore.saveEntry(entryData)
      router.push('/diary')
    }

  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save diary entry'
  } finally {
    saving.value = false
  }
}

const handleDuplicateChoice = async (choice) => {
  try {
    saving.value = true
    showDuplicateModal.value = false

    if (choice === 'append') {
      // Append to existing entry
      const updatedData = {
        ...pendingEntryData.value,
        content: existingEntry.value.content
          ? `${existingEntry.value.content}\n\n---\n\n${pendingEntryData.value.content}`
          : pendingEntryData.value.content,
        // Merge watchlists
        watchlist: [...new Set([...(existingEntry.value.watchlist || []), ...pendingEntryData.value.watchlist])],
        // Merge tags
        tags: [...new Set([...(existingEntry.value.tags || []), ...pendingEntryData.value.tags])],
        // Keep existing key levels if new one is empty
        keyLevels: pendingEntryData.value.keyLevels || existingEntry.value.key_levels,
        // Keep existing title if new one is empty
        title: pendingEntryData.value.title || existingEntry.value.title
      }

      await diaryStore.updateEntry(existingEntry.value.id, updatedData)
    } else if (choice === 'overwrite') {
      // Overwrite existing entry
      await diaryStore.updateEntry(existingEntry.value.id, pendingEntryData.value)
    }

    router.push('/diary')
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save diary entry'
  } finally {
    saving.value = false
    existingEntry.value = null
    pendingEntryData.value = null
  }
}

// Load entry data if editing
onMounted(async () => {
  if (isEditing.value) {
    await loadEntry()
  } else {
    // Load templates for new entries
    await loadTemplates()
  }

  // Adjust textarea height after content is loaded
  nextTick(() => {
    adjustTextareaHeight()
    adjustLessonsTextareaHeight()
  })
})
</script>

<style scoped>
.form-radio {
  @apply h-4 w-4 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500;
}

.input {
  @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white;
}

.btn-primary {
  @apply bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2;
}

.toolbar-btn {
  @apply p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-600 rounded transition-colors duration-150 flex items-center justify-center min-w-[32px] min-h-[32px];
}

.toolbar-btn:hover {
  @apply bg-gray-100 dark:bg-gray-600;
}

.toolbar-btn:active {
  @apply bg-gray-200 dark:bg-gray-500;
}
</style>