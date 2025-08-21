<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Back Button -->
    <div class="mb-6">
      <button 
        @click="$router.go(-1)"
        class="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span class="ml-1 text-sm">Back</span>
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="trade" class="space-y-8">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ trade.symbol }} Trade
          </h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ formatDate(trade.trade_date) }} • {{ trade.side }}
          </p>
        </div>
        <div class="flex space-x-3">
          <router-link :to="`/trades/${trade.id}/edit`" class="btn-secondary">
            Edit
          </router-link>
          <button @click="deleteTrade" class="btn-danger">
            Delete
          </button>
        </div>
      </div>

      <!-- Trade Details -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <!-- Main Details -->
        <div class="lg:col-span-2 space-y-6">
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Details</h3>
              <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Symbol</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ trade.symbol }}</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Side</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.side === 'long' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                      {{ trade.side }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Entry Price</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">${{ formatNumber(trade.entry_price) }}</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Exit Price</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                    {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : 'Open' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Quantity</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ formatNumber(trade.quantity, 0) }}</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.exit_price 
                          ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      ]">
                      {{ trade.exit_price ? 'Closed' : 'Open' }}
                    </span>
                  </dd>
                </div>
                <div v-if="trade.sector">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Sector</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.sector }}</dd>
                </div>
                <div v-if="trade.broker">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Broker</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.broker }}</dd>
                </div>
                <div v-if="trade.strategy">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Strategy</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.strategy }}</dd>
                </div>
                <div v-if="trade.setup">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Setup</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.setup }}</dd>
                </div>
                <div v-if="trade.commission">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Commission</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">${{ formatNumber(trade.commission) }}</dd>
                </div>
                <div v-if="trade.fees">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Fees</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">${{ formatNumber(trade.fees) }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Trade Chart Visualization -->
          <TradeChartVisualization 
            v-if="trade.exit_price && trade.exit_time" 
            :trade-id="trade.id" 
          />

          <!-- Executions -->
          <div v-if="trade.executions && trade.executions.length > 0" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Executions ({{ trade.executions.length }})
              </h3>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Time
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Action
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Price
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Value
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fees
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="(execution, index) in trade.executions" :key="index" class="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {{ formatDateTime(execution.datetime) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                          :class="[
                            execution.action === 'buy' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          ]">
                          {{ execution.action }}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        {{ formatNumber(execution.quantity, 0) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        ${{ formatNumber(execution.price) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        ${{ formatNumber(execution.quantity * execution.price) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        ${{ formatNumber(execution.fees || 0) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="trade.tags && trade.tags.length > 0" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Tags</h3>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tag in trade.tags"
                  :key="tag"
                  class="px-3 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-sm rounded-full"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="trade.notes" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Notes</h3>
              <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ trade.notes }}</p>
            </div>
          </div>

          <!-- Attachments -->
          <div v-if="trade.attachments && trade.attachments.length > 0" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Attachments</h3>
              <div class="space-y-3">
                <div
                  v-for="attachment in trade.attachments"
                  :key="attachment.id"
                  class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div class="flex items-center">
                    <DocumentIcon class="h-8 w-8 text-gray-400" />
                    <div class="ml-3">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{{ attachment.file_name }}</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatFileSize(attachment.file_size) }}</p>
                    </div>
                  </div>
                  <a
                    :href="attachment.file_url"
                    target="_blank"
                    class="text-primary-600 hover:text-primary-500"
                  >
                    View
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Comments -->
          <div class="card">
            <div class="card-body">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                  Comments ({{ comments.length }})
                </h3>
              </div>

              <div v-if="loadingComments" class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>

              <div v-else>
                <div v-if="comments.length === 0" class="text-center py-8">
                  <ChatBubbleLeftIcon class="mx-auto h-12 w-12 text-gray-400" />
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    No comments yet. Be the first to comment!
                  </p>
                </div>

                <div v-else class="space-y-4 mb-6">
                  <div
                    v-for="comment in comments"
                    :key="comment.id"
                    class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                  >
                    <div class="flex items-start space-x-3">
                      <div class="flex-shrink-0">
                        <img
                          v-if="comment.avatar_url"
                          :src="comment.avatar_url"
                          :alt="comment.username"
                          class="h-8 w-8 rounded-full"
                        />
                        <div
                          v-else
                          class="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center"
                        >
                          <span class="text-xs font-medium text-white">
                            {{ comment.username.charAt(0).toUpperCase() }}
                          </span>
                        </div>
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center space-x-2">
                            <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                              {{ comment.username }}
                            </h4>
                            <span class="text-xs text-gray-500 dark:text-gray-400">
                              {{ formatCommentDate(comment.created_at) }}
                              <span v-if="comment.edited_at" class="italic">(edited)</span>
                            </span>
                          </div>
                          <div v-if="comment.user_id === authStore.user?.id" class="flex items-center space-x-2">
                            <button
                              @click="startEditComment(comment)"
                              class="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              @click="deleteTradeComment(comment.id)"
                              class="text-xs text-red-500 hover:text-red-700 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        <!-- Edit form or comment text -->
                        <div v-if="editingCommentId === comment.id" class="mt-2">
                          <textarea
                            v-model="editCommentText"
                            rows="3"
                            class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2"
                            :disabled="submittingComment"
                            @keydown="handleEditKeydown"
                          ></textarea>
                          <div class="mt-2 flex justify-end space-x-2">
                            <button
                              @click="cancelEditComment"
                              class="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              @click="saveEditComment(comment.id)"
                              :disabled="submittingComment || !editCommentText.trim()"
                              class="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        <p v-else class="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {{ comment.comment }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Add Comment Form -->
                <form @submit.prevent="submitComment" class="mt-6">
                  <div>
                    <label for="comment" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Add a comment
                    </label>
                    <div class="mt-1">
                      <textarea
                        id="comment"
                        v-model="newComment"
                        rows="3"
                        class="shadow-sm block w-full sm:text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white px-3 py-2"
                        placeholder="Share your thoughts..."
                        :disabled="submittingComment"
                        @keydown="handleCommentKeydown"
                      />
                    </div>
                  </div>
                  <div class="mt-4 flex justify-end">
                    <button
                      type="submit"
                      class="btn-primary"
                      :disabled="!newComment.trim() || submittingComment"
                    >
                      <span v-if="submittingComment">Posting...</span>
                      <span v-else>Post Comment</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Summary -->
        <div class="space-y-6">
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance</h3>
              <dl class="space-y-4">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">P&L</dt>
                  <dd class="mt-1 text-2xl font-semibold" :class="[
                    trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : 'Open' }}
                  </dd>
                </div>
                <div v-if="trade.pnl_percent">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">P&L %</dt>
                  <dd class="mt-1 text-lg font-semibold" :class="[
                    trade.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Price Change</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ calculateRiskReward() }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Value</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    ${{ formatNumber(trade.entry_price * trade.quantity) }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Timeline -->
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Timeline</h3>
              <dl class="space-y-3">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Entry</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ formatDateTime(trade.entry_time) }}
                  </dd>
                </div>
                <div v-if="trade.exit_time">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Exit</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ formatDateTime(trade.exit_time) }}
                  </dd>
                </div>
                <div v-if="trade.exit_time">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ calculateDuration() }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12">
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Trade not found</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        The trade you're looking for doesn't exist or you don't have permission to view it.
      </p>
      <div class="mt-6">
        <router-link to="/trades" class="btn-primary">
          Back to Trades
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import { format, formatDistanceToNow, formatDistance } from 'date-fns'
import { DocumentIcon, ChatBubbleLeftIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import TradeChartVisualization from '@/components/trades/TradeChartVisualization.vue'

const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

const loading = ref(true)
const trade = ref(null)

// Comments state
const comments = ref([])
const loadingComments = ref(false)
const newComment = ref('')
const submittingComment = ref(false)
const editingCommentId = ref(null)
const editCommentText = ref('')

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

function formatDate(date) {
  // Handle date strings that might be in different formats
  // If it's already a date string like '2025-07-04', treat it as local date
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // This is a date-only string, create local date to avoid timezone issues
    const [year, month, day] = date.split('-')
    const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return format(localDate, 'MMM dd, yyyy')
  }
  // For datetime strings, use as-is
  return format(new Date(date), 'MMM dd, yyyy')
}

function formatDateTime(date) {
  // For datetime display, we want to show the actual time in the user's timezone
  // but handle the date component consistently
  const dateObj = new Date(date)
  return format(dateObj, 'MMM dd, yyyy HH:mm')
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function calculateRiskReward() {
  if (!trade.value.exit_price) return 'Open'
  
  // For closed trades, we can't calculate a true risk/reward ratio without stop-loss/target levels
  // Instead, we'll show the actual outcome as a ratio
  const entryPrice = trade.value.entry_price
  const exitPrice = trade.value.exit_price
  const isLong = trade.value.side === 'long'
  
  // Calculate the price movement as a percentage
  const priceChange = isLong 
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100
  
  if (priceChange > 0) {
    return `+${priceChange.toFixed(2)}%`
  } else if (priceChange < 0) {
    return `${priceChange.toFixed(2)}%`
  } else {
    return 'Breakeven'
  }
}

function calculateDuration() {
  if (!trade.value.exit_time) return 'Open'
  
  const entry = new Date(trade.value.entry_time)
  const exit = new Date(trade.value.exit_time)
  
  return formatDistance(entry, exit)
}

function formatCommentDate(date) {
  const dateObj = new Date(date)
  const now = new Date()
  const diffInHours = (now - dateObj) / (1000 * 60 * 60)
  
  if (diffInHours < 24) {
    return format(dateObj, 'HH:mm')
  } else if (diffInHours < 48) {
    return 'Yesterday'
  } else if (diffInHours < 168) { // 7 days
    return format(dateObj, 'EEEE')
  } else {
    return format(dateObj, 'MMM dd')
  }
}

async function loadComments() {
  try {
    loadingComments.value = true
    const response = await api.get(`/trades/${trade.value.id}/comments`)
    comments.value = response.data.comments
  } catch (error) {
    console.error('Failed to load comments:', error)
    showError('Error', 'Failed to load comments')
  } finally {
    loadingComments.value = false
  }
}

async function submitComment() {
  if (!newComment.value.trim() || submittingComment.value) return

  try {
    submittingComment.value = true
    const response = await api.post(`/trades/${trade.value.id}/comments`, {
      comment: newComment.value.trim()
    })
    
    // Add the new comment to the list
    comments.value.unshift({
      ...response.data.comment,
      username: authStore.user?.username || 'You',
      avatar_url: authStore.user?.avatar_url || null
    })
    
    newComment.value = ''
    showSuccess('Success', 'Comment posted successfully')
  } catch (error) {
    console.error('Failed to post comment:', error)
    showError('Error', 'Failed to post comment')
  } finally {
    submittingComment.value = false
  }
}

function startEditComment(comment) {
  editingCommentId.value = comment.id
  editCommentText.value = comment.comment
}

function cancelEditComment() {
  editingCommentId.value = null
  editCommentText.value = ''
}

async function saveEditComment(commentId) {
  if (!editCommentText.value.trim() || submittingComment.value) return
  
  try {
    submittingComment.value = true
    const response = await api.put(`/trades/${trade.value.id}/comments/${commentId}`, {
      comment: editCommentText.value.trim()
    })
    
    // Update the comment in the list
    const index = comments.value.findIndex(c => c.id === commentId)
    if (index !== -1) {
      comments.value[index] = response.data.comment
    }
    
    editingCommentId.value = null
    editCommentText.value = ''
    showSuccess('Success', 'Comment updated successfully')
  } catch (error) {
    console.error('Failed to update comment:', error)
    showError('Error', 'Failed to update comment')
  } finally {
    submittingComment.value = false
  }
}

async function deleteTradeComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return
  
  try {
    await api.delete(`/trades/${trade.value.id}/comments/${commentId}`)
    
    // Remove the comment from the list
    comments.value = comments.value.filter(c => c.id !== commentId)
    
    showSuccess('Success', 'Comment deleted successfully')
  } catch (error) {
    console.error('Failed to delete comment:', error)
    showError('Error', 'Failed to delete comment')
  }
}

function handleCommentKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submitComment()
  }
}

function handleEditKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const commentId = editingCommentId.value
    if (commentId) {
      saveEditComment(commentId)
    }
  }
}

async function deleteTrade() {
  if (!confirm('Are you sure you want to delete this trade? This action cannot be undone.')) {
    return
  }

  try {
    await tradesStore.deleteTrade(trade.value.id)
    showSuccess('Success', 'Trade deleted successfully')
    router.push('/trades')
  } catch (error) {
    showError('Error', 'Failed to delete trade')
  }
}

async function loadTrade() {
  try {
    loading.value = true
    trade.value = await tradesStore.fetchTrade(route.params.id)
    // Load comments after trade is loaded
    if (trade.value) {
      loadComments()
    }
  } catch (error) {
    showError('Error', 'Failed to load trade')
    router.push('/trades')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTrade()
})
</script>