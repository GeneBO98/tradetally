<template>
  <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
          <SparklesIcon class="w-5 h-5 mr-2 text-purple-600" />
          AI Journal Analysis
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Get AI-powered insights and recommendations from your journal entries
        </p>
      </div>
      <button
        v-if="!showAnalysisForm && !analysis"
        @click="showAnalysisForm = true"
        class="btn-primary flex items-center"
      >
        <SparklesIcon class="w-4 h-4 mr-2" />
        Analyze Journal
      </button>
    </div>

    <!-- Date Range Selection Form -->
    <div v-if="showAnalysisForm && !analyzing" class="mb-6">
      <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
        <h4 class="font-medium text-gray-900 dark:text-white mb-4">Select Analysis Period</h4>
        
        <!-- Quick Date Presets -->
        <div class="mb-4">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Quick Select:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in datePresets"
              :key="preset.label"
              @click="selectDatePreset(preset)"
              class="px-3 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- Custom Date Range -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              v-model="startDate"
              type="date"
              class="input"
              :max="endDate"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              v-model="endDate"
              type="date"
              class="input"
              :min="startDate"
              :max="today"
            />
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end space-x-3">
          <button
            @click="cancelAnalysis"
            class="btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="startAnalysis"
            :disabled="!startDate || !endDate"
            class="btn-primary flex items-center"
            :class="{ 'opacity-50 cursor-not-allowed': !startDate || !endDate }"
          >
            <SparklesIcon class="w-4 h-4 mr-2" />
            Start Analysis
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="analyzing" class="text-center py-8">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Analyzing Your Journal</h3>
      <p class="text-gray-600 dark:text-gray-400">
        AI is reviewing your entries from {{ startDate }} to {{ endDate }}...
      </p>
      <div class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        This may take up to 30 seconds
      </div>
    </div>

    <!-- Analysis Results -->
    <div v-if="analysis && !analyzing" class="space-y-6">
      <!-- Analysis Header -->
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-lg font-medium text-gray-900 dark:text-white">
            Analysis Results
          </h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Period: {{ formatDate(startDate) }} - {{ formatDate(endDate) }} 
            ({{ entriesAnalyzed }} entries analyzed)
          </p>
        </div>
        <button
          @click="startNewAnalysis"
          class="btn-secondary text-sm"
        >
          New Analysis
        </button>
      </div>

      <!-- Analysis Content -->
      <div class="prose dark:prose-invert max-w-none">
        <div 
          v-html="formatAnalysisContent(analysis)"
          class="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed"
        ></div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-600">
        <button
          @click="shareAnalysis"
          class="btn-secondary flex items-center"
        >
          <ShareIcon class="w-4 h-4 mr-2" />
          Share
        </button>
        <button
          @click="saveAnalysis"
          class="btn-primary flex items-center"
        >
          <BookmarkIcon class="w-4 h-4 mr-2" />
          Save Analysis
        </button>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <div class="flex items-start">
        <ExclamationTriangleIcon class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0" />
        <div>
          <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
            Analysis Failed
          </h3>
          <p class="text-sm text-red-700 dark:text-red-300 mt-1">
            {{ error }}
          </p>
          <button
            @click="clearError"
            class="text-sm text-red-800 dark:text-red-200 underline mt-2"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth } from 'date-fns'
import { useDiaryStore } from '@/stores/diary'
import api from '@/services/api'
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  ShareIcon,
  BookmarkIcon
} from '@heroicons/vue/24/outline'

const diaryStore = useDiaryStore()

// Component state
const showAnalysisForm = ref(false)
const analyzing = ref(false)
const analysis = ref(null)
const error = ref(null)
const entriesAnalyzed = ref(0)

// Date range
const today = new Date().toISOString().split('T')[0]
const startDate = ref('')
const endDate = ref(today)

// Date presets
const datePresets = ref([
  {
    label: 'Last 7 days',
    start: () => subDays(new Date(), 7),
    end: () => new Date()
  },
  {
    label: 'Last 2 weeks',
    start: () => subWeeks(new Date(), 2),
    end: () => new Date()
  },
  {
    label: 'Last month',
    start: () => subMonths(new Date(), 1),
    end: () => new Date()
  },
  {
    label: 'This week',
    start: () => startOfWeek(new Date()),
    end: () => new Date()
  },
  {
    label: 'This month',
    start: () => startOfMonth(new Date()),
    end: () => new Date()
  }
])

// Methods
const selectDatePreset = (preset) => {
  startDate.value = preset.start().toISOString().split('T')[0]
  endDate.value = preset.end().toISOString().split('T')[0]
}

const startAnalysis = async () => {
  analyzing.value = true
  error.value = null
  
  try {
    // Try using the store method first, fallback to direct API call
    let result
    if (typeof diaryStore.analyzeEntries === 'function') {
      result = await diaryStore.analyzeEntries(startDate.value, endDate.value)
    } else {
      // Direct API call as fallback
      const response = await api.get(`/diary/analyze?startDate=${startDate.value}&endDate=${endDate.value}`)
      result = response.data
    }
    
    analysis.value = result.analysis
    entriesAnalyzed.value = result.entriesAnalyzed
    showAnalysisForm.value = false
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to analyze journal entries'
  } finally {
    analyzing.value = false
  }
}

const cancelAnalysis = () => {
  showAnalysisForm.value = false
  startDate.value = ''
  endDate.value = today
}

const clearError = () => {
  error.value = null
  showAnalysisForm.value = true
}

const startNewAnalysis = () => {
  analysis.value = null
  entriesAnalyzed.value = 0
  showAnalysisForm.value = true
}

const formatDate = (dateString) => {
  return format(new Date(dateString), 'MMM d, yyyy')
}

const formatAnalysisContent = (content) => {
  if (!content) return ''
  
  // Convert markdown-like formatting to HTML
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\d+\.\s+/gm, '<br/><strong>$&</strong>')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

const shareAnalysis = () => {
  if (navigator.share) {
    navigator.share({
      title: 'Trading Journal Analysis',
      text: `Journal Analysis (${formatDate(startDate.value)} - ${formatDate(endDate.value)}):\n\n${analysis.value}`
    })
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(analysis.value)
    // You could add a toast notification here
  }
}

const saveAnalysis = () => {
  // Create a downloadable text file
  const blob = new Blob([
    `Trading Journal Analysis\n` +
    `Period: ${formatDate(startDate.value)} - ${formatDate(endDate.value)}\n` +
    `Entries Analyzed: ${entriesAnalyzed.value}\n\n` +
    `${analysis.value}`
  ], { type: 'text/plain' })
  
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `journal-analysis-${startDate.value}-to-${endDate.value}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Initialize with last week as default
selectDatePreset(datePresets.value[0])
</script>