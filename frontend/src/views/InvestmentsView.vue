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
                    @click="activeTab = 'income'"
                    :class="[
                        'py-4 px-1 border-b-2 font-medium text-sm',
                        activeTab === 'income'
                            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
                    ]"
                >
                    Income
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
                    <div class="flex-1">
                        <SymbolAutocomplete
                            v-model="searchSymbol"
                            placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
                            input-class="w-full py-3 text-base"
                            @select="onScreenerSelect"
                        />
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
            <div v-if="investmentsStore.currentAnalysis" class="mb-6 space-y-6">
                <!-- DCF Valuation Calculator (above 8 Pillars) -->
                <StockAnalyzerSection
                    v-if="investmentsStore.currentAnalysis.type !== 'crypto'"
                    :symbol="investmentsStore.currentAnalysis.symbol"
                    :current-price="investmentsStore.currentAnalysis.currentPrice"
                    :pending-valuation-id="pendingValuationId"
                    :analyzer-loading="investmentsStore.analysisLoading"
                    @select-symbol="handleAnalyzerSymbolSelect"
                    @pending-consumed="pendingValuationId = null"
                />

                <EightPillarsCard
                    :analysis="investmentsStore.currentAnalysis"
                    @view-details="viewAnalysisDetails"
                    @add-to-holdings="addToHoldings"
                    @add-to-watchlist="openWatchlistModal"
                />

                <!-- Key Metrics summary card (between Pillars and Financial Statements) -->
                <KeyMetricsCard
                    v-if="investmentsStore.currentAnalysis.type !== 'crypto'"
                    :metrics="investmentsStore.dcfMetrics"
                />

                <!-- Financial Statements Section (only for stocks, not crypto) -->
                <div
                    v-if="investmentsStore.currentAnalysis.type !== 'crypto'"
                >
                    <FinancialStatementTabs
                        :symbol="investmentsStore.currentAnalysis.symbol"
                    />
                </div>
            </div>

            <!-- Saved Valuations (visible even with no current analysis) -->
            <StockAnalyzerSection
                v-else
                :symbol="selectedDcfSymbol"
                :current-price="null"
                :pending-valuation-id="pendingValuationId"
                :analyzer-loading="investmentsStore.analysisLoading"
                class="mb-6"
                @select-symbol="handleAnalyzerSymbolSelect"
                @pending-consumed="pendingValuationId = null"
            />

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

                <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 mb-6 items-start">
                    <div class="space-y-6 min-w-0">
                    <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 class="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <span>Portfolio vs</span>
                                    <input
                                        v-if="editingBenchmark"
                                        ref="benchmarkInput"
                                        v-model="benchmarkSymbol"
                                        @blur="commitBenchmarkEdit"
                                        @keydown.enter.prevent="commitBenchmarkEdit"
                                        @keydown.escape.prevent="cancelBenchmarkEdit"
                                        type="text"
                                        maxlength="6"
                                        class="px-2 py-0.5 w-24 text-lg font-medium uppercase border border-primary-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                                    />
                                    <button
                                        v-else
                                        type="button"
                                        @click="startBenchmarkEdit"
                                        :disabled="savingPortfolioSettings"
                                        class="px-1 -mx-1 rounded underline decoration-dotted decoration-gray-400 underline-offset-4 hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Click to change benchmark"
                                    >
                                        {{ benchmarkSymbol }}
                                    </button>
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
                                <button
                                    @click="refreshPortfolioData"
                                    :disabled="investmentsStore.loading"
                                    class="ml-2 btn-secondary text-xs px-2.5 py-1.5"
                                >
                                    {{ investmentsStore.loading ? "Refreshing..." : "Refresh" }}
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
                    <!-- Allocation table fills the space beside the tall sidebar -->
                <div
                    v-if="investmentsStore.portfolioPositions.length > 0"
                    class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
                >
                    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4">
                        <div>
                            <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                                Allocation and Rebalancing
                            </h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Advisory only. Share deltas are suggestions, not broker-ready orders.
                            </p>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <div
                                v-if="pricesUpdating && pendingPriceCount > 0"
                                class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                            >
                                <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-500 border-t-transparent"></div>
                                <span>Updating prices ({{ pendingPriceCount }} remaining)…</span>
                            </div>
                            <button
                                v-if="dirtyTargetSymbols.length > 0"
                                @click="saveAllTargetAllocations"
                                :disabled="targetSaving"
                                class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {{ targetSaving ? "Saving…" : `Save all (${dirtyTargetSymbols.length})` }}
                            </button>
                        </div>
                    </div>
                    <!-- Targets are normalized to 100% before drift is computed;
                         warn when the entered targets don't already sum to 100%. -->
                    <div
                        v-if="targetsNeedNormalizing"
                        class="mx-6 mt-4 rounded-md border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <p class="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                                Your targets add up to {{ formatPercent(targetTotalPercent, false) }}, not 100%.
                            </p>
                            <button
                                @click="normalizeTargetAllocations"
                                :disabled="targetSaving"
                                class="text-xs px-2.5 py-1 rounded border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-gray-800 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 disabled:opacity-50 whitespace-nowrap"
                            >
                                {{ targetSaving ? "Saving…" : "Normalize" }}
                            </button>
                        </div>
                        <p class="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
                            Drift, share deltas, and trade values are measured against normalized weights —
                            each target is scaled to {{ Math.round(targetScalePercent) }}% of what you entered<template v-if="targetNormalizationExample">, so {{ targetNormalizationExample.symbol }}'s {{ formatPercent(targetNormalizationExample.raw, false) }} target counts as {{ formatPercent(targetNormalizationExample.normalized, false) }}</template>.
                            Adjust your targets to total 100% — or click Normalize to save the scaled weights as your new targets.
                        </p>
                    </div>

                    <!-- Cash flow + realized P&L if every suggested trade in the Allocation
                         table below were executed. Lets the user check feasibility (will
                         the sells cover the buys, or is fresh cash required?) before
                         placing orders. -->
                    <div
                        v-if="rebalanceImpact.hasTrades"
                        class="mx-6 mt-4 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4"
                    >
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Buy total</p>
                                <p class="text-sm font-semibold text-red-600 mt-0.5">
                                    -{{ formatCurrency(rebalanceImpact.cashToBuy) }}
                                </p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Cash needed</p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Sell proceeds</p>
                                <p class="text-sm font-semibold text-green-600 mt-0.5">
                                    +{{ formatCurrency(rebalanceImpact.cashFromSells) }}
                                </p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Cash released</p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Net cash</p>
                                <p
                                    class="text-sm font-semibold mt-0.5"
                                    :class="rebalanceImpact.selfFunded ? 'text-green-600' : 'text-red-600'"
                                >
                                    <template v-if="rebalanceImpact.selfFunded">Self-funded</template>
                                    <template v-else>Need {{ formatCurrency(rebalanceImpact.additionalCashNeeded) }}</template>
                                </p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    <template v-if="rebalanceImpact.selfFunded && rebalanceImpact.excessCash > 0">
                                        {{ formatCurrency(rebalanceImpact.excessCash) }} excess after trades
                                    </template>
                                    <template v-else-if="rebalanceImpact.selfFunded">
                                        Sells exactly cover buys
                                    </template>
                                    <template v-else>
                                        Additional funds required
                                    </template>
                                </p>
                            </div>
                            <div>
                                <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Realized P&amp;L</p>
                                <p
                                    class="text-sm font-semibold mt-0.5"
                                    :class="rebalanceImpact.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'"
                                >
                                    {{ rebalanceImpact.realizedPnl >= 0 ? '+' : '' }}{{ formatCurrency(rebalanceImpact.realizedPnl) }}
                                </p>
                                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">If all sells execute</p>
                            </div>
                        </div>
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
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-help" title="Cash impact of rebalancing: what buying would cost you (shown negative) or what selling would bring in (shown positive)">
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
                                                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span class="text-sm font-medium text-gray-900 dark:text-white">
                                                        {{ position.symbol }}
                                                    </span>
                                                    <span
                                                        class="inline-flex shrink-0 items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
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
                                        <div class="flex items-center justify-end gap-1.5">
                                            <div
                                                v-if="position.priceStale && pricesUpdating"
                                                class="animate-spin rounded-full h-3 w-3 border-2 border-primary-500 border-t-transparent"
                                                title="Fetching the latest price…"
                                            ></div>
                                            <span>{{ position.currentValue === null ? "—" : formatCurrency(position.currentValue) }}</span>
                                        </div>
                                        <div class="text-xs text-gray-500 dark:text-gray-400">
                                            {{ formatCurrency(position.averageCostBasis) }} avg
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {{ formatPercent(position.actualAllocationPercent, false) }}
                                    </td>
                                    <td class="px-6 py-4 text-right text-sm">
                                        <div class="flex items-center justify-end gap-2">
                                            <input
                                                v-model="targetAllocationDrafts[position.symbol]"
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                class="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-right focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                                            />
                                            <span
                                                v-if="savedTargets[position.symbol]"
                                                class="text-xs font-medium text-green-600 dark:text-green-400"
                                            >
                                                Saved
                                            </span>
                                            <button
                                                v-else
                                                @click="saveTargetAllocation(position)"
                                                :disabled="targetSaving"
                                                class="text-xs text-primary-600 hover:text-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Save
                                            </button>
                                        </div>
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
                                    <!-- Cash impact, not delta-to-target: buying spends cash
                                         (negative/red), selling brings cash in (positive/green). -->
                                    <td
                                        :class="[
                                            'px-6 py-4 text-right text-sm font-medium',
                                            position.valueDelta < 0 ? 'text-green-600' : position.valueDelta > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100',
                                        ]"
                                    >
                                        <span v-if="position.valueDelta !== null">
                                            {{ position.valueDelta < 0 ? '+' : '' }}{{ formatCurrency(-position.valueDelta) }}
                                            <span class="block text-xs font-normal text-gray-400 dark:text-gray-500">
                                                {{ position.valueDelta > 0 ? 'cost' : position.valueDelta < 0 ? 'proceeds' : '' }}
                                            </span>
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
                                            v-if="position.holdingId && !position.includesOpenTrades && !position.hasPlaidLots"
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
                    </div>
                    <aside class="space-y-4">
                        <section class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <div class="flex items-center justify-between gap-2">
                                    <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
                                        Account Comparison
                                    </h2>
                                    <div
                                        v-if="accountComparisonLoading"
                                        class="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent"
                                    ></div>
                                </div>
                                <div
                                    v-if="selectedComparisonAccounts.size > 0"
                                    class="flex flex-wrap items-center justify-between gap-2 mt-2"
                                >
                                    <span
                                        v-if="inCompareMode"
                                        class="text-[11px] text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-full px-2 py-0.5 whitespace-nowrap"
                                    >
                                        Comparing {{ selectedComparisonAccounts.size }}
                                    </span>
                                    <span v-else class="text-[11px] text-gray-500 dark:text-gray-400">
                                        1 selected
                                    </span>
                                    <div class="flex items-center gap-3 ml-auto">
                                        <button
                                            v-if="inCompareMode"
                                            type="button"
                                            @click="openFullCompare"
                                            class="text-[11px] text-primary-600 hover:text-primary-800 whitespace-nowrap font-medium"
                                        >
                                            Compare in full →
                                        </button>
                                        <button
                                            type="button"
                                            @click="clearComparisonSelection"
                                            class="text-[11px] text-primary-600 hover:text-primary-800 whitespace-nowrap"
                                        >
                                            Back to all
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Compare view: side-by-side metrics with delta vs leader.
                                 Always shown above the row list so the user can keep adding/removing
                                 accounts while seeing the comparison update live. -->
                            <div v-if="inCompareMode && selectedComparisonRows.length >= 2" class="overflow-x-auto border-b border-gray-200 dark:border-gray-700">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                                    <thead class="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th class="px-3 py-2 text-left text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                Metric
                                            </th>
                                            <th
                                                v-for="row in selectedComparisonRows"
                                                :key="row.value"
                                                class="px-3 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                            >
                                                <div class="text-gray-900 dark:text-white normal-case font-medium">
                                                    {{ row.label }}
                                                </div>
                                                <div v-if="row.isLeader" class="text-[10px] text-primary-600 dark:text-primary-400 normal-case font-normal">
                                                    leader
                                                </div>
                                            </th>
                                            <th
                                                v-if="isPairCompare"
                                                class="px-3 py-2 text-right text-[11px] font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                                :title="`Difference: ${pairDifferenceRow.label} minus leader`"
                                            >
                                                Difference
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr>
                                            <td class="px-3 py-2 text-gray-700 dark:text-gray-300">Return</td>
                                            <td
                                                v-for="row in selectedComparisonRows"
                                                :key="row.value"
                                                class="px-3 py-2 text-right"
                                            >
                                                <span
                                                    :class="row.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'"
                                                    class="font-medium"
                                                >
                                                    {{ formatPercent(row.totalReturnPercent) }}
                                                </span>
                                                <span
                                                    v-if="!row.isLeader && !isPairCompare"
                                                    :class="row.returnDelta >= 0 ? 'text-green-600' : 'text-red-600'"
                                                    class="block text-[10px]"
                                                >
                                                    {{ row.returnDelta >= 0 ? '+' : '' }}{{ row.returnDelta.toFixed(2) }}%
                                                </span>
                                            </td>
                                            <td
                                                v-if="isPairCompare"
                                                class="px-3 py-2 text-right font-medium"
                                                :class="pairDifferenceRow.returnDelta >= 0 ? 'text-green-600' : 'text-red-600'"
                                            >
                                                {{ pairDifferenceRow.returnDelta >= 0 ? '+' : '' }}{{ pairDifferenceRow.returnDelta.toFixed(2) }}%
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class="px-3 py-2 text-gray-700 dark:text-gray-300">Value</td>
                                            <td
                                                v-for="row in selectedComparisonRows"
                                                :key="row.value"
                                                class="px-3 py-2 text-right text-gray-900 dark:text-gray-100"
                                            >
                                                <span class="font-medium">{{ formatCurrency(row.totalValue) }}</span>
                                                <span
                                                    v-if="!row.isLeader && !isPairCompare"
                                                    class="block text-[10px] text-gray-500 dark:text-gray-400"
                                                >
                                                    {{ row.valueDelta >= 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(row.valueDelta)) }}
                                                </span>
                                            </td>
                                            <td
                                                v-if="isPairCompare"
                                                class="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300"
                                            >
                                                {{ pairDifferenceRow.valueDelta >= 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(pairDifferenceRow.valueDelta)) }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class="px-3 py-2 text-gray-700 dark:text-gray-300">Positions</td>
                                            <td
                                                v-for="row in selectedComparisonRows"
                                                :key="row.value"
                                                class="px-3 py-2 text-right text-gray-900 dark:text-gray-100"
                                            >
                                                <span class="font-medium">{{ row.positionCount }}</span>
                                                <span
                                                    v-if="!row.isLeader && !isPairCompare"
                                                    class="block text-[10px] text-gray-500 dark:text-gray-400"
                                                >
                                                    {{ row.positionsDelta >= 0 ? '+' : '' }}{{ row.positionsDelta }}
                                                </span>
                                            </td>
                                            <td
                                                v-if="isPairCompare"
                                                class="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300"
                                            >
                                                {{ pairDifferenceRow.positionsDelta >= 0 ? '+' : '' }}{{ pairDifferenceRow.positionsDelta }}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class="px-3 py-2 text-gray-700 dark:text-gray-300">Max Drift</td>
                                            <td
                                                v-for="row in selectedComparisonRows"
                                                :key="row.value"
                                                class="px-3 py-2 text-right text-gray-900 dark:text-gray-100"
                                            >
                                                <span class="font-medium">
                                                    {{ row.maxDriftPercent === null ? 'N/A' : formatPercent(row.maxDriftPercent) }}
                                                </span>
                                                <span
                                                    v-if="!row.isLeader && !isPairCompare && row.driftDelta !== null"
                                                    :class="row.driftDelta <= 0 ? 'text-green-600' : 'text-red-600'"
                                                    class="block text-[10px]"
                                                >
                                                    {{ row.driftDelta >= 0 ? '+' : '' }}{{ row.driftDelta.toFixed(2) }}%
                                                </span>
                                            </td>
                                            <td
                                                v-if="isPairCompare"
                                                class="px-3 py-2 text-right font-medium"
                                                :class="pairDifferenceRow.driftDelta === null ? 'text-gray-500 dark:text-gray-400' : pairDifferenceRow.driftDelta <= 0 ? 'text-green-600' : 'text-red-600'"
                                            >
                                                <template v-if="pairDifferenceRow.driftDelta === null">—</template>
                                                <template v-else>{{ pairDifferenceRow.driftDelta >= 0 ? '+' : '' }}{{ pairDifferenceRow.driftDelta.toFixed(2) }}%</template>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- Row list: always rendered when data exists, so the user can
                                 add or remove accounts from the comparison set at any time. -->
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
                                            :class="[
                                                'cursor-pointer transition-colors',
                                                selectedComparisonAccounts.has(row.value)
                                                    ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/60 border-l-4 border-transparent',
                                            ]"
                                            @click="toggleComparisonAccount(row.value)"
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
                                <div>
                                    <div class="mb-2">
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Alert thresholds
                                        </p>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Holdings crossing these limits show under Active now and trigger notifications.
                                        </p>
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
                                            <p
                                                v-if="investmentsStore.portfolioAlertSummary"
                                                class="text-[10px] text-gray-500 dark:text-gray-400 mt-1"
                                            >
                                                Saved: {{ formatPercent(investmentsStore.portfolioAlertSummary.driftThresholdPercent, false) }}
                                            </p>
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
                                            <p
                                                v-if="investmentsStore.portfolioAlertSummary"
                                                class="text-[10px] text-gray-500 dark:text-gray-400 mt-1"
                                            >
                                                Saved: {{ formatPercent(investmentsStore.portfolioAlertSummary.drawdownThresholdPercent, false) }}
                                            </p>
                                        </div>
                                    </div>
                                    <label class="flex items-start gap-2 mt-3">
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
                                        class="btn-primary w-full text-sm mt-3"
                                    >
                                        {{ savingPortfolioSettings ? "Saving..." : "Save Alert Settings" }}
                                    </button>
                                </div>

                                <div>
                                    <div class="mb-2">
                                        <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Active now
                                        </p>
                                        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Holdings currently breaching your thresholds. Updated live each time you open this page.
                                        </p>
                                    </div>
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
                                </div>

                                <div v-if="investmentsStore.portfolioAlertSummary?.recentAlerts?.length">
                                    <div class="flex items-start justify-between gap-3 mb-2">
                                        <div>
                                            <p class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                Recent alerts
                                            </p>
                                            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                Notifications previously sent. Values shown are from when each alert fired, not today.
                                            </p>
                                        </div>
                                        <router-link
                                            to="/notifications"
                                            class="text-[11px] text-primary-600 hover:text-primary-800 whitespace-nowrap"
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
                    </aside>
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

        <!-- Income Tab -->
        <div v-if="activeTab === 'income'">
            <IncomeAnalytics />
        </div>

        <!-- Stock Analyzer Tab (DCF Valuation) -->
        <div v-if="activeTab === 'analyzer'">
            <!-- Search Bar -->
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6"
            >
                <div class="flex items-center space-x-4">
                    <div class="flex-1">
                        <SymbolAutocomplete
                            v-model="analyzerSymbol"
                            placeholder="Enter stock symbol to analyze (e.g., AAPL, MSFT)"
                            input-class="w-full py-3 text-base"
                            @select="onAnalyzerSelect"
                        />
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

            <!-- DCF Valuation Section (always renders so saved valuations
                 stay visible even before a symbol is loaded) -->
            <StockAnalyzerSection
                :symbol="analyzerSymbol"
                :current-price="analyzerStockInfo?.currentPrice"
                :pending-valuation-id="pendingValuationId"
                :analyzer-loading="analyzerLoading"
                @select-symbol="handleAnalyzerSymbolSelect"
                @pending-consumed="pendingValuationId = null"
            />
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
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useInvestmentsStore } from "@/stores/investments";
import { useNotification } from "@/composables/useNotification";
import { format } from "date-fns";
import api from "@/services/api";
import EightPillarsCard from "@/components/investments/EightPillarsCard.vue";
import KeyMetricsCard from "@/components/investments/KeyMetricsCard.vue";
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
import IncomeAnalytics from "@/components/investments/IncomeAnalytics.vue";

const router = useRouter();
const route = useRoute();
const investmentsStore = useInvestmentsStore();
const scannerStore = useScannerStore();
const { showSuccess, showError } = useNotification();
const { selectedAccount, selectedAccountLabel, accounts, fetchAccounts, setAccount, clearAccount } =
    useGlobalAccountFilter();

// Valid tab names
const validTabs = ["screener", "holdings", "scanner", "income"];

// Initialize tab from URL or default to 'screener'
// Legacy 'analyzer' tab is now merged into 'screener'
const getInitialTab = () => {
    const urlTab = route.query.tab;
    if (urlTab === "analyzer") return "screener";
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
const editingBenchmark = ref(false);
const benchmarkInput = ref(null);
// Stored when entering edit mode so Escape can revert.
let benchmarkBeforeEdit = "";
const savingPortfolioSettings = ref(false);
const targetAllocationDrafts = ref({});
const targetSaving = ref(false);
const savedTargets = ref({}); // symbol -> true, shown briefly after a successful save
const savedTargetTimers = {};
const portfolioLoadedAt = ref(null);
// Live price streaming: positions render immediately with cached prices, then
// we poll until the backend has filled in fresh quotes for every stale symbol.
const PRICE_POLL_INTERVAL_MS = 3000;
const PRICE_POLL_MAX_MS = 90 * 1000; // give up after this so we never poll forever
let pricePollTimer = null;
let pricePollStartedAt = 0;
// Stall detection: if the number of positions awaiting a quote stops dropping
// for a few polls, the remaining symbols simply can't be quoted (delisted,
// unsupported, no API key, etc.) — stop polling rather than spin indefinitely.
const PRICE_POLL_MAX_STALLS = 3;
let pricePollStallCount = 0;
let pricePollLastPending = 0;
const pricesUpdating = ref(false);
const accountComparisonRows = ref([]);
// Local multi-select for the Account Comparison panel. Decoupled from the global
// account filter so multi-select doesn't propagate to pages that only handle a
// single account value.
const selectedComparisonAccounts = ref(new Set());
const inCompareMode = computed(() => selectedComparisonAccounts.value.size >= 2);
const selectedComparisonRows = computed(() => {
    if (!inCompareMode.value) return [];
    const ordered = accountComparisonRows.value.filter((row) =>
        selectedComparisonAccounts.value.has(row.value),
    );
    if (ordered.length === 0) return [];
    let leaderIndex = 0;
    ordered.forEach((row, idx) => {
        if (row.totalReturnPercent > ordered[leaderIndex].totalReturnPercent) {
            leaderIndex = idx;
        }
    });
    const leader = ordered[leaderIndex];
    return ordered.map((row, idx) => {
        const isLeader = idx === leaderIndex;
        const driftDelta =
            row.maxDriftPercent === null || leader.maxDriftPercent === null
                ? null
                : Number(row.maxDriftPercent) - Number(leader.maxDriftPercent);
        return {
            ...row,
            isLeader,
            returnDelta: Number(row.totalReturnPercent) - Number(leader.totalReturnPercent),
            valueDelta: Number(row.totalValue) - Number(leader.totalValue),
            positionsDelta: Number(row.positionCount) - Number(leader.positionCount),
            driftDelta,
        };
    });
});

// True when exactly two accounts are being compared — that's the case where
// a single "Difference" column makes sense. With 3+ selected, deltas stay
// inline beneath each non-leader value instead.
const isPairCompare = computed(() => selectedComparisonRows.value.length === 2);

// The non-leader row in a pair compare, used to populate the Difference column.
const pairDifferenceRow = computed(() =>
    isPairCompare.value ? selectedComparisonRows.value.find((row) => !row.isLeader) : null,
);
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

// DCF analyzer state (now part of screener flow)
const pendingValuationId = ref(null);
const selectedDcfSymbol = ref("");

const filteredSearchHistory = computed(() => {
    if (showFavoritesOnly.value) {
        return investmentsStore.searchHistory.filter((h) => h.isFavorite);
    }
    return investmentsStore.searchHistory;
});
const rebalanceRows = computed(
    () => investmentsStore.portfolioRebalance?.positions || [],
);

// A target input is "dirty" when its draft differs from the saved server value.
// Used to drive the "Save all" button and to preserve unsaved edits across the
// reload that follows a single-row save.
const dirtyTargetSymbols = computed(() => {
    return rebalanceRows.value
        .filter((row) => {
            const draft = targetAllocationDrafts.value[row.symbol];
            if (draft === undefined) return false;
            const draftNorm = draft === "" || draft === null ? "" : Number(draft);
            const serverNorm =
                row.targetAllocationPercent === null || row.targetAllocationPercent === undefined
                    ? ""
                    : Number(row.targetAllocationPercent);
            return String(draftNorm) !== String(serverNorm);
        })
        .map((row) => row.symbol);
});

// Sum of all entered targets. The backend normalizes these to 100% before
// computing drift/share deltas, so when this isn't ~100% the displayed target
// differs from the one actually used — we warn about that.
const targetTotalPercent = computed(
    () => investmentsStore.portfolioRebalance?.targetTotalPercent ?? 0,
);
const targetsNeedNormalizing = computed(() => {
    const total = targetTotalPercent.value;
    return total > 0 && Math.abs(total - 100) > 0.5;
});

// Aggregate cash flow and realized P&L the user would incur if they executed
// every suggested trade in the Allocation table. Positive valueDelta = position
// is over target = sell (cash IN). Negative valueDelta = under target = buy
// (cash OUT). Realized P&L is computed per-sell from current price minus the
// position's average cost basis.
const rebalanceImpact = computed(() => {
    const positions = rebalanceRows.value || [];
    let cashToBuy = 0;
    let cashFromSells = 0;
    let realizedPnl = 0;

    for (const position of positions) {
        const valueDelta = Number(position.valueDelta);
        if (!Number.isFinite(valueDelta) || valueDelta === 0) continue;
        if (valueDelta > 0) {
            cashToBuy += valueDelta;
        } else {
            const proceeds = -valueDelta;
            cashFromSells += proceeds;
            const sharesToSell = Math.abs(Number(position.shareDelta) || 0);
            const totalShares = Number(position.totalShares) || 0;
            const currentValue = Number(position.currentValue) || 0;
            const avgCostBasis = Number(position.averageCostBasis);
            if (sharesToSell > 0 && totalShares > 0 && Number.isFinite(avgCostBasis)) {
                const pricePerShare = currentValue / totalShares;
                realizedPnl += sharesToSell * (pricePerShare - avgCostBasis);
            }
        }
    }

    return {
        cashToBuy,
        cashFromSells,
        hasTrades: cashToBuy > 0 || cashFromSells > 0,
        selfFunded: cashFromSells >= cashToBuy,
        additionalCashNeeded: Math.max(0, cashToBuy - cashFromSells),
        excessCash: Math.max(0, cashFromSells - cashToBuy),
        realizedPnl,
    };
});

function startBenchmarkEdit() {
    benchmarkBeforeEdit = benchmarkSymbol.value;
    editingBenchmark.value = true;
    nextTick(() => {
        benchmarkInput.value?.focus();
        benchmarkInput.value?.select();
    });
}

function cancelBenchmarkEdit() {
    benchmarkSymbol.value = benchmarkBeforeEdit;
    editingBenchmark.value = false;
}

// Commit the inline benchmark edit. Reverts on empty/unchanged input;
// otherwise normalizes to uppercase and triggers savePortfolioSettings
// which already persists benchmark + alert thresholds together.
async function commitBenchmarkEdit() {
    if (!editingBenchmark.value) return;
    editingBenchmark.value = false;
    const next = (benchmarkSymbol.value || "").trim().toUpperCase();
    if (!next || next === benchmarkBeforeEdit) {
        benchmarkSymbol.value = benchmarkBeforeEdit;
        return;
    }
    benchmarkSymbol.value = next;
    await savePortfolioSettings();
}
// What fraction of each entered target is actually applied, as a percent
// (targets summing to 200% are each scaled to 50% of their value).
const targetScalePercent = computed(() => {
    const total = targetTotalPercent.value;
    return total > 0 ? (100 / total) * 100 : 100;
});
// A concrete row to illustrate the scaling in the warning banner.
const targetNormalizationExample = computed(() => {
    const row = rebalanceRows.value.find(
        (r) =>
            r.targetAllocationPercent !== null &&
            r.targetAllocationPercent !== undefined &&
            r.normalizedTargetPercent !== null &&
            r.normalizedTargetPercent !== undefined,
    );
    if (!row) return null;
    return {
        symbol: row.symbol,
        raw: row.targetAllocationPercent,
        normalized: row.normalizedTargetPercent,
    };
});
const portfolioOverviewReturn = computed(
    () => investmentsStore.portfolioOverview?.totalReturn || 0,
);
// Number of positions still waiting on a fresh quote from the API. Drives the
// "Updating prices" indicator and tells the poll loop when it can stop.
const pendingPriceCount = computed(
    () => (investmentsStore.portfolioPositions || []).filter((position) => position.priceStale).length,
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

// Rebuild the draft map from server data. With `preserveEdits`, any input the
// user has changed but not yet saved (draft differs from the incoming server
// value) is kept instead of being overwritten — this is what stops a single
// row's Save from clearing the other rows' pending edits.
// `preserveEdits` keeps in-progress (unsaved) edits in other rows when one row
// is refreshed. `forceSymbols` overrides that for symbols we just persisted —
// their entry boxes must snap to the authoritative server value (e.g. the
// scaled weights produced by Normalize), even though that differs from the
// pre-save draft.
function syncTargetAllocationDrafts(positions = [], { preserveEdits = false, forceSymbols = null } = {}) {
    const prevDrafts = targetAllocationDrafts.value;
    const nextDrafts = {};
    positions.forEach((position) => {
        const serverValue = position.targetAllocationPercent ?? "";
        const currentDraft = prevDrafts[position.symbol];
        const draftDiffers =
            currentDraft !== undefined && String(currentDraft) !== String(serverValue);
        const forced = forceSymbols ? forceSymbols.has(position.symbol) : false;
        nextDrafts[position.symbol] =
            !forced && preserveEdits && draftDiffers ? currentDraft : serverValue;
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
async function loadPortfolioData({ force = false, periodOnly = false, preserveTargetEdits = false } = {}) {
    const cacheKey = buildCacheKey();
    // Cancel any in-flight poll; we'll restart it below if the freshly-loaded
    // data still has stale quotes.
    if (!periodOnly) stopPricePolling();

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
                syncTargetAllocationDrafts(cached.positions || [], { preserveEdits: preserveTargetEdits });
                maybeStartPricePolling();
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
        syncTargetAllocationDrafts(positions, { preserveEdits: preserveTargetEdits });
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

    if (!periodOnly) {
        maybeStartPricePolling();
    }
}

function stopPricePolling() {
    if (pricePollTimer) {
        clearTimeout(pricePollTimer);
        pricePollTimer = null;
    }
    pricesUpdating.value = false;
}

// Poll the portfolio endpoints (silently) until every position has a fresh
// quote, then stop. This is what makes prices "stream in" after the table has
// already rendered with whatever was cached.
function maybeStartPricePolling() {
    stopPricePolling();

    if (activeTab.value !== "holdings" || pendingPriceCount.value === 0) {
        return;
    }

    pricesUpdating.value = true;
    pricePollStartedAt = Date.now();
    pricePollStallCount = 0;
    pricePollLastPending = pendingPriceCount.value;
    pricePollTimer = setTimeout(runPricePoll, PRICE_POLL_INTERVAL_MS);
}

async function runPricePoll() {
    // Bail if the user navigated away from the Holdings tab.
    if (activeTab.value !== "holdings") {
        stopPricePolling();
        return;
    }

    const params = buildPortfolioParams();
    try {
        await Promise.allSettled([
            investmentsStore.fetchPortfolioOverview(params, { silent: true }),
            investmentsStore.fetchPortfolioPositions(params, { silent: true }),
            investmentsStore.fetchPortfolioRebalance(params, { silent: true }),
        ]);

        // Keep the period cache in sync so switching periods/tabs shows the
        // streamed-in prices rather than the original stale snapshot.
        const cacheKey = buildCacheKey();
        const prev = periodDataCache.get(cacheKey) || {};
        periodDataCache.set(cacheKey, {
            ...prev,
            fetchedAt: Date.now(),
            overview: investmentsStore.portfolioOverview,
            positions: investmentsStore.portfolioPositions,
            rebalance: investmentsStore.portfolioRebalance,
        });
        portfolioLoadedAt.value = new Date();
    } catch (error) {
        // Ignore transient poll errors; we'll try again on the next tick.
        console.warn("[INVESTMENTS] Price poll failed:", error);
    }

    // Track whether we're still making progress. No drop in pending count means
    // the remaining symbols aren't resolving.
    const pending = pendingPriceCount.value;
    if (pending >= pricePollLastPending) {
        pricePollStallCount += 1;
    } else {
        pricePollStallCount = 0;
    }
    pricePollLastPending = pending;

    const timedOut = Date.now() - pricePollStartedAt > PRICE_POLL_MAX_MS;
    const stalled = pricePollStallCount >= PRICE_POLL_MAX_STALLS;
    if (pending === 0 || timedOut || stalled || activeTab.value !== "holdings") {
        stopPricePolling();
        return;
    }

    pricePollTimer = setTimeout(runPricePoll, PRICE_POLL_INTERVAL_MS);
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
        pruneComparisonSelection();
    } catch (error) {
        console.error("Failed to load account comparison:", error);
        accountComparisonRows.value = [];
        pruneComparisonSelection();
    } finally {
        accountComparisonLoading.value = false;
    }
}

// Drop any selected account values that no longer appear in the comparison rows
// (e.g. after a refresh removed them). Keeps the local set in sync with the
// table without surprising the user.
function pruneComparisonSelection() {
    if (selectedComparisonAccounts.value.size === 0) return;
    const visible = new Set(accountComparisonRows.value.map((row) => row.value));
    const next = new Set();
    for (const value of selectedComparisonAccounts.value) {
        if (visible.has(value)) next.add(value);
    }
    if (next.size !== selectedComparisonAccounts.value.size) {
        selectedComparisonAccounts.value = next;
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
        restoreComparisonSelectionFromQuery();
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

    if (newTab !== "holdings") {
        stopPricePolling();
    }

    if (newTab === "scanner") {
        await loadScannerData();
    }

    if (newTab === "holdings") {
        await loadPortfolioData(); // cached — instant if still fresh
        await loadAccountComparison();
    }
});

onBeforeUnmount(() => {
    stopPricePolling();
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

// Loading a saved valuation for a different symbol switches the screener
// to that stock so the DCF analyzer, 8 Pillars, and financials all reload.
async function handleAnalyzerSymbolSelect({ symbol, valuationId }) {
    if (!symbol) return;
    pendingValuationId.value = valuationId || null;
    activeTab.value = "screener";
    searchSymbol.value = symbol;
    await analyzeSymbol();
}

async function analyzeSymbol() {
    if (!searchSymbol.value) return;
    const symbol = searchSymbol.value.toUpperCase();
    selectedDcfSymbol.value = symbol;
    investmentsStore.clearAnalysis();

    try {
        // Always force refresh when user explicitly clicks Analyze button
        await investmentsStore.analyzeStock(
            symbol,
            true,
        );
        await investmentsStore.fetchSearchHistory();
    } catch (error) {
        console.error("Analysis failed:", error.response?.data || error);
    }
}

async function analyzeFromHistory(symbol) {
    searchSymbol.value = symbol;
    await analyzeSymbol();
}

async function onScreenerSelect(item) {
    searchSymbol.value = item.symbol;
    await analyzeSymbol();
}

async function onAnalyzerSelect(item) {
    analyzerSymbol.value = item.symbol;
    await loadAnalyzerData();
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
    if (position.hasPlaidLots) return "Plaid Synced";
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

// Toggle a row in/out of the local multi-select. Reconcile the global filter
// only when the resulting size is 0 or 1 — past that, the comparison is
// panel-local and the global filter stays put.
function toggleComparisonAccount(accountValue) {
    const next = new Set(selectedComparisonAccounts.value);
    if (next.has(accountValue)) {
        next.delete(accountValue);
    } else {
        next.add(accountValue);
    }
    selectedComparisonAccounts.value = next;

    if (next.size === 0) {
        clearAccount();
    } else if (next.size === 1) {
        const [only] = next;
        setAccount(only);
    }
    // size >= 2: leave global filter alone
}

function clearComparisonSelection() {
    selectedComparisonAccounts.value = new Set();
    clearAccount();
}

// Rehydrate the comparison set from a ?compare=A,B,C URL query so a user
// returning from the full compare view keeps their selection intact. Only
// keeps account values that actually exist in the freshly loaded rows.
function restoreComparisonSelectionFromQuery() {
    const raw = route.query.compare;
    if (!raw) return;
    const requested = String(raw)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (requested.length === 0) return;
    const visible = new Set(accountComparisonRows.value.map((row) => row.value));
    const restored = new Set(requested.filter((value) => visible.has(value)));
    if (restored.size > 0) {
        selectedComparisonAccounts.value = restored;
    }
}

// Navigate to the full-screen side-by-side compare view, carrying the current
// selection plus period and benchmark via the URL so the view is shareable.
function openFullCompare() {
    if (selectedComparisonAccounts.value.size < 2) return;
    router.push({
        name: "analysis-compare",
        query: {
            accounts: Array.from(selectedComparisonAccounts.value).join(","),
            period: portfolioPeriod.value,
            benchmark: (benchmarkSymbol.value || "SPY").trim().toUpperCase(),
        },
    });
}

// Briefly flag a row as just-saved so the UI can show "Saved" feedback.
function flashSaved(symbol) {
    savedTargets.value = { ...savedTargets.value, [symbol]: true };
    if (savedTargetTimers[symbol]) clearTimeout(savedTargetTimers[symbol]);
    savedTargetTimers[symbol] = setTimeout(() => {
        const next = { ...savedTargets.value };
        delete next[symbol];
        savedTargets.value = next;
        delete savedTargetTimers[symbol];
    }, 2500);
}

// Saving a target only affects the rebalance table (targets are normalized
// across rows), so refresh just that endpoint in place — no chart/metrics
// reload. Silent fetch keeps the current rows visible and updates them when
// the response lands.
async function refreshRebalanceOnly(syncedSymbols = []) {
    const params = buildPortfolioParams();
    await investmentsStore.fetchPortfolioRebalance(params, { silent: true });
    syncTargetAllocationDrafts(
        investmentsStore.portfolioRebalance?.positions || [],
        { preserveEdits: true, forceSymbols: new Set(syncedSymbols) },
    );
    // Keep the current period's cache entry consistent; drop the rest so other
    // periods refetch the updated targets lazily on next visit.
    const cacheKey = buildCacheKey();
    const prev = periodDataCache.get(cacheKey);
    periodDataCache.clear();
    if (prev) {
        periodDataCache.set(cacheKey, {
            ...prev,
            rebalance: investmentsStore.portfolioRebalance,
            fetchedAt: Date.now(),
        });
    }
}

async function saveTargetAllocation(position) {
    targetSaving.value = true;
    try {
        const draftValue = targetAllocationDrafts.value[position.symbol];
        await investmentsStore.updatePortfolioTarget(
            position.symbol,
            draftValue === "" || draftValue === null ? null : Number(draftValue),
        );
        await refreshRebalanceOnly([position.symbol]);
        flashSaved(position.symbol);
    } catch (error) {
        console.error("Failed to save target allocation:", error);
        showError("Error", "Failed to save target allocation");
    } finally {
        targetSaving.value = false;
    }
}

// Save every row whose target was edited in one pass, then refresh once.
async function saveAllTargetAllocations() {
    const symbols = dirtyTargetSymbols.value;
    if (symbols.length === 0) return;
    targetSaving.value = true;
    try {
        for (const symbol of symbols) {
            const draftValue = targetAllocationDrafts.value[symbol];
            await investmentsStore.updatePortfolioTarget(
                symbol,
                draftValue === "" || draftValue === null ? null : Number(draftValue),
            );
        }
        await refreshRebalanceOnly(symbols);
        symbols.forEach((symbol) => flashSaved(symbol));
    } catch (error) {
        console.error("Failed to save target allocations:", error);
        showError("Error", "Failed to save one or more target allocations");
    } finally {
        targetSaving.value = false;
    }
}

// Scale every entered target by 100 / total so the new saved values sum to 100%.
// Tiny rounding remainders (e.g. 33.33 × 3 = 99.99) are within the 0.5% tolerance
// used by targetsNeedNormalizing, so the warning clears after saving.
async function normalizeTargetAllocations() {
    const total = targetTotalPercent.value;
    if (!total || Math.abs(total - 100) <= 0.5) return;
    const scale = 100 / total;
    const updates = rebalanceRows.value
        .filter((row) =>
            row.targetAllocationPercent !== null &&
            row.targetAllocationPercent !== undefined &&
            Number(row.targetAllocationPercent) > 0,
        )
        .map((row) => ({
            symbol: row.symbol,
            value: Math.round(Number(row.targetAllocationPercent) * scale * 100) / 100,
        }));
    if (updates.length === 0) return;
    targetSaving.value = true;
    try {
        for (const { symbol, value } of updates) {
            await investmentsStore.updatePortfolioTarget(symbol, value);
        }
        await refreshRebalanceOnly(updates.map(({ symbol }) => symbol));
        updates.forEach(({ symbol }) => flashSaved(symbol));
    } catch (error) {
        console.error("Failed to normalize target allocations:", error);
        showError("Error", "Failed to normalize target allocations");
    } finally {
        targetSaving.value = false;
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
