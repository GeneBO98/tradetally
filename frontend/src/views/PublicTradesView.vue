<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">Public Trades</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Explore trades shared by the community.
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="trades.length === 0" class="text-center py-12">
      <DocumentTextIcon class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No public trades</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        No trades have been shared publicly yet.
      </p>
    </div>

    <div v-else class="space-y-6">
      <div
        v-for="trade in trades"
        :key="trade.id"
        class="card hover:shadow-lg transition-shadow duration-200"
      >
        <div class="card-body">
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-4">
              <div class="flex-shrink-0">
                <img
                  v-if="trade.avatar_url"
                  :src="trade.avatar_url"
                  :alt="trade.display_name || trade.username"
                  class="h-10 w-10 rounded-full"
                />
                <div
                  v-else
                  class="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center"
                >
                  <span class="text-sm font-medium text-white">
                    {{ (trade.display_name || trade.username).charAt(0).toUpperCase() }}
                  </span>
                </div>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="heading-card">
                    {{ trade.symbol }}
                  </h3>
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    :class="[
                      trade.side === 'long'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    ]">
                    {{ trade.side }}
                  </span>
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    :class="[
                      trade.exit_price
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    ]">
                    {{ trade.exit_price ? 'Closed' : 'Open' }}
                  </span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  by @{{ trade.display_name || trade.username }} • {{ formatDate(trade.trade_date) }}
                </p>
              </div>
            </div>
            
            <div class="text-right">
              <div class="text-lg font-semibold" :class="[
                trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
              ]">
                {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : 'Open' }}
              </div>
              <div v-if="trade.pnl_percent" class="text-sm text-gray-500 dark:text-gray-400">
                {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
              </div>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Entry Price
              </dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                ${{ formatNumber(trade.entry_price) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Exit Price
              </dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : 'Open' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Quantity
              </dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {{ formatNumber(trade.quantity, 0) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Value
              </dt>
              <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                ${{ formatNumber(trade.entry_price * trade.quantity) }}
              </dd>
            </div>
          </div>

          <div v-if="trade.tags && trade.tags.length > 0" class="mt-4">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="tag in trade.tags"
                :key="tag"
                class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <div v-if="trade.notes" class="mt-4">
            <p class="text-sm text-gray-700 dark:text-gray-300">
              {{ trade.notes }}
            </p>
          </div>

          <div v-if="trade.attachment_urls && trade.attachment_urls.length > 0" class="mt-4">
            <div class="flex space-x-2">
              <a
                v-for="(url, index) in trade.attachment_urls"
                :key="index"
                :href="url"
                target="_blank"
                class="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <DocumentIcon class="h-4 w-4 mr-1" />
                View Chart
              </a>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div class="flex items-center space-x-4">
              <button
                @click="openComments(trade)"
                class="flex items-center hover:text-primary-600 transition-colors"
              >
                <ChatBubbleLeftIcon class="h-4 w-4 mr-1" />
                {{ trade.comment_count || 0 }} comments
              </button>
              <span>{{ formatDateTime(trade.created_at) }}</span>
              <!-- Delete button for trade owner or admin -->
              <button
                v-if="canDeleteTrade(trade)"
                @click="deleteTrade(trade)"
                class="flex items-center text-red-600 hover:text-red-700 transition-colors"
                title="Delete trade"
              >
                <TrashIcon class="h-4 w-4" />
              </button>
            </div>
            
            <router-link
              :to="`/trades/${trade.id}`"
              class="text-primary-600 hover:text-primary-500 font-medium"
            >
              View Details
            </router-link>
          </div>
        </div>
      </div>

      <!-- Load More -->
      <div v-if="hasMore" class="text-center">
        <button
          @click="loadMore"
          :disabled="loading"
          class="btn-secondary"
        >
          <span v-if="loading">Loading...</span>
          <span v-else>Load More</span>
        </button>
      </div>
    </div>

    <!-- Comments Dialog -->
    <TradeCommentsDialog
      v-if="selectedTrade"
      :is-open="showCommentsDialog"
      :trade-id="selectedTrade.id"
      @close="showCommentsDialog = false"
      @comment-added="handleCommentAdded"
      @comment-deleted="handleCommentDeleted"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { format } from 'date-fns'
import { formatTradeDate } from '@/utils/date'
import { DocumentTextIcon, DocumentIcon, ChatBubbleLeftIcon, TrashIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import TradeCommentsDialog from '@/components/trades/TradeCommentsDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useUserTimezone } from '@/composables/useUserTimezone'

const { formatDateTime: formatDateTimeTz } = useUserTimezone()
const loading = ref(true)
const trades = ref([])
const hasMore = ref(true)
const currentPage = ref(0)
const pageSize = 10

// Comments dialog
const showCommentsDialog = ref(false)
const selectedTrade = ref(null)

// Auth and notifications
const authStore = useAuthStore()
const { showSuccess, showError, showConfirmation } = useNotification()

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

function formatDate(date) {
  return formatTradeDate(date, 'MMM dd, yyyy')
}

function formatDateTime(date) {
  return formatDateTimeTz(date)
}

async function fetchTrades(offset = 0) {
  try {
    const response = await api.get('/trades/public', {
      params: {
        limit: pageSize,
        offset
      }
    })

    const newTrades = response.data.trades
    
    if (offset === 0) {
      trades.value = newTrades
    } else {
      trades.value.push(...newTrades)
    }

    hasMore.value = newTrades.length === pageSize
    currentPage.value = Math.floor(offset / pageSize)
  } catch (error) {
    console.error('Failed to fetch public trades:', error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  loading.value = true
  await fetchTrades((currentPage.value + 1) * pageSize)
}

function openComments(trade) {
  selectedTrade.value = trade
  showCommentsDialog.value = true
}

function handleCommentAdded() {
  // Increment the comment count for the trade
  const tradeIndex = trades.value.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    trades.value[tradeIndex].comment_count = (trades.value[tradeIndex].comment_count || 0) + 1
  }
}

function handleCommentDeleted() {
  // Decrement the comment count for the trade
  const tradeIndex = trades.value.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    trades.value[tradeIndex].comment_count = Math.max((trades.value[tradeIndex].comment_count || 0) - 1, 0)
  }
}

function canDeleteTrade(trade) {
  // Only allow deletion if user is authenticated and either owns the trade or is admin
  if (!authStore.isAuthenticated) return false
  
  const user = authStore.user
  if (!user) return false
  
  // User can delete if they own the trade OR if they are an admin
  return trade.user_id === user.id || user.role === 'admin'
}

async function deleteTrade(trade) {
  showConfirmation(
    'Delete Trade',
    `Are you sure you want to delete this trade for ${trade.symbol}?`,
    async () => {
      try {
        await api.delete(`/trades/${trade.id}`)
        
        // Remove the trade from the list
        trades.value = trades.value.filter(t => t.id !== trade.id)
        
        showSuccess('Success', 'Trade deleted successfully')
      } catch (error) {
        console.error('Failed to delete trade:', error)
        const errorMessage = error.response?.data?.error || 'Failed to delete trade'
        showError('Error', errorMessage)
      }
    }
  )
}

onMounted(() => {
  document.title = 'Public Trades - TradeTally Trading Journal Community'

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }
  metaDescription.setAttribute('content', 'Explore public trades shared by the TradeTally community. Review entries, exits, notes, tags, and performance from a free trading journal platform.')

  let metaKeywords = document.querySelector('meta[name="keywords"]')
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta')
    metaKeywords.setAttribute('name', 'keywords')
    document.head.appendChild(metaKeywords)
  }
  metaKeywords.setAttribute('content', 'public trades, shared trading journal, TradeTally community trades, free trading journal examples')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', 'https://tradetally.io/public')

  fetchTrades()
})
</script>
