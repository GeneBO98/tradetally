<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Investments</h1>
        <p class="text-gray-600 dark:text-gray-400 mt-1">Analyze stocks and track your portfolio</p>
      </div>
      <button
        v-if="activeTab === 'holdings'"
        @click="showAddHoldingModal = true"
        class="btn-primary"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        Add Position
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav class="-mb-px flex space-x-8">
        <button
          @click="activeTab = 'screener'"
          :class="[
            'py-4 px-1 border-b-2 font-medium text-sm',
            activeTab === 'screener'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          ]"
        >
          Stock Screener
        </button>
        <button
          @click="activeTab = 'holdings'"
          :class="[
            'py-4 px-1 border-b-2 font-medium text-sm',
            activeTab === 'holdings'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          ]"
        >
          Holdings
          <span
            v-if="investmentsStore.holdingCount > 0"
            class="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-0.5 px-2 rounded-full text-xs"
          >
            {{ investmentsStore.holdingCount }}
          </span>
        </button>
        <button
          @click="activeTab = 'scanner'"
          :class="[
            'py-4 px-1 border-b-2 font-medium text-sm',
            activeTab === 'scanner'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          ]"
        >
          Stock Scanner
        </button>
        <button
          @click="activeTab = 'analyzer'"
          :class="[
            'py-4 px-1 border-b-2 font-medium text-sm',
            activeTab === 'analyzer'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          ]"
        >
          Stock Analyzer
        </button>
      </nav>
    </div>

    <!-- Screener Tab -->
    <div v-if="activeTab === 'screener'">
      <!-- Search Bar -->
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6">
        <div class="flex items-center space-x-4">
          <div class="flex-1 relative">
            <input
              v-model="searchSymbol"
              @keyup.enter="analyzeSymbol"
              type="text"
              placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <svg class="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <button
            @click="analyzeSymbol"
            :disabled="!searchSymbol || investmentsStore.analysisLoading"
            class="btn-primary px-6 py-3"
          >
            <span v-if="investmentsStore.analysisLoading">Analyzing...</span>
            <span v-else>Analyze</span>
          </button>
        </div>
      </div>

      <!-- Current Analysis -->
      <div v-if="investmentsStore.currentAnalysis" class="mb-6">
        <EightPillarsCard
          :analysis="investmentsStore.currentAnalysis"
          @view-details="viewAnalysisDetails"
          @add-to-holdings="addToHoldings"
          @add-to-watchlist="openWatchlistModal"
        />

        <!-- Financial Statements Section (only for stocks, not crypto) -->
        <div v-if="investmentsStore.currentAnalysis.type !== 'crypto'" class="mt-6">
          <FinancialStatementTabs :symbol="investmentsStore.currentAnalysis.symbol" />
        </div>
      </div>

      <!-- Search History -->
      <div v-if="investmentsStore.searchHistory.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">Recent Searches</h2>
          <button
            @click="showFavoritesOnly = !showFavoritesOnly"
            :class="[
              'text-sm px-3 py-1 rounded-md',
              showFavoritesOnly
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            ]"
          >
            {{ showFavoritesOnly ? 'Showing Favorites' : 'Show Favorites' }}
          </button>
        </div>
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <div
            v-for="item in filteredSearchHistory"
            :key="item.id"
            class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            @click="analyzeFromHistory(item.symbol)"
          >
            <div>
              <span class="font-medium text-gray-900 dark:text-white">{{ item.symbol }}</span>
              <span v-if="item.companyName" class="ml-2 text-gray-500 dark:text-gray-400">{{ item.companyName }}</span>
            </div>
            <div class="flex items-center space-x-3">
              <button
                @click.stop="toggleFavorite(item.symbol)"
                :class="item.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'"
              >
                <svg class="w-5 h-5" :fill="item.isFavorite ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                </svg>
              </button>
              <span class="text-sm text-gray-400">{{ formatDate(item.searchedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!investmentsStore.currentAnalysis" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No analysis yet</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter a stock symbol above to analyze using the 8 Pillars methodology.</p>
      </div>
    </div>

    <!-- Holdings Tab -->
    <div v-if="activeTab === 'holdings'">
      <!-- Portfolio Summary -->
      <div v-if="investmentsStore.portfolioSummary" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(investmentsStore.totalPortfolioValue) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">Unrealized P&L</p>
          <p :class="['text-2xl font-bold', investmentsStore.totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600']">
            {{ formatCurrency(investmentsStore.totalUnrealizedPnL) }}
          </p>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Dividends</p>
          <p class="text-2xl font-bold text-green-600">{{ formatCurrency(investmentsStore.totalDividends) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">Positions</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ investmentsStore.holdingCount }}</p>
        </div>
      </div>

      <!-- Holdings List -->
      <div v-if="investmentsStore.holdings.length > 0" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white">Your Holdings</h2>
          <button
            @click="refreshPrices"
            :disabled="investmentsStore.loading"
            class="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
          >
            {{ investmentsStore.loading ? 'Refreshing...' : 'Refresh Prices' }}
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Symbol</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shares</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Cost</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Value</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">P&L</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="holding in investmentsStore.holdings" :key="holding.id">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ holding.symbol }}</span>
                    <span
                      v-if="holding.source === 'trades'"
                      class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      Open Trade
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ holding.source === 'trades' ? `${holding.lotCount} trade(s)` : `${holding.lotCount} lot(s)` }}
                    <span v-if="holding.brokers" class="ml-1">- {{ holding.brokers }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">
                  <div>{{ formatNumber(holding.totalShares) }}</div>
                  <div
                    v-if="holding.source === 'trades' && holding.totalSharesTraded && holding.totalSharesTraded !== holding.totalShares"
                    class="text-xs text-gray-500 dark:text-gray-400"
                  >
                    ({{ formatNumber(holding.totalSharesTraded) }} traded)
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">
                  {{ formatCurrency(holding.averageCostBasis) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">
                  {{ holding.currentPrice ? formatCurrency(holding.currentPrice) : 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">
                  {{ holding.currentValue ? formatCurrency(holding.currentValue) : 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <span v-if="holding.unrealizedPnl !== null" :class="holding.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'">
                    {{ formatCurrency(holding.unrealizedPnl) }}
                    <span class="text-xs">({{ formatPercent(holding.unrealizedPnlPercent) }})</span>
                  </span>
                  <span v-else class="text-gray-400">N/A</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                  <button
                    v-if="holding.source !== 'trades'"
                    @click="viewHolding(holding)"
                    class="text-primary-600 hover:text-primary-900"
                  >
                    View
                  </button>
                  <router-link
                    v-else
                    :to="{ name: 'trades', query: { status: 'open', symbol: holding.symbol } }"
                    class="text-primary-600 hover:text-primary-900"
                  >
                    View Trades
                  </router-link>
                  <button
                    @click="analyzeHolding(holding.symbol)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    Analyze
                  </button>
                  <button
                    v-if="holding.source !== 'trades'"
                    @click="confirmDeleteHolding(holding)"
                    class="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Empty Holdings State -->
      <div v-else class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No holdings yet</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Start tracking your long-term investments.</p>
        <div class="mt-6">
          <button @click="showAddHoldingModal = true" class="btn-primary">
            Add Your First Position
          </button>
        </div>
      </div>
    </div>

    <!-- Stock Scanner Tab -->
    <div v-if="activeTab === 'scanner'">
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <!-- Scanner Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">8 Pillars Stock Scanner</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Find US stocks that pass the 8 Pillars value investing criteria
              </p>
            </div>
            <ScanStatusBadge />
          </div>
        </div>

        <!-- Scanner Content -->
        <div class="p-6">
          <!-- Loading State -->
          <div v-if="scannerStore.loading && !scannerStore.hasResults" class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>

          <!-- No Scan Data Yet -->
          <div v-else-if="!scannerStore.hasScanData && !scannerStore.loading" class="text-center py-12">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No scan data available</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Stock scans run quarterly. Admins can trigger a scan manually.
            </p>
          </div>

          <!-- Scanner Results -->
          <div v-else class="space-y-6">
            <!-- Pillar Filters -->
            <PillarFilterChips @change="onPillarFilterChange" />

            <!-- Results Table -->
            <ScannerResultsTable />
          </div>
        </div>
      </div>
    </div>

    <!-- Stock Analyzer Tab (DCF Valuation) -->
    <div v-if="activeTab === 'analyzer'">
      <!-- Search Bar -->
      <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6">
        <div class="flex items-center space-x-4">
          <div class="flex-1 relative">
            <input
              v-model="analyzerSymbol"
              @keyup.enter="loadAnalyzerData"
              type="text"
              placeholder="Enter stock symbol to analyze (e.g., AAPL, MSFT)"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <svg class="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <button
            @click="loadAnalyzerData"
            :disabled="!analyzerSymbol || analyzerLoading"
            class="btn-primary px-6 py-3"
          >
            <span v-if="analyzerLoading">Loading...</span>
            <span v-else>Analyze</span>
          </button>
        </div>
      </div>

      <!-- Stock Info Header -->
      <div v-if="analyzerStockInfo" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <img v-if="analyzerStockInfo.logo" :src="analyzerStockInfo.logo" :alt="analyzerStockInfo.symbol" class="w-12 h-12 rounded-lg mr-4" />
            <div>
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{ analyzerStockInfo.symbol }}</h2>
              <p class="text-gray-600 dark:text-gray-400">{{ analyzerStockInfo.companyName }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-500 dark:text-gray-400">Current Price</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ analyzerStockInfo.currentPrice ? formatCurrency(analyzerStockInfo.currentPrice) : 'N/A' }}
            </p>
          </div>
        </div>
      </div>

      <!-- DCF Valuation Section -->
      <div v-if="analyzerSymbol && analyzerStockInfo">
        <StockAnalyzerSection
          :symbol="analyzerSymbol"
          :current-price="analyzerStockInfo?.currentPrice"
        />
      </div>

      <!-- Empty State -->
      <div v-else-if="!analyzerLoading" class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">DCF Valuation Calculator</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter a stock symbol above to calculate fair value using Discounted Cash Flow analysis.
        </p>
      </div>
    </div>

    <!-- Add Holding Modal -->
    <AddHoldingModal
      v-if="showAddHoldingModal"
      @close="showAddHoldingModal = false"
      @created="onHoldingCreated"
    />

    <!-- Delete Confirmation Modal -->
    <div v-if="holdingToDelete" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Delete Holding</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete your {{ holdingToDelete.symbol }} position? This will also delete all lots and dividend history.
        </p>
        <div class="flex justify-end space-x-3">
          <button @click="holdingToDelete = null" class="btn-secondary">Cancel</button>
          <button @click="deleteHolding" class="btn-danger">Delete</button>
        </div>
      </div>
    </div>

    <!-- Add to Watchlist Modal -->
    <div v-if="showWatchlistModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Add {{ symbolToAddToWatchlist }} to Watchlist
        </h3>

        <!-- Loading State -->
        <div v-if="watchlistsLoading" class="flex justify-center py-4">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>

        <!-- No Watchlists -->
        <div v-else-if="watchlists.length === 0" class="text-center py-4">
          <p class="text-gray-600 dark:text-gray-400 mb-4">You don't have any watchlists yet.</p>
          <router-link to="/watchlists" class="text-primary-600 hover:text-primary-800">
            Create your first watchlist
          </router-link>
        </div>

        <!-- Watchlist Selection -->
        <div v-else class="space-y-2 mb-6">
          <label
            v-for="watchlist in watchlists"
            :key="watchlist.id"
            class="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            :class="{ 'border-primary-500 bg-primary-50 dark:bg-primary-900/20': selectedWatchlistId === watchlist.id }"
          >
            <input
              type="radio"
              v-model="selectedWatchlistId"
              :value="watchlist.id"
              class="text-primary-600 focus:ring-primary-500"
            />
            <div class="ml-3">
              <span class="font-medium text-gray-900 dark:text-white">{{ watchlist.name }}</span>
              <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">({{ watchlist.item_count }} symbols)</span>
              <span v-if="watchlist.is_default" class="ml-2 text-xs text-primary-600 dark:text-primary-400">Default</span>
            </div>
          </label>
        </div>

        <div class="flex justify-end space-x-3">
          <button @click="closeWatchlistModal" class="btn-secondary">Cancel</button>
          <button
            v-if="watchlists.length > 0"
            @click="addToWatchlist"
            :disabled="!selectedWatchlistId || addingToWatchlist"
            class="btn-primary"
          >
            {{ addingToWatchlist ? 'Adding...' : 'Add to Watchlist' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInvestmentsStore } from '@/stores/investments'
import { useNotification } from '@/composables/useNotification'
import { format } from 'date-fns'
import api from '@/services/api'
import EightPillarsCard from '@/components/investments/EightPillarsCard.vue'
import AddHoldingModal from '@/components/investments/AddHoldingModal.vue'
import FinancialStatementTabs from '@/components/investments/financials/FinancialStatementTabs.vue'
import PillarFilterChips from '@/components/investments/scanner/PillarFilterChips.vue'
import ScannerResultsTable from '@/components/investments/scanner/ScannerResultsTable.vue'
import ScanStatusBadge from '@/components/investments/scanner/ScanStatusBadge.vue'
import StockAnalyzerSection from '@/components/investments/dcf/StockAnalyzerSection.vue'
import { useScannerStore } from '@/stores/scanner'

const router = useRouter()
const route = useRoute()
const investmentsStore = useInvestmentsStore()
const scannerStore = useScannerStore()
const { showSuccess, showError } = useNotification()

// Valid tab names
const validTabs = ['screener', 'holdings', 'scanner', 'analyzer']

// Initialize tab from URL or default to 'screener'
const getInitialTab = () => {
  const urlTab = route.query.tab
  return validTabs.includes(urlTab) ? urlTab : 'screener'
}

const activeTab = ref(getInitialTab())
const searchSymbol = ref('')
const showAddHoldingModal = ref(false)
const showFavoritesOnly = ref(false)
const holdingToDelete = ref(null)

// Watchlist modal state
const showWatchlistModal = ref(false)
const watchlists = ref([])
const watchlistsLoading = ref(false)
const selectedWatchlistId = ref(null)
const symbolToAddToWatchlist = ref('')
const addingToWatchlist = ref(false)

// Stock Analyzer state
const analyzerSymbol = ref('')
const analyzerStockInfo = ref(null)
const analyzerLoading = ref(false)

const filteredSearchHistory = computed(() => {
  if (showFavoritesOnly.value) {
    return investmentsStore.searchHistory.filter(h => h.isFavorite)
  }
  return investmentsStore.searchHistory
})

onMounted(async () => {
  const promises = [
    investmentsStore.fetchHoldings(),
    investmentsStore.fetchPortfolioSummary(),
    investmentsStore.fetchSearchHistory()
  ]

  // If starting on scanner tab, also load scanner data
  if (activeTab.value === 'scanner') {
    promises.push(loadScannerData())
  }

  await Promise.all(promises)
})

// Watch for tab changes to load scanner data and update URL
watch(activeTab, async (newTab) => {
  // Update URL with current tab (replace to avoid cluttering browser history)
  router.replace({ query: { ...route.query, tab: newTab } })

  if (newTab === 'scanner') {
    await loadScannerData()
  }
})

// Watch for pillar filter changes
watch(() => scannerStore.selectedPillars, async () => {
  if (activeTab.value === 'scanner') {
    await scannerStore.fetchResults(1)
  }
}, { deep: true })

// Scanner functions
async function loadScannerData() {
  try {
    await Promise.all([
      scannerStore.fetchResults(1),
      scannerStore.fetchStatus()
    ])
  } catch (error) {
    console.error('Failed to load scanner data:', error)
  }
}

async function onPillarFilterChange() {
  // Filters are already updated in the store via togglePillar
  // Just need to refetch results
  await scannerStore.fetchResults(1)
}

// Stock Analyzer functions
async function loadAnalyzerData() {
  if (!analyzerSymbol.value) return

  analyzerLoading.value = true
  analyzerStockInfo.value = null

  try {
    // Get stock info (8 pillars analysis gives us company name, logo, price)
    const analysis = await investmentsStore.analyzeStock(analyzerSymbol.value.toUpperCase(), false)
    analyzerStockInfo.value = {
      symbol: analysis.symbol,
      companyName: analysis.companyName,
      logo: analysis.logo,
      currentPrice: analysis.currentPrice
    }
  } catch (error) {
    console.error('Failed to load analyzer data:', error)
    showError('Error', 'Failed to load stock data. Please try again.')
  } finally {
    analyzerLoading.value = false
  }
}

async function analyzeSymbol() {
  if (!searchSymbol.value) return
  try {
    // Always force refresh when user explicitly clicks Analyze button
    await investmentsStore.analyzeStock(searchSymbol.value.toUpperCase(), true)
    await investmentsStore.fetchSearchHistory()
  } catch (error) {
    console.error('Analysis failed:', error)
  }
}

async function analyzeFromHistory(symbol) {
  searchSymbol.value = symbol
  await analyzeSymbol()
}

async function analyzeHolding(symbol) {
  activeTab.value = 'screener'
  searchSymbol.value = symbol
  await analyzeSymbol()
}

function viewAnalysisDetails(analysis) {
  router.push({ name: 'stock-analysis', params: { symbol: analysis.symbol } })
}

function addToHoldings(analysis) {
  searchSymbol.value = ''
  showAddHoldingModal.value = true
}

function viewHolding(holding) {
  router.push({ name: 'holding-detail', params: { id: holding.id } })
}

async function toggleFavorite(symbol) {
  await investmentsStore.toggleFavorite(symbol)
}

async function refreshPrices() {
  await investmentsStore.refreshPrices()
}

function confirmDeleteHolding(holding) {
  holdingToDelete.value = holding
}

async function deleteHolding() {
  if (!holdingToDelete.value) return
  await investmentsStore.deleteHolding(holdingToDelete.value.id)
  holdingToDelete.value = null
}

async function onHoldingCreated() {
  showAddHoldingModal.value = false
  await investmentsStore.fetchHoldings()
  await investmentsStore.fetchPortfolioSummary()
}

// Watchlist functions
async function openWatchlistModal(analysis) {
  symbolToAddToWatchlist.value = analysis.symbol
  showWatchlistModal.value = true
  selectedWatchlistId.value = null
  await loadWatchlists()
}

function closeWatchlistModal() {
  showWatchlistModal.value = false
  symbolToAddToWatchlist.value = ''
  selectedWatchlistId.value = null
}

async function loadWatchlists() {
  watchlistsLoading.value = true
  try {
    const response = await api.get('/watchlists')
    watchlists.value = response.data.data || []
    // Auto-select default watchlist if available
    const defaultWatchlist = watchlists.value.find(w => w.is_default)
    if (defaultWatchlist) {
      selectedWatchlistId.value = defaultWatchlist.id
    }
  } catch (error) {
    console.error('Error loading watchlists:', error)
    showError('Error', 'Failed to load watchlists')
  } finally {
    watchlistsLoading.value = false
  }
}

async function addToWatchlist() {
  if (!selectedWatchlistId.value || !symbolToAddToWatchlist.value) return

  addingToWatchlist.value = true
  try {
    await api.post(`/watchlists/${selectedWatchlistId.value}/items`, {
      symbol: symbolToAddToWatchlist.value
    })
    const watchlistName = watchlists.value.find(w => w.id === selectedWatchlistId.value)?.name || 'watchlist'
    showSuccess('Added to Watchlist', `${symbolToAddToWatchlist.value} has been added to ${watchlistName}`)
    closeWatchlistModal()
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    if (error.response?.data?.error?.includes('already in this watchlist')) {
      showError('Already in Watchlist', `${symbolToAddToWatchlist.value} is already in this watchlist`)
    } else {
      showError('Error', 'Failed to add symbol to watchlist')
    }
  } finally {
    addingToWatchlist.value = false
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}

function formatNumber(value) {
  if (value === null || value === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  }).format(value)
}

function formatPercent(value) {
  if (value === null || value === undefined) return ''
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatDate(date) {
  if (!date) return ''
  return format(new Date(date), 'MMM d, yyyy')
}
</script>
