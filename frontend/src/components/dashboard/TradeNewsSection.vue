<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Latest News</h3>
        <button
          @click="refreshNews"
          :disabled="loading"
          class="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            class="w-4 h-4 mr-1.5"
            :class="{ 'animate-spin': loading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      <div v-if="loading && !newsItems.length" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <div class="text-red-500 dark:text-red-400 mb-2">
          <svg class="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {{ error }}
        </div>
        <button
          @click="fetchNews"
          class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Try again
        </button>
      </div>

      <div v-else-if="!newsItems.length" class="text-center py-8">
        <p class="text-gray-500 dark:text-gray-400">No news available for your open positions.</p>
      </div>

      <div v-else class="space-y-4">
        <div v-for="(newsGroup, symbol) in groupedNews" :key="symbol">
          <div class="mb-2">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
              <span class="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs mr-2">{{ symbol }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ newsGroup.length }} article{{ newsGroup.length !== 1 ? 's' : '' }}</span>
            </h4>
          </div>
          <div class="space-y-3">
            <article
              v-for="(item, index) in newsGroup"
              :key="item.id"
              v-show="expandedSymbols[symbol] || index < 3"
              class="border-l-2 border-gray-200 dark:border-gray-700 pl-4 hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <h5 class="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 mb-1">
                    <a
                      :href="item.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {{ item.headline }}
                    </a>
                  </h5>
                  <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">
                    {{ item.summary }}
                  </p>
                  <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ item.source }}</span>
                    <span class="mx-1">•</span>
                    <time :datetime="item.datetime">{{ formatNewsDate(item.datetime) }}</time>
                  </div>
                </div>
                <img
                  v-if="item.image"
                  :src="item.image"
                  :alt="item.headline"
                  class="ml-3 w-16 h-16 object-cover rounded-md flex-shrink-0"
                  @error="handleImageError"
                />
              </div>
            </article>
          </div>
          <button
            v-if="newsGroup.length > 3"
            @click="toggleExpanded(symbol)"
            class="mt-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            {{ expandedSymbols[symbol] ? 'Show less' : `Show ${newsGroup.length - 3} more` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/services/api'

const props = defineProps({
  symbols: {
    type: Array,
    required: true
  }
})

const newsItems = ref([])
const loading = ref(false)
const error = ref(null)
const expandedSymbols = ref({})

const groupedNews = computed(() => {
  const grouped = {}
  newsItems.value.forEach(item => {
    if (!grouped[item.symbol]) {
      grouped[item.symbol] = []
    }
    grouped[item.symbol].push(item)
  })
  return grouped
})

const formatNewsDate = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

const handleImageError = (event) => {
  event.target.style.display = 'none'
}

const toggleExpanded = (symbol) => {
  expandedSymbols.value[symbol] = !expandedSymbols.value[symbol]
}

const fetchNews = async () => {
  if (!props.symbols.length) {
    newsItems.value = []
    return
  }

  loading.value = true
  error.value = null

  try {
    const response = await api.get('/trades/news', {
      params: {
        symbols: props.symbols.join(',')
      }
    })

    newsItems.value = response.data
  } catch (err) {
    console.error('Failed to fetch news:', err)
    error.value = err.response?.data?.error || 'Failed to load news. Please try again later.'
  } finally {
    loading.value = false
  }
}

const refreshNews = () => {
  fetchNews()
}

onMounted(() => {
  fetchNews()
})

watch(() => props.symbols, () => {
  fetchNews()
}, { deep: true })
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>