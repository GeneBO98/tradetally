<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Stock Watchlists</h1>
        <p class="text-gray-600">Track your favorite stocks and set price alerts</p>
      </div>
      <button
        v-if="!authLoading && isProUser"
        @click="showCreateWatchlistModal = true"
        class="mt-4 sm:mt-0 btn-primary"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        Create Watchlist
      </button>
    </div>

    <!-- Loading State for Auth -->
    <div v-if="authLoading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Pro Feature Notice -->
    <ProUpgradePrompt 
      v-else-if="!authLoading && !isProUser" 
      variant="card"
      description="Stock watchlists and price alerts are available for Pro users only."
    />

    <!-- Loading State for Watchlists -->
    <div v-else-if="isProUser && loading" class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Watchlists Grid -->
    <div v-else-if="isProUser && watchlists.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="watchlist in watchlists"
        :key="watchlist.id"
        class="bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
        @click="selectWatchlist(watchlist)"
      >
        <div class="p-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-gray-900">{{ watchlist.name }}</h3>
            <span v-if="watchlist.is_default" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Default
            </span>
          </div>
          <p v-if="watchlist.description" class="text-gray-600 text-sm mb-4">{{ watchlist.description }}</p>
          <div class="flex items-center justify-between text-sm text-gray-500">
            <span>{{ watchlist.item_count }} symbols</span>
            <span>{{ watchlist.alert_count }} alerts</span>
          </div>
          <div class="mt-4 flex space-x-2">
            <button
              @click.stop="editWatchlist(watchlist)"
              class="btn-secondary"
            >
              Edit
            </button>
            <button
              @click.stop="deleteWatchlist(watchlist)"
              v-if="!watchlist.is_default"
              class="btn-danger"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!authLoading && isProUser && !loading" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No watchlists</h3>
      <p class="mt-1 text-sm text-gray-500">Get started by creating your first watchlist.</p>
      <div class="mt-6">
        <button
          @click="showCreateWatchlistModal = true"
          class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Create Watchlist
        </button>
      </div>
    </div>

    <!-- Create/Edit Watchlist Modal -->
    <div v-if="showCreateWatchlistModal || editingWatchlist" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            {{ editingWatchlist ? 'Edit Watchlist' : 'Create New Watchlist' }}
          </h3>
          <form @submit.prevent="saveWatchlist">
            <div class="mb-4">
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                id="name"
                v-model="watchlistForm.name"
                type="text"
                required
                class="input"
                placeholder="Enter watchlist name"
              >
            </div>
            <div class="mb-4">
              <label for="description" class="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
              <textarea
                id="description"
                v-model="watchlistForm.description"
                rows="3"
                class="input"
                placeholder="Enter description"
              ></textarea>
            </div>
            <div class="mb-6">
              <label class="flex items-center">
                <input
                  v-model="watchlistForm.is_default"
                  type="checkbox"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                >
                <span class="ml-2 text-sm text-gray-700">Set as default watchlist</span>
              </label>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="cancelEdit"
                class="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {{ saving ? 'Saving...' : (editingWatchlist ? 'Update' : 'Create') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'

export default {
  name: 'WatchlistView',
  components: {
    ProUpgradePrompt
  },
  setup() {
    const router = useRouter()
    const { showSuccess, showError } = useNotification()
    const authStore = useAuthStore()

    const watchlists = ref([])
    const loading = ref(true)
    const saving = ref(false)
    const showCreateWatchlistModal = ref(false)
    const editingWatchlist = ref(null)

    const watchlistForm = ref({
      name: '',
      description: '',
      is_default: false
    })

    const isProUser = computed(() => {
      // If billing is disabled (self-hosted), all users have pro access
      if (authStore.user?.billingEnabled === false) {
        return true
      }
      return authStore.user?.tier === 'pro'
    })

    // Track if we're still loading user data to avoid showing upgrade prompt prematurely
    const authLoading = computed(() => {
      return authStore.loading || (authStore.isAuthenticated && !authStore.user)
    })

    const loadWatchlists = async () => {
      // Wait for auth to finish loading before checking Pro status
      if (authLoading.value) {
        return
      }

      if (!isProUser.value) {
        loading.value = false
        return
      }

      try {
        loading.value = true
        const response = await api.get('/watchlists')
        watchlists.value = response.data.data
      } catch (error) {
        console.error('Error loading watchlists:', error)
        showError('Error', 'Failed to load watchlists')
      } finally {
        loading.value = false
      }
    }

    const selectWatchlist = (watchlist) => {
      router.push(`/watchlists/${watchlist.id}`)
    }

    const editWatchlist = (watchlist) => {
      editingWatchlist.value = watchlist
      watchlistForm.value = {
        name: watchlist.name,
        description: watchlist.description || '',
        is_default: watchlist.is_default
      }
    }

    const deleteWatchlist = async (watchlist) => {
      if (!confirm(`Are you sure you want to delete "${watchlist.name}"?`)) {
        return
      }

      try {
        await api.delete(`/watchlists/${watchlist.id}`)
        await loadWatchlists()
        showSuccess('Success', 'Watchlist deleted successfully')
      } catch (error) {
        console.error('Error deleting watchlist:', error)
        showError('Error', 'Failed to delete watchlist')
      }
    }

    const saveWatchlist = async () => {
      try {
        saving.value = true
        
        if (editingWatchlist.value) {
          // Update existing watchlist
          await api.put(`/watchlists/${editingWatchlist.value.id}`, watchlistForm.value)
          showSuccess('Success', 'Watchlist updated successfully')
        } else {
          // Create new watchlist
          await api.post('/watchlists', watchlistForm.value)
          showSuccess('Success', 'Watchlist created successfully')
        }

        cancelEdit()
        await loadWatchlists()
      } catch (error) {
        console.error('Error saving watchlist:', error)
        showError('Error', 'Failed to save watchlist')
      } finally {
        saving.value = false
      }
    }

    const cancelEdit = () => {
      showCreateWatchlistModal.value = false
      editingWatchlist.value = null
      watchlistForm.value = {
        name: '',
        description: '',
        is_default: false
      }
    }

    // Watch for auth loading to complete, then load watchlists
    watch(authLoading, (newAuthLoading) => {
      if (!newAuthLoading) {
        loadWatchlists()
      }
    }, { immediate: true })

    onMounted(() => {
      // Initial load if auth is already ready
      if (!authLoading.value) {
        loadWatchlists()
      }
    })

    return {
      watchlists,
      loading,
      saving,
      showCreateWatchlistModal,
      editingWatchlist,
      watchlistForm,
      isProUser,
      authLoading,
      selectWatchlist,
      editWatchlist,
      deleteWatchlist,
      saveWatchlist,
      cancelEdit
    }
  }
}
</script>