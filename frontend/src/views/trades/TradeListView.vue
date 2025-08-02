<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Title -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Trades</h1>
      <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
        A list of all your trades including their details and performance.
      </p>
    </div>
    
    <!-- Buttons Row -->
    <div class="flex items-center justify-between mb-6">
      <button 
        @click="goBack" 
        class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
        Back
      </button>
      <router-link to="/trades/new" class="btn-primary">
        Add trade
      </router-link>
    </div>

    <!-- Enrichment Status -->
    <EnrichmentStatus />

    <div class="mt-8 card">
      <div class="card-body">
        <TradeFilters @filter="handleFilter" />
      </div>
    </div>


    <!-- Total P/L Summary for Filtered Results -->
    <div v-if="tradesStore.trades.length > 0" class="mt-6">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <!-- Mobile Layout: Stack vertically -->
        <div class="block sm:hidden space-y-4">
          <div>
            <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Total P&L ({{ tradesStore.pagination.total }} {{ tradesStore.pagination.total === 1 ? 'trade' : 'trades' }})
            </h3>
            <div class="text-lg font-semibold" :class="[
              tradesStore.totalPnL >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            ]">
              {{ tradesStore.totalPnL >= 0 ? '+' : '' }}${{ formatNumber(Math.abs(tradesStore.totalPnL)) }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Win Rate</div>
            <div class="text-lg font-medium text-gray-900 dark:text-white">{{ tradesStore.winRate }}%</div>
          </div>
        </div>
        
        <!-- Desktop Layout: Side by side -->
        <div class="hidden sm:flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total P&L ({{ tradesStore.pagination.total }} {{ tradesStore.pagination.total === 1 ? 'trade' : 'trades' }})
            </h3>
            <div class="text-lg font-semibold" :class="[
              tradesStore.totalPnL >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            ]">
              {{ tradesStore.totalPnL >= 0 ? '+' : '' }}${{ formatNumber(Math.abs(tradesStore.totalPnL)) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-sm text-gray-500 dark:text-gray-400">Win Rate</div>
            <div class="text-lg font-medium text-gray-900 dark:text-white">{{ tradesStore.winRate }}%</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-8">
      <div v-if="tradesStore.loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="tradesStore.trades.length === 0" class="text-center py-12">
        <DocumentTextIcon class="mx-auto h-12 w-12 text-gray-400" />
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No trades</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Get started by creating a new trade.
        </p>
        <div class="mt-6">
          <router-link to="/trades/new" class="btn-primary">
            Add trade
          </router-link>
        </div>
      </div>

      <!-- Show trades when available -->
      <div v-else :key="tradesStore.trades.length">
        <!-- Bulk Actions Bar -->
        <div v-if="selectedTrades.length > 0" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-sm text-blue-800 dark:text-blue-200">
              {{ selectedTrades.length }} trade{{ selectedTrades.length === 1 ? '' : 's' }} selected
            </span>
            <div class="flex items-center space-x-2">
              <button
                @click="clearSelection"
                class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Clear selection
              </button>
              <button
                @click="confirmBulkDelete"
                class="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete selected
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile view (cards) -->
        <div class="block md:hidden space-y-4" :key="'mobile-' + tradesStore.trades.length">
        <div v-for="trade in tradesStore.trades" :key="trade.id" 
             class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 hover:shadow-md transition-shadow">
          <div class="flex items-start space-x-3 mb-3">
            <input
              type="checkbox"
              :value="trade.id"
              v-model="selectedTrades"
              @click.stop
              class="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <div class="flex-1 cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-2">
                <div class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ trade.symbol }}
                </div>
                <span class="px-2 py-1 text-xs font-semibold rounded-full"
                  :class="[
                    trade.side === 'long' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  ]">
                  {{ trade.side }}
                </span>
                <!-- News badge for mobile -->
                <span v-if="trade.has_news" 
                  :class="getNewsBadgeClasses(trade.news_sentiment)"
                  class="px-2 py-1 text-xs font-semibold rounded-full flex items-center"
                  :title="`${trade.news_events?.length || 0} news article(s) - ${trade.news_sentiment || 'neutral'} sentiment`">
                  <MdiIcon :icon="newspaperIcon" :size="14" class="mr-1" />
                  <span>{{ trade.news_events?.length || 0 }}</span>
                </span>
              </div>
            <span class="px-2 py-1 text-xs font-semibold rounded-full"
              :class="[
                trade.exit_price 
                  ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
              ]">
              {{ trade.exit_price ? 'Closed' : 'Open' }}
            </span>
          </div>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-gray-500 dark:text-gray-400">Date</div>
              <div class="text-gray-900 dark:text-white">{{ formatDate(trade.trade_date) }}</div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">Entry</div>
              <div class="text-gray-900 dark:text-white">${{ formatNumber(trade.entry_price) }}</div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">Exit</div>
              <div class="text-gray-900 dark:text-white">
                {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : '-' }}
              </div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">P&L</div>
              <div class="font-medium" :class="[
                trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              ]">
                {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : '-' }}
                <span v-if="trade.pnl_percent" class="text-xs ml-1">
                  ({{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%)
                </span>
              </div>
            </div>
          </div>
          
          <!-- Confidence Level -->
          <div v-if="trade.confidence" class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-xs text-gray-500 dark:text-gray-400">Confidence</div>
              <div class="flex items-center space-x-2">
                <div class="flex space-x-1">
                  <div v-for="i in 10" :key="i" class="w-2 h-2 rounded-full"
                    :class="i <= trade.confidence ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                  </div>
                </div>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ trade.confidence }}/10</span>
              </div>
            </div>
          </div>
          
          <!-- Sector Information -->
          <div v-if="trade.sector" class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div class="text-xs text-gray-500 dark:text-gray-400">Sector</div>
            <div class="text-sm text-gray-900 dark:text-white">{{ trade.sector }}</div>
          </div>
          
          <div class="flex justify-between items-center mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              @click.stop="openComments(trade)"
              class="inline-flex items-center text-gray-500 hover:text-primary-600 transition-colors"
            >
              <ChatBubbleLeftIcon class="h-4 w-4 mr-1" />
              <span class="text-sm">{{ trade.comment_count || 0 }}</span>
            </button>
            <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
        </div>
        </div>
        </div>

        <!-- Desktop view (table) -->
        <div class="hidden md:block overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg" :key="'desktop-' + tradesStore.trades.length">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  @change="toggleSelectAll"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Symbol
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Side
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Entry
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Exit
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                P&L
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Confidence
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sector
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Comments
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="trade in tradesStore.trades" :key="trade.id" 
                class="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td class="px-6 py-4 whitespace-nowrap">
                <input
                  type="checkbox"
                  :value="trade.id"
                  v-model="selectedTrades"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <div class="flex items-center space-x-2">
                  <div class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ trade.symbol }}
                  </div>
                  <!-- News badge for desktop table -->
                  <span v-if="trade.has_news" 
                    :class="getNewsBadgeClasses(trade.news_sentiment)"
                    class="px-2 py-1 text-xs font-semibold rounded-full flex items-center"
                    :title="`${trade.news_events?.length || 0} news article(s) - ${trade.news_sentiment || 'neutral'} sentiment`">
                    <MdiIcon :icon="newspaperIcon" :size="14" class="mr-1" />
                    <span>{{ trade.news_events?.length || 0 }}</span>
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <div class="text-sm text-gray-900 dark:text-white">
                  {{ formatDate(trade.trade_date) }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  :class="[
                    trade.side === 'long' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  ]">
                  {{ trade.side }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                ${{ formatNumber(trade.entry_price) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <div class="text-sm font-medium" :class="[
                  trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                ]">
                  {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : '-' }}
                </div>
                <div v-if="trade.pnl_percent" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <div v-if="trade.confidence" class="flex items-center space-x-2">
                  <div class="flex space-x-1">
                    <div v-for="i in 5" :key="i" class="w-2 h-2 rounded-full"
                      :class="i <= Math.ceil(trade.confidence / 2) ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                    </div>
                  </div>
                  <span class="text-sm text-gray-900 dark:text-white">{{ trade.confidence }}/10</span>
                </div>
                <div v-else class="text-sm text-gray-500 dark:text-gray-400">-</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <div class="text-sm text-gray-900 dark:text-white">
                  {{ trade.sector || '-' }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  :class="[
                    trade.exit_price 
                      ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                  ]">
                  {{ trade.exit_price ? 'Closed' : 'Open' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-center">
                <button
                  @click.stop="openComments(trade)"
                  class="inline-flex items-center text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <ChatBubbleLeftIcon class="h-4 w-4 mr-1" />
                  <span class="text-sm">{{ trade.comment_count || 0 }}</span>
                </button>
              </td>
            </tr>
          </tbody>
          </table>
        </div>
        </div>
      </div>
        
      <!-- Pagination (shared for both mobile and desktop) -->
      <div v-if="tradesStore.pagination.totalPages > 1" class="mt-4">
        <div class="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6 rounded-lg shadow">
          <div class="flex-1 flex justify-between sm:hidden">
            <button 
              @click="prevPage"
              :disabled="tradesStore.pagination.page === 1"
              class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button 
              @click="nextPage"
              :disabled="tradesStore.pagination.page === tradesStore.pagination.totalPages"
              class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                Showing
                <span class="font-medium">{{ (tradesStore.pagination.page - 1) * tradesStore.pagination.limit + 1 }}</span>
                to
                <span class="font-medium">{{ Math.min(tradesStore.pagination.page * tradesStore.pagination.limit, tradesStore.pagination.total) }}</span>
                of
                <span class="font-medium">{{ tradesStore.pagination.total }}</span>
                results
              </p>
            </div>
            <div>
              <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button 
                  @click="prevPage"
                  :disabled="tradesStore.pagination.page === 1"
                  class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span class="sr-only">Previous</span>
                  <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                
                <button
                  v-for="page in visiblePages"
                  :key="page"
                  @click="goToPage(page)"
                  :class="[
                    page === tradesStore.pagination.page
                      ? 'z-10 bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
                    'relative inline-flex items-center px-4 py-2 border text-sm font-medium'
                  ]"
                >
                  {{ page }}
                </button>
                
                <button 
                  @click="nextPage"
                  :disabled="tradesStore.pagination.page === tradesStore.pagination.totalPages"
                  class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span class="sr-only">Next</span>
                  <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
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

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3 text-center">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Delete Trades</h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete {{ selectedTrades.length }} trade{{ selectedTrades.length === 1 ? '' : 's' }}? 
              This action cannot be undone.
            </p>
          </div>
          <div class="flex justify-center space-x-4 px-4 py-3">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Cancel
            </button>
            <button
              @click="executeBulkDelete"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { format } from 'date-fns'
import { DocumentTextIcon, ChatBubbleLeftIcon } from '@heroicons/vue/24/outline'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import TradeCommentsDialog from '@/components/trades/TradeCommentsDialog.vue'
import EnrichmentStatus from '@/components/trades/EnrichmentStatus.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiNewspaper } from '@mdi/js'

const tradesStore = useTradesStore()
const route = useRoute()
const router = useRouter()

// MDI icons
const newspaperIcon = mdiNewspaper

// Comments dialog
const showCommentsDialog = ref(false)
const selectedTrade = ref(null)

// Bulk selection
const selectedTrades = ref([])
const showDeleteConfirm = ref(false)

// Pagination computed properties
const visiblePages = computed(() => {
  const current = tradesStore.pagination.page
  const total = tradesStore.pagination.totalPages
  const pages = []
  
  // Show 5 pages around current page
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  return pages
})

// Bulk selection computed properties
const isAllSelected = computed(() => {
  return tradesStore.trades.length > 0 && selectedTrades.value.length === tradesStore.trades.length
})

// Watch for pagination changes and refetch
watch(
  () => tradesStore.pagination.page,
  () => {
    tradesStore.fetchTrades()
  }
)

function formatNumber(num) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num || 0)
}

function formatDate(date) {
  return format(new Date(date), 'MMM dd, yyyy')
}

function handleFilter(filters) {
  tradesStore.setFilters(filters)
  tradesStore.fetchTrades()
}

function goToPage(page) {
  tradesStore.setPage(page)
}

function nextPage() {
  tradesStore.nextPage()
}

function prevPage() {
  tradesStore.prevPage()
}

function openComments(trade) {
  selectedTrade.value = trade
  showCommentsDialog.value = true
}

function handleCommentAdded() {
  // Increment the comment count for the trade
  const tradeIndex = tradesStore.trades.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    tradesStore.trades[tradeIndex].comment_count = (tradesStore.trades[tradeIndex].comment_count || 0) + 1
  }
}

function handleCommentDeleted() {
  // Decrement the comment count for the trade
  const tradeIndex = tradesStore.trades.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    tradesStore.trades[tradeIndex].comment_count = Math.max((tradesStore.trades[tradeIndex].comment_count || 0) - 1, 0)
  }
}

function goBack() {
  // Use the browser's back button to preserve scroll position and state
  window.history.back()
}

function clearStrategyFilter() {
  // Navigate to trades page without strategy query parameters
  router.push({ path: '/trades' })
}

// Bulk selection functions
function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedTrades.value = []
  } else {
    selectedTrades.value = tradesStore.trades.map(trade => trade.id)
  }
}

function clearSelection() {
  selectedTrades.value = []
}

function confirmBulkDelete() {
  if (selectedTrades.value.length === 0) return
  showDeleteConfirm.value = true
}

async function executeBulkDelete() {
  try {
    await tradesStore.bulkDeleteTrades(selectedTrades.value)
    selectedTrades.value = []
    showDeleteConfirm.value = false
    // Refresh the trades list
    await tradesStore.fetchTrades()
  } catch (error) {
    console.error('Failed to delete trades:', error)
  }
}

// Get news badge classes based on sentiment
function getNewsBadgeClasses(sentiment) {
  const baseClasses = 'px-2 py-1 text-xs font-semibold rounded-full flex items-center'
  
  switch (sentiment) {
    case 'positive':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    case 'negative':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

onMounted(() => {
  // Check if there are URL parameters that the TradeFilters component should handle
  const hasFiltersInUrl = !!(
    route.query.symbol || route.query.startDate || route.query.endDate || 
    route.query.strategy || route.query.sector || route.query.status || 
    route.query.minPrice || route.query.maxPrice || route.query.minQuantity || 
    route.query.maxQuantity || route.query.holdTime || route.query.broker ||
    route.query.minHoldTime || route.query.maxHoldTime || route.query.pnlType
  )
  
  // Only fetch trades immediately if there are no URL parameters
  // TradeFilters component will handle URL parameters and trigger fetch automatically
  if (!hasFiltersInUrl) {
    tradesStore.fetchTrades()
  }
})
</script>