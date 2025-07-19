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
      } catch (error) {
        console.error('Error loading watchlist:', error)
        showError('Error', 'Failed to load watchlist')
        router.push('/watchlists')
      } finally {
        loading.value = false
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
      addSymbol,
      removeSymbol,
      editNotes,
      updateNotes,
      createPriceAlert,
      cancelAddSymbol,
      cancelEditNotes,
      formatPrice,
      formatPriceChange,
      formatPercentChange,
      priceChangeClass,
      formatDate
    }
  }
}
</script>