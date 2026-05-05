<template>
    <div class="content-wrapper py-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8">
            <div>
                <h1 class="heading-page">Investments</h1>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                    Analyze stocks and track your portfolio
                </p>
            </div>
            <button
                v-if="activeTab === 'holdings'"
                @click="showAddHoldingModal = true"
                class="btn-primary"
            >
                <svg
                    class="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                    ></path>
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
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
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
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
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
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
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
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
                    ]"
                >
                    Stock Analyzer
                </button>
            </nav>
        </div>

        <!-- Screener Tab -->
        <div v-if="activeTab === 'screener'">
            <!-- Search Bar -->
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6"
            >
                <div class="flex items-center space-x-4">
                    <div class="flex-1 relative">
                        <input
                            v-model="searchSymbol"
                            @keyup.enter="analyzeSymbol"
                            type="text"
                            placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
                            class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        />
                        <svg
                            class="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            ></path>
                        </svg>
                    </div>
                    <button
                        @click="analyzeSymbol"
                        :disabled="
                            !searchSymbol || investmentsStore.analysisLoading
                        "
                        class="btn-primary px-6 py-3"
                    >
                        <span v-if="investmentsStore.analysisLoading"
                            >Analyzing...</span
                        >
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
                <div
                    v-if="investmentsStore.currentAnalysis.type !== 'crypto'"
                    class="mt-6"
                >
                    <FinancialStatementTabs
                        :symbol="investmentsStore.currentAnalysis.symbol"
                    />
                </div>
            </div>

            <!-- Search History -->
            <div
                v-if="investmentsStore.searchHistory.length > 0"
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
            >
                <div
                    class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
                >
                    <h2
                        class="text-lg font-medium text-gray-900 dark:text-white"
                    >
                        Recent Searches
                    </h2>
                    <button
                        @click="showFavoritesOnly = !showFavoritesOnly"
                        :class="[
                            'text-sm px-3 py-1 rounded-md',
                            showFavoritesOnly
                                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
                        ]"
                    >
                        {{
                            showFavoritesOnly
                                ? "Showing Favorites"
                                : "Show Favorites"
                        }}
                    </button>
                </div>
                <div class="divide-y divide-gray-200 dark:divide-gray-700">
                    <div
                        v-for="item in filteredSearchHistory"
                        :key="item.id"
                        class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        @click="analyzeFromHistory(item.symbol)"
                    >
                        <div class="flex items-center gap-3 min-w-0">
                            <StockLogo :symbol="item.symbol" size-class="w-8 h-8" />
                            <div class="min-w-0">
                                <span
                                    class="font-medium text-gray-900 dark:text-white"
                                    >{{ item.symbol }}</span
                                >
                                <span
                                    v-if="item.companyName"
                                    class="ml-2 text-gray-500 dark:text-gray-400"
                                    >{{ item.companyName }}</span
                                >
                            </div>
                        </div>
                        <div class="flex items-center space-x-3">
                            <button
                                @click.stop="toggleFavorite(item.symbol)"
                                :class="
                                    item.isFavorite
                                        ? 'text-yellow-500'
                                        : 'text-gray-400 hover:text-yellow-500'
                                "
                            >
                                <svg
                                    class="w-5 h-5"
                                    :fill="
                                        item.isFavorite
                                            ? 'currentColor'
                                            : 'none'
                                    "
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                    ></path>
                                </svg>
                            </button>
                            <span class="text-sm text-gray-400">{{
                                formatDate(item.searchedAt)
                            }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Empty State -->
            <div
                v-else-if="!investmentsStore.currentAnalysis"
                class="text-center py-12"
            >
                <svg
                    class="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    ></path>
                </svg>
                <h3
                    class="mt-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                    No analysis yet
                </h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Enter a stock symbol above to analyze using the 8 Pillars
                    methodology.
                </p>
            </div>
        </div>

        <!-- Holdings Tab -->
        <div v-if="activeTab === 'holdings'">
            <div
                v-if="initialLoading || (investmentsStore.portfolioLoading && !investmentsStore.portfolioOverview)"
                class="flex flex-col items-center justify-center py-24 gap-4"
            >
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Loading portfolio data...</p>
            </div>

            <template v-else-if="investmentsStore.portfolioOverview">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Portfolio Value
                        </p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                            {{ formatCurrency(investmentsStore.totalPortfolioValue) }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            {{ selectedAccountLabel }}
                        </p>
                    </div>
                    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Total Return
                        </p>
                        <p
                            :class="[
                                'text-2xl font-bold mt-2',
                                portfolioOverviewReturn >= 0 ? 'text-green-600' : 'text-red-600',
                            ]"
                        >
                            {{ formatCurrency(investmentsStore.portfolioOverview.totalReturn) }}
                        </p>
                        <p
                            :class="[
                                'text-xs mt-2',
                                portfolioOverviewReturn >= 0 ? 'text-green-500' : 'text-red-500',
                            ]"
                        >
                            {{ formatPercent(investmentsStore.portfolioOverview.totalReturnPercent) }}
                        </p>
                    </div>
                    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Dividend Income
                        </p>
                        <p class="text-2xl font-bold text-green-600 mt-2">
                            {{ formatCurrency(investmentsStore.totalDividends) }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Captured across tracked positions
                        </p>
                    </div>
                    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-5">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Positions
                        </p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                            {{ investmentsStore.portfolioOverview.positionCount }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Target coverage {{ formatPercent(investmentsStore.portfolioOverview.targetCoveragePercent, false) }}
                        </p>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 mb-6">
                    <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                                    Portfolio vs {{ benchmarkSymbol }}
                                </h2>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Historical comparison for {{ selectedAccountLabel }}
                                </p>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <div
                                    v-if="investmentsStore.portfolioLoading && investmentsStore.portfolioOverview"
                                    class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mr-1"
                                >
                                    <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-500 border-t-transparent"></div>
                                    <span>Updating...</span>
                                </div>
                                <button
                                    v-for="period in portfolioPeriods"
                                    :key="period"
                                    @click="setPortfolioPeriod(period)"
                                    :disabled="investmentsStore.portfolioLoading"
                                    :class="[
                                        'px-3 py-1.5 text-xs rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                                        portfolioPeriod === period
                                            ? 'bg-primary-600 text-white border-primary-600'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600',
                                    ]"
                                >
                                    {{ period }}
                                </button>
                            </div>
                        </div>
                        <div class="p-6">
                            <div
                                v-if="
                                    investmentsStore.portfolioPerformance &&
                                    investmentsStore.portfolioPerformance.series.length > 0
                                "
                            >
                                <div class="h-[22rem] md:h-[30rem] xl:h-[34rem] 2xl:h-[38rem]">
                                    <PortfolioPerformanceChart
                                        :data="investmentsStore.portfolioPerformance.series"
                                        :benchmark-label="benchmarkSymbol"
                                    />
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Return</p>
                                        <p class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                            {{ formatPercent(investmentsStore.portfolioPerformance.metrics.totalReturnPercent) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Total gain/loss for the selected period</p>
                                    </div>
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sharpe Ratio</p>
                                        <p class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                            {{ formatMetric(investmentsStore.portfolioPerformance.metrics.sharpeRatio, 3) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Return per unit of risk. Above 1 is good, above 2 is excellent</p>
                                    </div>
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Beta</p>
                                        <p class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                            {{ formatMetric(investmentsStore.portfolioPerformance.metrics.beta, 3) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Sensitivity to {{ benchmarkSymbol }}. 1 = moves with market, &lt;1 = less volatile</p>
                                    </div>
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Alpha</p>
                                        <p class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                            {{ formatPercent(investmentsStore.portfolioPerformance.metrics.alphaPercent) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Excess return vs {{ benchmarkSymbol }} after adjusting for market risk</p>
                                    </div>
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Volatility</p>
                                        <p class="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                                            {{ formatPercent(investmentsStore.portfolioPerformance.metrics.volatilityPercent) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Annualized price swing. Higher means larger day-to-day moves</p>
                                    </div>
                                    <div class="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-4">
                                        <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Max Drawdown</p>
                                        <p class="text-lg font-semibold text-red-600 mt-1">
                                            {{ formatPercent(-Math.abs(investmentsStore.portfolioPerformance.metrics.maxDrawdownPercent || 0)) }}
                                        </p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Largest peak-to-trough decline during the period</p>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="text-center py-16 text-gray-500 dark:text-gray-400">
                                Historical benchmark data is not available yet for the current selection.
                            </div>
                        </div>
                    </section>

                    <aside class="space-y-4">
                        <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                                    Data Status
                                </h2>
                                <span
                                    :class="[
                                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                        portfolioDataStatus.tone === 'good'
                                            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                            : portfolioDataStatus.tone === 'warning'
                                              ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                    ]"
                                >
                                    {{ portfolioDataStatus.label }}
                                </span>
                            </div>
                            <div class="p-4 space-y-3">
                                <div class="grid grid-cols-3 gap-3">
                                    <div>
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Quotes
                                        </p>
                                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                                            {{ portfolioDataStatus.quoteCoverage }}
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            History
                                        </p>
                                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                                            {{ portfolioDataStatus.historyPointText }}
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Loaded
                                        </p>
                                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                                            {{ portfolioLoadedAtLabel }}
                                        </p>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    {{ portfolioDataStatus.missingQuoteText }}
                                </p>
                                <p class="text-xs text-primary-800 dark:text-primary-200 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-md p-2">
                                    Performance uses a tracked-position index, not TWR/IRR with external cash flows.
                                </p>
                            </div>
                        </section>

                        <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                                    Portfolio Controls
                                </h2>
                                <button
                                    @click="refreshPortfolioData"
                                    :disabled="investmentsStore.loading"
                                    class="btn-secondary text-xs px-2.5 py-1.5"
                                >
                                    {{ investmentsStore.loading ? "Refreshing..." : "Refresh" }}
                                </button>
                            </div>
                            <div class="p-4 space-y-4">
                                <div>
                                    <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Benchmark
                                    </label>
                                    <SymbolAutocomplete
                                        v-model="benchmarkSymbol"
                                        placeholder="e.g., SPY"
                                        input-class="text-sm"
                                    />
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            Drift %
                                        </label>
                                        <input
                                            v-model.number="portfolioPreferencesForm.driftThresholdPercent"
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            Drawdown %
                                        </label>
                                        <input
                                            v-model.number="portfolioPreferencesForm.drawdownThresholdPercent"
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                                        />
                                    </div>
                                </div>
                                <label class="flex items-start gap-2">
                                    <input
                                        v-model="portfolioPreferencesForm.alertsEnabled"
                                        type="checkbox"
                                        class="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span class="text-xs text-gray-700 dark:text-gray-300">
                                        Send drift and drawdown alerts to Notifications
                                    </span>
                                </label>
                                <button
                                    @click="savePortfolioSettings"
                                    :disabled="savingPortfolioSettings"
                                    class="btn-primary w-full text-sm"
                                >
                                    {{ savingPortfolioSettings ? "Saving..." : "Save Settings" }}
                                </button>
                                <div
                                    v-if="investmentsStore.portfolioRebalance"
                                    class="grid grid-cols-3 gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3"
                                >
                                    <div>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400">Coverage</p>
                                        <p class="text-xs font-medium text-gray-900 dark:text-white">
                                            {{ formatPercent(investmentsStore.portfolioRebalance.targetCoveragePercent, false) }}
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400">Target</p>
                                        <p class="text-xs font-medium text-gray-900 dark:text-white">
                                            {{ formatPercent(investmentsStore.portfolioRebalance.targetTotalPercent, false) }}
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400">Drift</p>
                                        <p class="text-xs font-medium text-gray-900 dark:text-white">
                                            {{ formatPercent(investmentsStore.portfolioRebalance.driftThresholdPercent, false) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <div>
                                    <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                                        Portfolio Alerts
                                    </h2>
                                </div>
                                <span
                                    v-if="investmentsStore.portfolioAlertSummary"
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {{ investmentsStore.portfolioAlertSummary.alertsEnabled ? "Enabled" : "Disabled" }}
                                </span>
                            </div>
                            <div class="p-4 space-y-4">
                                <div
                                    v-if="investmentsStore.portfolioAlertSummary?.activeConditions?.length"
                                    class="space-y-2"
                                >
                                    <div
                                        v-for="condition in investmentsStore.portfolioAlertSummary.activeConditions"
                                        :key="`${condition.category}-${condition.symbol}`"
                                        class="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-3"
                                    >
                                        <div class="flex items-center justify-between gap-3">
                                            <p class="text-xs font-medium text-yellow-900 dark:text-yellow-100">
                                                {{ condition.symbol }}
                                            </p>
                                            <span class="text-[11px] text-yellow-700 dark:text-yellow-300">
                                                {{ condition.category === "drawdown" ? "Drawdown" : "Drift" }}
                                            </span>
                                        </div>
                                        <p class="text-xs text-yellow-800 dark:text-yellow-200 mt-1">
                                            {{ condition.message }}
                                        </p>
                                    </div>
                                </div>
                                <div
                                    v-else
                                    class="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3"
                                >
                                    <p class="text-xs font-medium text-green-900 dark:text-green-100">
                                        No active portfolio alert conditions.
                                    </p>
                                </div>

                                <div
                                    v-if="investmentsStore.portfolioAlertSummary"
                                    class="grid grid-cols-2 gap-3"
                                >
                                    <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400">Drift threshold</p>
                                        <p class="text-xs font-medium text-gray-900 dark:text-white">
                                            {{ formatPercent(investmentsStore.portfolioAlertSummary.driftThresholdPercent, false) }}
                                        </p>
                                    </div>
                                    <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400">Drawdown threshold</p>
                                        <p class="text-xs font-medium text-gray-900 dark:text-white">
                                            {{ formatPercent(investmentsStore.portfolioAlertSummary.drawdownThresholdPercent, false) }}
                                        </p>
                                    </div>
                                </div>

                                <div v-if="investmentsStore.portfolioAlertSummary?.recentAlerts?.length">
                                    <div class="flex items-center justify-between mb-2">
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Recent alerts
                                        </p>
                                        <router-link
                                            to="/notifications"
                                            class="text-[11px] text-primary-600 hover:text-primary-800"
                                        >
                                            View all
                                        </router-link>
                                    </div>
                                    <div class="space-y-2">
                                        <div
                                            v-for="alert in investmentsStore.portfolioAlertSummary.recentAlerts"
                                            :key="alert.id"
                                            class="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                                        >
                                            <div class="flex items-center justify-between gap-3">
                                                <p class="text-xs font-medium text-gray-900 dark:text-white">
                                                    {{ alert.symbol }}
                                                </p>
                                                <span class="text-[11px] text-gray-500 dark:text-gray-400">
                                                    {{ formatDateTime(alert.createdAt) }}
                                                </span>
                                            </div>
                                            <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                                {{ alert.message }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <div>
                                    <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                                        Account Comparison
                                    </h2>
                                </div>
                                <div
                                    v-if="accountComparisonLoading"
                                    class="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent"
                                ></div>
                            </div>
                            <div v-if="accountComparisonRows.length > 0" class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead class="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th class="px-3 py-2 text-left text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                Account
                                            </th>
                                            <th class="px-3 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                Return
                                            </th>
                                            <th class="px-3 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                Drift
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr
                                            v-for="row in accountComparisonRows"
                                            :key="row.value"
                                            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                            @click="setComparisonAccount(row.value)"
                                        >
                                            <td class="px-3 py-2">
                                                <div class="text-xs font-medium text-gray-900 dark:text-white">
                                                    {{ row.label }}
                                                </div>
                                                <div class="text-[11px] text-gray-500 dark:text-gray-400">
                                                    {{ formatCurrency(row.totalValue) }} · {{ row.positionCount }} pos.
                                                </div>
                                            </td>
                                            <td
                                                :class="[
                                                    'px-3 py-2 text-right text-xs font-medium',
                                                    row.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600',
                                                ]"
                                            >
                                                {{ formatPercent(row.totalReturnPercent) }}
                                            </td>
                                            <td class="px-3 py-2 text-right text-xs text-gray-900 dark:text-gray-100">
                                                {{ row.maxDriftPercent === null ? 'N/A' : formatPercent(row.maxDriftPercent) }}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div v-else class="p-4 text-xs text-gray-500 dark:text-gray-400">
                                Add at least two accounts to compare portfolios.
                            </div>
                        </section>
                    </aside>
                </div>

                <div
                    v-if="investmentsStore.portfolioPositions.length > 0"
                    class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
                >
                    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                            Allocation and Rebalancing
                        </h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Advisory only. Share deltas are suggestions, not broker-ready orders.
                        </p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Symbol
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" title="Current market value and average cost basis per share">
                                        Value
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="This position's current share of total portfolio value">
                                        Actual %
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="Your desired allocation percentage for this position. Edit and save to track rebalancing needs">
                                        Target %
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="How far the actual allocation has strayed from your target. Highlighted when it exceeds your drift alert threshold">
                                        Drift
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="Estimated number of shares to buy (positive) or sell (negative) to return to your target allocation">
                                        Share Delta
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="Estimated dollar value to buy or sell to return to your target allocation">
                                        Trade Value
                                    </th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                <tr
                                    v-for="position in rebalanceRows"
                                    :key="position.symbol"
                                >
                                    <td class="px-6 py-4 align-top">
                                        <div class="flex items-center gap-3">
                                            <StockLogo
                                                :symbol="position.symbol"
                                                size-class="w-8 h-8"
                                            />
                                            <div>
                                                <div class="flex items-center gap-2">
                                                    <span class="text-sm font-medium text-gray-900 dark:text-white">
                                                        {{ position.symbol }}
                                                    </span>
                                                    <span
                                                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                                                    >
                                                        {{ positionSourceLabel(position) }}
                                                    </span>
                                                </div>
                                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {{ formatNumber(position.totalShares) }} shares
                                                    <span v-if="position.brokers"> • {{ position.brokers }}</span>
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                                        <div>{{ formatCurrency(position.currentValue) }}</div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            {{ formatCurrency(position.averageCostBasis) }} avg
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {{ formatPercent(position.actualAllocationPercent, false) }}
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm">
                                        <div
                                            v-if="position.holdingId"
                                            class="flex items-center justify-end gap-2"
                                        >
                                            <input
                                                v-model="targetAllocationDrafts[position.symbol]"
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                class="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-right focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                                            />
                                            <button
                                                @click="saveTargetAllocation(position)"
                                                class="text-xs text-primary-600 hover:text-primary-800"
                                            >
                                                Save
                                            </button>
                                        </div>
                                        <span v-else class="text-gray-400">N/A</span>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm">
                                        <div v-if="position.driftPercent !== null">
                                            <span
                                                :class="
                                                    Math.abs(position.driftPercent) >= portfolioPreferencesForm.driftThresholdPercent
                                                        ? 'text-red-600 font-medium'
                                                        : 'text-gray-900 dark:text-gray-100'
                                                "
                                            >
                                                {{ formatPercent(position.driftPercent) }}
                                            </span>
                                            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {{ rebalanceActionLabel(position) }}
                                            </div>
                                        </div>
                                        <span v-else class="text-gray-400">Target not set</span>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                                        <span v-if="position.shareDelta !== null">
                                            {{ position.action === "buy" ? "+" : "" }}{{ formatNumber(position.shareDelta) }}
                                        </span>
                                        <span v-else class="text-gray-400">N/A</span>
                                    </td>
                                    <td
                                        :class="[
                                            'px-6 py-4 text-right text-sm font-medium',
                                            position.valueDelta > 0 ? 'text-green-600' : position.valueDelta < 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100',
                                        ]"
                                    >
                                        <span v-if="position.valueDelta !== null">
                                            {{ position.valueDelta > 0 ? '+' : '' }}{{ formatCurrency(position.valueDelta) }}
                                        </span>
                                        <span v-else class="text-gray-400">N/A</span>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm space-x-3">
                                        <button
                                            @click="openPortfolioPosition(position)"
                                            class="text-primary-600 hover:text-primary-800"
                                        >
                                            {{ position.holdingId ? "View" : "View Trades" }}
                                        </button>
                                        <button
                                            @click="analyzeHolding(position.symbol)"
                                            class="text-primary-600 hover:text-primary-800"
                                        >
                                            Analyze
                                        </button>
                                        <button
                                            v-if="position.holdingId && !position.includesOpenTrades"
                                            @click="confirmDeleteHolding(position)"
                                            class="text-red-600 hover:text-red-800"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div
                    v-else
                    class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
                >
                    <svg
                        class="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        ></path>
                    </svg>
                    <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                        No positions yet
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Start tracking long-term holdings or keep an open trade to populate your portfolio.
                    </p>
                    <div class="mt-6">
                        <button
                            @click="showAddHoldingModal = true"
                            class="btn-primary"
                        >
                            Add Your First Position
                        </button>
                    </div>
                </div>
            </template>
        </div>

        <!-- Stock Scanner Tab -->
        <div v-if="activeTab === 'scanner'">
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
            >
                <!-- Scanner Header -->
                <div
                    class="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
                >
                    <div class="flex items-center justify-between">
                        <div>
                            <h2
                                class="text-lg font-medium text-gray-900 dark:text-white"
                            >
                                8 Pillars Stock Scanner
                            </h2>
                            <p
                                class="text-sm text-gray-500 dark:text-gray-400 mt-1"
                            >
                                Find US stocks that pass the 8 Pillars value
                                investing criteria
                            </p>
                        </div>
                        <ScanStatusBadge />
                    </div>
                </div>

                <!-- Scanner Content -->
                <div class="p-6">
                    <!-- Loading State -->
                    <div
                        v-if="scannerStore.loading && !scannerStore.hasResults"
                        class="flex items-center justify-center py-12"
                    >
                        <div
                            class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
                        ></div>
                    </div>

                    <!-- No Scan Data Yet -->
                    <div
                        v-else-if="
                            !scannerStore.hasScanData && !scannerStore.loading
                        "
                        class="text-center py-12"
                    >
                        <svg
                            class="mx-auto h-12 w-12 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                            />
                        </svg>
                        <h3
                            class="mt-2 text-sm font-medium text-gray-900 dark:text-white"
                        >
                            No scan data available
                        </h3>
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Stock scans run quarterly. Admins can trigger a scan
                            manually.
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
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6"
            >
                <div class="flex items-center space-x-4">
                    <div class="flex-1 relative">
                        <input
                            v-model="analyzerSymbol"
                            @keyup.enter="loadAnalyzerData"
                            type="text"
                            placeholder="Enter stock symbol to analyze (e.g., AAPL, MSFT)"
                            class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        />
                        <svg
                            class="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            ></path>
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
            <div
                v-if="analyzerStockInfo"
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <StockLogo
                            :symbol="analyzerStockInfo.symbol"
                            :logo-url="analyzerStockInfo.logo"
                            size-class="w-12 h-12"
                            class="mr-4"
                        />
                        <div>
                            <h2
                                class="text-2xl font-bold text-gray-900 dark:text-white"
                            >
                                {{ analyzerStockInfo.symbol }}
                            </h2>
                            <p class="text-gray-600 dark:text-gray-400">
                                {{ analyzerStockInfo.companyName }}
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Current Price
                        </p>
                        <p
                            class="text-2xl font-bold text-gray-900 dark:text-white"
                        >
                            {{
                                analyzerStockInfo.currentPrice
                                    ? formatCurrency(
                                          analyzerStockInfo.currentPrice,
                                      )
                                    : "N/A"
                            }}
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
            <div
                v-else-if="!analyzerLoading"
                class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
            >
                <svg
                    class="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                </svg>
                <h3
                    class="mt-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                    DCF Valuation Calculator
                </h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Enter a stock symbol above to calculate fair value using
                    Discounted Cash Flow analysis.
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
        <div
            v-if="holdingToDelete"
            class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
            >
                <h3
                    class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                >
                    Delete Holding
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                    Are you sure you want to delete your
                    {{ holdingToDelete.symbol }} position? This will also delete
                    all lots and dividend history.
                </p>
                <div class="flex justify-end space-x-3">
                    <button
                        @click="holdingToDelete = null"
                        class="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button @click="deleteHolding" class="btn-danger">
                        Delete
                    </button>
                </div>
            </div>
        </div>

        <!-- Add to Watchlist Modal -->
        <div
            v-if="showWatchlistModal"
            class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
            >
                <h3
                    class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                >
                    Add {{ symbolToAddToWatchlist }} to Watchlist
                </h3>

                <!-- Loading State -->
                <div v-if="watchlistsLoading" class="flex justify-center py-4">
                    <div
                        class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"
                    ></div>
                </div>

                <!-- No Watchlists -->
                <div
                    v-else-if="watchlists.length === 0"
                    class="text-center py-4"
                >
                    <p class="text-gray-600 dark:text-gray-400 mb-4">
                        You don't have any watchlists yet.
                    </p>
                    <router-link
                        to="/watchlists"
                        class="text-primary-600 hover:text-primary-800"
                    >
                        Create your first watchlist
                    </router-link>
                </div>

                <!-- Watchlist Selection -->
                <div v-else class="space-y-2 mb-6">
                    <label
                        v-for="watchlist in watchlists"
                        :key="watchlist.id"
                        class="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                        :class="{
                            'border-primary-500 bg-primary-50 dark:bg-primary-900/20':
                                selectedWatchlistId === watchlist.id,
                        }"
                    >
                        <input
                            type="radio"
                            v-model="selectedWatchlistId"
                            :value="watchlist.id"
                            class="text-primary-600 focus:ring-primary-500"
                        />
                        <div class="ml-3">
                            <span
                                class="font-medium text-gray-900 dark:text-white"
                                >{{ watchlist.name }}</span
                            >
                            <span
                                class="ml-2 text-sm text-gray-500 dark:text-gray-400"
                                >({{ watchlist.item_count }} symbols)</span
                            >
                            <span
                                v-if="watchlist.is_default"
                                class="ml-2 text-xs text-primary-600 dark:text-primary-400"
                                >Default</span
                            >
                        </div>
                    </label>
                </div>

                <div class="flex justify-end space-x-3">
                    <button @click="closeWatchlistModal" class="btn-secondary">
                        Cancel
                    </button>
                    <button
                        v-if="watchlists.length > 0"
                        @click="addToWatchlist"
                        :disabled="!selectedWatchlistId || addingToWatchlist"
                        class="btn-primary"
                    >
                        {{
                            addingToWatchlist ? "Adding..." : "Add to Watchlist"
                        }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useInvestmentsStore } from "@/stores/investments";
import { useNotification } from "@/composables/useNotification";
import { format } from "date-fns";
import api from "@/services/api";
import EightPillarsCard from "@/components/investments/EightPillarsCard.vue";
import AddHoldingModal from "@/components/investments/AddHoldingModal.vue";
import FinancialStatementTabs from "@/components/investments/financials/FinancialStatementTabs.vue";
import PillarFilterChips from "@/components/investments/scanner/PillarFilterChips.vue";
import ScannerResultsTable from "@/components/investments/scanner/ScannerResultsTable.vue";
import ScanStatusBadge from "@/components/investments/scanner/ScanStatusBadge.vue";
import StockAnalyzerSection from "@/components/investments/dcf/StockAnalyzerSection.vue";
import PortfolioPerformanceChart from "@/components/investments/PortfolioPerformanceChart.vue";
import { useScannerStore } from "@/stores/scanner";
import { useGlobalAccountFilter } from "@/composables/useGlobalAccountFilter";
import StockLogo from "@/components/common/StockLogo.vue";
import SymbolAutocomplete from "@/components/common/SymbolAutocomplete.vue";

const router = useRouter();
const route = useRoute();
const investmentsStore = useInvestmentsStore();
const scannerStore = useScannerStore();
const { showSuccess, showError } = useNotification();
const { selectedAccount, selectedAccountLabel, accounts, fetchAccounts, setAccount } =
    useGlobalAccountFilter();

// Valid tab names
const validTabs = ["screener", "holdings", "scanner", "analyzer"];

// Initialize tab from URL or default to 'screener'
const getInitialTab = () => {
    const urlTab = route.query.tab;
    return validTabs.includes(urlTab) ? urlTab : "screener";
};

const activeTab = ref(getInitialTab());
const searchSymbol = ref("");
const showAddHoldingModal = ref(false);
const showFavoritesOnly = ref(false);
const holdingToDelete = ref(null);
const portfolioPeriods = ["1M", "3M", "6M", "1Y", "5Y", "10Y", "YTD"];
const portfolioPeriod = ref("6M");
// True from first render until the initial data load finishes. Separate from
// portfolioLoading because the loading flag is only set inside store actions,
// not during the preferences/accounts pre-fetch that happens first.
const initialLoading = ref(true);
const PORTFOLIO_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
// Per-period cache: Map<cacheKey, { fetchedAt, overview, positions, performance, rebalance, alerts }>
// Key is `period|account|benchmark` so switching back to a previous period is instant.
const periodDataCache = new Map();
let _periodDebounceTimer = null; // debounce handle for rapid period clicks
const benchmarkSymbol = ref("SPY");
const savingPortfolioSettings = ref(false);
const targetAllocationDrafts = ref({});
const portfolioLoadedAt = ref(null);
const accountComparisonRows = ref([]);
const accountComparisonLoading = ref(false);
const portfolioPreferencesForm = ref({
    driftThresholdPercent: 5,
    drawdownThresholdPercent: 10,
    alertsEnabled: true,
});

// Watchlist modal state
const showWatchlistModal = ref(false);
const watchlists = ref([]);
const watchlistsLoading = ref(false);
const selectedWatchlistId = ref(null);
const symbolToAddToWatchlist = ref("");
const addingToWatchlist = ref(false);

// Stock Analyzer state
const analyzerSymbol = ref("");
const analyzerStockInfo = ref(null);
const analyzerLoading = ref(false);

const filteredSearchHistory = computed(() => {
    if (showFavoritesOnly.value) {
        return investmentsStore.searchHistory.filter((h) => h.isFavorite);
    }
    return investmentsStore.searchHistory;
});
const rebalanceRows = computed(
    () => investmentsStore.portfolioRebalance?.positions || [],
);
const portfolioOverviewReturn = computed(
    () => investmentsStore.portfolioOverview?.totalReturn || 0,
);
const portfolioDataStatus = computed(() => {
    const positions = investmentsStore.portfolioPositions || [];
    const totalPositions = positions.length;
    const missingQuotes = positions.filter((position) => !position.currentPrice || position.currentValue === null).length;
    const quotedPositions = Math.max(totalPositions - missingQuotes, 0);
    const quoteCoveragePercent = totalPositions > 0 ? (quotedPositions / totalPositions) * 100 : 0;
    const performanceSeries = investmentsStore.portfolioPerformance?.series || [];
    const seriesPoints = performanceSeries.length;
    const benchmarkPoints = performanceSeries.filter((point) => point.benchmarkIndex !== null && point.benchmarkIndex !== undefined).length;

    let tone = "good";
    if (totalPositions > 0 && missingQuotes > 0) {
        tone = missingQuotes === totalPositions ? "danger" : "warning";
    } else if (seriesPoints === 0) {
        tone = "warning";
    }

    return {
        tone,
        label: tone === "good" ? "Ready" : tone === "warning" ? "Partial Data" : "Quotes Missing",
        quoteCoverage: totalPositions > 0 ? `${quotedPositions}/${totalPositions}` : "0/0",
        missingQuoteText: missingQuotes > 0
            ? `${missingQuotes} position${missingQuotes === 1 ? "" : "s"} missing a current quote`
            : "All tracked positions have current quote data",
        historyPointText: benchmarkPoints > 0 ? `${seriesPoints} / ${benchmarkPoints}` : `${seriesPoints}`,
    };
});
const portfolioLoadedAtLabel = computed(() => {
    if (!portfolioLoadedAt.value) return "Not loaded";
    return format(portfolioLoadedAt.value, "h:mm a");
});

function buildPortfolioParams() {
    const params = {
        benchmark: benchmarkSymbol.value.trim().toUpperCase() || "SPY",
        period: portfolioPeriod.value,
    };

    if (selectedAccount.value) {
        params.accounts = selectedAccount.value;
    }

    return params;
}

function syncTargetAllocationDrafts(positions = []) {
    const nextDrafts = {};
    positions.forEach((position) => {
        nextDrafts[position.symbol] =
            position.targetAllocationPercent ?? "";
    });
    targetAllocationDrafts.value = nextDrafts;
}

function buildCacheKey() {
    return `${portfolioPeriod.value}|${selectedAccount.value || ""}|${benchmarkSymbol.value}`;
}

// Period-sensitive endpoints (chart, metrics): re-fetched whenever the time
// range changes.  Period-insensitive endpoints (positions, rebalance): only
// fetched on initial load, account change, or explicit refresh, because
// allocation/rebalancing data is point-in-time and doesn't change with period.
async function loadPortfolioData({ force = false, periodOnly = false } = {}) {
    const cacheKey = buildCacheKey();

    if (!force) {
        const cached = periodDataCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < PORTFOLIO_CACHE_TTL_MS) {
            // Restore from cache — no network round-trip.
            investmentsStore.portfolioOverview = cached.overview;
            investmentsStore.portfolioPerformance = cached.performance;
            if (!periodOnly) {
                investmentsStore.portfolioPositions = cached.positions;
                investmentsStore.portfolioRebalance = cached.rebalance;
                investmentsStore.portfolioAlertSummary = cached.alerts;
                syncTargetAllocationDrafts(cached.positions || []);
            }
            portfolioLoadedAt.value = new Date(cached.fetchedAt);
            return;
        }
    }

    const params = buildPortfolioParams();

    if (periodOnly) {
        // Only update the chart and metrics. Positions and the allocation
        // table stay visible with their current data — they don't depend on
        // the selected time range so there's no need to blank them out.
        await Promise.allSettled([
            investmentsStore.fetchPortfolioOverview(params),
            investmentsStore.fetchPortfolioPerformance(params),
        ]);
    } else {
        const results = await Promise.allSettled([
            investmentsStore.fetchPortfolioOverview(params),
            investmentsStore.fetchPortfolioPositions(params),
            investmentsStore.fetchPortfolioPerformance(params),
            investmentsStore.fetchPortfolioRebalance(params),
            investmentsStore.fetchPortfolioAlerts(params),
        ]);
        const positions = results[1].status === "fulfilled" ? results[1].value : [];
        syncTargetAllocationDrafts(positions);
    }

    // Save freshly-fetched data. For period-only loads, preserve the cached
    // positions and rebalance so switching back is still instant.
    const prev = periodDataCache.get(cacheKey);
    periodDataCache.set(cacheKey, {
        fetchedAt: Date.now(),
        overview: investmentsStore.portfolioOverview,
        performance: investmentsStore.portfolioPerformance,
        positions: periodOnly ? (prev?.positions ?? investmentsStore.portfolioPositions) : investmentsStore.portfolioPositions,
        rebalance: periodOnly ? (prev?.rebalance ?? investmentsStore.portfolioRebalance) : investmentsStore.portfolioRebalance,
        alerts: periodOnly ? (prev?.alerts ?? investmentsStore.portfolioAlertSummary) : investmentsStore.portfolioAlertSummary,
    });
    portfolioLoadedAt.value = new Date();
}

async function loadAccountComparison() {
    const comparableAccounts = accounts.value
        .filter((account) => account.value && account.value !== "__unsorted__")
        .slice(0, 6);

    if (comparableAccounts.length < 2) {
        accountComparisonRows.value = [];
        return;
    }

    accountComparisonLoading.value = true;
    try {
        const rows = await Promise.all(
            comparableAccounts.map(async (account) => {
                const params = {
                    benchmark: benchmarkSymbol.value.trim().toUpperCase() || "SPY",
                    period: portfolioPeriod.value,
                    accounts: account.value,
                };
                const [overviewResult, rebalanceResult] = await Promise.allSettled([
                    api.get("/investments/portfolio/overview", { params }),
                    api.get("/investments/portfolio/rebalance", { params }),
                ]);
                const overview = overviewResult.status === "fulfilled" ? overviewResult.value.data : {};
                const rebalance = rebalanceResult.status === "fulfilled" ? rebalanceResult.value.data : {};
                const maxDriftPercent = (rebalance.positions || []).reduce((max, position) => {
                    if (position.driftPercent === null || position.driftPercent === undefined) {
                        return max;
                    }
                    const absoluteDrift = Math.abs(Number(position.driftPercent));
                    return max === null || absoluteDrift > max ? absoluteDrift : max;
                }, null);

                return {
                    value: account.value,
                    label: account.label,
                    totalValue: overview.totalValue || 0,
                    totalReturnPercent: overview.totalReturnPercent || 0,
                    positionCount: overview.positionCount || 0,
                    maxDriftPercent,
                };
            }),
        );

        accountComparisonRows.value = rows.sort((left, right) => right.totalReturnPercent - left.totalReturnPercent);
    } catch (error) {
        console.error("Failed to load account comparison:", error);
        accountComparisonRows.value = [];
    } finally {
        accountComparisonLoading.value = false;
    }
}

onMounted(async () => {
    try {
        const [preferences] = await Promise.all([
            investmentsStore.fetchPortfolioPreferences(),
            investmentsStore.fetchSearchHistory(),
            fetchAccounts(),
        ]);

        benchmarkSymbol.value =
            preferences?.defaultBenchmarkSymbol || "SPY";
        portfolioPreferencesForm.value = {
            driftThresholdPercent:
                preferences?.driftThresholdPercent ?? 5,
            drawdownThresholdPercent:
                preferences?.drawdownThresholdPercent ?? 10,
            alertsEnabled: preferences?.alertsEnabled ?? true,
        };
        await loadPortfolioData();
        await loadAccountComparison();
    } catch (error) {
        console.error("Failed to load portfolio data:", error);
    } finally {
        initialLoading.value = false;
    }

    // If starting on scanner tab, also load scanner data
    if (activeTab.value === "scanner") {
        await loadScannerData();
    }
});

// Watch for tab changes to load scanner data and update URL
watch(activeTab, async (newTab) => {
    // Update URL with current tab (replace to avoid cluttering browser history)
    router.replace({ query: { ...route.query, tab: newTab } });

    if (newTab === "scanner") {
        await loadScannerData();
    }

    if (newTab === "holdings") {
        await loadPortfolioData(); // cached — instant if still fresh
        await loadAccountComparison();
    }
});

watch(selectedAccount, async () => {
    if (activeTab.value === "holdings") {
        periodDataCache.clear(); // different account = different data for all periods
        await loadPortfolioData({ force: true });
        await loadAccountComparison();
    }
});

// Watch for pillar filter changes
watch(
    () => scannerStore.selectedPillars,
    async () => {
        if (activeTab.value === "scanner") {
            await scannerStore.fetchResults(1);
        }
    },
    { deep: true },
);

// Scanner functions
async function loadScannerData() {
    try {
        await Promise.all([
            scannerStore.fetchResults(1),
            scannerStore.fetchStatus(),
        ]);
    } catch (error) {
        console.error("Failed to load scanner data:", error);
    }
}

async function onPillarFilterChange() {
    // Filters are already updated in the store via togglePillar
    // Just need to refetch results
    await scannerStore.fetchResults(1);
}

// Stock Analyzer functions
async function loadAnalyzerData() {
    if (!analyzerSymbol.value) return;

    analyzerLoading.value = true;
    analyzerStockInfo.value = null;

    try {
        // Get stock info (8 pillars analysis gives us company name, logo, price)
        const analysis = await investmentsStore.analyzeStock(
            analyzerSymbol.value.toUpperCase(),
            false,
        );
        analyzerStockInfo.value = {
            symbol: analysis.symbol,
            companyName: analysis.companyName,
            logo: analysis.logo,
            currentPrice: analysis.currentPrice,
        };
    } catch (error) {
        console.error("Failed to load analyzer data:", error);
        showError("Error", "Failed to load stock data. Please try again.");
    } finally {
        analyzerLoading.value = false;
    }
}

async function analyzeSymbol() {
    if (!searchSymbol.value) return;
    try {
        // Always force refresh when user explicitly clicks Analyze button
        await investmentsStore.analyzeStock(
            searchSymbol.value.toUpperCase(),
            true,
        );
        await investmentsStore.fetchSearchHistory();
    } catch (error) {
        console.error("Analysis failed:", error);
    }
}

async function analyzeFromHistory(symbol) {
    searchSymbol.value = symbol;
    await analyzeSymbol();
}

async function analyzeHolding(symbol) {
    activeTab.value = "screener";
    searchSymbol.value = symbol;
    await analyzeSymbol();
}

function viewAnalysisDetails(analysis) {
    router.push({
        name: "stock-analysis",
        params: { symbol: analysis.symbol },
    });
}

function addToHoldings(analysis) {
    searchSymbol.value = "";
    showAddHoldingModal.value = true;
}

function viewHolding(holdingId) {
    router.push({ name: "holding-detail", params: { id: holdingId } });
}

async function toggleFavorite(symbol) {
    await investmentsStore.toggleFavorite(symbol);
}

async function refreshPortfolioData() {
    // Clear entire cache so re-visiting any period gets fresh data.
    periodDataCache.clear();
    await investmentsStore.refreshPrices();
    await loadPortfolioData({ force: true });
    await loadAccountComparison();
}

function confirmDeleteHolding(holding) {
    holdingToDelete.value = holding;
}

async function deleteHolding() {
    if (!holdingToDelete.value) return;
    await investmentsStore.deleteHolding(holdingToDelete.value.holdingId);
    holdingToDelete.value = null;
    periodDataCache.clear();
    await loadPortfolioData({ force: true });
}

async function onHoldingCreated() {
    showAddHoldingModal.value = false;
    periodDataCache.clear();
    await loadPortfolioData({ force: true });
}

function positionSourceLabel(position) {
    if (position.source === "mixed") return "Holding + Open Trade";
    if (position.source === "trades") return "Open Trade";
    return "Holding";
}

function openPortfolioPosition(position) {
    if (position.holdingId) {
        viewHolding(position.holdingId);
        return;
    }

    router.push({
        name: "trades",
        query: {
            status: "open",
            symbol: position.symbol,
        },
    });
}

function setPortfolioPeriod(period) {
    if (portfolioPeriod.value === period) return;
    portfolioPeriod.value = period;
    // Debounce: if the user clicks several periods quickly, cancel the
    // previous pending fetch and only send one request for the final pick.
    clearTimeout(_periodDebounceTimer);
    _periodDebounceTimer = setTimeout(() => {
        _periodDebounceTimer = null;
        // periodOnly=true keeps the allocation/rebalancing table visible
        // unchanged while only the chart and metrics update.
        loadPortfolioData({ periodOnly: true });
        loadAccountComparison();
    }, 200);
}

async function savePortfolioSettings() {
    savingPortfolioSettings.value = true;

    try {
        const preferences = await investmentsStore.updatePortfolioPreferences({
            defaultBenchmarkSymbol: benchmarkSymbol.value
                .trim()
                .toUpperCase(),
            driftThresholdPercent:
                portfolioPreferencesForm.value.driftThresholdPercent,
            drawdownThresholdPercent:
                portfolioPreferencesForm.value.drawdownThresholdPercent,
            alertsEnabled: portfolioPreferencesForm.value.alertsEnabled,
        });

        benchmarkSymbol.value = preferences.defaultBenchmarkSymbol;
        portfolioPreferencesForm.value = {
            driftThresholdPercent: preferences.driftThresholdPercent,
            drawdownThresholdPercent:
                preferences.drawdownThresholdPercent,
            alertsEnabled: preferences.alertsEnabled,
        };
        periodDataCache.clear(); // benchmark may have changed, all keys stale
        await loadPortfolioData({ force: true });
        await loadAccountComparison();
    } catch (error) {
        console.error("Failed to save portfolio settings:", error);
        showError("Error", "Failed to save portfolio settings");
    } finally {
        savingPortfolioSettings.value = false;
    }
}

function rebalanceActionLabel(position) {
    if (position.driftPercent === null || position.driftPercent === undefined) {
        return "Target not set";
    }

    if (Math.abs(position.driftPercent) < portfolioPreferencesForm.value.driftThresholdPercent) {
        return "Inside threshold";
    }

    if (position.action === "buy") return "Under target";
    if (position.action === "sell") return "Over target";
    return "On target";
}

async function setComparisonAccount(accountValue) {
    setAccount(accountValue);
}

async function saveTargetAllocation(position) {
    if (!position.holdingId) return;

    try {
        const draftValue = targetAllocationDrafts.value[position.symbol];
        await investmentsStore.updateHolding(position.holdingId, {
            targetAllocationPercent:
                draftValue === "" || draftValue === null
                    ? null
                    : Number(draftValue),
        });
        periodDataCache.clear();
        await loadPortfolioData({ force: true });
    } catch (error) {
        console.error("Failed to save target allocation:", error);
        showError("Error", "Failed to save target allocation");
    }
}

// Watchlist functions
async function openWatchlistModal(analysis) {
    symbolToAddToWatchlist.value = analysis.symbol;
    showWatchlistModal.value = true;
    selectedWatchlistId.value = null;
    await loadWatchlists();
}

function closeWatchlistModal() {
    showWatchlistModal.value = false;
    symbolToAddToWatchlist.value = "";
    selectedWatchlistId.value = null;
}

async function loadWatchlists() {
    watchlistsLoading.value = true;
    try {
        const response = await api.get("/watchlists");
        watchlists.value = response.data.data || [];
        // Auto-select default watchlist if available
        const defaultWatchlist = watchlists.value.find((w) => w.is_default);
        if (defaultWatchlist) {
            selectedWatchlistId.value = defaultWatchlist.id;
        }
    } catch (error) {
        console.error("Error loading watchlists:", error);
        showError("Error", "Failed to load watchlists");
    } finally {
        watchlistsLoading.value = false;
    }
}

async function addToWatchlist() {
    if (!selectedWatchlistId.value || !symbolToAddToWatchlist.value) return;

    addingToWatchlist.value = true;
    try {
        await api.post(`/watchlists/${selectedWatchlistId.value}/items`, {
            symbol: symbolToAddToWatchlist.value,
        });
        const watchlistName =
            watchlists.value.find((w) => w.id === selectedWatchlistId.value)
                ?.name || "watchlist";
        showSuccess(
            "Added to Watchlist",
            `${symbolToAddToWatchlist.value} has been added to ${watchlistName}`,
        );
        closeWatchlistModal();
    } catch (error) {
        console.error("Error adding to watchlist:", error);
        if (
            error.response?.data?.error?.includes("already in this watchlist")
        ) {
            showError(
                "Already in Watchlist",
                `${symbolToAddToWatchlist.value} is already in this watchlist`,
            );
        } else {
            showError("Error", "Failed to add symbol to watchlist");
        }
    } finally {
        addingToWatchlist.value = false;
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
    }).format(value);
}

function formatNumber(value) {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    }).format(value);
}

function formatPercent(value, showSign = true) {
    if (value === null || value === undefined) return "";
    const sign = showSign && value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}

function formatMetric(value, decimals = 2) {
    if (value === null || value === undefined) return "N/A";
    return Number(value).toFixed(decimals);
}

function formatDate(date) {
    if (!date) return "";
    return format(new Date(date), "MMM d, yyyy");
}

function formatDateTime(date) {
    if (!date) return "";
    return format(new Date(date), "MMM d, h:mm a");
}
</script>
