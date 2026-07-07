<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">Analytics</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Analyze your trading performance and identify areas for improvement.
      </p>
    </div>

    <!-- Onboarding card removed - Analytics is no longer in the tour flow -->

    <div class="space-y-8">
      <!-- Filters: collapsed by default so the charts (the point of this
           page) aren't pushed below the fold by a permanently open panel. -->
      <div class="card">
        <div class="card-body">
          <button
            type="button"
            class="flex w-full items-center justify-between text-left"
            :aria-expanded="filtersExpanded"
            @click="filtersExpanded = !filtersExpanded"
          >
            <span class="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <FunnelIcon class="h-4 w-4 text-gray-500 dark:text-gray-400" />
              Filters
              <span
                v-if="activeFilterCount > 0"
                class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white"
              >{{ activeFilterCount }}</span>
            </span>
            <ChevronDownIcon
              class="h-4 w-4 text-gray-500 transition-transform dark:text-gray-400"
              :class="{ 'rotate-180': filtersExpanded }"
            />
          </button>

          <div v-show="filtersExpanded" class="mt-4">
            <!-- :auto-apply-on-mount="false" prevents the mount-time emit from
                 double-fetching: loadData() already restores saved filters from
                 localStorage and runs the full fetch batch via applyFilters(). -->
            <TradeFilters :auto-apply-on-mount="false" @filter="handleFilter" />
          </div>

          <!-- R-Value Mode Toggle -->
          <div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display Charts in R-Multiples
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Show performance in terms of risk units instead of dollar amounts
                </p>
              </div>
              <button
                @click="rValueMode = !rValueMode"
                :class="[
                  rValueMode ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700',
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                ]"
                type="button"
              >
                <span
                  :class="[
                    rValueMode ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                  ]"
                />
              </button>
            </div>
          </div>

          <!-- AI Recommendations and Chart Customization buttons -->
          <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div class="flex gap-2 flex-wrap">
              <button
                @click="toggleCustomization"
                class="px-3 py-2 text-sm font-medium border rounded-md transition-colors"
                :class="isCustomizing ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'"
              >
                <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {{ isCustomizing ? 'Done' : 'Reorder Charts' }}
              </button>
              <button
                @click="showLayoutSettings = true"
                class="px-3 py-2 text-sm font-medium border rounded-md transition-colors bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Show/Hide Charts
              </button>
              <button
                v-if="isCustomizing"
                @click="resetChartLayout"
                class="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Reset to Default
              </button>
            </div>
            <button
              @click="showAIPanel = !showAIPanel"
              class="px-3 py-2 text-sm font-medium border rounded-md transition-colors"
              :class="showAIPanel
                ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
                : 'text-white bg-primary-600 border-transparent hover:bg-primary-700'"
            >
              <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>{{ showAIPanel ? 'Hide AI Assistant' : 'AI Assistant' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- AI Conversation Panel -->
      <div v-if="showAIPanel" class="card">
        <AIConversationPanel />
      </div>

      <!-- Customization Mode Message -->
      <div v-if="isCustomizing" class="card bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
        <div class="card-body">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p class="text-sm font-medium text-primary-900 dark:text-primary-100">Customization Mode Active</p>
              <p class="text-xs text-primary-700 dark:text-primary-300 mt-1">Drag and drop chart sections to reorder them. Charts will auto-resize based on their width setting.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Full page spinner only on initial load -->
      <div v-if="initialLoading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Section Tabs -->
      <div v-show="!initialLoading" class="border-b border-gray-200 dark:border-gray-700">
        <nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Analytics sections">
          <button
            v-for="tab in analyticsTabs"
            :key="tab.id"
            @click="activeAnalyticsTab = tab.id"
            :class="[
              'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeAnalyticsTab === tab.id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- Draggable Grid Container with refresh indicator -->
      <div v-show="!initialLoading" class="relative">
        <!-- Subtle refresh indicator -->
        <div v-if="loading && !initialLoading" class="absolute top-0 right-0 z-10">
          <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
          </div>
        </div>
      <draggable
        v-model="tabCharts"
        :disabled="!isCustomizing"
        item-key="id"
        class="grid grid-cols-1 lg:grid-cols-2 gap-8"
        handle=".drag-handle"
      >
        <template #item="{ element }">
          <div
            v-if="element.visible"
            :class="[
              getChartSizeClass(element),
              isCustomizing ? 'ring-2 ring-primary-300 dark:ring-primary-700 rounded-lg transition-all' : '',
              'overflow-visible'
            ]"
          >
            <!-- Drag Handle (only visible in customize mode) -->
            <div v-if="isCustomizing" class="drag-handle flex items-center justify-center py-2 bg-gray-100 dark:bg-gray-800 rounded-t-lg cursor-move hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                </svg>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ getChartDefinition(element.id)?.title }}</span>
              </div>
            </div>

            <!-- Overview Stats -->
            <template v-if="element.id === 'overview'">
              <!-- Overview Stats -->
      <div class="card overflow-hidden">
        <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y divide-gray-100 dark:divide-gray-800 lg:divide-y-0 lg:divide-x lg:divide-gray-200 lg:dark:divide-gray-700">
          <!-- Total P&L -->
          <div class="px-4 py-3.5">
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Total P&L</dt>
            <dd class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="displayOverview.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ formatCurrency(displayOverview.total_pnl) }}
            </dd>
          </div>

          <!-- Win Rate -->
          <div class="px-4 py-3.5">
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
              Win Rate<span v-if="displayOverview.position_grouping" class="ml-1 normal-case text-primary-600 dark:text-primary-400">· whole trade</span>
            </dt>
            <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">
              {{ displayOverview.win_rate }}%<span class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">incl. BE</span>
            </dd>
            <dd v-if="displayOverview.breakeven_trades > 0" class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {{ displayOverview.win_rate_excluding_breakeven }}% excl. BE
            </dd>
          </div>

          <!-- Total Trades -->
          <div class="px-4 py-3.5">
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Total Trades</dt>
            <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">{{ displayOverview.total_trades }}</dd>
          </div>

          <!-- Average / Median Trade -->
          <div class="px-4 py-3.5">
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">{{ calculationMethod }} Trade</dt>
            <dd class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="displayOverview.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ formatCurrency(displayOverview.avg_pnl) }}
            </dd>
          </div>

          <!-- Profit Factor -->
          <div class="px-4 py-3.5">
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">Profit Factor</dt>
            <dd class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">{{ displayOverview.profit_factor ?? '0.00' }}</dd>
          </div>

          <!-- R-Multiple (click to toggle Average / Total) -->
          <div
            class="px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            @click="toggleRMultipleDisplay"
            title="Click to toggle Average / Total R"
          >
            <dt class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
              {{ rMultipleFlipped ? 'Total R' : calculationMethod + ' R-Multiple' }}
              <span class="ml-1 normal-case text-gray-400">↻</span>
            </dt>
            <transition name="r-fade" mode="out-in">
              <dd v-if="!rMultipleFlipped" key="avg" class="mt-1 text-lg lg:text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                {{ overview.avg_r_value !== undefined && overview.avg_r_value !== null ? Number(overview.avg_r_value).toFixed(1) + 'R' : '0.0R' }}
              </dd>
              <dd v-else key="total" class="mt-1 text-lg lg:text-xl font-semibold whitespace-nowrap" :class="(overview.total_r_value ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">
                {{ overview.total_r_value !== undefined && overview.total_r_value !== null ? Number(overview.total_r_value).toFixed(2) + 'R' : '0.00R' }}
              </dd>
            </transition>
          </div>
        </dl>
      </div>

      <!-- Equity Notice for K-Ratio -->
      <div v-if="overview.k_ratio === '0.00'" class="card mt-6 mb-8">
        <div class="card-body">
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">K-Ratio Requires Account Equity Tracking</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                To calculate your K-Ratio, you need to track your account equity over time. The K-Ratio requires at least 3 equity entries to calculate meaningful consistency metrics.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <router-link to="/settings" class="inline-flex items-center px-3 py-1 text-xs font-medium text-primary-700 bg-primary-100 rounded-full hover:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40">
                  Update Current Equity
                </router-link>
                <router-link to="/equity-history" class="inline-flex items-center px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40">
                  View Equity History
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
            </template>

            <!-- Detailed Stats -->
            <template v-else-if="element.id === 'detailed-stats'">
      <!-- Stats + Top Symbols side by side -->
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-3">
      <!-- Stats -->
      <div class="card xl:col-span-2">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Stats</h3>
            <span
              v-if="displayOverview.position_grouping"
              class="text-xs font-normal text-primary-600 dark:text-primary-400"
            >whole trade</span>
          </div>

          <!-- Core stats (available to all users) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div
              v-for="row in freeStatRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800"
            >
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ row.label }}</span>
              <span
                class="text-sm font-semibold whitespace-nowrap"
                :class="row.class || 'text-gray-900 dark:text-white'"
              >{{ row.display }}</span>
            </div>
          </div>

          <!-- Advanced metrics (Pro) -->
          <div class="relative mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Advanced Metrics</p>

            <!-- Pro Tier Overlay for Free Users -->
            <div v-if="isFreeTier" class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-lg">
              <div class="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md">
                <svg class="mx-auto h-12 w-12 text-primary-600 dark:text-primary-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Pro Feature</h3>
                <p class="text-gray-600 dark:text-gray-400 mb-6">
                  Unlock advanced trading metrics including SQN, Kelly Criterion, K-Ratio, MAE/MFE, and more with Pro.
                </p>
                <router-link
                  to="/pricing"
                  class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Upgrade to Pro - {{ monthlyPricePerMonthLabel }}
                </router-link>
              </div>
            </div>

            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-x-8"
              :class="{ 'filter blur-sm pointer-events-none select-none': isFreeTier }"
            >
              <div
                v-for="row in advancedStatRows"
                :key="row.label"
                class="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800"
                :title="row.tip"
              >
                <span class="text-sm text-gray-500 dark:text-gray-400 cursor-help">{{ row.label }}</span>
                <span
                  class="text-sm font-semibold whitespace-nowrap"
                  :class="row.class || 'text-gray-900 dark:text-white'"
                >{{ row.display }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Symbols -->
      <div class="card xl:col-span-1">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Performing Symbols</h3>
            <div v-if="symbolStats.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
              No data available
            </div>
            <div v-else>
              <!-- Column Headers — must mirror the body row's flex structure
                   (logo w-8, gap-2, symbol w-16, gap-2, trades count) so the
                   header labels sit directly above their values. -->
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-baseline gap-2">
                  <span class="w-8" aria-hidden="true"></span>
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Symbol</span>
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</span>
                </div>
                <div class="flex items-center">
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 text-right">P&L</span>
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12 text-right">Win %</span>
                </div>
              </div>
              
              <!-- Data Rows -->
              <div class="space-y-1">
                <div
                  v-for="symbol in symbolStats.slice(0, 10)"
                  :key="symbol.symbol"
                  class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1 cursor-pointer transition-colors"
                  @click="navigateToSymbolTrades(symbol.symbol)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <StockLogo
                      :symbol="symbol.symbol"
                      size-class="w-8 h-8"
                    />
                    <span class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 w-16">{{ symbol.symbol }}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ symbol.total_trades }}
                    </span>
                  </div>
                  <div class="flex items-center">
                    <div class="text-sm font-medium w-20 text-right" :class="[
                      symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    ]">
                      {{ formatCurrency(symbol.total_pnl) }}
                    </div>
                    <div class="w-12 text-right">
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ (symbol.winning_trades / symbol.total_trades * 100).toFixed(0) }}%
                      </div>
                      <div
                        v-if="(Number(symbol.breakeven_trades) || 0) > 0"
                        class="text-[10px] text-gray-400 dark:text-gray-500 leading-tight"
                        :title="`Excludes ${symbol.breakeven_trades} breakeven trade${Number(symbol.breakeven_trades) === 1 ? '' : 's'}`"
                      >
                        {{ symbolWinRateExclBE(symbol) }}% BE
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
            </template>

            <!-- Performance Chart -->
            <template v-else-if="element.id === 'performance-chart'">
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="heading-card">Performance Over Time</h3>
            <div class="w-auto">
              <BaseSelect
                v-model="performancePeriod"
                :options="[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' }
                ]"
                @change="fetchPerformance"
              />
            </div>
          </div>
          <div class="h-80">
            <PerformanceChart :data="performanceData" :r-value-mode="rValueMode" />
          </div>
        </div>
      </div>
            </template>

            <!-- Sector Performance -->
            <template v-else-if="element.id === 'sector-performance'">
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="heading-card">Sector Performance</h3>
              <div v-if="sectorStats.uncategorizedSymbols > 0 || showCompletionMessage" class="mt-2">
                <div class="flex items-center justify-between text-xs mb-1" 
                     :class="showCompletionMessage ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
                  <span>
                    <MdiIcon v-if="showCompletionMessage" :icon="mdiCheckCircle" :size="16" class="mr-1 text-green-500" />
                    {{ showCompletionMessage ? 'All symbols processed!' : 'Processing symbols in background...' }}
                  </span>
                  <span>{{ categorizationProgress.completed }}/{{ categorizationProgress.total }}</span>
                </div>
                <div v-if="!showCompletionMessage && sectorStats.failedSymbols > 0" class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {{ sectorStats.symbolsAnalyzed }} categorized, {{ sectorStats.failedSymbols }} failed, {{ sectorStats.uncategorizedSymbols }} pending
                </div>
                <div class="w-full rounded-full h-1.5"
                     :class="showCompletionMessage ? 'bg-green-200 dark:bg-green-800' : 'bg-amber-200 dark:bg-amber-800'">
                  <div 
                    class="h-1.5 rounded-full transition-all duration-500 ease-out"
                    :class="showCompletionMessage ? 'bg-green-500 dark:bg-green-400' : 'bg-amber-500 dark:bg-amber-400'"
                    :style="{ width: `${categorizationProgress.percentage}%` }"
                  ></div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button 
                v-if="sectorStats.uncategorizedSymbols > 0"
                @click="refreshSectorData"
                :disabled="loadingSectorRefresh"
                class="px-3 py-1 text-xs bg-primary-100 hover:bg-primary-200 dark:bg-primary-900 dark:hover:bg-primary-800 text-primary-700 dark:text-primary-300 rounded-md transition-colors disabled:opacity-50"
              >
                <div v-if="loadingSectorRefresh" class="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                <span v-else>Refresh</span>
              </button>
              <div v-if="loadingSectors" class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
            </div>
          </div>
          
          <!-- Always show content area with relative positioning for loading overlay -->
          <div class="relative min-h-[200px]">
            
            <!-- Loading overlay -->
            <div v-if="loadingSectors" class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div class="text-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p class="text-sm text-gray-600 dark:text-gray-400">Fetching industry data...</p>
                <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">This may take a moment</p>
              </div>
            </div>
            
            <!-- Content (always present) -->
            <div v-if="allSectorData.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div 
              v-for="sector in displayedSectorData" 
              :key="sector.industry"
              class="group border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              @click="navigateToSectorTrades(sector.industry)"
              :title="`Click to view trades in ${sector.industry} sector`"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center">
                  <h4 class="font-medium text-gray-900 dark:text-white text-sm truncate pr-2">{{ sector.industry }}</h4>
                  <svg class="w-3 h-3 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </div>
                <span 
                  class="text-xs font-semibold px-2 py-1 rounded whitespace-nowrap"
                  :class="sector.total_pnl >= 0 ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'"
                >
                  {{ formatCurrency(sector.total_pnl) }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-2 text-xs mb-2">
                <div class="flex justify-between">
                  <span class="text-gray-500 dark:text-gray-400">Trades:</span>
                  <span class="font-medium">{{ sector.total_trades }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500 dark:text-gray-400">Win Rate:</span>
                  <span class="font-medium">{{ sector.win_rate }}%</span>
                </div>
              </div>
              
              <div v-if="sector.symbols && sector.symbols.length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div class="flex flex-wrap gap-1">
                  <span 
                    v-for="symbol in sector.symbols.slice(0, 6)" 
                    :key="symbol.symbol"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    :title="`${symbol.trades} trades, ${formatCurrency(symbol.pnl)} P&L`"
                  >
                    <StockLogo
                      :symbol="symbol.symbol"
                      size-class="w-5 h-5"
                      rounded-class="rounded-sm"
                      fallback-text-class="text-[9px] font-semibold"
                      class="mr-1"
                    />
                    {{ symbol.symbol }}
                    <span 
                      class="ml-1 text-xs"
                      :class="symbol.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      {{ formatCurrency(symbol.pnl, { compact: true, minimumFractionDigits: 0, maximumFractionDigits: 0 }) }}
                    </span>
                  </span>
                  <span v-if="sector.symbols.length > 6" class="text-xs text-gray-500 dark:text-gray-400 px-1">
                    +{{ sector.symbols.length - 6 }} more
                  </span>
                </div>
              </div>
            </div>
            
            </div>
            
            <!-- Empty state -->
            <div v-else-if="!loadingSectors" class="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>No sector data available. Industry information will be fetched automatically from your trades.</p>
            </div>
            
            <!-- Initial placeholder while waiting for first load -->
            <div v-else class="text-center py-8 text-gray-400 dark:text-gray-500">
              <div class="w-12 h-12 mx-auto mb-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p class="text-sm">Sector data will appear here</p>
            </div>
            
          </div>
          
          <!-- Load More / Collapse Buttons at bottom right of widget -->
          <div v-if="allSectorData.length > 10" class="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex space-x-2">
              <button 
                v-if="sectorsToShow > 10"
                @click="collapseSectors"
                class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Show Less
              </button>
              <button 
                v-if="hasMoreSectors"
                @click="loadMoreSectors"
                class="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
              >
                Show More
              </button>
            </div>
          </div>
        </div>
      </div>
            </template>

            <!-- Drawdown Chart -->
            <template v-else-if="element.id === 'drawdown-chart'">
      <div id="drawdown" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Drawdown Analysis</h3>
          <div class="h-80 relative">
            <canvas ref="drawdownChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Daily Volume Chart -->
            <template v-else-if="element.id === 'daily-volume-chart'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Daily Volume Traded</h3>
          <div class="h-80 relative">
            <canvas ref="dailyVolumeChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Day of Week Performance -->
            <template v-else-if="element.id === 'day-of-week'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Day of Week</h3>
          <div class="h-80 relative">
            <canvas ref="dayOfWeekChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Performance by Hold Time -->
            <template v-else-if="element.id === 'performance-by-hold-time'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Hold Time</h3>
          <div class="h-96 relative">
            <canvas ref="performanceByHoldTimeChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Trade Distribution by Price -->
            <template v-else-if="element.id === 'trade-distribution'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Distribution by Price</h3>
          <div class="h-80 relative">
            <canvas ref="tradeDistributionChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Performance by Price -->
            <template v-else-if="element.id === 'performance-by-price'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Price</h3>
          <div class="h-80 relative">
            <canvas ref="performanceByPriceChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>
            </template>

            <!-- Performance by Volume Traded -->
            <template v-else-if="element.id === 'performance-by-volume'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Volume Traded</h3>
          <div class="h-80 relative">
            <canvas
              ref="performanceByVolumeChart"
              class="absolute inset-0 w-full h-full"
              :class="{ 'hidden': !performanceByVolumeData.length || performanceByVolumeData.every(val => val === 0) }"
            ></canvas>
            <div
              v-if="!performanceByVolumeData.length || performanceByVolumeData.every(val => val === 0)"
              class="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400"
            >
              <div class="text-center">
                <svg class="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <p>No volume data available for the selected period</p>
              </div>
            </div>
          </div>
        </div>
      </div>
            </template>

            <!-- Performance by Position Size -->
            <template v-else-if="element.id === 'performance-by-position-size'">
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Position Size ($)</h3>
          <div class="h-80 relative">
            <canvas
              ref="performanceByPositionSizeChart"
              class="absolute inset-0 w-full h-full"
              :class="{ 'hidden': !performanceByPositionSizeData.length || performanceByPositionSizeData.every(val => val === 0) }"
            ></canvas>
            <div
              v-if="!performanceByPositionSizeData.length || performanceByPositionSizeData.every(val => val === 0)"
              class="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400"
            >
              <div class="text-center">
                <svg class="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p>No position size data available for the selected period</p>
              </div>
            </div>
          </div>
        </div>
      </div>
            </template>

            <!-- News Sentiment Correlation Analytics -->
            <template v-else-if="element.id === 'news-sentiment'">
      <div class="relative">
        <!-- Pro Tier Overlay for Free Users -->
        <div v-if="isFreeTier" class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-lg">
          <div class="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md">
            <svg class="mx-auto h-12 w-12 text-primary-600 dark:text-primary-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Pro Feature</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Unlock news sentiment correlation analytics to see how news affects your trading performance with Pro.
            </p>
            <router-link
              to="/pricing"
              class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Upgrade to Pro - {{ monthlyPricePerMonthLabel }}
            </router-link>
          </div>
        </div>

        <div :class="{ 'filter blur-sm pointer-events-none': isFreeTier }">
          <NewsCorrelationAnalytics />
        </div>
      </div>
            </template>

            <!-- Tag Performance -->
            <template v-else-if="element.id === 'tag-performance'">
      <div v-if="filteredTagStats.length > 0" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Tag Performance</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tag
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Trades
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Breakeven
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ rValueMode ? 'Total R' : 'Total P&L' }}
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="tag in filteredTagStats" :key="tag.tag">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                      {{ tag.tag }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ tag.total_trades }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                      {{ tag.breakeven_trades }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div class="flex flex-col">
                      <span>{{ winRateInclBE(tag) }}%<span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                      <span v-if="(Number(tag.breakeven_trades) || 0) > 0" class="text-[10px] text-gray-500 dark:text-gray-400">
                        {{ winRateExclBE(tag) }}% excl. BE
                      </span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? tag.total_r_value : tag.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(tag.total_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(tag.total_pnl) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? tag.avg_r_value : tag.avg_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(tag.avg_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(tag.avg_pnl) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
            </template>

            <!-- Strategy/Setup Performance -->
            <template v-else-if="element.id === 'strategy-performance'">
      <div v-if="filteredStrategyStats.length > 0" id="strategies" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Strategy/Setup Performance</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Strategy
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Trades
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Breakeven
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ rValueMode ? 'Total R' : 'Total P&L' }}
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="strategy in filteredStrategyStats" :key="strategy.strategy">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                      {{ strategy.strategy }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ strategy.total_trades }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                      {{ strategy.breakeven_trades }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div class="flex flex-col">
                      <span>{{ winRateInclBE(strategy) }}%<span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                      <span v-if="(Number(strategy.breakeven_trades) || 0) > 0" class="text-[10px] text-gray-500 dark:text-gray-400">
                        {{ winRateExclBE(strategy) }}% excl. BE
                      </span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? strategy.total_r_value : strategy.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(strategy.total_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(strategy.total_pnl) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? strategy.avg_r_value : strategy.avg_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(strategy.avg_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(strategy.avg_pnl) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
            </template>

            <!-- Hour of Day Performance -->
            <template v-else-if="element.id === 'hour-of-day-performance'">
      <div v-if="filteredHourOfDayStats.length > 0" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Hour of Day Performance</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Hour
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Trades
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Breakeven
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Win Rate
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ rValueMode ? 'Total R' : 'Total P&L' }}
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ calculationMethod }} {{ rValueMode ? 'R' : 'P&L' }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="hour in filteredHourOfDayStats" :key="hour.hour">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                      {{ formatHour(hour.hour) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ hour.total_trades }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">
                      {{ hour.breakeven_trades }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div class="flex flex-col">
                      <span>{{ winRateInclBE(hour) }}%<span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">incl. BE</span></span>
                      <span v-if="(Number(hour.breakeven_trades) || 0) > 0" class="text-[10px] text-gray-500 dark:text-gray-400">
                        {{ winRateExclBE(hour) }}% excl. BE
                      </span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? hour.total_r_value : hour.total_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(hour.total_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(hour.total_pnl) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    (rValueMode ? hour.avg_r_value : hour.avg_pnl) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <span v-if="rValueMode">{{ formatNumber(hour.avg_r_value) }}R</span>
                    <span v-else>{{ formatCurrency(hour.avg_pnl) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
            </template>

            <!-- MAE / MFE Analysis -->
            <template v-else-if="element.id === 'mae-mfe-analysis'">
      <MaeMfeAnalysis :filters="filters" />
            </template>

          </div>
        </template>
      </draggable>
      </div>
    </div>

    <!-- Chart Layout Settings Modal -->
    <div v-if="showLayoutSettings" class="fixed inset-0 z-50 overflow-y-auto" @click="showLayoutSettings = false">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div
          class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6"
          @click.stop
        >
          <div class="flex items-center justify-between mb-6">
            <h3 class="heading-card">
              Chart Visibility & Size
            </h3>
            <button
              @click="showLayoutSettings = false"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-6">
            <!-- Stats Section -->
            <div>
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Statistics</h4>
              <div class="space-y-2">
                <div v-for="chart in chartDefinitions.filter(c => c.category === 'stats')" :key="chart.id" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div class="flex items-center gap-3">
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        :checked="chartLayout.find(c => c.id === chart.id)?.visible"
                        @change="toggleChartVisibility(chart.id)"
                        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span class="ml-2 text-sm text-gray-900 dark:text-white">{{ chart.title }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Charts Section -->
            <div>
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Charts</h4>
              <div class="space-y-2">
                <div v-for="chart in chartDefinitions.filter(c => c.category === 'charts')" :key="chart.id" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div class="flex items-center gap-3">
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        :checked="chartLayout.find(c => c.id === chart.id)?.visible"
                        @change="toggleChartVisibility(chart.id)"
                        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span class="ml-2 text-sm text-gray-900 dark:text-white">{{ chart.title }}</span>
                    </label>
                  </div>
                  <button
                    v-if="chartLayout.find(c => c.id === chart.id)?.visible"
                    @click="toggleChartSize(chart.id)"
                    class="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-500"
                  >
                    {{ chartLayout.find(c => c.id === chart.id)?.size === 'full' ? 'Full Width' : 'Half Width' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Tables Section -->
            <div>
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Performance Tables</h4>
              <div class="space-y-2">
                <div v-for="chart in chartDefinitions.filter(c => c.category === 'tables')" :key="chart.id" class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div class="flex items-center gap-3">
                    <label class="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        :checked="chartLayout.find(c => c.id === chart.id)?.visible"
                        @change="toggleChartVisibility(chart.id)"
                        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span class="ml-2 text-sm text-gray-900 dark:text-white">{{ chart.title }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-between">
            <button
              @click="resetChartLayout"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Reset to Defaults
            </button>
            <button
              @click="showLayoutSettings = false"
              class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import api from '@/services/api'
import { parseTradeDate } from '@/utils/date'
import { FunnelIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import NewsCorrelationAnalytics from '@/components/analytics/NewsCorrelationAnalytics.vue'
import MaeMfeAnalysis from '@/components/analytics/MaeMfeAnalysis.vue'
import TagManagement from '@/components/trades/TagManagement.vue'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import AIReportRenderer from '@/components/ai/AIReportRenderer.vue'
import AIConversationPanel from '@/components/ai/AIConversationPanel.vue'
import StockLogo from '@/components/common/StockLogo.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { useAIStore } from '@/stores/ai'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import { usePricingExperiment } from '@/composables/usePricingExperiment'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { Chart } from '@/lib/chartSetup'

const { use12Hour } = useUserTimezone()
const { formatCurrency, currencySymbol } = useCurrencyFormatter()
const { monthlyPricePerMonthLabel } = usePricingExperiment()
import draggable from 'vuedraggable'
import {
  mdiCheckCircle,
  mdiTarget,
  mdiChartBox,
  mdiAlert
} from '@mdi/js'

const loading = ref(true)
const initialLoading = ref(true) // Track initial load separately to preserve scroll on refresh
const rValueMode = ref(false)

// Filter panel collapse state + badge count (matches the Trades/Dashboard
// labeled-button pattern).
const filtersExpanded = ref(false)
const activeFilterCount = ref(0)
const rMultipleFlipped = ref(false)
const performancePeriod = ref('daily')
const userSettings = ref(null)
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const uiPreferencesStore = useUiPreferencesStore()
const aiStore = useAIStore()
const { selectedAccount } = useGlobalAccountFilter()
const showAdvanced = ref(false)
const showAIPanel = ref(false)

// Check if user is on free tier
const isFreeTier = computed(() => {
  return authStore.user?.tier !== 'pro'
})

// Dropdown visibility
const showStrategyDropdown = ref(false)
const showSectorDropdown = ref(false)
const showBrokerDropdown = ref(false)
const showDayOfWeekDropdown = ref(false)

// Filter data loading states
const loadingSectorsFilter = ref(false)
const loadingBrokersFilter = ref(false)
const availableSectorsFilter = ref([])
const availableBrokersFilter = ref([])

// Strategy options
const strategyOptions = [
  { value: 'scalper', label: 'Scalper' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'mean_reversion', label: 'Mean Reversion' },
  { value: 'swing', label: 'Swing' },
  { value: 'day_trading', label: 'Day Trading' },
  { value: 'position', label: 'Position Trading' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'trend_following', label: 'Trend Following' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'news_momentum', label: 'News Momentum' },
  { value: 'news_swing', label: 'News Swing' },
  { value: 'news_uncertainty', label: 'News Uncertainty' }
]

// Day of week options
const dayOfWeekOptions = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }
]

// Local filters that are displayed in UI
const localFilters = ref({
  symbol: '',
  startDate: '',
  endDate: '',
  strategies: [],
  setups: [],
  sectors: [],
  tags: [],
  hasNews: '',
  side: '',
  minPrice: null,
  maxPrice: null,
  minQuantity: null,
  maxQuantity: null,
  status: '',
  minPnl: null,
  maxPnl: null,
  pnlType: '',
  holdTime: '',
  brokers: [],
  daysOfWeek: [],
  instrumentTypes: [],
  optionTypes: [],
  qualityGrades: []
})

// Filters that are sent to API (converted from localFilters)
const filters = ref({
  // Basic filters
  symbol: '',
  startDate: '',
  endDate: '',
  strategies: '',
  setups: '',
  sectors: '',
  tags: '',
  hasNews: '',
  // Advanced filters
  side: '',
  minPrice: null,
  maxPrice: null,
  minQuantity: null,
  maxQuantity: null,
  status: '',
  minPnl: null,
  maxPnl: null,
  pnlType: '',
  holdTime: '',
  brokers: '',
  daysOfWeek: '',
  instrumentTypes: '',
  optionTypes: '',
  qualityGrades: ''
})

const overview = ref({
  total_pnl: 0,
  win_rate: 0,
  win_rate_excluding_breakeven: 0,
  total_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  breakeven_trades: 0,
  avg_pnl: 0,
  avg_win: 0,
  avg_loss: 0,
  best_trade: 0,
  worst_trade: 0,
  profit_factor: 0,
  sqn: '0.00',
  probability_random: 'N/A',
  kelly_percentage: '0.00',
  k_ratio: '0.00',
  total_commissions: 0,
  total_fees: 0,
  avg_mae: 'N/A',
  avg_mfe: 'N/A',
  avg_r_value: 0,
  total_r_value: 0
})

const performanceData = ref([])
const symbolStats = ref([])
const tagStats = ref([])
const strategyStats = ref([])
const hourOfDayStats = ref([])

// Recommendations
const loadingRecommendations = ref(false)
const showRecommendations = ref(false)
const recommendations = ref(null)
const recommendationError = ref(null)

// Sector Performance
const sectorData = ref([])
const allSectorData = ref([]) // Store all sectors
const sectorsToShow = ref(10) // Number of sectors to display
const loadingSectors = ref(false)
const loadingSectorRefresh = ref(false)
const sectorStats = ref({
  symbolsAnalyzed: 0,
  totalSymbols: 0,
  uncategorizedSymbols: 0,
  failedSymbols: 0,
  processedSymbols: 0
})

const categorizationProgress = ref({
  total: 0,
  completed: 0,
  percentage: 0
})

const showCompletionMessage = ref(false)

// Chart layout customization
const chartDefinitions = [
  { id: 'overview', title: 'Overview Stats', defaultSize: 'full', category: 'stats', tab: 'overview' },
  { id: 'detailed-stats', title: 'Detailed Stats', defaultSize: 'full', category: 'stats', tab: 'overview' },
  { id: 'performance-chart', title: 'Performance Over Time', defaultSize: 'full', category: 'charts', tab: 'time' },
  { id: 'sector-performance', title: 'Sector Performance', defaultSize: 'full', category: 'charts', tab: 'symbol' },
  { id: 'drawdown-chart', title: 'Drawdown Analysis', defaultSize: 'half', category: 'charts', tab: 'time' },
  { id: 'daily-volume-chart', title: 'Daily Volume', defaultSize: 'half', category: 'charts', tab: 'time' },
  { id: 'day-of-week', title: 'Day of Week Performance', defaultSize: 'half', category: 'charts', tab: 'time' },
  { id: 'performance-by-hold-time', title: 'Performance by Hold Time', defaultSize: 'half', category: 'charts', tab: 'time' },
  { id: 'trade-distribution', title: 'Trade Distribution by Price', defaultSize: 'half', category: 'charts', tab: 'size' },
  { id: 'performance-by-price', title: 'Performance by Price', defaultSize: 'half', category: 'charts', tab: 'size' },
  { id: 'performance-by-volume', title: 'Performance by Volume', defaultSize: 'half', category: 'charts', tab: 'size' },
  { id: 'performance-by-position-size', title: 'Performance by Position Size', defaultSize: 'half', category: 'charts', tab: 'size' },
  { id: 'news-sentiment', title: 'News Sentiment Correlation', defaultSize: 'full', category: 'charts', tab: 'symbol' },
  { id: 'tag-performance', title: 'Tag Performance', defaultSize: 'full', category: 'tables', tab: 'symbol' },
  { id: 'strategy-performance', title: 'Strategy/Setup Performance', defaultSize: 'full', category: 'tables', tab: 'symbol' },
  { id: 'hour-of-day-performance', title: 'Hour of Day Performance', defaultSize: 'full', category: 'tables', tab: 'time' },
  { id: 'mae-mfe-analysis', title: 'MAE / MFE Analysis', defaultSize: 'full', category: 'charts', tab: 'time' }
]

const analyticsTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'By Time' },
  { id: 'symbol', label: 'By Symbol & Strategy' },
  { id: 'size', label: 'By Trade Size' }
]

const activeAnalyticsTab = ref('overview')

const defaultChartLayout = chartDefinitions.map(chart => ({
  id: chart.id,
  visible: true,
  size: chart.defaultSize
}))

const chartLayout = ref(JSON.parse(JSON.stringify(defaultChartLayout)))
const isCustomizing = ref(false)
const showLayoutSettings = ref(false)

// Computed property for calculation method
const calculationMethod = computed(() => {
  return userSettings.value?.statisticsCalculation === 'median' ? 'Median' : 'Average'
})

// Filtered stats for R-Value mode - exclude entries with 0 R-value (no stop_loss data)
// Helper to check if a value is effectively zero (handles strings, nulls, and floats)
function hasRValue(val) {
  if (val === null || val === undefined || val === '') return false
  const num = parseFloat(val)
  return !isNaN(num) && Math.abs(num) > 0.001
}

const filteredTagStats = computed(() => {
  if (!rValueMode.value) return tagStats.value
  return tagStats.value.filter(tag =>
    hasRValue(tag.total_r_value) || hasRValue(tag.avg_r_value)
  )
})

const filteredStrategyStats = computed(() => {
  if (!rValueMode.value) return strategyStats.value
  return strategyStats.value.filter(strategy =>
    hasRValue(strategy.total_r_value) || hasRValue(strategy.avg_r_value)
  )
})

const filteredHourOfDayStats = computed(() => {
  if (!rValueMode.value) return hourOfDayStats.value
  return hourOfDayStats.value.filter(hour =>
    hasRValue(hour.total_r_value) || hasRValue(hour.avg_r_value)
  )
})

// Display overview - switches between regular and R-value filtered stats based on mode
// The summary cards always show the full filtered dataset in dollars. The
// R-multiple toggle is charts-only and must not alter these headline metrics
// (it previously swapped in an R-trade subset, still rendered in dollars, which
// silently changed P&L / win rate / MAE with no R values shown). R headline
// numbers live in the dedicated "Avg R-Multiple / Total R" flip card.
const displayOverview = computed(() => overview.value)

// Computed property for visible charts in order
const visibleCharts = computed(() => {
  return chartLayout.value.filter(chart => chart.visible)
})

// Charts belonging to the active analytics tab. Writable so draggable can
// reorder within a tab while preserving the order of charts on other tabs.
const tabCharts = computed({
  get: () => chartLayout.value.filter(c => {
    const def = chartDefinitions.find(d => d.id === c.id)
    return def?.tab === activeAnalyticsTab.value
  }),
  set: (newOrder) => {
    const otherCharts = chartLayout.value.filter(c => {
      const def = chartDefinitions.find(d => d.id === c.id)
      return def?.tab !== activeAnalyticsTab.value
    })
    chartLayout.value = [...otherCharts, ...newOrder]
  }
})

// When the user changes tabs, the new tab's canvases mount fresh.
// Re-run chart init so Chart.js binds to the newly-mounted canvas elements.
watch(activeAnalyticsTab, async () => {
  await nextTick()
  initializeAllCharts()
})

// Get chart definition by ID
function getChartDefinition(id) {
  return chartDefinitions.find(chart => chart.id === id)
}

// Get chart size class
function getChartSizeClass(chart) {
  if (chart.size === 'full') return 'col-span-1 lg:col-span-2'
  if (chart.size === 'half') return 'col-span-1'
  return 'col-span-1'
}



// Helper methods for multi-select dropdowns
function getSelectedStrategyText() {
  if (localFilters.value.strategies.length === 0) return 'All Strategies'
  if (localFilters.value.strategies.length === 1) {
    const strategy = strategyOptions.find(s => s.value === localFilters.value.strategies[0])
    return strategy ? strategy.label : 'All Strategies'
  }
  return `${localFilters.value.strategies.length} strategies selected`
}

function getSelectedSectorText() {
  if (localFilters.value.sectors.length === 0) return loadingSectorsFilter.value ? 'Loading sectors...' : 'All Sectors'
  if (localFilters.value.sectors.length === 1) return localFilters.value.sectors[0]
  return `${localFilters.value.sectors.length} sectors selected`
}

function getSelectedBrokerText() {
  if (localFilters.value.brokers.length === 0) return loadingBrokersFilter.value ? 'Loading brokers...' : 'All Brokers'
  if (localFilters.value.brokers.length === 1) return localFilters.value.brokers[0]
  return `${localFilters.value.brokers.length} brokers selected`
}

function getSelectedDayOfWeekText() {
  if (localFilters.value.daysOfWeek.length === 0) return 'All Days'
  if (localFilters.value.daysOfWeek.length === 1) {
    const day = dayOfWeekOptions.find(d => d.value === localFilters.value.daysOfWeek[0])
    return day ? day.label : 'All Days'
  }
  return `${localFilters.value.daysOfWeek.length} days selected`
}

function toggleAllStrategies(event) {
  if (event.target.checked) {
    localFilters.value.strategies = []
  }
}

function toggleAllSectors(event) {
  if (event.target.checked) {
    localFilters.value.sectors = []
  }
}

function toggleAllBrokers(event) {
  if (event.target.checked) {
    localFilters.value.brokers = []
  }
}

function toggleAllDaysOfWeek(event) {
  if (!event.target.checked) {
    localFilters.value.daysOfWeek = dayOfWeekOptions.map(d => d.value)
  } else {
    localFilters.value.daysOfWeek = []
  }
}

// Count of active advanced filters
const activeAdvancedCount = computed(() => {
  let count = 0
  if (localFilters.value.hasNews) count++
  if (localFilters.value.side) count++
  if (localFilters.value.minPrice || localFilters.value.maxPrice) count++
  if (localFilters.value.minQuantity || localFilters.value.maxQuantity) count++
  if (localFilters.value.status) count++
  if (localFilters.value.minPnl || localFilters.value.maxPnl) count++
  if (localFilters.value.pnlType) count++
  if (localFilters.value.holdTime) count++
  return count
})

// Update active filters count to use localFilters
const activeFiltersCount = computed(() => {
  let count = 0
  if (localFilters.value.symbol) count++
  if (localFilters.value.startDate || localFilters.value.endDate) count++
  if (localFilters.value.strategies.length > 0) count++
  if (localFilters.value.sectors.length > 0) count++
  if (localFilters.value.brokers.length > 0) count++
  if (localFilters.value.daysOfWeek.length > 0) count++
  return count + activeAdvancedCount.value
})

// Click outside handlers
function handleClickOutside(event) {
  const dropdowns = [
    { ref: showStrategyDropdown, selector: '[data-dropdown="strategy"]' },
    { ref: showSectorDropdown, selector: '[data-dropdown="sector"]' },
    { ref: showBrokerDropdown, selector: '[data-dropdown="broker"]' },
    { ref: showDayOfWeekDropdown, selector: '[data-dropdown="day"]' }
  ]
  
  dropdowns.forEach(dropdown => {
    const element = document.querySelector(dropdown.selector)
    if (element && !element.contains(event.target)) {
      dropdown.ref.value = false
    }
  })
}

// Fetch available sectors for filter dropdown
async function fetchAvailableSectorsForFilter() {
  loadingSectorsFilter.value = true
  try {
    const response = await api.get('/analytics/sectors/available')
    availableSectorsFilter.value = response.data.sectors || []
  } catch (error) {
    console.error('Failed to fetch sectors for filter:', error)
    availableSectorsFilter.value = []
  } finally {
    loadingSectorsFilter.value = false
  }
}

// Fetch available brokers for filter dropdown
async function fetchAvailableBrokersForFilter() {
  loadingBrokersFilter.value = true
  try {
    const response = await api.get('/analytics/brokers/available')
    availableBrokersFilter.value = response.data.brokers || []
  } catch (error) {
    console.error('Failed to fetch brokers for filter:', error)
    availableBrokersFilter.value = []
  } finally {
    loadingBrokersFilter.value = false
  }
}

// Computed property for displayed sectors
const displayedSectorData = computed(() => {
  return allSectorData.value.slice(0, sectorsToShow.value)
})

const hasMoreSectors = computed(() => {
  return allSectorData.value.length > sectorsToShow.value
})

// Chart refs
const tradeDistributionChart = ref(null)
const performanceByPriceChart = ref(null)
const performanceByVolumeChart = ref(null)
const performanceByPositionSizeChart = ref(null)
const performanceByHoldTimeChart = ref(null)
const dayOfWeekChart = ref(null)
const dailyVolumeChart = ref(null)
const drawdownChart = ref(null)

// Chart instances
let tradeDistributionChartInstance = null
let performanceByPriceChartInstance = null
let performanceByVolumeChartInstance = null
let performanceByPositionSizeChartInstance = null
let performanceByHoldTimeChartInstance = null
let dayOfWeekChartInstance = null
let dailyVolumeChartInstance = null
let drawdownChartInstance = null

// Chart data
const tradeDistributionData = ref([])
const performanceByPriceData = ref([])
const performanceByPriceRData = ref([])
const performanceByVolumeData = ref([])
const performanceByVolumeRData = ref([])
const performanceByPositionSizeData = ref([])
const performanceByPositionSizeRData = ref([])
const performanceByHoldTimeData = ref([])
const performanceByHoldTimeRData = ref([])
const performanceByPriceCounts = ref([])
const performanceByVolumeCounts = ref([])
const performanceByPositionSizeCounts = ref([])
const performanceByHoldTimeCounts = ref([])
const dayOfWeekData = ref([])
const dailyVolumeData = ref([])
const drawdownData = ref([])

// Dynamic chart labels
const chartLabels = ref({
  volume: [],
  price: ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+'],
  positionSize: [],
  holdTime: ['< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months']
})

// Price and hold time labels for navigation
const priceLabels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+']
const holdTimeLabels = ['< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months']

function formatNumber(num) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num || 0)
}

function formatHour(hour) {
  const h = parseInt(hour)
  if (use12Hour.value) {
    if (h === 0) return '12:00 AM'
    if (h < 12) return `${h}:00 AM`
    if (h === 12) return '12:00 PM'
    return `${h - 12}:00 PM`
  }
  return `${String(h).padStart(2, '0')}:00`
}

// Win rate helpers for tag / strategy / hour rows. Mirrors the overview pattern:
// "incl. BE" uses wins / total; "excl. BE" uses wins / (wins + losses) so a
// scratch (breakeven) trade no longer dilutes the rate.
function winRateInclBE(row) {
  const total = Number(row?.total_trades) || 0
  if (total === 0) return '0.0'
  const wins = Number(row?.winning_trades) || 0
  return ((wins / total) * 100).toFixed(1)
}

function winRateExclBE(row) {
  const wins = Number(row?.winning_trades) || 0
  const losses = Number(row?.losing_trades) || 0
  const decisive = wins + losses
  if (decisive === 0) return '0.0'
  return ((wins / decisive) * 100).toFixed(1)
}

// Integer-rounded variant for the compact Top Performing Symbols list where
// a 1-decimal "100.0%" overflows the w-12 column.
function symbolWinRateExclBE(row) {
  const wins = Number(row?.winning_trades) || 0
  const losses = Number(row?.losing_trades) || 0
  const decisive = wins + losses
  if (decisive === 0) return '0'
  return ((wins / decisive) * 100).toFixed(0)
}

function getWinPercentage() {
  if (displayOverview.value.total_trades === 0) return 0
  return ((displayOverview.value.winning_trades / displayOverview.value.total_trades) * 100).toFixed(1)
}

function getLossPercentage() {
  if (displayOverview.value.total_trades === 0) return 0
  return ((displayOverview.value.losing_trades / displayOverview.value.total_trades) * 100).toFixed(1)
}

function getBreakevenPercentage() {
  if (displayOverview.value.total_trades === 0) return 0
  return ((displayOverview.value.breakeven_trades / displayOverview.value.total_trades) * 100).toFixed(1)
}

// Whole-number thousands separator for counts/volume in the stats table
function formatCount(value) {
  return (Number(value) || 0).toLocaleString('en-US')
}

// Human-readable hold time from a minutes value (Tradervue-style)
function formatHoldDuration(minutes) {
  const m = Number(minutes) || 0
  if (m <= 0) return '—'
  if (m < 1) return 'less than a minute'
  if (m < 60) {
    const mins = Math.round(m)
    return `${mins} minute${mins === 1 ? '' : 's'}`
  }
  if (m < 1440) {
    const hours = m / 60
    const h = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const days = m / 1440
  const d = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10
  return `${d} day${d === 1 ? '' : 's'}`
}

const POSITIVE_CLASS = 'text-green-600'
const NEGATIVE_CLASS = 'text-red-600'
const NEUTRAL_CLASS = 'text-gray-900 dark:text-white'

function signClass(value) {
  return (Number(value) || 0) >= 0 ? POSITIVE_CLASS : NEGATIVE_CLASS
}

// Free-tier stats shown to every user in the unified "Stats" table
const freeStatRows = computed(() => {
  const o = displayOverview.value || {}
  const m = calculationMethod.value
  const total = Number(o.total_trades) || 0
  const winPct = total > 0 ? ((Number(o.winning_trades) / total) * 100).toFixed(1) : '0.0'
  const lossPct = total > 0 ? ((Number(o.losing_trades) / total) * 100).toFixed(1) : '0.0'
  return [
    { label: 'Total Gain/Loss', display: formatCurrency(o.total_pnl ?? 0), class: signClass(o.total_pnl) },
    { label: 'Largest Gain', display: formatCurrency(o.best_trade ?? 0), class: POSITIVE_CLASS },
    { label: 'Largest Loss', display: formatCurrency(o.worst_trade ?? 0), class: NEGATIVE_CLASS },

    { label: 'Average Daily Gain/Loss', display: formatCurrency(o.avg_daily_pnl ?? 0), class: signClass(o.avg_daily_pnl) },
    { label: 'Average Daily Volume', display: formatCount(Math.round(o.avg_daily_volume ?? 0)) },
    { label: `${m} Per-share Gain/Loss`, display: formatCurrency(o.avg_per_share_pnl ?? 0), class: signClass(o.avg_per_share_pnl) },

    { label: `${m} Trade Gain/Loss`, display: formatCurrency(o.avg_pnl ?? 0), class: signClass(o.avg_pnl) },
    { label: `${m} Winning Trade`, display: formatCurrency(o.avg_win ?? 0), class: POSITIVE_CLASS },
    { label: `${m} Losing Trade`, display: formatCurrency(o.avg_loss ?? 0), class: NEGATIVE_CLASS },

    { label: 'Total Number of Trades', display: formatCount(o.total_trades ?? 0) },
    { label: 'Number of Winning Trades', display: `${formatCount(o.winning_trades ?? 0)} (${winPct}%)`, class: POSITIVE_CLASS },
    { label: 'Number of Losing Trades', display: `${formatCount(o.losing_trades ?? 0)} (${lossPct}%)`, class: NEGATIVE_CLASS },

    { label: 'Average Hold Time (scratch trades)', display: formatHoldDuration(o.avg_hold_scratch_minutes) },
    { label: 'Average Hold Time (winning trades)', display: formatHoldDuration(o.avg_hold_win_minutes) },
    { label: 'Average Hold Time (losing trades)', display: formatHoldDuration(o.avg_hold_loss_minutes) },

    { label: 'Number of Scratch Trades', display: formatCount(o.breakeven_trades ?? 0) },
    { label: 'Max Consecutive Wins', display: formatCount(o.max_consecutive_wins ?? 0), class: POSITIVE_CLASS },
    { label: 'Max Consecutive Losses', display: formatCount(o.max_consecutive_losses ?? 0), class: NEGATIVE_CLASS },

    { label: 'Profit Factor', display: o.profit_factor ?? '0.00' }
  ]
})

// Advanced stats gated behind Pro (single overlay, matching existing behavior)
const advancedStatRows = computed(() => {
  const o = displayOverview.value || {}
  const m = calculationMethod.value
  const mae = (o.avg_mae === 'N/A' || o.avg_mae == null) ? 'N/A' : formatCurrency(o.avg_mae)
  const mfe = (o.avg_mfe === 'N/A' || o.avg_mfe == null) ? 'N/A' : formatCurrency(o.avg_mfe)
  return [
    { label: 'Trade P&L Standard Deviation', display: formatCurrency(o.pnl_std_dev ?? 0), tip: 'Spread of individual trade results around the average. Lower means more consistent trades.' },
    { label: 'System Quality Number (SQN)', display: o.sqn ?? '0.00', tip: `(${m} Trade / Standard Deviation) × √Number of Trades. Higher values indicate a more consistent system.` },
    { label: 'Probability of Random Chance', display: o.probability_random ?? 'N/A', tip: 'Likelihood your results occurred by random chance. Lower is more statistically significant.' },

    { label: 'Kelly Percentage', display: `${o.kelly_percentage ?? '0.00'}%`, tip: 'Optimal fraction of capital to risk per trade for long-term growth, from win rate and avg win/loss.' },
    { label: 'K-Ratio', display: o.k_ratio ?? '0.00', tip: 'Consistency of the equity curve over time. Requires 3+ equity entries.' },
    { label: 'Total Commissions', display: formatCurrency(o.total_commissions ?? 0), class: NEGATIVE_CLASS },

    { label: 'Total Fees', display: formatCurrency(o.total_fees ?? 0), class: NEGATIVE_CLASS },
    { label: `${m} Position MAE`, display: mae, class: mae === 'N/A' ? NEUTRAL_CLASS : NEGATIVE_CLASS, tip: 'Maximum Adverse Excursion — largest unrealized loss during the trade (estimated).' },
    { label: `${m} Position MFE`, display: mfe, class: mfe === 'N/A' ? NEUTRAL_CLASS : POSITIVE_CLASS, tip: 'Maximum Favorable Excursion — largest unrealized profit during the trade (estimated).' }
  ]
})

function getSQNInterpretation(sqn) {
  const sqnValue = parseFloat(sqn) || 0
  if (sqnValue < 1.6) return 'Poor system'
  if (sqnValue < 2.0) return 'Below average'
  if (sqnValue < 2.5) return 'Average'
  if (sqnValue < 3.0) return 'Good'
  if (sqnValue < 5.0) return 'Excellent'
  if (sqnValue < 7.0) return 'Superb'
  return 'Holy Grail'
}

function getKRatioInterpretation(kRatio) {
  const kValue = parseFloat(kRatio) || 0
  if (kValue < -1.0) return 'Very inconsistent returns'
  if (kValue < 0) return 'Inconsistent returns'
  if (kValue < 0.5) return 'Somewhat consistent'
  if (kValue < 1.0) return 'Consistent returns'
  if (kValue < 2.0) return 'Very consistent'
  return 'Extremely consistent'
}

// Chart creation functions
function createTradeDistributionChart() {
  const canvas = tradeDistributionChart.value
  if (!canvas) {
    console.error('Trade distribution chart canvas not found')
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Trade distribution chart canvas context not available')
    return
  }

  if (tradeDistributionChartInstance) {
    tradeDistributionChartInstance.destroy()
  }
  const labels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+']
  
  console.log('Creating trade distribution chart with data:', tradeDistributionData.value)
  
  tradeDistributionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Number of Trades',
        data: tradeDistributionData.value,
        backgroundColor: '#f3a05a',
        borderColor: '#e89956',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const priceRange = labels[index]
          navigateToTradesByPriceRange(priceRange)
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Trades'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Price Range'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        }
      }
    }
  })
}

function createPerformanceByPriceChart() {
  const canvas = performanceByPriceChart.value
  if (!canvas) {
    console.error('Performance by price chart canvas not found')
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Performance by price chart canvas context not available')
    return
  }

  if (performanceByPriceChartInstance) {
    performanceByPriceChartInstance.destroy()
  }
  const labels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+']

  // Use R-value data if in R-value mode, otherwise use P&L data
  const chartData = rValueMode.value ? performanceByPriceRData.value : performanceByPriceData.value
  const chartLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L'
  const xAxisLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L ($)'

  performanceByPriceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: chartData,
        backgroundColor: chartData.map(val => val >= 0 ? '#4ade80' : '#f87171'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const priceRange = priceLabels[index]
          navigateToTradesByPriceRange(priceRange)
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xAxisLabel
          },
          grid: {
            color: function(context) {
              if (context.tick.value === 0) {
                return '#9ca3af'
              }
              return 'rgba(0,0,0,0.1)'
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Price Range'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex
              const tradeCount = performanceByPriceCounts.value[index] || 0
              if (rValueMode.value) {
                return `Total R-Multiple: ${context.parsed.x.toFixed(2)}R (${tradeCount} trades)`
              }
              return `Total P&L: ${currencySymbol.value}${context.parsed.x.toFixed(2)} (${tradeCount} trades)`
            }
          }
        }
      }
    }
  })
}

function createPerformanceByVolumeChart() {
  if (performanceByVolumeChartInstance) {
    performanceByVolumeChartInstance.destroy()
  }

  // Use R-value data if in R-value mode, otherwise use P&L data
  const chartData = rValueMode.value ? performanceByVolumeRData.value : performanceByVolumeData.value

  // Only create chart if there's data to display
  if (!chartData.length || chartData.every(val => val === 0)) {
    console.log('No volume data to display, skipping chart creation')
    return
  }

  const ctx = performanceByVolumeChart.value.getContext('2d')
  const labels = chartLabels.value.volume.length > 0 ? chartLabels.value.volume : []
  const chartLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L'
  const xAxisLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L ($)'

  performanceByVolumeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: chartData,
        backgroundColor: chartData.map(val => val >= 0 ? '#4ade80' : '#f87171'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const volumeRange = labels[index]
          navigateToTradesByVolumeRange(volumeRange)
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xAxisLabel
          },
          grid: {
            color: function(context) {
              if (context.tick.value === 0) {
                return '#9ca3af'
              }
              return 'rgba(0,0,0,0.1)'
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Volume Range (Shares)'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex
              const tradeCount = performanceByVolumeCounts.value[index] || 0
              if (rValueMode.value) {
                return `Total R-Multiple: ${context.parsed.x.toFixed(2)}R (${tradeCount} trades)`
              }
              return `Total P&L: ${currencySymbol.value}${context.parsed.x.toFixed(2)} (${tradeCount} trades)`
            }
          }
        }
      }
    }
  })
}

function createPerformanceByPositionSizeChart() {
  if (performanceByPositionSizeChartInstance) {
    performanceByPositionSizeChartInstance.destroy()
  }

  // Use R-value data if in R-value mode, otherwise use P&L data
  const chartData = rValueMode.value ? performanceByPositionSizeRData.value : performanceByPositionSizeData.value

  // Only create chart if there's data to display
  if (!chartData.length || chartData.every(val => val === 0)) {
    console.log('No position size data to display, skipping chart creation')
    return
  }

  const ctx = performanceByPositionSizeChart.value.getContext('2d')
  const labels = chartLabels.value.positionSize?.length > 0 ? chartLabels.value.positionSize : []
  const chartLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L'
  const xAxisLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L ($)'

  performanceByPositionSizeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: chartData,
        backgroundColor: chartData.map(val => val >= 0 ? '#4ade80' : '#f87171'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const sizeRange = labels[index]
          navigateToTradesByPositionSize(sizeRange)
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xAxisLabel
          },
          grid: {
            color: function(context) {
              if (context.tick.value === 0) {
                return '#9ca3af'
              }
              return 'rgba(0,0,0,0.1)'
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Position Size ($)'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex
              const tradeCount = performanceByPositionSizeCounts.value[index] || 0
              if (rValueMode.value) {
                return `Total R-Multiple: ${context.parsed.x.toFixed(2)}R (${tradeCount} trades)`
              }
              return `Total P&L: ${currencySymbol.value}${context.parsed.x.toFixed(2)} (${tradeCount} trades)`
            }
          }
        }
      }
    }
  })
}

function createDayOfWeekChart() {
  if (!dayOfWeekChart.value) {
    console.error('Day of week chart canvas not found')
    return
  }

  if (dayOfWeekChartInstance) {
    dayOfWeekChartInstance.destroy()
  }

  const ctx = dayOfWeekChart.value.getContext('2d')
  // Only show weekdays since markets are closed on weekends
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  // Backend already returns only weekdays (Monday-Friday), no need to slice
  const weekdayData = dayOfWeekData.value

  // Use R-value data if in R-value mode, otherwise use P&L data
  const chartData = rValueMode.value
    ? weekdayData.map(d => d.total_r_value || 0)
    : weekdayData.map(d => d.total_pnl || 0)
  const chartLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L'
  const xAxisLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L ($)'

  dayOfWeekChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: chartLabel,
        data: chartData,
        backgroundColor: chartData.map(val => val >= 0 ? '#4ade80' : '#f87171'),
        borderWidth: 1,
        barThickness: 30,
        categoryPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const dayOfWeek = index + 1 // Convert to weekday: 0=Monday -> 1, 1=Tuesday -> 2, etc.
          navigateToTradesByDayOfWeek(dayOfWeek)
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: xAxisLabel
          },
          grid: {
            color: function(context) {
              if (context.tick.value === 0) {
                return '#9ca3af'
              }
              return 'rgba(0,0,0,0.1)'
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Day of Week'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (rValueMode.value) {
                return `R-Multiple: ${context.parsed.x.toFixed(2)}R`
              }
              return `P&L: ${currencySymbol.value}${context.parsed.x.toFixed(2)}`
            }
          }
        }
      }
    }
  })
}

function createPerformanceByHoldTimeChart() {
  if (!performanceByHoldTimeChart.value) {
    console.error('Performance by hold time chart canvas not found')
    return
  }

  if (performanceByHoldTimeChartInstance) {
    performanceByHoldTimeChartInstance.destroy()
  }

  const ctx = performanceByHoldTimeChart.value.getContext('2d')
  const labels = ['< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months']

  // Use R-value data if in R-value mode, otherwise use P&L data
  const chartData = rValueMode.value ? performanceByHoldTimeRData.value : performanceByHoldTimeData.value
  const chartLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L'
  const xAxisLabel = rValueMode.value ? 'Total R-Multiple' : 'Total P&L ($)'

  performanceByHoldTimeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: chartData,
        backgroundColor: chartData.map(val => val >= 0 ? '#4ade80' : '#f87171'),
        borderWidth: 1,
        barThickness: 20,
        categoryPercentage: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const holdTimeRange = holdTimeLabels[index]
          navigateToTradesByHoldTime(holdTimeRange)
        }
      },
      layout: {
        padding: {
          top: 20,
          bottom: 20,
          left: 10,
          right: 10
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: xAxisLabel
          },
          grid: {
            color: function(context) {
              if (context.tick.value === 0) {
                return '#9ca3af'
              }
              return 'rgba(0,0,0,0.1)'
            }
          }
        },
        y: {
          title: {
            display: true,
            text: 'Hold Time'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex
              const tradeCount = performanceByHoldTimeCounts.value[index] || 0
              if (rValueMode.value) {
                return `Total R-Multiple: ${context.parsed.x.toFixed(2)}R (${tradeCount} trades)`
              }
              return `Total P&L: ${currencySymbol.value}${context.parsed.x.toFixed(2)} (${tradeCount} trades)`
            }
          }
        }
      }
    }
  })
}

function createDailyVolumeChart() {
  if (!dailyVolumeChart.value) {
    console.error('Daily volume chart canvas not found')
    return
  }

  if (dailyVolumeChartInstance) {
    dailyVolumeChartInstance.destroy()
  }

  const ctx = dailyVolumeChart.value.getContext('2d')
  const labels = dailyVolumeData.value.map(d => {
    const date = parseTradeDate(d.trade_date)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
  const volumes = dailyVolumeData.value.map(d => d.total_volume)
  
  dailyVolumeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Volume',
        data: volumes,
        backgroundColor: '#f3a05a',
        borderColor: '#e89956',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedDate = dailyVolumeData.value[index].trade_date
          navigateToTradesByDate(clickedDate)
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Date'
          },
          ticks: {
            callback: function(value, index) {
              // Show every 7th tick (weekly intervals)
              if (index % 7 === 0) {
                return this.getLabelForValue(value)
              }
              return ''
            },
            maxRotation: 0,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Volume (Shares)'
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Volume: ${context.parsed.y.toLocaleString()} shares`
            },
            title: function(context) {
              const originalDate = dailyVolumeData.value[context[0].dataIndex].trade_date
              const date = new Date(originalDate)
              return date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              })
            }
          }
        }
      }
    }
  })
}

function createDrawdownChart() {
  if (!drawdownChart.value) {
    console.error('Drawdown chart canvas not found')
    return
  }

  if (drawdownChartInstance) {
    drawdownChartInstance.destroy()
  }

  const ctx = drawdownChart.value.getContext('2d')
  const labels = drawdownData.value.map(d => {
    const date = parseTradeDate(d.trade_date)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  // Use R-value drawdown if in R-value mode, otherwise use dollar drawdown
  const drawdowns = rValueMode.value
    ? drawdownData.value.map(d => d.r_value_drawdown || 0)
    : drawdownData.value.map(d => d.drawdown)

  const yAxisLabel = rValueMode.value ? 'Drawdown (R)' : 'Drawdown ($)'

  // Log drawdown data for debugging
  console.log('Drawdown chart data:', {
    maxDrawdown: Math.min(...drawdowns),
    drawdownCount: drawdowns.length,
    firstFewDrawdowns: drawdowns.slice(0, 5),
    lastFewDrawdowns: drawdowns.slice(-5)
  })

  drawdownChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Drawdown',
        data: drawdowns,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedDate = drawdownData.value[index].trade_date
          navigateToTradesByDate(clickedDate)
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Date'
          },
          ticks: {
            callback: function(value, index) {
              // Show every 7th tick (weekly intervals)
              if (index % 7 === 0) {
                return this.getLabelForValue(value)
              }
              return ''
            },
            maxRotation: 0,
            minRotation: 0
          }
        },
        y: {
          title: {
            display: true,
            text: yAxisLabel
          },
          afterDataLimits: function(scale) {
            const minValue = Math.min(...drawdowns)
            const range = Math.abs(minValue)
            scale.max = range * 0.15 // Add 15% padding above 0
            scale.min = minValue - (range * 0.05) // Add small padding below minimum
          }
        }
      },
      plugins: {
        legend: {
          onClick: null // Disable legend clicking
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (rValueMode.value) {
                return `Drawdown: ${context.parsed.y.toFixed(2)}R`
              }
              return `Drawdown: ${currencySymbol.value}${context.parsed.y.toFixed(2)}`
            },
            title: function(context) {
              const originalDate = drawdownData.value[context[0].dataIndex].trade_date
              const date = new Date(originalDate)
              return date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              })
            }
          }
        }
      }
    }
  })
}

async function fetchChartData() {
  try {
    const params = buildFilterParams()
    const response = await api.get('/analytics/charts', { params })
    
    console.log('Chart data received:', response.data)

    tradeDistributionData.value = response.data.tradeDistribution
    performanceByPriceData.value = response.data.performanceByPrice
    performanceByPriceRData.value = response.data.performanceByPriceR || []
    performanceByPriceCounts.value = response.data.performanceByPriceCounts || []
    performanceByVolumeData.value = response.data.performanceByVolume
    performanceByVolumeRData.value = response.data.performanceByVolumeR || []
    performanceByVolumeCounts.value = response.data.performanceByVolumeCounts || []
    performanceByPositionSizeData.value = response.data.performanceByPositionSize
    performanceByPositionSizeRData.value = response.data.performanceByPositionSizeR || []
    performanceByPositionSizeCounts.value = response.data.performanceByPositionSizeCounts || []
    performanceByHoldTimeData.value = response.data.performanceByHoldTime
    performanceByHoldTimeRData.value = response.data.performanceByHoldTimeR || []
    performanceByHoldTimeCounts.value = response.data.performanceByHoldTimeCounts || []
    dayOfWeekData.value = response.data.dayOfWeek
    dailyVolumeData.value = response.data.dailyVolume
    
    // Update dynamic labels if provided
    if (response.data.labels) {
      chartLabels.value = {
        ...chartLabels.value,
        ...response.data.labels
      }
    }

    // Chart creation is now handled in applyFilters after loading is complete
    console.log('Chart data loaded successfully')
  } catch (error) {
    console.error('Error fetching chart data:', error)
  }
}

async function fetchUserSettings() {
  try {
    const response = await api.get('/settings')
    userSettings.value = response.data.settings

    // Load chart layout if saved
    if (userSettings.value.analyticsChartLayout && Array.isArray(userSettings.value.analyticsChartLayout)) {
      const savedLayout = userSettings.value.analyticsChartLayout
      const savedIds = savedLayout.map(s => s.id)

      // Start with saved layout in its saved order (preserves user's custom ordering)
      // Merge with defaults to pick up any new properties that may have been added
      chartLayout.value = savedLayout.map(savedChart => {
        const defaultChart = defaultChartLayout.find(d => d.id === savedChart.id)
        return defaultChart ? { ...defaultChart, ...savedChart } : savedChart
      })

      // Add any new charts that weren't in the saved layout (appended at the end)
      const newCharts = defaultChartLayout.filter(d => !savedIds.includes(d.id))
      chartLayout.value = [...chartLayout.value, ...newCharts]
    }
  } catch (error) {
    console.error('Failed to load user settings:', error)
    // Default to average if loading fails
    userSettings.value = { statisticsCalculation: 'average' }
  }
}

async function saveChartLayout() {
  try {
    await api.put('/settings', {
      analyticsChartLayout: chartLayout.value
    })
    console.log('[CHART LAYOUT] Layout saved successfully')
  } catch (error) {
    console.error('[CHART LAYOUT] Failed to save layout:', error)
  }
}

async function resetChartLayout() {
  chartLayout.value = JSON.parse(JSON.stringify(defaultChartLayout))
  await saveChartLayout()
}

function toggleCustomization() {
  isCustomizing.value = !isCustomizing.value
}

function toggleRMultipleDisplay() {
  rMultipleFlipped.value = !rMultipleFlipped.value
}

function toggleChartVisibility(chartId) {
  const chart = chartLayout.value.find(c => c.id === chartId)
  if (chart) {
    chart.visible = !chart.visible
  }
}

function toggleChartSize(chartId) {
  const chart = chartLayout.value.find(c => c.id === chartId)
  if (chart) {
    chart.size = chart.size === 'full' ? 'half' : 'full'
  }
}

// Save layout when chart layout changes (with debounce)
let saveLayoutTimeout = null
watch(chartLayout, () => {
  if (saveLayoutTimeout) clearTimeout(saveLayoutTimeout)
  saveLayoutTimeout = setTimeout(() => {
    saveChartLayout()
  }, 1000) // Save 1 second after user stops making changes
}, { deep: true })

// Reinitialize charts when layout changes (after DOM updates)
watch(chartLayout, async () => {
  await nextTick()
  setTimeout(() => {
    initializeAllCharts()
  }, 100)
}, { deep: true })

// Helper function to initialize all charts
function initializeAllCharts() {
  try {
    if (drawdownChart.value) createDrawdownChart()
    if (dailyVolumeChart.value) createDailyVolumeChart()
    if (dayOfWeekChart.value) createDayOfWeekChart()
    if (performanceByHoldTimeChart.value) createPerformanceByHoldTimeChart()
    if (tradeDistributionChart.value) createTradeDistributionChart()
    if (performanceByPriceChart.value) createPerformanceByPriceChart()
    if (performanceByVolumeChart.value) createPerformanceByVolumeChart()
    if (performanceByPositionSizeChart.value) createPerformanceByPositionSizeChart()
  } catch (error) {
    console.error('[CHART] Error initializing charts:', error)
  }
}

// Helper function to build filter params
// IMPORTANT: Use filters.value directly, just like trades store does with ...filters.value
function buildFilterParams(additionalParams = {}) {
  // Start with additional params, then spread filters.value directly
  // This ensures ALL filters are included, even empty ones (which will be filtered out by the API)
  const params = {
    ...additionalParams,
    ...filters.value
  }

  // Add global account filter if set
  if (selectedAccount.value) {
    params.accounts = selectedAccount.value
  }

  // NOTE: R-value mode (rValueMode) is a CHARTS-ONLY display toggle. It must
  // NOT filter the dataset — the summary cards (P&L, win rate, trades, MAE/MFE)
  // always reflect the full filtered dataset in dollars. Only the charts switch
  // to R-multiples. Do not inject a hasRValue filter here.

  // Remove null/undefined/empty string values to keep params clean
  Object.keys(params).forEach(key => {
    if (params[key] === null || params[key] === undefined || params[key] === '') {
      delete params[key]
    }
  })

  console.log('[AnalyticsView] buildFilterParams - filters.value:', JSON.stringify(filters.value))
  console.log('[AnalyticsView] buildFilterParams - returning params:', JSON.stringify(params))
  return params
}

async function fetchOverview() {
  try {
    const params = buildFilterParams()
    console.log('[AnalyticsView] fetchOverview - filters.value:', JSON.stringify(filters.value))
    console.log('[AnalyticsView] fetchOverview - params being sent:', JSON.stringify(params))
    const response = await api.get('/analytics/overview', { params })
    console.log('[AnalyticsView] fetchOverview - API response:', response.data)
    console.log('[AnalyticsView] fetchOverview - Overview data received:', response.data.overview)
    overview.value = response.data.overview
    console.log('[AnalyticsView] fetchOverview - overview.value updated:', overview.value)
  } catch (error) {
    console.error('[AnalyticsView] Failed to fetch overview:', error)
  }
}

async function fetchPerformance() {
  try {
    const params = buildFilterParams({ period: performancePeriod.value })
    const response = await api.get('/analytics/performance', { params })
    performanceData.value = response.data.performance
  } catch (error) {
    console.error('Failed to fetch performance:', error)
  }
}

async function fetchSymbolStats() {
  try {
    const params = buildFilterParams()
    console.log('[SYMBOLS] Fetching symbol stats with filters:', params)
    const response = await api.get('/analytics/symbols', { params })
    console.log('[SYMBOLS] Symbol stats response:', response.data)
    symbolStats.value = response.data.symbols
  } catch (error) {
    console.error('Failed to fetch symbol stats:', error)
  }
}

async function fetchTagStats() {
  try {
    const params = buildFilterParams()
    const response = await api.get('/analytics/tags', { params })
    tagStats.value = response.data.tags
  } catch (error) {
    console.error('Failed to fetch tag stats:', error)
  }
}

async function fetchStrategyStats() {
  try {
    const params = buildFilterParams()
    const response = await api.get('/analytics/strategies', { params })
    strategyStats.value = response.data.strategies
  } catch (error) {
    console.error('Failed to fetch strategy stats:', error)
  }
}

async function fetchHourOfDayStats() {
  try {
    const params = buildFilterParams()
    const response = await api.get('/analytics/hours', { params })
    hourOfDayStats.value = response.data.hours
  } catch (error) {
    console.error('Failed to fetch hour of day stats:', error)
  }
}

async function fetchDrawdownData() {
  try {
    const params = buildFilterParams()
    const response = await api.get('/analytics/drawdown', { params })
    drawdownData.value = response.data.drawdown
  } catch (error) {
    console.error('Failed to fetch drawdown data:', error)
  }
}

// Handle filter changes from TradeFilters component
// TradeFilters only sends non-empty values, so we need to treat newFilters as the complete active filter set
async function handleFilter(newFilters) {
  console.log('[AnalyticsView] handleFilter received:', newFilters)

  // TradeFilters only emits non-empty values, so their count is the badge.
  activeFilterCount.value = Object.values(newFilters || {}).filter(
    v => v !== '' && v !== null && v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0)
  ).length
  
  // CRITICAL: TradeFilters only sends non-empty filters, so we must reset all filters first,
  // then apply only what's in newFilters. This ensures cleared filters are actually cleared.
  // Reset all filters to defaults
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: '',
    setups: '',
    sectors: '',
    tags: '',
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    brokers: '',
    daysOfWeek: '',
    instrumentTypes: '',
    optionTypes: '',
    qualityGrades: ''
  }
  
  // Now apply only the filters that TradeFilters sent (the active ones)
  Object.keys(newFilters).forEach(key => {
    if (key in filters.value) {
      filters.value[key] = newFilters[key]
    }
  })
  
  // Reset localFilters to defaults, then apply new filters
  localFilters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: [],
    setups: [],
    sectors: [],
    tags: [],
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    brokers: [],
    daysOfWeek: [],
    instrumentTypes: [],
    optionTypes: [],
    qualityGrades: []
  }
  
  // Convert newFilters back to localFilters format (arrays for multi-select)
  if (newFilters.symbol) localFilters.value.symbol = newFilters.symbol
  if (newFilters.startDate) localFilters.value.startDate = newFilters.startDate
  if (newFilters.endDate) localFilters.value.endDate = newFilters.endDate
  if (newFilters.strategies) localFilters.value.strategies = typeof newFilters.strategies === 'string' ? newFilters.strategies.split(',').filter(Boolean) : newFilters.strategies
  if (newFilters.sectors) localFilters.value.sectors = typeof newFilters.sectors === 'string' ? newFilters.sectors.split(',').filter(Boolean) : newFilters.sectors
  if (newFilters.tags) localFilters.value.tags = typeof newFilters.tags === 'string' ? newFilters.tags.split(',').filter(Boolean) : newFilters.tags
  if (newFilters.hasNews) localFilters.value.hasNews = newFilters.hasNews
  if (newFilters.side) localFilters.value.side = newFilters.side
  if (newFilters.status) localFilters.value.status = newFilters.status
  if (newFilters.minPrice !== undefined && newFilters.minPrice !== null) localFilters.value.minPrice = newFilters.minPrice
  if (newFilters.maxPrice !== undefined && newFilters.maxPrice !== null) localFilters.value.maxPrice = newFilters.maxPrice
  if (newFilters.minQuantity !== undefined && newFilters.minQuantity !== null) localFilters.value.minQuantity = newFilters.minQuantity
  if (newFilters.maxQuantity !== undefined && newFilters.maxQuantity !== null) localFilters.value.maxQuantity = newFilters.maxQuantity
  if (newFilters.minPnl !== undefined && newFilters.minPnl !== null) localFilters.value.minPnl = newFilters.minPnl
  if (newFilters.maxPnl !== undefined && newFilters.maxPnl !== null) localFilters.value.maxPnl = newFilters.maxPnl
  if (newFilters.pnlType) localFilters.value.pnlType = newFilters.pnlType
  if (newFilters.holdTime) localFilters.value.holdTime = newFilters.holdTime
  if (newFilters.brokers) localFilters.value.brokers = typeof newFilters.brokers === 'string' ? newFilters.brokers.split(',').filter(Boolean) : newFilters.brokers
  if (newFilters.daysOfWeek) localFilters.value.daysOfWeek = typeof newFilters.daysOfWeek === 'string' ? newFilters.daysOfWeek.split(',').filter(Boolean).map(Number) : newFilters.daysOfWeek
  if (newFilters.instrumentTypes) localFilters.value.instrumentTypes = typeof newFilters.instrumentTypes === 'string' ? newFilters.instrumentTypes.split(',').filter(Boolean) : newFilters.instrumentTypes
  if (newFilters.optionTypes) localFilters.value.optionTypes = typeof newFilters.optionTypes === 'string' ? newFilters.optionTypes.split(',').filter(Boolean) : newFilters.optionTypes
  if (newFilters.qualityGrades) localFilters.value.qualityGrades = typeof newFilters.qualityGrades === 'string' ? newFilters.qualityGrades.split(',').filter(Boolean) : newFilters.qualityGrades

  console.log('[AnalyticsView] Updated filters.value:', JSON.stringify(filters.value))
  const params = buildFilterParams()
  console.log('[AnalyticsView] buildFilterParams will return:', JSON.stringify(params))

  loading.value = true

  // Fetch all analytics data with the new filters
  await Promise.all([
    fetchOverview(),
    fetchPerformance(),
    fetchSymbolStats(),
    fetchTagStats(),
    fetchStrategyStats(),
    fetchHourOfDayStats(),
    fetchChartData(),
    fetchDrawdownData()
  ])

  // Load sector data asynchronously
  fetchSectorData()
  loading.value = false
  initialLoading.value = false

  // Create charts after loading is complete and DOM is updated
  await nextTick()
  setTimeout(() => {
    initializeAllCharts()
  }, 100)
}

async function applyFilters(newFilters = null) {
  // Convert localFilters to API format
  filters.value = {
    // Basic filters
    symbol: localFilters.value.symbol,
    startDate: localFilters.value.startDate,
    endDate: localFilters.value.endDate,
    strategies: (localFilters.value.strategies || []).join(','),
    sectors: (localFilters.value.sectors || []).join(','),
    tags: (localFilters.value.tags || []).join(','),
    hasNews: localFilters.value.hasNews,
    // Advanced filters
    side: localFilters.value.side,
    minPrice: localFilters.value.minPrice,
    maxPrice: localFilters.value.maxPrice,
    minQuantity: localFilters.value.minQuantity,
    maxQuantity: localFilters.value.maxQuantity,
    status: localFilters.value.status,
    minPnl: localFilters.value.minPnl,
    maxPnl: localFilters.value.maxPnl,
    pnlType: localFilters.value.pnlType,
    holdTime: localFilters.value.holdTime,
    brokers: (localFilters.value.brokers || []).join(','),
    daysOfWeek: (localFilters.value.daysOfWeek || []).join(','),
    instrumentTypes: (localFilters.value.instrumentTypes || []).join(','),
    optionTypes: (localFilters.value.optionTypes || []).join(','),
    qualityGrades: (localFilters.value.qualityGrades || []).join(',')
  }
  
  loading.value = true
  
  // Save filters to localStorage
  saveFilters()
  
  await Promise.all([
    fetchOverview(),
    fetchPerformance(),
    fetchSymbolStats(),
    fetchTagStats(),
    fetchStrategyStats(),
    fetchHourOfDayStats(),
    fetchChartData(),
    fetchDrawdownData()
  ])

  // Load sector data asynchronously after page loads
  fetchSectorData()
  loading.value = false
  initialLoading.value = false

  // Create charts after loading is complete and DOM is updated
  await nextTick()
  setTimeout(() => {
    initializeAllCharts()
  }, 100)
}

async function resetFilters() {
  // Reset local filters
  localFilters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: [],
    setups: [],
    sectors: [],
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    brokers: [],
    daysOfWeek: [],
    instrumentTypes: [],
    optionTypes: [],
    qualityGrades: []
  }

  // Reset and reload data
  await clearFilters()
}

async function clearFilters() {
  // Reset local filters
  localFilters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: [],
    setups: [],
    sectors: [],
    hasNews: '',
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    brokers: [],
    daysOfWeek: [],
    instrumentTypes: [],
    optionTypes: [],
    qualityGrades: []
  }

  // Reset API filters
  filters.value = {
    // Basic filters
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: '',
    setups: '',
    sectors: '',
    hasNews: '',
    // Advanced filters
    side: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    status: '',
    minPnl: null,
    maxPnl: null,
    pnlType: '',
    holdTime: '',
    brokers: '',
    daysOfWeek: '',
    instrumentTypes: '',
    optionTypes: '',
    qualityGrades: ''
  }
  
  // Clear localStorage to ensure fresh defaults
  localStorage.removeItem('analyticsFilters')
  uiPreferencesStore.notifyChanged('analyticsFilters', null)

  // Apply the cleared filters
  await applyFilters()
}

async function getRecommendations() {
  try {
    console.log('[START] Starting AI recommendations request...')
    loadingRecommendations.value = true
    recommendationError.value = null
    recommendations.value = null
    
    const params = buildFilterParams()
    
    console.log('[API] Making API call to /analytics/recommendations with params:', params)
    
    // Add timeout to the request
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minute timeout for AI processing
    
    try {
      const response = await api.get('/analytics/recommendations', {
        params,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      console.log('[SUCCESS] API response received:', response)
      console.log('[API] Response status:', response.status)
      console.log('[PACKAGE] Response data keys:', Object.keys(response.data || {}))
      console.log('[CONFIG] Recommendations content preview:', response.data?.recommendations?.substring(0, 100) + '...')
      
      if (!response.data) {
        throw new Error('No data received from API')
      }
      
      if (!response.data.recommendations) {
        throw new Error('No recommendations field in response')
      }
      
      recommendations.value = response.data
      console.log('[STORAGE] Recommendations stored in state:', !!recommendations.value)
      console.log('[TARGET] Setting showRecommendations to true...')
      
      // Force reactivity update with nextTick
      await nextTick()
      showRecommendations.value = true
      
      console.log('[CHECK] showRecommendations is now:', showRecommendations.value)
      
      // Double-check modal state after a small delay
      setTimeout(() => {
        console.log('[CHECK] Double-checking modal state after 100ms:', showRecommendations.value)
      }, 100)
      
    } catch (timeoutError) {
      clearTimeout(timeoutId)
      if (timeoutError.name === 'AbortError') {
        throw new Error('Request timed out after 60 seconds')
      }
      throw timeoutError
    }
    
  } catch (error) {
    console.error('[ERROR] Error fetching recommendations:', error)
    console.error('Error response:', error.response)
    console.error('Error status:', error.response?.status)
    console.error('Error data:', error.response?.data)
    
    recommendationError.value = error.response?.data?.error || 'Failed to generate recommendations. Please try again.'
    await nextTick()
    showRecommendations.value = true
  } finally {
    loadingRecommendations.value = false
  }
}

async function fetchSectorData() {
  try {
    loadingSectors.value = true
    const params = buildFilterParams()
    console.log('[SECTORS] Fetching sector performance data with filters:', params)
    const response = await api.get('/analytics/sectors', { params })
    console.log('[SECTORS] Sector response:', response.data)
    sectorData.value = response.data.sectors || []
    allSectorData.value = response.data.sectors || []
    
    // Update sector stats
    sectorStats.value = {
      symbolsAnalyzed: response.data.symbolsAnalyzed || 0,
      totalSymbols: response.data.totalSymbols || 0,
      uncategorizedSymbols: response.data.uncategorizedSymbols || 0,
      failedSymbols: response.data.failedSymbols || 0,
      processedSymbols: response.data.processedSymbols || 0
    }
    
    // Initialize progress tracking (use processedSymbols to account for failed ones)
    categorizationProgress.value = {
      total: sectorStats.value.totalSymbols,
      completed: sectorStats.value.processedSymbols,
      percentage: sectorStats.value.totalSymbols > 0 
        ? Math.round((sectorStats.value.processedSymbols / sectorStats.value.totalSymbols) * 100)
        : 0
    }
    
    console.log('[SUCCESS] Sector data loaded:', sectorData.value.length, 'sectors')
    console.log('[SECTORS] Sector stats:', sectorStats.value)
    console.log('[PROGRESS] Categorization progress:', categorizationProgress.value)
    
    // If there are uncategorized symbols, set up auto-refresh with progress updates
    if (sectorStats.value.uncategorizedSymbols > 0) {
      console.log('⏳ Setting up auto-refresh for uncategorized symbols...')
      startProgressTracking()
    }
  } catch (error) {
    console.error('[ERROR] Error fetching sector data:', error)
    sectorData.value = []
    sectorStats.value = { symbolsAnalyzed: 0, totalSymbols: 0, uncategorizedSymbols: 0 }
  } finally {
    loadingSectors.value = false
  }
}

function navigateToSectorTrades(sectorName) {
  console.log(`[NAV] Navigating to trades for sector: ${sectorName}`)
  router.push({
    path: '/trades',
    query: {
      sector: sectorName
    }
  })
}

async function refreshSectorData() {
  try {
    loadingSectorRefresh.value = true
    const params = new URLSearchParams()
    if (filters.value.startDate) params.append('startDate', filters.value.startDate)
    if (filters.value.endDate) params.append('endDate', filters.value.endDate)
    
    console.log('[PROCESS] Refreshing sector performance data...')
    const response = await api.get(`/analytics/sectors/refresh?${params}`)
    sectorData.value = response.data.sectors || []
    allSectorData.value = response.data.sectors || []
    
    // Update sector stats
    const oldUncategorized = sectorStats.value.uncategorizedSymbols
    sectorStats.value = {
      symbolsAnalyzed: response.data.symbolsAnalyzed || 0,
      totalSymbols: response.data.totalSymbols || 0,
      uncategorizedSymbols: response.data.uncategorizedSymbols || 0,
      failedSymbols: response.data.failedSymbols || 0,
      processedSymbols: response.data.processedSymbols || 0
    }
    
    // Update progress (use processedSymbols to account for failed ones)
    categorizationProgress.value = {
      total: sectorStats.value.totalSymbols,
      completed: sectorStats.value.processedSymbols,
      percentage: sectorStats.value.totalSymbols > 0 
        ? Math.round((sectorStats.value.processedSymbols / sectorStats.value.totalSymbols) * 100)
        : 0
    }
    
    console.log('[SUCCESS] Sector data refreshed:', sectorData.value.length, 'sectors')
    console.log('[UPDATE] Updated sector stats:', sectorStats.value)
    console.log('[UPDATE] Updated categorization progress:', categorizationProgress.value)
    
    // Show success message if more symbols were categorized
    if (oldUncategorized > sectorStats.value.uncategorizedSymbols) {
      const newlyCategorized = oldUncategorized - sectorStats.value.uncategorizedSymbols
      console.log(`[SUCCESS] ${newlyCategorized} additional symbols categorized!`)
    }
    
    // Check if all symbols are now categorized
    if (sectorStats.value.uncategorizedSymbols === 0 && sectorStats.value.totalSymbols > 0) {
      console.log('[SUCCESS] All symbols categorized!')
      showCompletionMessage.value = true
      
      // Hide completion message after 3 seconds
      setTimeout(() => {
        showCompletionMessage.value = false
      }, 3000)
      
      // Clear progress interval
      if (progressInterval) {
        clearInterval(progressInterval)
        progressInterval = null
      }
    } else if (sectorStats.value.uncategorizedSymbols > 0) {
      // Continue tracking if there are still uncategorized symbols
      startProgressTracking()
    }
    
  } catch (error) {
    console.error('[ERROR] Error refreshing sector data:', error)
  } finally {
    loadingSectorRefresh.value = false
  }
}

let progressInterval = null

function startProgressTracking() {
  // Clear any existing interval
  if (progressInterval) {
    clearInterval(progressInterval)
  }
  
  // Set up periodic progress checks
  progressInterval = setInterval(async () => {
    if (sectorStats.value.uncategorizedSymbols === 0) {
      clearInterval(progressInterval)
      progressInterval = null
      return
    }
    
    // Check progress every 10 seconds
    await refreshSectorData()
  }, 10000)
  
  // Also set up the 30-second refresh as backup
  setTimeout(() => {
    if (sectorStats.value.uncategorizedSymbols > 0) {
      refreshSectorData()
    }
  }, 30000)
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString()
}

async function loadData() {
  loading.value = true

  // Load user settings first
  await fetchUserSettings()

  // Load saved filters from localStorage (use same key as TradeFilters component)
  const savedFilters = localStorage.getItem('tradeFilters')
  const savedPeriod = localStorage.getItem('tradeFiltersPeriod')

  console.log('[AnalyticsView] onMounted - Loading from localStorage')
  console.log('[AnalyticsView] savedFilters:', savedFilters)
  console.log('[AnalyticsView] savedPeriod:', savedPeriod)

  if (savedFilters || savedPeriod) {
    try {
      // First, always load saved filters if they exist (this includes custom dates)
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters)
        console.log('[AnalyticsView] Parsed filters:', parsed)
        console.log('[AnalyticsView] parsed startDate:', parsed.startDate, 'endDate:', parsed.endDate)
        
        // Update localFilters first (this is what applyFilters uses)
        localFilters.value = {
          symbol: parsed.symbol || '',
          startDate: parsed.startDate || '',
          endDate: parsed.endDate || '',
          strategies: Array.isArray(parsed.strategies) ? parsed.strategies : (parsed.strategies ? parsed.strategies.split(',').filter(Boolean) : []),
          sectors: Array.isArray(parsed.sectors) ? parsed.sectors : (parsed.sectors ? parsed.sectors.split(',').filter(Boolean) : []),
          tags: Array.isArray(parsed.tags) ? parsed.tags : (parsed.tags ? parsed.tags.split(',').filter(Boolean) : []),
          hasNews: parsed.hasNews || '',
          side: parsed.side || '',
          minPrice: parsed.minPrice || null,
          maxPrice: parsed.maxPrice || null,
          minQuantity: parsed.minQuantity || null,
          maxQuantity: parsed.maxQuantity || null,
          status: parsed.status || '',
          minPnl: parsed.minPnl || null,
          maxPnl: parsed.maxPnl || null,
          pnlType: parsed.pnlType || '',
          holdTime: parsed.holdTime || '',
          brokers: Array.isArray(parsed.brokers) ? parsed.brokers : (parsed.brokers ? parsed.brokers.split(',').filter(Boolean) : []),
          daysOfWeek: Array.isArray(parsed.daysOfWeek) ? parsed.daysOfWeek : (parsed.daysOfWeek ? parsed.daysOfWeek.split(',').filter(Boolean).map(Number) : []),
          instrumentTypes: Array.isArray(parsed.instrumentTypes) ? parsed.instrumentTypes : (parsed.instrumentTypes ? parsed.instrumentTypes.split(',').filter(Boolean) : []),
          optionTypes: Array.isArray(parsed.optionTypes) ? parsed.optionTypes : (parsed.optionTypes ? parsed.optionTypes.split(',').filter(Boolean) : []),
          qualityGrades: Array.isArray(parsed.qualityGrades) ? parsed.qualityGrades : (parsed.qualityGrades ? parsed.qualityGrades.split(',').filter(Boolean) : [])
        }
        
        // Also merge into filters for backward compatibility
        Object.keys(parsed).forEach(key => {
          if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
            filters.value[key] = parsed[key]
          }
        })
        console.log('[AnalyticsView] After merge, localFilters.value:', JSON.stringify(localFilters.value))
      }

      // If a period preset is saved (not custom), recalculate dates dynamically
      // This ensures relative periods like "30d" are always relative to today
      if (savedPeriod && savedPeriod !== 'custom' && savedPeriod !== 'all') {
        const now = new Date()
        // Use local date formatting to avoid timezone issues (e.g., 8PM CST showing as next day)
        const formatLocalDate = (date) => {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }
        const today = formatLocalDate(now)
        let startDate = ''

        switch (savedPeriod) {
          case '7d': {
            const start = new Date(now)
            start.setDate(start.getDate() - 7)
            startDate = formatLocalDate(start)
            break
          }
          case '30d': {
            const start = new Date(now)
            start.setDate(start.getDate() - 30)
            startDate = formatLocalDate(start)
            break
          }
          case '90d': {
            const start = new Date(now)
            start.setDate(start.getDate() - 90)
            startDate = formatLocalDate(start)
            break
          }
          case 'ytd': {
            const start = new Date(now.getFullYear(), 0, 1)
            startDate = formatLocalDate(start)
            break
          }
          case '1y': {
            const start = new Date(now)
            start.setFullYear(start.getFullYear() - 1)
            startDate = formatLocalDate(start)
            break
          }
        }

        localFilters.value.startDate = startDate
        localFilters.value.endDate = today
        filters.value.startDate = startDate
        filters.value.endDate = today
      } else if (savedPeriod === 'all') {
        // All time - no date filters
        localFilters.value.startDate = ''
        localFilters.value.endDate = ''
        filters.value.startDate = ''
        filters.value.endDate = ''
      }
      // For 'custom' period, dates are already loaded from savedFilters above
    } catch (e) {
      // If parsing fails, don't set any date filter (show all data)
      console.error('Failed to parse saved filters:', e)
    }
  }
  // If no saved filters, don't set default dates - let TradeFilters handle it
  // This prevents overriding the TradeFilters component's saved state

  await applyFilters()
}

function setDefaultDateRange() {
  // Set default to cover actual trade data (2024) instead of current date (2025)
  filters.value.endDate = '2024-12-31'
  filters.value.startDate = '2024-01-01'
}

function saveFilters() {
  localStorage.setItem('analyticsFilters', JSON.stringify(filters.value))
  uiPreferencesStore.notifyChanged('analyticsFilters', filters.value)
}

function navigateToSymbolTrades(symbol) {
  router.push({
    path: '/trades',
    query: { symbol: symbol }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Navigation functions for chart clicks
function navigateToTradesByPriceRange(priceRange) {
  // Convert price range to min/max price values
  let minPrice = null
  let maxPrice = null
  
  switch (priceRange) {
    case '< $2':
      minPrice = 0
      maxPrice = 1.99
      break
    case '$2-4.99':
      minPrice = 2
      maxPrice = 4.99
      break
    case '$5-9.99':
      minPrice = 5
      maxPrice = 9.99
      break
    case '$10-19.99':
      minPrice = 10
      maxPrice = 19.99
      break
    case '$20-49.99':
      minPrice = 20
      maxPrice = 49.99
      break
    case '$50-99.99':
      minPrice = 50
      maxPrice = 99.99
      break
    case '$100-199.99':
      minPrice = 100
      maxPrice = 199.99
      break
    case '$200+':
      minPrice = 200
      maxPrice = null
      break
  }
  
  const query = {}
  if (minPrice !== null) query.minPrice = minPrice
  if (maxPrice !== null) query.maxPrice = maxPrice
  
  router.push({
    path: '/trades',
    query
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByVolumeRange(volumeRange) {
  // Convert volume range to min/max quantity values
  let minQuantity = null
  let maxQuantity = null
  
  // Parse the volume range string (e.g., "1-100", "1000+", etc.)
  if (volumeRange.includes('-')) {
    const [min, max] = volumeRange.split('-').map(v => parseInt(v.replace(/[^0-9]/g, '')))
    minQuantity = min
    maxQuantity = max
  } else if (volumeRange.includes('+')) {
    minQuantity = parseInt(volumeRange.replace(/[^0-9]/g, ''))
    maxQuantity = null
  } else if (volumeRange.includes('<')) {
    minQuantity = 0
    maxQuantity = parseInt(volumeRange.replace(/[^0-9]/g, '')) - 1
  }
  
  const query = {}
  if (minQuantity !== null) query.minQuantity = minQuantity
  if (maxQuantity !== null) query.maxQuantity = maxQuantity
  
  router.push({
    path: '/trades',
    query
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByDayOfWeek(dayOfWeek) {
  router.push({
    path: '/trades',
    query: {
      daysOfWeek: dayOfWeek.toString() // Pass the day number (0=Sunday, 1=Monday, etc.)
    }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByPositionSize(positionSizeRange) {
  // Parse the position size range (e.g., "$100-$200", "$5K-$10K", "$1M-$2M")
  let minPositionSize = null
  let maxPositionSize = null

  const parseValue = (str) => {
    // Remove $ sign
    str = str.replace('$', '').trim()

    // Handle K (thousands)
    if (str.includes('K')) {
      return parseFloat(str.replace('K', '')) * 1000
    }
    // Handle M (millions)
    if (str.includes('M')) {
      return parseFloat(str.replace('M', '')) * 1000000
    }
    // Plain number
    return parseFloat(str)
  }

  if (positionSizeRange.includes('-')) {
    const parts = positionSizeRange.split('-')
    minPositionSize = parseValue(parts[0])
    maxPositionSize = parseValue(parts[1])
  } else if (positionSizeRange.includes('+')) {
    minPositionSize = parseValue(positionSizeRange.replace('+', ''))
    maxPositionSize = null
  } else if (positionSizeRange.includes('<')) {
    minPositionSize = 0
    maxPositionSize = parseValue(positionSizeRange.replace('<', '')) - 1
  }

  const query = {}
  if (minPositionSize !== null) query.minPositionSize = minPositionSize
  if (maxPositionSize !== null) query.maxPositionSize = maxPositionSize

  router.push({
    path: '/trades',
    query
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByHoldTime(holdTimeRange) {
  router.push({
    path: '/trades',
    query: {
      holdTime: holdTimeRange
    }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByDate(date) {
  router.push({
    path: '/trades',
    query: {
      startDate: date,
      endDate: date
    }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Watch for global account filter changes
watch(selectedAccount, () => {
  console.log('[AnalyticsView] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  loadData()
})

onMounted(async () => {
  // Add click outside listener
  document.addEventListener('click', handleClickOutside)

  // Fetch filter dropdown data
  fetchAvailableSectorsForFilter()
  fetchAvailableBrokersForFilter()

  // loadData() now handles initializing localFilters from saved filters
  await loadData()

  // Scroll to hash if present. The dashboard's Max Drawdown card links to
  // #drawdown; if the user customized the layout to hide that chart, force it
  // back on so the click has a visible target instead of silently no-op'ing.
  if (route.hash) {
    if (route.hash === '#drawdown') {
      const drawdownChart = chartLayout.value.find(c => c.id === 'drawdown-chart')
      if (drawdownChart && !drawdownChart.visible) {
        drawdownChart.visible = true
      }
    }

    // The Strategy/Setup Performance table lives on the "By Symbol & Strategy"
    // tab and may be hidden via layout customization. Switch to that tab and
    // force the section visible so the scroll target actually renders.
    if (route.hash === '#strategies') {
      activeAnalyticsTab.value = 'symbol'
      const strategyTable = chartLayout.value.find(c => c.id === 'strategy-performance')
      if (strategyTable && !strategyTable.visible) {
        strategyTable.visible = true
      }
    }

    await nextTick()
    const element = document.querySelector(route.hash)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Briefly highlight the target so users see where they landed.
      element.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2', 'transition-all')
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2')
      }, 2000)
    }
  }
})

// Clean up charts and intervals on unmount
onUnmounted(() => {
  // Remove click outside listener
  document.removeEventListener('click', handleClickOutside)
  
  if (tradeDistributionChartInstance) {
    tradeDistributionChartInstance.destroy()
  }
  if (performanceByPriceChartInstance) {
    performanceByPriceChartInstance.destroy()
  }
  if (performanceByVolumeChartInstance) {
    performanceByVolumeChartInstance.destroy()
  }
  if (performanceByPositionSizeChartInstance) {
    performanceByPositionSizeChartInstance.destroy()
  }
  if (performanceByHoldTimeChartInstance) {
    performanceByHoldTimeChartInstance.destroy()
  }
  if (dayOfWeekChartInstance) {
    dayOfWeekChartInstance.destroy()
  }
  if (dailyVolumeChartInstance) {
    dailyVolumeChartInstance.destroy()
  }
  if (drawdownChartInstance) {
    drawdownChartInstance.destroy()
  }
  
  // Clean up progress tracking interval
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
})

// Load More function
function loadMoreSectors() {
  sectorsToShow.value += 10
  console.log(`[DISPLAY] Showing ${sectorsToShow.value} sectors out of ${allSectorData.value.length}`)
}

// Collapse function
function collapseSectors() {
  sectorsToShow.value = 10
  console.log(`[DISPLAY] Collapsed to show ${sectorsToShow.value} sectors`)
}

// Watch for R-value mode changes and rebuild charts (charts-only toggle)
watch(() => rValueMode.value, async () => {
  // R-multiple mode is a charts-only display toggle — the dataset is identical
  // whether it's on or off, so there's no need to refetch. Just rebuild the
  // charts so they redraw in R-multiples (or back to dollars). The summary
  // cards intentionally do not change.
  await nextTick()
  setTimeout(() => {
    initializeAllCharts()
  }, 100)
})
</script>

<style scoped>
/* Crossfade between Average R-Multiple and Total R on the toggleable card */
.r-fade-enter-active,
.r-fade-leave-active {
  transition: opacity 0.2s ease;
}
.r-fade-enter-from,
.r-fade-leave-to {
  opacity: 0;
}
</style>
