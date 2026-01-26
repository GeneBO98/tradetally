<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="heading-page">Trading Journal</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Track your daily market thoughts, trading plans, and reflections
          </p>
        </div>
        
        <div class="mt-4 sm:mt-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <!-- View Toggle -->
          <div class="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 min-w-max">
              <button
                @click="currentView = 'list'"
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center',
                  currentView === 'list'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
              >
                <ListBulletIcon class="w-4 h-4 mr-1" />
                List
              </button>
              <button
                @click="currentView = 'calendar'"
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center',
                  currentView === 'calendar'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
              >
                <CalendarDaysIcon class="w-4 h-4 mr-1" />
                Calendar
              </button>
              <button
                @click="currentView = 'templates'"
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center',
                  currentView === 'templates'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
              >
                <DocumentTextIcon class="w-4 h-4 mr-1" />
                Templates
              </button>
              <button
                @click="currentView = 'analysis'"
                :class="[
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center',
                  currentView === 'analysis'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                ]"
              >
                <SparklesIcon class="w-4 h-4 mr-1" />
                AI Analysis
              </button>
            </div>
          </div>

          <!-- Create Entry Button -->
          <router-link
            to="/diary/new"
            class="btn-primary flex-shrink-0"
          >
            <PlusIcon class="w-4 h-4 mr-2" />
            New Entry
          </router-link>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div class="flex flex-col sm:flex-row gap-4">
        <!-- Entry Type Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Type
          </label>
          <select
            v-model="filters.entryType"
            @change="applyFilters"
            class="input text-sm"
          >
            <option value="">All Types</option>
            <option value="diary">Diary</option>
            <option value="playbook">Playbook</option>
          </select>
        </div>

        <!-- Market Bias Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Market Bias
          </label>
          <select
            v-model="filters.marketBias"
            @change="applyFilters"
            class="input text-sm"
          >
            <option value="">All Bias</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        <!-- Date Range Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Start Date
          </label>
          <input
            type="date"
            v-model="filters.startDate"
            @change="applyFilters"
            class="input text-sm"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            End Date
          </label>
          <input
            type="date"
            v-model="filters.endDate"
            @change="applyFilters"
            class="input text-sm"
          />
        </div>

        <!-- Search -->
        <div class="flex-1">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <div class="relative">
            <input
              type="text"
              v-model="searchQuery"
              @input="debounceSearch"
              @focus="showTagSuggestions = searchQuery.includes('#')"
              @blur="hideTagSuggestions"
              placeholder="Search entries or #tag..."
              class="input text-sm pl-10"
            />
            <MagnifyingGlassIcon class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />

            <!-- Tag Suggestions Dropdown -->
            <div
              v-if="showTagSuggestions && filteredTags.length > 0"
              class="absolute z-50 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto"
            >
              <button
                v-for="tag in filteredTags"
                :key="tag"
                @mousedown.prevent="selectTag(tag)"
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              >
                #{{ tag }}
              </button>
            </div>
          </div>
        </div>

        <!-- Clear Filters -->
        <div class="flex items-end">
          <button
            @click="clearFilters"
            class="btn-secondary text-sm"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="min-h-96">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <ExclamationTriangleIcon class="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        <button @click="loadEntries" class="btn-primary mt-4">Try Again</button>
      </div>

      <!-- Content -->
      <div v-else>
        <!-- General Notes Section (shown in all views) -->
        <GeneralNotes v-if="currentView === 'list'" class="mb-6" />

        <!-- List View -->
        <div v-if="currentView === 'list'" class="space-y-4">
        <!-- Entry Cards -->
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <div class="flex items-center space-x-3 mb-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ formatDate(entry.entry_date) }}
                </span>
                
                <span
                  :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    entry.entry_type === 'diary'
                      ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
                      : 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-400'
                  ]"
                >
                  {{ entry.entry_type === 'diary' ? 'Diary' : 'Playbook' }}
                </span>
                
                <span
                  v-if="entry.market_bias"
                  :class="marketBiasClasses(entry.market_bias)"
                  class="px-2 py-1 text-xs font-medium rounded-full"
                >
                  {{ entry.market_bias.charAt(0).toUpperCase() + entry.market_bias.slice(1) }}
                </span>
              </div>
              
              <h3
                v-if="entry.title"
                class="text-lg font-medium text-gray-900 dark:text-white mb-2"
              >
                {{ entry.title }}
              </h3>
            </div>
            
            <div class="flex items-center space-x-2 ml-4">
              <router-link
                :to="`/diary/${entry.id}/edit`"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <PencilIcon class="w-4 h-4" />
              </router-link>
              
              <button
                @click="confirmDelete(entry)"
                class="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                <TrashIcon class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Content (split into cards if appended) -->
          <div v-if="entry.content" class="mb-4">
            <div
              v-for="(contentPart, idx) in splitContent(entry.content)"
              :key="idx"
              :class="[
                'text-sm text-gray-700 dark:text-gray-300 prose prose-sm max-w-none dark:prose-invert',
                splitContent(entry.content).length > 1 ? 'bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg mb-3 last:mb-0' : ''
              ]"
              v-html="truncateHtml(parseMarkdown(contentPart), 300)"
            ></div>
          </div>

          <div v-if="entry.key_levels && entry.key_levels.length > 0" class="mb-3">
            <span class="text-xs font-medium text-yellow-600 dark:text-yellow-400">Key Levels:</span>
            <div class="text-sm text-gray-600 dark:text-gray-400 mt-1" v-html="truncateHtml(parseMarkdown(entry.key_levels), 150)"></div>
          </div>
          
          <div v-if="entry.watchlist && entry.watchlist.length > 0" class="mb-3">
            <span class="text-xs font-medium text-blue-600 dark:text-blue-400 mr-2">Watchlist:</span>
            <div class="inline-flex flex-wrap gap-1">
              <WatchlistSymbol
                v-for="(symbol, index) in entry.watchlist.slice(0, 5)"
                :key="symbol"
                :symbol="symbol"
                @added-to-watchlist="handleWatchlistAdded"
                @alert-created="handleAlertCreated"
              />
              <span
                v-if="entry.watchlist.length > 5"
                class="text-xs text-gray-500 dark:text-gray-400 px-2"
              >
                +{{ entry.watchlist.length - 5 }} more
              </span>
            </div>
          </div>

          <div v-if="entry.linked_trades && entry.linked_trades.length > 0" class="mb-3">
            <span class="text-xs font-medium text-purple-600 dark:text-purple-400 mr-2">Linked Trades:</span>
            <LinkedTradesList :trade-ids="entry.linked_trades" />
          </div>

          <div v-if="entry.tags && entry.tags.length > 0" class="flex flex-wrap gap-2 mb-3">
            <span
              v-for="tag in entry.tags.slice(0, 3)"
              :key="tag"
              class="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs"
            >
              #{{ tag }}
            </span>
            <span
              v-if="entry.tags.length > 3"
              class="text-xs text-gray-500 dark:text-gray-400"
            >
              +{{ entry.tags.length - 3 }} more tags
            </span>
          </div>

          <!-- Attachments Preview -->
          <div v-if="entry.attachments && entry.attachments.length > 0" class="flex flex-wrap gap-2">
            <div
              v-for="attachment in entry.attachments.slice(0, 4)"
              :key="attachment.id"
              class="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
              @click.stop="openImagePreview(attachment)"
            >
              <img
                :src="getImageUrl(attachment)"
                :alt="attachment.file_name"
                class="w-full h-full object-cover"
              />
            </div>
            <div
              v-if="entry.attachments.length > 4"
              class="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm text-gray-600 dark:text-gray-300 font-medium"
            >
              +{{ entry.attachments.length - 4 }}
            </div>
          </div>
        </div>

        <!-- No Entries State -->
        <div v-if="!loading && entries.length === 0" class="text-center py-12">
          <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No journal entries found</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-6">
            {{ hasActiveFilters ? 'Try adjusting your filters or' : '' }}
            Start documenting your trading journey with your first entry.
          </p>
          <router-link to="/diary/new" class="btn-primary">
            <PlusIcon class="w-4 h-4 mr-2" />
            Create Your First Entry
          </router-link>
        </div>
        </div>

        <!-- Calendar View -->
        <div v-else-if="currentView === 'calendar'" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <!-- Calendar Header -->
        <div class="flex justify-between items-center mb-6">
          <h2 class="heading-section">
            {{ format(calendarDate, 'MMMM yyyy') }}
          </h2>
          <div class="flex items-center space-x-2">
            <button
              @click="changeMonth(-1)"
              class="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeftIcon class="w-5 h-5" />
            </button>
            <button
              @click="goToToday"
              class="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Today
            </button>
            <button
              @click="changeMonth(1)"
              class="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRightIcon class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Calendar Grid -->
        <div class="grid grid-cols-7 gap-1">
          <!-- Day Headers -->
          <div
            v-for="day in dayHeaders"
            :key="day"
            class="p-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {{ day }}
          </div>

          <!-- Calendar Days -->
          <div
            v-for="day in calendarDays"
            :key="`${day.date.getMonth()}-${day.date.getDate()}`"
            class="relative min-h-[100px] p-2 border border-gray-200 dark:border-gray-600"
            :class="{
              'bg-gray-50 dark:bg-gray-700': !day.isCurrentMonth,
              'bg-blue-50 dark:bg-blue-900': day.isToday,
              'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700': day.isCurrentMonth
            }"
            @click="selectDate(day.date)"
          >
            <!-- Day Number -->
            <div
              class="text-sm font-medium mb-1"
              :class="{
                'text-gray-400': !day.isCurrentMonth,
                'text-blue-600 dark:text-blue-400': day.isToday,
                'text-gray-900 dark:text-white': day.isCurrentMonth && !day.isToday
              }"
            >
              {{ day.date.getDate() }}
            </div>

            <!-- Diary Entries -->
            <div v-if="day.entries.length > 0" class="space-y-1">
              <div
                v-for="entry in day.entries.slice(0, 2)"
                :key="entry.id"
                class="text-xs p-1 rounded cursor-pointer"
                :class="getEntryDisplayClass(entry)"
                @click.stop="goToEntry(entry)"
                :title="getEntryTooltip(entry)"
              >
                <component :is="getEntryIcon(entry)" class="w-3 h-3 inline mr-1" />
                <span class="font-medium">{{ getEntryDisplayText(entry) }}</span>
                <div v-if="entry.market_bias" class="text-xs opacity-75">
                  {{ entry.market_bias }} bias
                </div>
              </div>
              <div
                v-if="day.entries.length > 2"
                class="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                @click.stop="showDayEntries(day.date)"
              >
                +{{ day.entries.length - 2 }} more entries
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State for Calendar -->
        <div v-if="entries.length === 0" class="text-center py-12">
          <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Diary Entries</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-4">
            Create your first entry to see it on the calendar.
          </p>
          <router-link
            to="/diary/new"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            <PlusIcon class="w-4 h-4 mr-2" />
            Create Your First Entry
          </router-link>
        </div>
        </div>

        <!-- Templates View -->
        <div v-else-if="currentView === 'templates'">
          <TemplateManager @apply-template="handleApplyTemplate" />
        </div>

        <!-- AI Analysis View -->
        <div v-else-if="currentView === 'analysis'">
          <DiaryAnalysis />
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="entries.length > 0 && pagination.pages > 1" class="mt-8 flex justify-center">
      <nav class="flex items-center space-x-2">
        <button
          @click="changePage(pagination.page - 1)"
          :disabled="pagination.page <= 1"
          class="px-3 py-2 text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        <span class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
          Page {{ pagination.page }} of {{ pagination.pages }}
        </span>
        
        <button
          @click="changePage(pagination.page + 1)"
          :disabled="pagination.page >= pagination.pages"
          class="px-3 py-2 text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </nav>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showDeleteModal = false"
    >
      <div
        class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full mx-4"
        @click.stop
      >
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Delete Entry</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete this journal entry? This action cannot be undone.
        </p>
        <div class="flex justify-end space-x-3">
          <button
            @click="showDeleteModal = false"
            class="btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="deleteEntry"
            :disabled="deleting"
            class="btn-danger"
          >
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      @click="previewImage = null"
    >
      <div class="relative max-w-4xl max-h-[90vh] p-4">
        <button
          @click="previewImage = null"
          class="absolute top-2 right-2 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
        >
          <svg class="w-6 h-6 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <img
          :src="getImageUrl(previewImage)"
          :alt="previewImage.file_name"
          class="max-w-full max-h-[85vh] object-contain rounded-lg"
          @click.stop
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDiaryStore } from '@/stores/diary'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { parseMarkdown, truncateHtml as truncateHtmlUtil } from '@/utils/markdown'
import DiaryAnalysis from '@/components/diary/DiaryAnalysis.vue'
import GeneralNotes from '@/components/diary/GeneralNotes.vue'
import TemplateManager from '@/components/diary/TemplateManager.vue'
import LinkedTradesList from '@/components/diary/LinkedTradesList.vue'
import WatchlistSymbol from '@/components/diary/WatchlistSymbol.vue'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  DocumentTextIcon
} from '@heroicons/vue/24/outline'

const diaryStore = useDiaryStore()
const router = useRouter()

// Component state - load saved view from localStorage
const savedView = localStorage.getItem('diaryView')
const currentView = ref(savedView || 'list')
const savedSearchQuery = localStorage.getItem('diarySearchQuery')
const searchQuery = ref(savedSearchQuery || '')
const searchTimeout = ref(null)
const showDeleteModal = ref(false)
const entryToDelete = ref(null)
const deleting = ref(false)
const showTagSuggestions = ref(false)
const allTags = ref([])
const previewImage = ref(null)

// Calendar state
const calendarDate = ref(new Date())

// Filters - load from localStorage
const savedFilters = localStorage.getItem('diaryFilters')
const filters = ref(savedFilters ? JSON.parse(savedFilters) : {
  entryType: '',
  marketBias: '',
  startDate: '',
  endDate: ''
})

// Computed properties
const entries = computed(() => diaryStore.entries)
const loading = computed(() => diaryStore.loading)
const error = computed(() => diaryStore.error)
const pagination = computed(() => diaryStore.pagination)

const hasActiveFilters = computed(() => {
  return Object.values(filters.value).some(value => value !== '') || searchQuery.value !== ''
})

const filteredTags = computed(() => {
  if (!searchQuery.value.includes('#')) return []

  // Extract the tag query after the last #
  const lastHashIndex = searchQuery.value.lastIndexOf('#')
  const tagQuery = searchQuery.value.substring(lastHashIndex + 1).toLowerCase()

  if (!tagQuery) return allTags.value

  return allTags.value.filter(tag =>
    tag.toLowerCase().includes(tagQuery)
  )
})

// Calendar computed properties
const dayHeaders = computed(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])

const calendarDays = computed(() => {
  const start = startOfWeek(startOfMonth(calendarDate.value))
  const end = endOfWeek(endOfMonth(calendarDate.value))
  const days = eachDayOfInterval({ start, end })
  
  return days.map(date => {
    const dateString = format(date, 'yyyy-MM-dd')
    const dayEntries = entries.value.filter(entry => {
      // Extract date part from entry_date (which might be a full timestamp)
      const entryDateString = entry.entry_date.split('T')[0]
      return entryDateString === dateString
    })
    
    return {
      date,
      isCurrentMonth: date.getMonth() === calendarDate.value.getMonth(),
      isToday: isToday(date),
      entries: dayEntries
    }
  })
})

// Methods
const formatDate = (dateString) => {
  // Parse as local date to avoid timezone shifts
  const [year, month, day] = dateString.split('T')[0].split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  return format(date, 'MMM d, yyyy')
}

const splitContent = (content) => {
  if (!content) return []
  // Split by the separator used in append mode
  const parts = content.split(/\n\n---\n\n/)
  return parts.filter(part => part.trim().length > 0)
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

const truncateHtml = (html, maxLength) => {
  return truncateHtmlUtil(html, maxLength)
}

const applyFilters = async () => {
  // Save filters to localStorage
  localStorage.setItem('diaryFilters', JSON.stringify(filters.value))
  diaryStore.updateFilters(filters.value)
  await loadEntries()
}

const clearFilters = async () => {
  filters.value = {
    entryType: '',
    marketBias: '',
    startDate: '',
    endDate: ''
  }
  searchQuery.value = ''
  // Clear from localStorage
  localStorage.removeItem('diaryFilters')
  localStorage.removeItem('diarySearchQuery')
  diaryStore.resetFilters()
  await loadEntries()
}

const debounceSearch = () => {
  // Show tag suggestions if # is typed
  if (searchQuery.value.includes('#')) {
    showTagSuggestions.value = true
  } else {
    showTagSuggestions.value = false
  }

  // Save search query to localStorage
  if (searchQuery.value.trim()) {
    localStorage.setItem('diarySearchQuery', searchQuery.value)
  } else {
    localStorage.removeItem('diarySearchQuery')
  }

  clearTimeout(searchTimeout.value)
  searchTimeout.value = setTimeout(async () => {
    if (searchQuery.value.trim().length >= 2) {
      await diaryStore.searchEntries(searchQuery.value, filters.value)
    } else if (searchQuery.value.trim().length === 0) {
      await loadEntries()
    }
  }, 300)
}

const selectTag = (tag) => {
  // Replace everything after the last # with the selected tag
  const lastHashIndex = searchQuery.value.lastIndexOf('#')
  searchQuery.value = searchQuery.value.substring(0, lastHashIndex + 1) + tag
  showTagSuggestions.value = false
  debounceSearch()
}

const hideTagSuggestions = () => {
  setTimeout(() => {
    showTagSuggestions.value = false
  }, 200)
}

// Calendar methods
const changeMonth = (delta) => {
  if (delta > 0) {
    calendarDate.value = addMonths(calendarDate.value, 1)
  } else {
    calendarDate.value = subMonths(calendarDate.value, 1)
  }
}

const goToToday = () => {
  calendarDate.value = new Date()
}

const selectDate = (date) => {
  const dateString = format(date, 'yyyy-MM-dd')
  const dayEntries = entries.value.filter(entry => {
    const entryDateString = entry.entry_date.split('T')[0]
    return entryDateString === dateString
  })
  
  if (dayEntries.length === 1) {
    // If there's exactly one entry, open it for editing
    router.push(`/diary/${dayEntries[0].id}/edit`)
  } else if (dayEntries.length > 1) {
    // If there are multiple entries, show them in a modal or filter the list view
    showDayEntries(date)
  } else {
    // If no entries, create a new one for this date
    router.push(`/diary/new?date=${dateString}`)
  }
}

const goToEntry = (entry) => {
  router.push(`/diary/${entry.id}/edit`)
}

const showDayEntries = (date) => {
  // Switch to list view and filter by the selected date
  const dateString = format(date, 'yyyy-MM-dd')
  filters.value.startDate = dateString
  filters.value.endDate = dateString
  currentView.value = 'list'
}

const getEntryDisplayClass = (entry) => {
  const baseClass = 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
  
  // Different colors based on entry type or market bias
  if (entry.market_bias === 'bullish') {
    return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
  } else if (entry.market_bias === 'bearish') {
    return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
  } else if (entry.market_bias === 'neutral') {
    return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
  } else {
    return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
  }
}

const getEntryIcon = (entry) => {
  if (entry.entry_type === 'playbook') {
    return BookOpenIcon
  }
  return PencilIcon
}

const getEntryDisplayText = (entry) => {
  if (entry.title && entry.title.trim()) {
    return entry.title.length > 12 ? entry.title.substring(0, 12) + '...' : entry.title
  }
  return entry.entry_type === 'playbook' ? 'Playbook' : 'Journal'
}

const getEntryTooltip = (entry) => {
  let tooltip = entry.title || (entry.entry_type === 'playbook' ? 'Playbook Entry' : 'Journal Entry')
  
  if (entry.market_bias) {
    tooltip += `\nMarket Bias: ${entry.market_bias}`
  }
  
  if (entry.content && entry.content.length > 0) {
    const contentPreview = entry.content.length > 100 
      ? entry.content.substring(0, 100) + '...' 
      : entry.content
    tooltip += `\n\n${contentPreview}`
  }
  
  return tooltip
}

const loadEntries = async () => {
  try {
    await diaryStore.fetchEntries({ page: 1 })
  } catch (error) {
    console.error('Error loading entries:', error)
  }
}

const changePage = async (page) => {
  if (page >= 1 && page <= pagination.value.pages) {
    try {
      await diaryStore.fetchEntries({ page })
    } catch (error) {
      console.error('Error changing page:', error)
    }
  }
}

const confirmDelete = (entry) => {
  entryToDelete.value = entry
  showDeleteModal.value = true
}

const deleteEntry = async () => {
  if (!entryToDelete.value) return

  try {
    deleting.value = true
    await diaryStore.deleteEntry(entryToDelete.value.id)
    showDeleteModal.value = false
    entryToDelete.value = null

    // Reload entries to refresh the list
    await loadEntries()
  } catch (error) {
    console.error('Error deleting entry:', error)
  } finally {
    deleting.value = false
  }
}

const handleWatchlistAdded = (symbol) => {
  console.log(`[SUCCESS] ${symbol} added to watchlist`)
}

const handleAlertCreated = (symbol) => {
  console.log(`[SUCCESS] Price alert created for ${symbol}`)
}

const handleApplyTemplate = (template) => {
  // Navigate to new entry form (template will be shown there)
  router.push('/diary/new')
}

// Image handling
const getImageUrl = (attachment) => {
  const token = localStorage.getItem('token')
  // file_url already includes /api prefix, so use origin only (not VITE_API_URL which includes /api)
  const origin = window.location.origin
  return `${origin}${attachment.file_url}?token=${token}`
}

const openImagePreview = (attachment) => {
  previewImage.value = attachment
}

// Load entries and tags on component mount
onMounted(async () => {
  await loadEntries()
  // Load tags for autocomplete
  const tags = await diaryStore.fetchTags()
  allTags.value = tags || []
})

// Watch for filter changes
watch(filters, () => {
  applyFilters()
}, { deep: true })

// Watch for view changes to persist to localStorage
watch(currentView, (newView) => {
  localStorage.setItem('diaryView', newView)
})
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

.btn-danger {
  @apply bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>