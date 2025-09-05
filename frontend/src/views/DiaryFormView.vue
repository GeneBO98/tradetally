<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
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

    <!-- Form -->
    <div v-else class="space-y-8">
      <form @submit.prevent="saveEntry" class="space-y-6">
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
              <!-- Simple toolbar -->
              <div class="flex items-center space-x-2 p-3 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
                <button
                  type="button"
                  @click="formatText('bold')"
                  class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  @click="formatText('italic')"
                  class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  @click="insertList()"
                  class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  title="Bullet List"
                >
                  <ListBulletIcon class="w-4 h-4" />
                </button>
              </div>
              
              <textarea
                ref="contentEditor"
                v-model="form.content"
                rows="8"
                placeholder="Write your thoughts, observations, and plans..."
                class="w-full p-3 border-0 focus:ring-0 focus:outline-none bg-transparent resize-none"
                @input="adjustTextareaHeight"
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
              v-model="form.lessonsLearned"
              rows="4"
              placeholder="What went well? What could be improved? Key takeaways..."
              class="input resize-none"
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
import {
  ArrowLeftIcon,
  PlusIcon,
  XMarkIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ListBulletIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()
const diaryStore = useDiaryStore()

// Component state
const loading = ref(false)
const saving = ref(false)
const error = ref(null)

const contentEditor = ref(null)
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
  tags: [],
  followedPlan: null,
  lessonsLearned: ''
})

// Computed properties
const isEditing = computed(() => !!route.params.id)

// Methods
const formatText = (command) => {
  const textarea = contentEditor.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = textarea.value.substring(start, end)
  
  if (selectedText) {
    let formattedText = ''
    if (command === 'bold') {
      formattedText = `**${selectedText}**`
    } else if (command === 'italic') {
      formattedText = `*${selectedText}*`
    }
    
    const newValue = 
      textarea.value.substring(0, start) + 
      formattedText + 
      textarea.value.substring(end)
    
    form.value.content = newValue
    
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + formattedText.length, start + formattedText.length)
    })
  }
}

const insertList = () => {
  const textarea = contentEditor.value
  const cursorPos = textarea.selectionStart
  const newValue = 
    form.value.content.substring(0, cursorPos) + 
    '\n• ' + 
    form.value.content.substring(cursorPos)
  
  form.value.content = newValue
  
  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorPos + 3, cursorPos + 3)
  })
}

const adjustTextareaHeight = () => {
  const textarea = contentEditor.value
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
      form.value = {
        entryDate: entry.entry_date,
        entryType: entry.entry_type || 'diary',
        title: entry.title || '',
        marketBias: entry.market_bias || '',
        content: entry.content || '',
        keyLevels: entry.key_levels || '',
        watchlist: entry.watchlist || [],
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
      tags: form.value.tags,
      followedPlan: form.value.followedPlan,
      lessonsLearned: form.value.lessonsLearned.trim() || null
    }
    
    if (isEditing.value) {
      await diaryStore.updateEntry(route.params.id, entryData)
    } else {
      await diaryStore.saveEntry(entryData)
    }
    
    // Navigate back to diary list
    router.push('/diary')
    
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to save diary entry'
  } finally {
    saving.value = false
  }
}

// Load entry data if editing
onMounted(async () => {
  if (isEditing.value) {
    await loadEntry()
  }
  
  // Adjust textarea height after content is loaded
  nextTick(() => {
    adjustTextareaHeight()
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
</style>