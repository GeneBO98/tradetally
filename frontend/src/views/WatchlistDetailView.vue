<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center mb-8">
      <button
        @click="$router.push('/watchlists')"
        class="mr-4 p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>
      <div class="flex-1">
        <h1 class="text-3xl font-bold text-gray-900">{{ watchlist?.name }}</h1>
        <p v-if="watchlist?.description" class="text-gray-600 mt-1">{{ watchlist.description }}</p>
      </div>
      <button
        @click="showAddSymbolModal = true"
        class="btn-primary"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        Add Symbol
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Watchlist Items -->
    <div v-else-if="watchlist?.items?.length > 0" class="bg-white shadow-sm rounded-lg overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-medium text-gray-900">Symbols ({{ watchlist.items.length }})</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Change</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="item in watchlist.items" :key="item.id">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ item.symbol }}</div>
                <div v-if="item.notes" class="text-sm text-gray-500">{{ item.notes }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ item.current_price ? formatPrice(item.current_price) : 'N/A' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="item.price_change !== null" :class="priceChangeClass(item.price_change)">
                  {{ formatPriceChange(item.price_change) }}
                </span>
                <span v-else class="text-gray-400">N/A</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="item.percent_change !== null" :class="priceChangeClass(item.percent_change)">
                  {{ formatPercentChange(item.percent_change) }}
                </span>
                <span v-else class="text-gray-400">N/A</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(item.added_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  @click="createPriceAlert(item.symbol)"
                  class="text-blue-600 hover:text-blue-900"
                >
                  Alert
                </button>
                <button
                  @click="editNotes(item)"
                  class="text-indigo-600 hover:text-indigo-900"
                >
                  Edit
                </button>
                <button
                  @click="removeSymbol(item)"
                  class="text-red-600 hover:text-red-900"
                >
                  Remove
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No symbols in watchlist</h3>
      <p class="mt-1 text-sm text-gray-500">Get started by adding your first symbol.</p>
      <div class="mt-6">
        <button
          @click="showAddSymbolModal = true"
          class="btn-primary"
        >
          Add Symbol
        </button>
      </div>
    </div>

    <!-- News and Earnings Sections -->
    <div v-if="watchlist?.items?.length > 0" class="mt-8 space-y-8">
      
      <!-- Watchlist News Section -->
      <div class="bg-white shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 flex items-center">
            <svg class="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
            </svg>
            Recent News
          </h2>
          <div class="flex items-center space-x-2">
            <select v-model="newsFilter.days" @change="loadWatchlistNews" class="text-sm border-gray-300 rounded-md">
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <button 
              @click="loadWatchlistNews" 
              :disabled="loadingNews"
              class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {{ loadingNews ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
        
        <div v-if="loadingNews" class="flex justify-center items-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
        
        <div v-else-if="watchlistNews.length > 0" class="divide-y divide-gray-200">
          <article 
            v-for="article in watchlistNews.slice(0, newsFilter.limit)" 
            :key="article.id || article.datetime" 
            class="p-6 hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-start space-x-3">
              <div class="flex-shrink-0">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {{ article.symbol }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <a 
                  :href="article.url" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  class="block hover:text-blue-600 transition-colors"
                >
                  <h3 class="text-sm font-medium text-gray-900 mb-1">{{ article.headline }}</h3>
                  <p v-if="article.summary" class="text-sm text-gray-600 line-clamp-2 mb-2">{{ article.summary }}</p>
                  <div class="flex items-center text-xs text-gray-500">
                    <span>{{ formatNewsDate(article.datetime) }}</span>
                    <span v-if="article.source" class="ml-2">• {{ article.source }}</span>
                  </div>
                </a>
              </div>
            </div>
          </article>
        </div>
        
        <div v-else class="p-6 text-center text-gray-500">
          <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
          </svg>
          <p class="text-sm">No recent news available for your watchlist symbols</p>
        </div>
      </div>

      <!-- Upcoming Earnings Section -->
      <div class="bg-white shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 flex items-center">
            <svg class="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Upcoming Earnings
          </h2>
          <div class="flex items-center space-x-2">
            <select v-model="earningsFilter.days" @change="loadWatchlistEarnings" class="text-sm border-gray-300 rounded-md">
              <option value="14">Next 14 days</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
            <button 
              @click="loadWatchlistEarnings" 
              :disabled="loadingEarnings"
              class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {{ loadingEarnings ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
        
        <div v-if="loadingEarnings" class="flex justify-center items-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
        </div>
        
        <div v-else-if="watchlistEarnings.length > 0" class="divide-y divide-gray-200">
          <div 
            v-for="earnings in watchlistEarnings" 
            :key="`${earnings.symbol}-${earnings.date}`" 
            class="p-6 hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {{ earnings.symbol }}
                </span>
                <div>
                  <p class="text-sm font-medium text-gray-900">Earnings Report</p>
                  <p class="text-xs text-gray-500">{{ formatEarningsDate(earnings.date) }}</p>
                </div>
              </div>
              <div class="text-right">
                <div v-if="earnings.hour" class="text-xs text-gray-500">
                  {{ earnings.hour === 'amc' ? 'After Market Close' : earnings.hour === 'bmo' ? 'Before Market Open' : earnings.hour }}
                </div>
                <div v-if="earnings.epsEstimate" class="text-xs text-gray-600 mt-1">
                  Est. EPS: ${{ earnings.epsEstimate }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-else class="p-6 text-center text-gray-500">
          <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          <p class="text-sm">No upcoming earnings for your watchlist symbols</p>
        </div>
      </div>
    </div>

    <!-- Add Symbol Modal -->
    <div v-if="showAddSymbolModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Add Symbol to Watchlist</h3>
          <form @submit.prevent="addSymbol">
            <div class="mb-4">
              <label for="symbol" class="block text-sm font-medium text-gray-700 mb-2">Symbol</label>
              <input
                id="symbol"
                v-model="symbolForm.symbol"
                type="text"
                required
                class="input uppercase"
                placeholder="Enter symbol (e.g., AAPL)"
              >
            </div>
            <div class="mb-6">
              <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
              <textarea
                id="notes"
                v-model="symbolForm.notes"
                rows="3"
                class="input"
                placeholder="Enter notes"
              ></textarea>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="cancelAddSymbol"
                class="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="adding"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {{ adding ? 'Adding...' : 'Add Symbol' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Edit Notes Modal -->
    <div v-if="editingItem" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Notes for {{ editingItem.symbol }}</h3>
          <form @submit.prevent="updateNotes">
            <div class="mb-6">
              <label for="editNotes" class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                id="editNotes"
                v-model="editNotesForm.notes"
                rows="4"
                class="input"
                placeholder="Enter notes"
              ></textarea>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="cancelEditNotes"
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="updating"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {{ updating ? 'Updating...' : 'Update Notes' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

export default {
  name: 'WatchlistDetailView',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { showSuccess, showError } = useNotification()

    const watchlist = ref(null)
    const loading = ref(true)
    const adding = ref(false)
    const updating = ref(false)
    const showAddSymbolModal = ref(false)
    const editingItem = ref(null)

    // News and earnings data
    const watchlistNews = ref([])
    const watchlistEarnings = ref([])
    const loadingNews = ref(false)
    const loadingEarnings = ref(false)

    const newsFilter = ref({
      days: 7,
      limit: 10
    })

    const earningsFilter = ref({
      days: 30
    })

    const symbolForm = ref({
      symbol: '',
      notes: ''
    })

    const editNotesForm = ref({
      notes: ''
    })

    const loadWatchlist = async () => {
      try {
        loading.value = true
        const response = await api.get(`/watchlists/${route.params.id}`)
        watchlist.value = response.data.data
        
        // Load news and earnings if watchlist has items
        if (watchlist.value?.items?.length > 0) {
          await Promise.all([
            loadWatchlistNews(),
            loadWatchlistEarnings()
          ])
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
        showError('Error', 'Failed to load watchlist')
        router.push('/watchlists')
      } finally {
        loading.value = false
      }
    }

    const loadWatchlistNews = async () => {
      if (!watchlist.value?.id) return
      
      try {
        loadingNews.value = true
        const response = await api.get(`/watchlists/${watchlist.value.id}/news`, {
          params: {
            days: newsFilter.value.days,
            limit: 20 // Load more than display limit for better data
          }
        })
        watchlistNews.value = response.data.data || []
      } catch (error) {
        console.error('Error loading watchlist news:', error)
        showError('Error', 'Failed to load news')
        watchlistNews.value = []
      } finally {
        loadingNews.value = false
      }
    }

    const loadWatchlistEarnings = async () => {
      if (!watchlist.value?.id) return
      
      try {
        loadingEarnings.value = true
        const response = await api.get(`/watchlists/${watchlist.value.id}/earnings`, {
          params: {
            days: earningsFilter.value.days
          }
        })
        watchlistEarnings.value = response.data.data || []
      } catch (error) {
        console.error('Error loading watchlist earnings:', error)
        showError('Error', 'Failed to load earnings')
        watchlistEarnings.value = []
      } finally {
        loadingEarnings.value = false
      }
    }

    const addSymbol = async () => {
      try {
        adding.value = true
        await api.post(`/watchlists/${route.params.id}/items`, symbolForm.value)
        await loadWatchlist()
        showSuccess('Success', 'Symbol added to watchlist')
        cancelAddSymbol()
      } catch (error) {
        console.error('Error adding symbol:', error)
        const message = error.response?.data?.error || 'Failed to add symbol'
        showError('Error', message)
      } finally {
        adding.value = false
      }
    }

    const removeSymbol = async (item) => {
      if (!confirm(`Remove ${item.symbol} from watchlist?`)) {
        return
      }

      try {
        await api.delete(`/watchlists/${route.params.id}/items/${item.id}`)
        await loadWatchlist()
        showSuccess('Success', 'Symbol removed from watchlist')
      } catch (error) {
        console.error('Error removing symbol:', error)
        showError('Error', 'Failed to remove symbol')
      }
    }

    const editNotes = (item) => {
      editingItem.value = item
      editNotesForm.value.notes = item.notes || ''
    }

    const updateNotes = async () => {
      try {
        updating.value = true
        await api.put(`/watchlists/${route.params.id}/items/${editingItem.value.id}`, editNotesForm.value)
        await loadWatchlist()
        showSuccess('Success', 'Notes updated')
        cancelEditNotes()
      } catch (error) {
        console.error('Error updating notes:', error)
        showError('Error', 'Failed to update notes')
      } finally {
        updating.value = false
      }
    }

    const createPriceAlert = (symbol) => {
      router.push({ name: 'price-alerts', query: { symbol } })
    }

    const cancelAddSymbol = () => {
      showAddSymbolModal.value = false
      symbolForm.value = { symbol: '', notes: '' }
    }

    const cancelEditNotes = () => {
      editingItem.value = null
      editNotesForm.value = { notes: '' }
    }

    const formatPrice = (price) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      }).format(price)
    }

    const formatPriceChange = (change) => {
      const formatted = Math.abs(change).toFixed(2)
      return change >= 0 ? `+$${formatted}` : `-$${formatted}`
    }

    const formatPercentChange = (change) => {
      const formatted = Math.abs(change).toFixed(2)
      return change >= 0 ? `+${formatted}%` : `-${formatted}%`
    }

    const priceChangeClass = (change) => {
      if (change > 0) return 'text-green-600'
      if (change < 0) return 'text-red-600'
      return 'text-gray-600'
    }

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }

    const formatNewsDate = (timestamp) => {
      const date = new Date(timestamp * 1000) // Convert Unix timestamp to milliseconds
      const now = new Date()
      const diffMs = now - date
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffHours / 24)

      if (diffHours < 1) {
        return 'Just now'
      } else if (diffHours < 24) {
        return `${diffHours}h ago`
      } else if (diffDays < 7) {
        return `${diffDays}d ago`
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        })
      }
    }

    const formatEarningsDate = (dateString) => {
      const date = new Date(dateString)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const earningsDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const diffTime = earningsDate - today
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        return 'Today'
      } else if (diffDays === 1) {
        return 'Tomorrow'
      } else if (diffDays < 7) {
        return `In ${diffDays} days`
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        })
      }
    }

    onMounted(() => {
      loadWatchlist()
    })

    return {
      watchlist,
      loading,
      adding,
      updating,
      showAddSymbolModal,
      editingItem,
      symbolForm,
      editNotesForm,
      watchlistNews,
      watchlistEarnings,
      loadingNews,
      loadingEarnings,
      newsFilter,
      earningsFilter,
      addSymbol,
      removeSymbol,
      editNotes,
      updateNotes,
      createPriceAlert,
      cancelAddSymbol,
      cancelEditNotes,
      loadWatchlistNews,
      loadWatchlistEarnings,
      formatPrice,
      formatPriceChange,
      formatPercentChange,
      priceChangeClass,
      formatDate,
      formatNewsDate,
      formatEarningsDate
    }
  }
}
</script>