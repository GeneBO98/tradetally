<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Today's Journal Entry</h3>
          <div v-if="entry?.market_bias" class="ml-3 flex items-center">
            <span class="text-sm text-gray-500 dark:text-gray-400 mr-2">Market Bias:</span>
            <span 
              class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              :class="marketBiasClasses(entry.market_bias)"
            >
              <component :is="marketBiasIcon(entry.market_bias)" class="w-3 h-3 mr-1" />
              {{ entry.market_bias.charAt(0).toUpperCase() + entry.market_bias.slice(1) }}
            </span>
          </div>
        </div>
        
        <div class="flex items-center space-x-2">
          <button
            v-if="!entry"
            @click="createTodaysEntry"
            class="btn-primary text-sm"
            :disabled="creating"
          >
            <PlusIcon class="w-4 h-4 mr-1" />
            {{ creating ? 'Creating...' : 'Create Entry' }}
          </button>
          
          <button
            v-if="entry"
            @click="editEntry"
            class="btn-secondary text-sm"
          >
            <PencilIcon class="w-4 h-4 mr-1" />
            Edit
          </button>
          
          <router-link
            to="/diary"
            class="text-sm text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
          >
            View All →
          </router-link>
          
          <button
            @click="toggleExpanded"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <ChevronDownIcon 
              class="w-4 h-4 transition-transform duration-200"
              :class="{ 'transform rotate-180': expanded }"
            />
          </button>
        </div>
      </div>

      <!-- Entry Content -->
      <div v-if="entry && (expanded || showPreview)" class="space-y-4">
        <!-- Title -->
        <div v-if="entry.title" class="border-l-4 border-primary-500 pl-3">
          <h4 class="font-medium text-gray-900 dark:text-white">{{ entry.title }}</h4>
        </div>

        <!-- Content Preview -->
        <div v-if="entry.content" class="text-sm text-gray-700 dark:text-gray-300">
          <div 
            v-if="!expanded && entry.content.length > 200"
            v-html="truncateHtml(parseMarkdown(entry.content), 200)"
            class="prose prose-sm max-w-none dark:prose-invert"
          ></div>
          <div 
            v-else
            v-html="parseMarkdown(entry.content)"
            class="prose prose-sm max-w-none dark:prose-invert"
          ></div>
          
          <button
            v-if="!expanded && entry.content.length > 200"
            @click="expanded = true"
            class="text-primary-600 hover:text-primary-900 dark:text-primary-400 text-sm mt-2"
          >
            Show more...
          </button>
        </div>

        <!-- Key Levels -->
        <div v-if="entry.key_levels && expanded" class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
          <h5 class="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">Key Levels</h5>
          <div class="text-sm text-yellow-700 dark:text-yellow-300" v-html="parseMarkdown(entry.key_levels)"></div>
        </div>

        <!-- Watchlist -->
        <div v-if="entry.watchlist && entry.watchlist.length > 0 && expanded" class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <h5 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Watchlist</h5>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="symbol in entry.watchlist"
              :key="symbol"
              class="inline-flex items-center px-2 py-1 rounded bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-medium"
            >
              {{ symbol }}
            </span>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="entry.tags && entry.tags.length > 0 && expanded" class="flex flex-wrap gap-2">
          <span
            v-for="tag in entry.tags"
            :key="tag"
            class="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs"
          >
            #{{ tag }}
          </span>
        </div>

        <!-- Post-market reflection -->
        <div v-if="entry.followed_plan !== null && expanded" class="border-t pt-3">
          <div class="flex items-center text-sm">
            <span class="text-gray-500 dark:text-gray-400 mr-2">Followed Plan:</span>
            <span 
              :class="entry.followed_plan ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              class="font-medium"
            >
              {{ entry.followed_plan ? 'Yes' : 'No' }}
            </span>
          </div>
        </div>

        <div v-if="entry.lessons_learned && expanded" class="border-t pt-3">
          <h5 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Lessons Learned</h5>
          <div class="text-sm text-gray-700 dark:text-gray-300" v-html="parseMarkdown(entry.lessons_learned)"></div>
        </div>
      </div>

      <!-- No Entry State -->
      <div v-if="!entry && !loading" class="text-center py-6">
        <BookOpenIcon class="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p class="text-gray-500 dark:text-gray-400 mb-4">
          No journal entry for today yet. Start documenting your trading plan and market thoughts.
        </p>
        <button
          @click="createTodaysEntry"
          class="btn-primary"
          :disabled="creating"
        >
          <PlusIcon class="w-4 h-4 mr-2" />
          {{ creating ? 'Creating...' : 'Create Today\'s Entry' }}
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-6">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        <p class="text-gray-500 dark:text-gray-400 mt-2">Loading today's entry...</p>
      </div>

      <!-- Quick Entry Form (when creating) -->
      <div v-if="showQuickForm" class="mt-4 border-t pt-4">
        <form @submit.prevent="saveQuickEntry">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Market Bias
              </label>
              <select v-model="quickEntry.marketBias" class="input text-sm">
                <option value="">Select bias...</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quick Notes
              </label>
              <textarea
                v-model="quickEntry.content"
                rows="3"
                class="input text-sm"
                placeholder="What's your plan for today?"
              ></textarea>
            </div>
            
            <div class="flex justify-end space-x-2">
              <button
                type="button"
                @click="cancelQuickEntry"
                class="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn-primary text-sm"
                :disabled="saving"
              >
                {{ saving ? 'Saving...' : 'Save Entry' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDiaryStore } from '@/stores/diary'
import { parseMarkdown, truncateHtml as truncateHtmlUtil } from '@/utils/markdown'
import {
  PlusIcon,
  PencilIcon,
  ChevronDownIcon,
  BookOpenIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const diaryStore = useDiaryStore()

// Component state
const expanded = ref(false)
const showPreview = ref(true)
const creating = ref(false)
const saving = ref(false)
const showQuickForm = ref(false)

const quickEntry = ref({
  marketBias: '',
  content: ''
})

// Computed properties
const entry = computed(() => diaryStore.todaysEntry)
const loading = computed(() => diaryStore.loading)

// Methods
const toggleExpanded = () => {
  expanded.value = !expanded.value
}

const marketBiasClasses = (bias) => {
  switch (bias) {
    case 'bullish':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    case 'bearish':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    case 'neutral':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

const marketBiasIcon = (bias) => {
  switch (bias) {
    case 'bullish':
      return ArrowTrendingUpIcon
    case 'bearish':
      return ArrowTrendingDownIcon
    case 'neutral':
      return MinusIcon
    default:
      return MinusIcon
  }
}

const truncateHtml = (html, maxLength) => {
  return truncateHtmlUtil(html, maxLength)
}

const createTodaysEntry = () => {
  creating.value = true
  showQuickForm.value = true
  creating.value = false
}

const cancelQuickEntry = () => {
  showQuickForm.value = false
  quickEntry.value = {
    marketBias: '',
    content: ''
  }
}

const saveQuickEntry = async () => {
  try {
    saving.value = true
    
    const entryData = {
      entryType: 'diary',
      marketBias: quickEntry.value.marketBias || null,
      content: quickEntry.value.content || null
    }

    await diaryStore.saveEntry(entryData)
    
    showQuickForm.value = false
    quickEntry.value = {
      marketBias: '',
      content: ''
    }
    
    // Auto-expand to show the new entry
    expanded.value = true
    
  } catch (error) {
    console.error('Error saving quick entry:', error)
  } finally {
    saving.value = false
  }
}

const editEntry = () => {
  if (entry.value) {
    router.push(`/diary/${entry.value.id}/edit`)
  }
}

// Load today's entry on component mount
onMounted(async () => {
  await diaryStore.fetchTodaysEntry()
})

// Watch for changes to today's entry to auto-expand if there's content
watch(entry, (newEntry) => {
  if (newEntry && !expanded.value) {
    // Auto-expand if there's substantial content
    const hasSubstantialContent = 
      (newEntry.content && newEntry.content.length > 100) ||
      (newEntry.key_levels && newEntry.key_levels.length > 0) ||
      (newEntry.watchlist && newEntry.watchlist.length > 0) ||
      newEntry.followed_plan !== null ||
      (newEntry.lessons_learned && newEntry.lessons_learned.length > 0)
    
    if (hasSubstantialContent) {
      showPreview.value = true
    }
  }
}, { immediate: true })
</script>

<style scoped>
.prose {
  max-width: none;
}

.prose p {
  margin-bottom: 0.5rem;
}

.prose ul, .prose ol {
  margin-bottom: 0.5rem;
}

.prose li {
  margin-bottom: 0.25rem;
}
</style>