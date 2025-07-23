<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Analyze your trading performance and identify areas for improvement.
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="space-y-8">
      <!-- Date Filter -->
      <div class="card">
        <div class="card-body">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label for="startDate" class="label">Start Date</label>
              <input
                id="startDate"
                v-model="filters.startDate"
                type="date"
                class="input"
              />
            </div>
            <div>
              <label for="endDate" class="label">End Date</label>
              <input
                id="endDate"
                v-model="filters.endDate"
                type="date"
                class="input"
              />
            </div>
            
            <!-- Mobile: Stack buttons vertically -->
            <div class="flex flex-col space-y-2 sm:hidden">
              <div class="flex space-x-2">
                <button 
                  @click="applyFilters"
                  :disabled="loading"
                  class="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  <span v-if="loading" class="flex items-center justify-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Applying
                  </span>
                  <span v-else>Apply</span>
                </button>
                <button 
                  @click="clearFilters"
                  :disabled="loading"
                  class="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Clear
                </button>
              </div>
              <button 
                @click="getRecommendations" 
                :disabled="loadingRecommendations"
                class="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span v-if="loadingRecommendations" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Analyzing...
                </span>
                <span v-else class="whitespace-nowrap">
                  AI Recommendations
                </span>
              </button>
            </div>
            
            <!-- Desktop: Keep inline -->
            <div class="hidden sm:flex items-end space-x-2">
              <button 
                @click="applyFilters"
                :disabled="loading"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                <span v-if="loading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Applying
                </span>
                <span v-else>Apply</span>
              </button>
              <button 
                @click="clearFilters"
                :disabled="loading"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Clear
              </button>
              <button 
                @click="getRecommendations" 
                :disabled="loadingRecommendations"
                class="px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] flex items-center justify-center"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span v-if="loadingRecommendations" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Analyzing...
                </span>
                <span v-else>
                  AI Recommendations
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Overview Stats -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Total P&L
            </dt>
            <dd class="mt-1 text-2xl font-semibold" :class="[
              overview.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
            ]">
              ${{ formatNumber(overview.total_pnl) }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Win Rate
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.win_rate }}%
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Total Trades
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.total_trades }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              {{ calculationMethod }} Trade
            </dt>
            <dd class="mt-1 text-2xl font-semibold" :class="[
              overview.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'
            ]">
              ${{ formatNumber(overview.avg_pnl) }}
            </dd>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Profit Factor
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ overview.profit_factor ?? '0.00' }}
            </dd>
          </div>
        </div>
      </div>

      <!-- Equity Notice for K-Ratio -->
      <div v-if="overview.k_ratio === '0.00'" class="card mb-6">
        <div class="card-body">
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">K-Ratio Requires Account Equity Tracking</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                To calculate your K-Ratio, you need to track your account equity over time. The K-Ratio requires at least 3 equity entries to calculate meaningful consistency metrics.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <router-link to="/settings" class="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40">
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

      <!-- Advanced Trading Metrics -->
      <div class="card mb-8">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Advanced Trading Metrics</h3>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                System Quality Number
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ overview.sqn ?? '0.00' }} <span class="text-sm text-gray-500">(ratio)</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ getSQNInterpretation(overview.sqn) }}
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>System Quality Number (SQN)</strong><br>
                  Measures the quality of your trading system by calculating ({{ calculationMethod }} Trade / Standard Deviation) × √Number of Trades. Higher values indicate more consistent performance.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                Probability of Random
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ overview.probability_random ?? 'N/A' }} <span class="text-sm text-gray-500">(probability)</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Statistical significance
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>Probability of Random</strong><br>
                  The likelihood that your trading results could have occurred by random chance. Lower percentages indicate more statistically significant results.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                Kelly Percentage
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ overview.kelly_percentage ?? '0.00' }}% <span class="text-sm text-gray-500">(of capital)</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Optimal position size
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>Kelly Percentage</strong><br>
                  The optimal percentage of your capital to risk per trade to maximize long-term growth, based on your win rate and average win/loss ratio.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                K-Ratio
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ overview.k_ratio ?? '0.00' }} <span class="text-sm text-gray-500">(ratio)</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span v-if="overview.k_ratio === '0.00'">
                  Requires 3+ equity entries
                </span>
                <span v-else>
                  {{ getKRatioInterpretation(overview.k_ratio) }} (equity-based)
                </span>
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>K-Ratio</strong><br>
                  Measures the consistency of your equity curve by calculating {{ calculationMethod }} Return / Standard Deviation of Returns. Higher values indicate smoother, more consistent performance.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                Total Commissions
              </dt>
              <dd class="mt-1 text-lg font-semibold text-red-600">
                ${{ formatNumber(overview.total_commissions ?? 0) }} <span class="text-sm text-gray-500">(USD)</span>
              </dd>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                Total Fees
              </dt>
              <dd class="mt-1 text-lg font-semibold text-red-600">
                ${{ formatNumber(overview.total_fees ?? 0) }} <span class="text-sm text-gray-500">(USD)</span>
              </dd>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                {{ calculationMethod }} Position MAE
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                <span v-if="overview.avg_mae !== 'N/A'">${{ overview.avg_mae }} <span class="text-sm text-gray-500">(USD)</span></span>
                <span v-else>{{ overview.avg_mae }}</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Max adverse excursion (est.)
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>Maximum Adverse Excursion (MAE)</strong><br>
                  The largest unrealized loss your position experienced during the trade. Helps assess risk management and stop-loss placement.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
            
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 relative group">
              <dt class="text-xs font-medium text-gray-500 dark:text-gray-400 truncate cursor-help">
                {{ calculationMethod }} Position MFE
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                <span v-if="overview.avg_mfe !== 'N/A'">${{ overview.avg_mfe }} <span class="text-sm text-gray-500">(USD)</span></span>
                <span v-else>{{ overview.avg_mfe }}</span>
              </dd>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Max favorable excursion (est.)
              </p>
              <!-- Tooltip -->
              <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-1500 z-10 w-64">
                <div class="text-center">
                  <strong>Maximum Favorable Excursion (MFE)</strong><br>
                  The largest unrealized profit your position experienced during the trade. Helps assess profit-taking strategies and potential missed opportunities.
                </div>
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Stats -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <!-- Win/Loss Breakdown -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Win/Loss Breakdown</h3>
            <div>
              <!-- Column Headers -->
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Metric</span>
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Value</span>
              </div>
              
              <!-- Data Rows -->
              <div class="space-y-1">
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Winning Trades</span>
                  <span class="text-sm font-medium text-green-600">
                    {{ overview.winning_trades }} ({{ getWinPercentage() }}%)
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Losing Trades</span>
                  <span class="text-sm font-medium text-red-600">
                    {{ overview.losing_trades }} ({{ getLossPercentage() }}%)
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Breakeven Trades</span>
                  <span class="text-sm font-medium text-gray-500">
                    {{ overview.breakeven_trades }}
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">{{ calculationMethod }} Win</span>
                  <span class="text-sm font-medium text-green-600">
                    ${{ formatNumber(overview.avg_win) }}
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">{{ calculationMethod }} Loss</span>
                  <span class="text-sm font-medium text-red-600">
                    ${{ formatNumber(Math.abs(overview.avg_loss)) }}
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Best Trade</span>
                  <span class="text-sm font-medium text-green-600">
                    ${{ formatNumber(overview.best_trade) }}
                  </span>
                </div>
                <div class="flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-1 -m-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Worst Trade</span>
                  <span class="text-sm font-medium text-red-600">
                    ${{ formatNumber(overview.worst_trade) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Symbols -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Performing Symbols</h3>
            <div v-if="symbolStats.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
              No data available
            </div>
            <div v-else>
              <!-- Column Headers -->
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-baseline">
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
                  <div class="flex items-baseline">
                    <span class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 w-16">{{ symbol.symbol }}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ symbol.total_trades }}
                    </span>
                  </div>
                  <div class="flex items-center">
                    <div class="text-sm font-medium w-20 text-right" :class="[
                      symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    ]">
                      ${{ formatNumber(symbol.total_pnl) }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                      {{ (symbol.winning_trades / symbol.total_trades * 100).toFixed(0) }}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Chart -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Performance Over Time</h3>
            <select v-model="performancePeriod" @change="fetchPerformance" class="input w-auto">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div class="h-80">
            <PerformanceChart :data="performanceData" />
          </div>
        </div>
      </div>

      <!-- Sector Performance -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Sector Performance</h3>
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
                class="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-md transition-colors disabled:opacity-50"
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
                  ${{ formatNumber(sector.total_pnl) }}
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
                    :title="`${symbol.trades} trades, $${formatNumber(symbol.pnl)} P&L`"
                  >
                    {{ symbol.symbol }}
                    <span 
                      class="ml-1 text-xs"
                      :class="symbol.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      ${{ Math.abs(symbol.pnl) >= 1000 ? (symbol.pnl/1000).toFixed(1) + 'k' : symbol.pnl.toFixed(0) }}
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

      <!-- Drawdown Chart -->
      <div id="drawdown" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Drawdown Analysis</h3>
          <div class="h-80 relative">
            <canvas ref="drawdownChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- Daily Volume Chart -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Daily Volume Traded</h3>
          <div class="h-80 relative">
            <canvas ref="dailyVolumeChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- Day of Week Performance -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Day of Week</h3>
          <div class="h-80 relative">
            <canvas ref="dayOfWeekChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- Performance by Hold Time -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Hold Time</h3>
          <div class="h-96 relative">
            <canvas ref="performanceByHoldTimeChart" class="absolute inset-0 w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- New Chart Section -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <!-- Trade Distribution by Price -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Distribution by Price</h3>
            <div class="h-80 relative">
              <canvas ref="tradeDistributionChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance by Price -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance by Price</h3>
            <div class="h-80 relative">
              <canvas ref="performanceByPriceChart" class="absolute inset-0 w-full h-full"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance by Volume Traded -->
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
      </div>

      <!-- Tag Performance -->
      <div v-if="tagStats.length > 0" class="card">
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
                    Win Rate
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    P&L
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ calculationMethod }} P&L
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="tag in tagStats" :key="tag.tag">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full">
                      {{ tag.tag }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ tag.total_trades }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ (tag.winning_trades / tag.total_trades * 100).toFixed(1) }}%
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    tag.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    ${{ formatNumber(tag.total_pnl) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" :class="[
                    tag.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    ${{ formatNumber(tag.avg_pnl) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Recommendations Modal -->
    <div v-if="showRecommendations" class="fixed inset-0 z-50 overflow-y-auto" @click="showRecommendations = false">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
        
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <div 
          class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full sm:p-6"
          @click.stop
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              AI Performance Recommendations
            </h3>
            <button 
              @click="showRecommendations = false"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div v-if="recommendations" class="max-h-[70vh] overflow-y-auto">
            <div class="ai-recommendations max-w-none">
              <div v-if="recommendations.recommendations">
                <div 
                  class="text-gray-700 dark:text-gray-300"
                  v-html="parseMarkdown(recommendations.recommendations)"
                ></div>
              </div>
              <div v-else class="text-red-500 p-4">
                No recommendations content found. Raw data: {{ JSON.stringify(recommendations) }}
              </div>
            </div>
            
            <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>Analysis completed: {{ formatDate(recommendations.analysisDate) }}</p>
                <p>Trades analyzed: {{ recommendations.tradesAnalyzed }}</p>
                <p v-if="recommendations.dateRange.startDate || recommendations.dateRange.endDate">
                  Date range: {{ recommendations.dateRange.startDate || 'Beginning' }} to {{ recommendations.dateRange.endDate || 'Present' }}
                </p>
              </div>
            </div>
          </div>
          
          <div v-else-if="recommendationError" class="text-center py-8">
            <div class="text-red-600 dark:text-red-400 mb-2">
              <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p class="text-gray-600 dark:text-gray-400">{{ recommendationError }}</p>
          </div>
          
          <div v-else class="text-center py-8">
            <div class="text-gray-500 dark:text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div class="text-gray-600 dark:text-gray-400 text-xs space-y-1">
              <p>Debug: showRecommendations={{ showRecommendations }}, recommendations={{ !!recommendations }}, error={{ !!recommendationError }}</p>
              <p v-if="recommendations">Recommendations keys: {{ Object.keys(recommendations) }}</p>
              <p v-if="recommendations">Has recommendations field: {{ !!recommendations.recommendations }}</p>
              <p v-if="recommendations && recommendations.recommendations">Content length: {{ recommendations.recommendations.length }}</p>
              <p v-if="recommendations && recommendations.recommendations">Content preview: {{ recommendations.recommendations.substring(0, 50) }}...</p>
            </div>
          </div>
          
          <div class="mt-5 sm:mt-6 flex justify-end">
            <button 
              @click="showRecommendations = false"
              class="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/services/api'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import Chart from 'chart.js/auto'
import { marked } from 'marked'
import { 
  mdiCheckCircle,
  mdiTarget,
  mdiChartBox,
  mdiAlert
} from '@mdi/js'

const loading = ref(true)
const performancePeriod = ref('daily')
const userSettings = ref(null)
const router = useRouter()
const route = useRoute()

const filters = ref({
  startDate: '',
  endDate: ''
})

const overview = ref({
  total_pnl: 0,
  win_rate: 0,
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
  avg_mfe: 'N/A'
})

const performanceData = ref([])
const symbolStats = ref([])
const tagStats = ref([])

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

// Computed property for calculation method
const calculationMethod = computed(() => {
  return userSettings.value?.statisticsCalculation === 'median' ? 'Median' : 'Average'
})

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
const performanceByHoldTimeChart = ref(null)
const dayOfWeekChart = ref(null)
const dailyVolumeChart = ref(null)
const drawdownChart = ref(null)

// Chart instances
let tradeDistributionChartInstance = null
let performanceByPriceChartInstance = null
let performanceByVolumeChartInstance = null
let performanceByHoldTimeChartInstance = null
let dayOfWeekChartInstance = null
let dailyVolumeChartInstance = null
let drawdownChartInstance = null

// Chart data
const tradeDistributionData = ref([])
const performanceByPriceData = ref([])
const performanceByVolumeData = ref([])
const performanceByHoldTimeData = ref([])
const dayOfWeekData = ref([])
const dailyVolumeData = ref([])
const drawdownData = ref([])

// Dynamic chart labels
const chartLabels = ref({
  volume: [],
  price: ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+'],
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

function getWinPercentage() {
  if (overview.value.total_trades === 0) return 0
  return ((overview.value.winning_trades / overview.value.total_trades) * 100).toFixed(1)
}

function getLossPercentage() {
  if (overview.value.total_trades === 0) return 0
  return ((overview.value.losing_trades / overview.value.total_trades) * 100).toFixed(1)
}

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
  
  performanceByPriceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total P&L',
        data: performanceByPriceData.value,
        backgroundColor: performanceByPriceData.value.map(val => val >= 0 ? '#4ade80' : '#f87171'),
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
            text: 'Total P&L ($)'
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
              return `Total P&L: $${context.parsed.x.toFixed(2)}`
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

  // Only create chart if there's data to display
  if (!performanceByVolumeData.value.length || performanceByVolumeData.value.every(val => val === 0)) {
    console.log('No volume data to display, skipping chart creation')
    return
  }

  const ctx = performanceByVolumeChart.value.getContext('2d')
  const labels = chartLabels.value.volume.length > 0 ? chartLabels.value.volume : []
  
  performanceByVolumeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total P&L',
        data: performanceByVolumeData.value,
        backgroundColor: performanceByVolumeData.value.map(val => val >= 0 ? '#4ade80' : '#f87171'),
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
            text: 'Total P&L ($)'
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
              return `Total P&L: $${context.parsed.x.toFixed(2)}`
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
  const weekdayData = dayOfWeekData.value.slice(1, 6) // Skip Sunday (0) and Saturday (6)
  
  dayOfWeekChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Total P&L',
        data: weekdayData.map(d => d.total_pnl || 0),
        backgroundColor: weekdayData.map(d => (d.total_pnl || 0) >= 0 ? '#4ade80' : '#f87171'),
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
            text: 'Total P&L ($)'
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
              return `P&L: $${context.parsed.x.toFixed(2)}`
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
  
  performanceByHoldTimeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total P&L',
        data: performanceByHoldTimeData.value,
        backgroundColor: performanceByHoldTimeData.value.map(val => val >= 0 ? '#4ade80' : '#f87171'),
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
            text: 'Total P&L ($)'
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
              return `Total P&L: $${context.parsed.x.toFixed(2)}`
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
    const date = new Date(d.trade_date)
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
    const date = new Date(d.trade_date)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
  const drawdowns = drawdownData.value.map(d => d.drawdown)
  
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
            text: 'Drawdown ($)'
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
              return `Drawdown: $${context.parsed.y.toFixed(2)}`
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
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/charts', { params })
    
    console.log('Chart data received:', response.data)
    
    tradeDistributionData.value = response.data.tradeDistribution
    performanceByPriceData.value = response.data.performanceByPrice
    performanceByVolumeData.value = response.data.performanceByVolume
    performanceByHoldTimeData.value = response.data.performanceByHoldTime
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
  } catch (error) {
    console.error('Failed to load user settings:', error)
    // Default to average if loading fails
    userSettings.value = { statisticsCalculation: 'average' }
  }
}

async function fetchOverview() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/overview', { params })
    console.log('Analytics API response:', response.data)
    console.log('Overview data received:', response.data.overview)
    overview.value = response.data.overview
  } catch (error) {
    console.error('Failed to fetch overview:', error)
  }
}

async function fetchPerformance() {
  try {
    const params = { period: performancePeriod.value }
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/performance', { params })
    performanceData.value = response.data.performance
  } catch (error) {
    console.error('Failed to fetch performance:', error)
  }
}

async function fetchSymbolStats() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    console.log('📊 Fetching symbol stats with filters:', params)
    const response = await api.get('/analytics/symbols', { params })
    console.log('📊 Symbol stats response:', response.data)
    symbolStats.value = response.data.symbols
  } catch (error) {
    console.error('Failed to fetch symbol stats:', error)
  }
}

async function fetchTagStats() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/tags', { params })
    tagStats.value = response.data.tags
  } catch (error) {
    console.error('Failed to fetch tag stats:', error)
  }
}

async function fetchDrawdownData() {
  try {
    const params = {}
    if (filters.value.startDate) params.startDate = filters.value.startDate
    if (filters.value.endDate) params.endDate = filters.value.endDate

    const response = await api.get('/analytics/drawdown', { params })
    drawdownData.value = response.data.drawdown
  } catch (error) {
    console.error('Failed to fetch drawdown data:', error)
  }
}

async function applyFilters() {
  loading.value = true
  
  // Save filters to localStorage
  saveFilters()
  
  await Promise.all([
    fetchOverview(),
    fetchPerformance(),
    fetchSymbolStats(),
    fetchTagStats(),
    fetchChartData(),
    fetchDrawdownData()
  ])
  
  // Load sector data asynchronously after page loads
  fetchSectorData()
  loading.value = false
  
  // Create charts after loading is complete and DOM is updated
  await nextTick()
  setTimeout(() => {
    try {
      createTradeDistributionChart()
      createPerformanceByPriceChart()
      createPerformanceByVolumeChart()
      createPerformanceByHoldTimeChart()
      createDayOfWeekChart()
      createDailyVolumeChart()
      createDrawdownChart()
    } catch (error) {
      console.error('Error creating charts:', error)
    }
  }, 100)
}

async function clearFilters() {
  filters.value.startDate = ''
  filters.value.endDate = ''
  
  // Clear localStorage to ensure fresh defaults
  localStorage.removeItem('analyticsFilters')
  
  // Apply the cleared filters
  await applyFilters()
}

async function getRecommendations() {
  try {
    console.log('🚀 Starting AI recommendations request...')
    loadingRecommendations.value = true
    recommendationError.value = null
    recommendations.value = null
    
    const params = new URLSearchParams()
    if (filters.value.startDate) params.append('startDate', filters.value.startDate)
    if (filters.value.endDate) params.append('endDate', filters.value.endDate)
    
    console.log('📡 Making API call to:', `/analytics/recommendations?${params}`)
    
    // Add timeout to the request
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minute timeout for AI processing
    
    try {
      const response = await api.get(`/analytics/recommendations?${params}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      console.log('✅ API response received:', response)
      console.log('📊 Response status:', response.status)
      console.log('📦 Response data keys:', Object.keys(response.data || {}))
      console.log('📝 Recommendations content preview:', response.data?.recommendations?.substring(0, 100) + '...')
      
      if (!response.data) {
        throw new Error('No data received from API')
      }
      
      if (!response.data.recommendations) {
        throw new Error('No recommendations field in response')
      }
      
      recommendations.value = response.data
      console.log('💾 Recommendations stored in state:', !!recommendations.value)
      console.log('🎯 Setting showRecommendations to true...')
      
      // Force reactivity update with nextTick
      await nextTick()
      showRecommendations.value = true
      
      console.log('👁️ showRecommendations is now:', showRecommendations.value)
      
      // Double-check modal state after a small delay
      setTimeout(() => {
        console.log('🔍 Double-checking modal state after 100ms:', showRecommendations.value)
      }, 100)
      
    } catch (timeoutError) {
      clearTimeout(timeoutId)
      if (timeoutError.name === 'AbortError') {
        throw new Error('Request timed out after 60 seconds')
      }
      throw timeoutError
    }
    
  } catch (error) {
    console.error('❌ Error fetching recommendations:', error)
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
    const params = new URLSearchParams()
    if (filters.value.startDate) params.append('startDate', filters.value.startDate)
    if (filters.value.endDate) params.append('endDate', filters.value.endDate)
    
    console.log('🏭 Fetching sector performance data with filters:', params.toString())
    const response = await api.get(`/analytics/sectors?${params}`)
    console.log('🏭 Sector response:', response.data)
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
    
    console.log('✅ Sector data loaded:', sectorData.value.length, 'sectors')
    console.log('📊 Sector stats:', sectorStats.value)
    console.log('📈 Progress:', categorizationProgress.value)
    
    // If there are uncategorized symbols, set up auto-refresh with progress updates
    if (sectorStats.value.uncategorizedSymbols > 0) {
      console.log('⏳ Setting up auto-refresh for uncategorized symbols...')
      startProgressTracking()
    }
  } catch (error) {
    console.error('❌ Error fetching sector data:', error)
    sectorData.value = []
    sectorStats.value = { symbolsAnalyzed: 0, totalSymbols: 0, uncategorizedSymbols: 0 }
  } finally {
    loadingSectors.value = false
  }
}

function navigateToSectorTrades(sectorName) {
  console.log(`📊 Navigating to trades for sector: ${sectorName}`)
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
    
    console.log('🔄 Refreshing sector performance data...')
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
    
    console.log('✅ Sector data refreshed:', sectorData.value.length, 'sectors')
    console.log('📊 Updated sector stats:', sectorStats.value)
    console.log('📈 Updated progress:', categorizationProgress.value)
    
    // Show success message if more symbols were categorized
    if (oldUncategorized > sectorStats.value.uncategorizedSymbols) {
      const newlyCategorized = oldUncategorized - sectorStats.value.uncategorizedSymbols
      console.log(`🎉 ${newlyCategorized} additional symbols categorized!`)
    }
    
    // Check if all symbols are now categorized
    if (sectorStats.value.uncategorizedSymbols === 0 && sectorStats.value.totalSymbols > 0) {
      console.log('🎉 All symbols categorized!')
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
    console.error('❌ Error refreshing sector data:', error)
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

function parseMarkdown(text) {
  if (!text) return ''
  
  try {
    console.log('🎨 Parsing markdown, text length:', text.length)
    
    // Use basic marked parsing with post-processing for styling
    let result = marked.parse(text, {
      breaks: true,
      gfm: true
    })
    
    // Post-process the HTML to add custom classes with icon styling
    result = result
      .replace(/<h1>/g, '<h1 class="ai-section-header level-1"><span class="section-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,17.5A1.5,1.5 0 0,1 10.5,16A1.5,1.5 0 0,1 12,14.5A1.5,1.5 0 0,1 13.5,16A1.5,1.5 0 0,1 12,17.5M12,5A3,3 0 0,1 15,8C15,9.5 13.5,10.5 13,11.5H11C10.5,10.5 9,9.5 9,8A3,3 0 0,1 12,5Z" /></svg></span><span class="section-text">')
      .replace(/<\/h1>/g, '</span></h1>')
      .replace(/<h2>/g, '<h2 class="ai-section-header level-2"><span class="section-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" /></svg></span><span class="section-text">')
      .replace(/<\/h2>/g, '</span></h2>')
      .replace(/<h3>/g, '<h3 class="ai-section-header level-3"><span class="section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" /></svg></span><span class="section-text">')
      .replace(/<\/h3>/g, '</span></h3>')
      .replace(/<p>/g, '<p class="ai-paragraph">')
      .replace(/<ul>/g, '<ul class="ai-unordered-list">')
      .replace(/<ol>/g, '<ol class="ai-ordered-list">')
      .replace(/<li>/g, '<li class="ai-list-item">')
      .replace(/<strong>/g, '<strong class="ai-emphasis">')
    
    console.log('✅ Markdown parsed and styled successfully, result length:', result.length)
    return result
  
  } catch (error) {
    console.error('❌ Error parsing markdown:', error)
    console.error('Text that failed:', text.substring(0, 200) + '...')
    return `<div class="text-red-500 p-4">Error parsing markdown: ${error.message}<br><br>Raw text:<br><pre class="whitespace-pre-wrap">${text}</pre></div>`
  }
}

async function loadData() {
  loading.value = true
  
  // Load user settings first
  await fetchUserSettings()
  
  // Load saved filters from localStorage
  const savedFilters = localStorage.getItem('analyticsFilters')
  if (savedFilters) {
    try {
      const parsed = JSON.parse(savedFilters)
      filters.value = parsed
    } catch (e) {
      // If parsing fails, use default date range
      setDefaultDateRange()
    }
  } else {
    // Set default date range (last 30 days)
    setDefaultDateRange()
  }

  await applyFilters()
}

function setDefaultDateRange() {
  // Set default to cover actual trade data (2024) instead of current date (2025)
  filters.value.endDate = '2024-12-31'
  filters.value.startDate = '2024-01-01'
}

function saveFilters() {
  localStorage.setItem('analyticsFilters', JSON.stringify(filters.value))
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

onMounted(async () => {
  await loadData()
  
  // Scroll to hash if present
  if (route.hash) {
    await nextTick()
    const element = document.querySelector(route.hash)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
})

// Clean up charts and intervals on unmount
onUnmounted(() => {
  if (tradeDistributionChartInstance) {
    tradeDistributionChartInstance.destroy()
  }
  if (performanceByPriceChartInstance) {
    performanceByPriceChartInstance.destroy()
  }
  if (performanceByVolumeChartInstance) {
    performanceByVolumeChartInstance.destroy()
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
  console.log(`📊 Showing ${sectorsToShow.value} sectors out of ${allSectorData.value.length}`)
}

// Collapse function
function collapseSectors() {
  sectorsToShow.value = 10
  console.log(`📊 Collapsed to show ${sectorsToShow.value} sectors`)
}
</script>

<style scoped>
/* AI Recommendations Styling */
.ai-recommendations {
  line-height: 1.8;
  font-size: 16px;
  color: #374151;
  max-width: none;
}

.dark .ai-recommendations {
  color: #d1d5db;
}

/* Section Headers */
.ai-section-header {
  @apply flex items-center gap-3 mb-6 mt-8 pb-3 border-b border-gray-300 dark:border-gray-600;
  scroll-margin-top: 1rem;
  letter-spacing: -0.025em;
}

.ai-section-header.level-1 {
  @apply text-2xl font-bold text-gray-900 dark:text-white;
  margin-top: 2rem;
  margin-bottom: 1.5rem;
}

.ai-section-header.level-2 {
  @apply text-xl font-semibold text-gray-800 dark:text-gray-100;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
}

.ai-section-header.level-3 {
  @apply text-lg font-medium text-gray-700 dark:text-gray-200;
  margin-top: 1rem;
  margin-bottom: 0.75rem;
}

.section-icon {
  @apply text-xl flex-shrink-0;
}

.section-text {
  @apply flex-1;
}

/* Paragraphs */
.ai-paragraph {
  @apply mb-6 text-gray-700 dark:text-gray-300;
  line-height: 1.75;
  font-size: 16px;
  margin-top: 0;
}

.ai-paragraph + .ai-paragraph {
  margin-top: 1.5rem;
}

/* Lists */
.ai-unordered-list {
  @apply mb-6 ml-0 space-y-3;
  padding-left: 1.5rem;
}

.ai-ordered-list {
  @apply mb-6 ml-0 space-y-3;
  padding-left: 1.5rem;
}

.ai-list-item {
  @apply text-gray-700 dark:text-gray-300;
  line-height: 1.7;
  font-size: 16px;
  position: relative;
  padding-left: 0.5rem;
}

.ai-unordered-list .ai-list-item::before {
  content: '▸';
  @apply text-primary-600 dark:text-primary-400 font-bold absolute;
  left: -1.25rem;
  top: 0.1rem;
}

.ai-ordered-list .ai-list-item {
  @apply list-decimal;
  margin-left: 0;
}

/* Emphasis */
.ai-emphasis {
  @apply font-semibold text-primary-800 dark:text-primary-200 bg-primary-100 dark:bg-primary-900/40 px-2 py-1 rounded;
  font-size: 0.95em;
  letter-spacing: -0.015em;
}

/* Override default prose styles for better spacing */
.ai-recommendations h1:first-child,
.ai-recommendations h2:first-child,
.ai-recommendations h3:first-child {
  @apply mt-0;
}

.ai-recommendations h1:last-child,
.ai-recommendations h2:last-child,
.ai-recommendations h3:last-child,
.ai-recommendations p:last-child,
.ai-recommendations ul:last-child,
.ai-recommendations ol:last-child {
  @apply mb-0;
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .ai-section-header {
    @apply text-sm gap-2;
  }
  
  .ai-section-header.level-1 {
    @apply text-lg;
  }
  
  .ai-section-header.level-2 {
    @apply text-base;
  }
  
  .section-icon {
    @apply text-lg;
  }
}

/* Modal improvements */
.ai-recommendations {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
  padding: 1.5rem;
  background: #fafafa;
  border-radius: 0.5rem;
  margin: -0.5rem;
}

.dark .ai-recommendations {
  background: #1f2937;
}

.ai-recommendations::-webkit-scrollbar {
  width: 8px;
}

.ai-recommendations::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800 rounded;
}

.ai-recommendations::-webkit-scrollbar-thumb {
  @apply bg-gray-400 dark:bg-gray-600 rounded hover:bg-gray-500 dark:hover:bg-gray-500;
}
</style>