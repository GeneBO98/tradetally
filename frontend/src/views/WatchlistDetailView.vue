<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="flex items-center mb-8">
      <button
        @click="$router.push('/markets')"
        class="mr-4 p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
      </button>
      <div class="flex-1">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ watchlist?.name }}</h1>
        <p v-if="watchlist?.description" class="text-gray-600 dark:text-gray-400 mt-1">{{ watchlist.description }}</p>
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
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Watchlist Items -->
    <div v-else-if="watchlist?.items?.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Symbols ({{ watchlist.items.length }})</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Symbol</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Change</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="item in watchlist.items" :key="item.id">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900 dark:text-white">{{ item.symbol }}</div>
                <div v-if="item.notes" class="text-sm text-gray-500 dark:text-gray-400">{{ item.notes }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                {{ item.current_price ? formatPrice(item.current_price) : 'N/A' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="item.price_change !== null" :class="priceChangeClass(item.price_change)">
                  {{ formatPriceChange(item.price_change) }}
                </span>
                <span v-else class="text-gray-400 dark:text-gray-500">N/A</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span v-if="item.percent_change !== null" :class="priceChangeClass(item.percent_change)">
                  {{ formatPercentChange(item.percent_change) }}
                </span>
                <span v-else class="text-gray-400 dark:text-gray-500">N/A</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(item.added_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  @click="createPriceAlert(item.symbol)"
                  class="text-primary-600 hover:text-primary-900"
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
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No symbols in watchlist</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by adding your first symbol.</p>
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
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <svg class="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
            </svg>
            Recent News
          </h2>
          <div class="flex items-center space-x-2">
            <select v-model="newsFilter.days" @change="loadWatchlistNews" class="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white">
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <button
              @click="loadWatchlistNews"
              :disabled="loadingNews"
              class="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
            >
              {{ loadingNews ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="loadingNews" class="flex justify-center items-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
        
        <div v-else-if="watchlistNews.length > 0" class="divide-y divide-gray-200 dark:divide-gray-700">
          <article 
            v-for="article in watchlistNews.slice(0, newsFilter.limit)" 
            :key="article.id || article.datetime" 
            class="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-start space-x-3">
              <div class="flex-shrink-0">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">
                  {{ article.symbol }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <a
                  :href="article.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block hover:text-primary-600 transition-colors"
                >
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-1">{{ article.headline }}</h3>
                  <p v-if="article.summary" class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{{ article.summary }}</p>
                  <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ formatNewsDate(article.datetime) }}</span>
                    <span v-if="article.source" class="ml-2">• {{ article.source }}</span>
                  </div>
                </a>
              </div>
            </div>
          </article>
        </div>
        
        <div v-else class="p-6 text-center text-gray-500 dark:text-gray-400">
          <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
          </svg>
          <p class="text-sm">No recent news available for your watchlist symbols</p>
        </div>
      </div>

      <!-- Upcoming Earnings Section -->
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <svg class="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Upcoming Earnings
          </h2>
          <div class="flex items-center space-x-2">
            <select v-model="earningsFilter.days" @change="loadWatchlistEarnings" class="text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white">
              <option value="14">Next 14 days</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
            <button
              @click="loadWatchlistEarnings"
              :disabled="loadingEarnings"
              class="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
            >
              {{ loadingEarnings ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
        
        <div v-if="loadingEarnings" class="flex justify-center items-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
        </div>
        
        <div v-else-if="watchlistEarnings.length > 0" class="divide-y divide-gray-200 dark:divide-gray-700">
          <div 
            v-for="earnings in watchlistEarnings" 
            :key="`${earnings.symbol}-${earnings.date}`" 
            class="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  {{ earnings.symbol }}
                </span>
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">Earnings Report</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatEarningsDate(earnings.date) }}</p>
                </div>
              </div>
              <div class="text-right">
                <div v-if="earnings.hour" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ earnings.hour === 'amc' ? 'After Market Close' : earnings.hour === 'bmo' ? 'Before Market Open' : earnings.hour }}
                </div>
                <div v-if="earnings.epsEstimate" class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Est. EPS: ${{ earnings.epsEstimate }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-else class="p-6 text-center text-gray-500 dark:text-gray-400">
          <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          <p class="text-sm">No upcoming earnings for your watchlist symbols</p>
        </div>
      </div>

      <!-- 8 Pillars Analysis Section -->
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <svg class="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            8 Pillars Analysis
            <span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
              Pro
            </span>
          </h2>
          <div class="flex items-center space-x-2">
            <button
              v-if="!pillarsLoaded && !loadingPillars"
              @click="loadWatchlistPillars"
              class="text-sm text-primary-600 hover:text-primary-800"
            >
              Load Analysis
            </button>
            <button
              v-else-if="pillarsLoaded"
              @click="loadWatchlistPillars"
              :disabled="loadingPillars"
              class="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
            >
              {{ loadingPillars ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="loadingPillars" class="flex justify-center items-center py-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
          <span class="ml-3 text-sm text-gray-500 dark:text-gray-400">Analyzing {{ pillarsLoadingSymbol }}...</span>
        </div>

        <div v-else-if="!pillarsLoaded" class="p-6 text-center text-gray-500 dark:text-gray-400">
          <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          <p class="text-sm mb-2">Run fundamental analysis on your watchlist symbols</p>
          <button
            @click="loadWatchlistPillars"
            class="btn-primary text-sm"
          >
            Load 8 Pillars Analysis
          </button>
        </div>

        <div v-else-if="watchlistPillars.length > 0" class="divide-y divide-gray-200 dark:divide-gray-700">
          <div
            v-for="analysis in watchlistPillars"
            :key="analysis.symbol"
            class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="flex-shrink-0">
                  <img
                    v-if="analysis.logo"
                    :src="analysis.logo"
                    :alt="analysis.symbol"
                    class="w-10 h-10 rounded-lg"
                  />
                  <div
                    v-else
                    class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
                  >
                    <span class="text-sm font-bold text-gray-500">{{ analysis.symbol.slice(0, 2) }}</span>
                  </div>
                </div>
                <div>
                  <div class="flex items-center">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ analysis.symbol }}</span>
                    <span v-if="analysis.companyName" class="ml-2 text-xs text-gray-500 dark:text-gray-400 truncate max-w-48">
                      {{ analysis.companyName }}
                    </span>
                  </div>
                  <div class="flex items-center space-x-1 mt-1">
                    <!-- Mini pillar indicators -->
                    <span
                      v-for="n in 8"
                      :key="n"
                      :class="[
                        'w-4 h-4 rounded-full flex items-center justify-center text-xs',
                        getPillarPassed(analysis, n)
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                      ]"
                      :title="getPillarName(analysis, n)"
                    >
                      <svg v-if="getPillarPassed(analysis, n)" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <div class="text-right">
                  <span
                    :class="[
                      'text-lg font-bold',
                      analysis.pillarsPassed >= 6 ? 'text-green-600' : analysis.pillarsPassed >= 4 ? 'text-yellow-600' : 'text-red-600'
                    ]"
                  >
                    {{ analysis.pillarsPassed }}/8
                  </span>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Pillars Passed</p>
                </div>
                <router-link
                  :to="`/investments/analyze/${analysis.symbol}`"
                  class="text-sm text-primary-600 hover:text-primary-800 whitespace-nowrap"
                >
                  View Details
                </router-link>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="pillarsLoaded && watchlistPillars.length === 0" class="p-6 text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm">No analysis data available</p>
        </div>
      </div>
    </div>

    <!-- Add Symbol Modal -->
    <div v-if="showAddSymbolModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Add Symbol to Watchlist</h3>
          <form @submit.prevent="addSymbol">
            <div class="mb-4">
              <label for="symbol" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Symbol</label>
              <input
                id="symbol"
                v-model="symbolForm.symbol"
                type="text"
                required
                class="input uppercase dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter symbol (e.g., AAPL)"
              >
            </div>
            <div class="mb-6">
              <label for="notes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes (optional)</label>
              <textarea
                id="notes"
                v-model="symbolForm.notes"
                rows="3"
                class="input dark:bg-gray-700 dark:border-gray-600 dark:text-white"
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
                class="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
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
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Edit Notes for {{ editingItem.symbol }}</h3>
          <form @submit.prevent="updateNotes">
            <div class="mb-6">
              <label for="editNotes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
              <textarea
                id="editNotes"
                v-model="editNotesForm.notes"
                rows="4"
                class="input dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter notes"
              ></textarea>
            </div>
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                @click="cancelEditNotes"
                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="updating"
                class="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
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
import { useInvestmentsStore } from '@/stores/investments'
import api from '@/services/api'

export default {
  name: 'WatchlistDetailView',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { showSuccess, showError, showCriticalError, showConfirmation } = useNotification()
    const investmentsStore = useInvestmentsStore()

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

    // 8 Pillars data
    const watchlistPillars = ref([])
    const loadingPillars = ref(false)
    const pillarsLoaded = ref(false)
    const pillarsLoadingSymbol = ref('')

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
        showCriticalError('Error', 'Failed to load watchlist')
        router.push('/markets')
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
        showCriticalError('Error', 'Failed to load news')
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
        showCriticalError('Error', 'Failed to load earnings')
        watchlistEarnings.value = []
      } finally {
        loadingEarnings.value = false
      }
    }

    const loadWatchlistPillars = async () => {
      if (!watchlist.value?.items?.length) return

      try {
        loadingPillars.value = true
        watchlistPillars.value = []

        // Load analysis for each symbol sequentially to avoid rate limiting
        for (const item of watchlist.value.items) {
          pillarsLoadingSymbol.value = item.symbol
          try {
            const analysis = await investmentsStore.analyzeStock(item.symbol)
            if (analysis) {
              watchlistPillars.value.push(analysis)
            }
          } catch (error) {
            console.error(`Error loading 8 Pillars for ${item.symbol}:`, error)
            // Continue with next symbol even if one fails
          }
        }

        pillarsLoaded.value = true
      } catch (error) {
        console.error('Error loading watchlist pillars:', error)
        showCriticalError('Error', 'Failed to load 8 Pillars analysis')
      } finally {
        loadingPillars.value = false
        pillarsLoadingSymbol.value = ''
      }
    }

    const getPillarPassed = (analysis, pillarNum) => {
      if (!analysis?.pillars) return false
      const pillarKey = `pillar${pillarNum}`
      return analysis.pillars[pillarKey]?.passed || false
    }

    const getPillarName = (analysis, pillarNum) => {
      if (!analysis?.pillars) return `Pillar ${pillarNum}`
      const pillarKey = `pillar${pillarNum}`
      return analysis.pillars[pillarKey]?.name || `Pillar ${pillarNum}`
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
        showCriticalError('Error', message)
      } finally {
        adding.value = false
      }
    }

    const removeSymbol = async (item) => {
      showConfirmation(
        'Remove Symbol',
        `Are you sure you want to remove ${item.symbol} from this watchlist?`,
        async () => {
          try {
            await api.delete(`/watchlists/${route.params.id}/items/${item.id}`)
            await loadWatchlist()
            showSuccess('Success', 'Symbol removed from watchlist')
          } catch (error) {
            console.error('Error removing symbol:', error)
            showCriticalError('Error', 'Failed to remove symbol')
          }
        }
      )
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
        showCriticalError('Error', 'Failed to update notes')
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
      // 8 Pillars
      watchlistPillars,
      loadingPillars,
      pillarsLoaded,
      pillarsLoadingSymbol,
      addSymbol,
      removeSymbol,
      editNotes,
      updateNotes,
      createPriceAlert,
      cancelAddSymbol,
      cancelEditNotes,
      loadWatchlistNews,
      loadWatchlistEarnings,
      loadWatchlistPillars,
      getPillarPassed,
      getPillarName,
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