<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Back Button and Title -->
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
      </div>

      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Behavioral Analytics</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Analyze your trading behavior patterns and emotional decision-making
        </p>
      </div>

      <!-- Pro Tier Gate -->
      <div v-if="!hasAccess" class="card mb-8">
        <div class="card-body text-center py-12">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/20 mb-4">
            <svg class="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Pro Feature</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Behavioral Analytics is a Pro feature that helps identify emotional trading patterns like revenge trading, overtrading, and FOMO.
          </p>
          <button class="btn btn-primary">
            Upgrade to Pro
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Main Content -->
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
                  @click="analyzeHistoricalTrades" 
                  :disabled="loadingHistorical"
                  class="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span v-if="loadingHistorical" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Analyzing...
                  </span>
                  <span v-else class="whitespace-nowrap">
                    Analyze History
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
                  @click="analyzeHistoricalTrades" 
                  :disabled="loadingHistorical"
                  class="px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] flex items-center justify-center"
                >
                  <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span v-if="loadingHistorical" class="flex items-center">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Analyzing...
                  </span>
                  <span v-else>
                    Analyze History
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Alerts -->
        <div v-if="activeAlerts.length > 0" class="space-y-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Active Alerts</h2>
          <div class="grid gap-4">
            <div 
              v-for="alert in activeAlerts" 
              :key="alert.id"
              class="card border-l-4"
              :class="{
                'border-l-red-500 bg-red-50 dark:bg-red-900/10': alert.alert_type === 'warning',
                'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10': alert.alert_type === 'recommendation',
                'border-l-red-600 bg-red-100 dark:bg-red-900/20': alert.alert_type === 'blocking'
              }"
            >
              <div class="card-body">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ alert.title }}</h3>
                    <p class="text-gray-600 dark:text-gray-400 mt-1">{{ alert.message }}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      {{ formatDate(alert.created_at) }}
                    </p>
                  </div>
                  <button
                    @click="acknowledgeAlert(alert.id)"
                    class="ml-4 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Overview Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Revenge Trading Score -->
          <div class="card">
            <div class="card-body">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Revenge Trading Events</dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ revengeAnalysis?.statistics?.total_events || 0 }}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <!-- Loss Rate -->
          <div class="card">
            <div class="card-body">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                    <svg class="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Revenge Trading Loss Rate</dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ revengeAnalysis?.statistics?.loss_rate || 0 }}%</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <!-- Average Duration -->
          <div class="card">
            <div class="card-body">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <svg class="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Avg Duration</dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ Math.round(revengeAnalysis?.statistics?.avg_duration_minutes || 0) }}m</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <!-- Total P&L -->
          <div class="card">
            <div class="card-body">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="h-8 w-8 rounded-full flex items-center justify-center"
                       :class="{
                         'bg-green-100 dark:bg-green-900/20': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) < 0,
                         'bg-red-100 dark:bg-red-900/20': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) > 0,
                         'bg-gray-100 dark:bg-gray-900/20': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) === 0
                       }">
                    <svg class="h-5 w-5" 
                         :class="{
                           'text-green-600 dark:text-green-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) < 0,
                           'text-red-600 dark:text-red-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) > 0,
                           'text-gray-600 dark:text-gray-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) === 0
                         }"
                         fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      <span v-if="parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) < 0">Total Losses Recovered</span>
                      <span v-else-if="parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) > 0">Total Losses Increased</span>
                      <span v-else>Total Revenge P&L</span>
                    </dt>
                    <dd class="text-lg font-medium"
                        :class="{
                          'text-green-600 dark:text-green-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) < 0,
                          'text-red-600 dark:text-red-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) > 0,
                          'text-gray-600 dark:text-gray-400': parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) === 0
                        }">
                      <span v-if="parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0) < 0">
                        ${{ Math.abs(parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0)).toFixed(2) }}
                      </span>
                      <span v-else>
                        ${{ parseFloat(revengeAnalysis?.statistics?.total_additional_loss || 0).toFixed(2) }}
                      </span>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Revenge Trading Analysis -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Revenge Trading Detection</h3>
            
            <!-- No Data State -->
            <div v-if="!revengeAnalysis?.events?.length" class="text-center py-12">
              <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
                <svg class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Revenge Trading Detected</h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Great job! We haven't detected any revenge trading patterns in the selected time period.
              </p>
            </div>

            <!-- Events List -->
            <div v-else class="space-y-4">
              <!-- Re-run Analysis Button -->
              <div class="flex justify-between items-center mb-4">
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  Showing {{ revengeAnalysis.events.length }} of {{ pagination.total }} revenge trading events
                </div>
                <button 
                  @click="reRunAnalysis" 
                  :disabled="loadingHistorical"
                  class="px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span v-if="loadingHistorical">Re-analyzing...</span>
                  <span v-else>Re-run Analysis</span>
                </button>
              </div>
              
              <div 
                v-for="event in revengeAnalysis.events" 
                :key="event.id"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <span 
                        class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                        :class="{
                          'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': event.outcome_type === 'loss',
                          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': event.outcome_type === 'profit',
                          'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400': event.outcome_type === 'neutral'
                        }"
                      >
                        {{ event.outcome_type }}
                      </span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">
                        {{ formatDate(event.created_at) }}
                      </span>
                    </div>
                    <!-- Trigger Trade Information -->
                    <div v-if="event.trigger_trade" 
                         class="mt-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border-l-4 border-red-500">
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-red-800 dark:text-red-400">
                          📉 Initial Loss Trade (Trigger)
                        </h4>
                        <button 
                          @click="openTrade(event.trigger_trade.id)"
                          class="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                          View Details
                        </button>
                      </div>
                      <p class="text-xs text-red-700 dark:text-red-300 mb-3">
                        This losing trade triggered emotional revenge trading behavior
                      </p>
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span class="text-red-600 dark:text-red-400 font-medium">Symbol:</span>
                          <span class="ml-1">{{ event.trigger_trade.symbol }}</span>
                        </div>
                        <div>
                          <span class="text-red-600 dark:text-red-400 font-medium">Entry:</span>
                          <span class="ml-1">${{ parseFloat(event.trigger_trade.entry_price).toFixed(2) }}</span>
                        </div>
                        <div>
                          <span class="text-red-600 dark:text-red-400 font-medium">Exit:</span>
                          <span class="ml-1">${{ parseFloat(event.trigger_trade.exit_price).toFixed(2) }}</span>
                        </div>
                        <div>
                          <span class="text-red-600 dark:text-red-400 font-medium">Loss:</span>
                          <span class="ml-1 font-medium text-red-600 dark:text-red-400">
                            ${{ getPnLValue(event.trigger_trade).toFixed(2) }}
                          </span>
                        </div>
                        <div class="col-span-2 md:col-span-4">
                          <span class="text-red-600 dark:text-red-400 font-medium">Completed:</span>
                          <span class="ml-1">{{ formatDate(event.trigger_trade.exit_time) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Revenge Trading Follow-up -->
                    <div v-if="event.related_patterns?.length" class="mt-4">
                      <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-2">
                          <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200">⚡ Revenge Trading Response</h4>
                          <span class="text-xs text-gray-500 dark:text-gray-400">
                            ({{ getTimeBetweenTrades(event.trigger_trade.exit_time, event.related_patterns[0]?.entry_time) }} later)
                          </span>
                        </div>
                        <button 
                          v-if="event.related_patterns.length > 3"
                          @click="toggleEventExpansion(event.id)"
                          class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
                        >
                          <span>{{ expandedEvents.has(event.id) ? 'Show Less' : `Show All ${event.related_patterns.length}` }}</span>
                          <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-180': expandedEvents.has(event.id) }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                          </svg>
                        </button>
                      </div>
                      
                      <div class="space-y-3">
                        <div 
                          v-for="(pattern, index) in expandedEvents.has(event.id) ? event.related_patterns : event.related_patterns.slice(0, 3)" 
                          :key="pattern.pattern_type + index"
                          class="p-3 rounded-lg border-l-4 cursor-pointer transition-colors"
                          :class="{
                            'bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border-orange-400': pattern.pattern_type === 'same_symbol_revenge',
                            'bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20 border-purple-400': pattern.pattern_type === 'emotional_reactive_trading'
                          }"
                          @click="openTrade(pattern.trade_id)"
                        >
                          <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center space-x-2">
                              <span v-if="pattern.pattern_type === 'same_symbol_revenge'" class="text-sm font-medium text-orange-800 dark:text-orange-400">
                                🎯 Same Symbol Revenge
                              </span>
                              <span v-else class="text-sm font-medium text-purple-800 dark:text-purple-400">
                                ⚡ Emotional Spillover
                              </span>
                              <span 
                                class="px-2 py-0.5 text-xs rounded"
                                :class="{
                                  'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400': pattern.severity === 'high',
                                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400': pattern.severity === 'medium',
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400': pattern.severity === 'low'
                                }"
                              >
                                {{ pattern.severity }} risk
                              </span>
                            </div>
                            <button class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                              View Trade
                            </button>
                          </div>
                          
                          <!-- Basic Trade Info -->
                          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Symbol:</span>
                              <span class="ml-1 font-medium">{{ pattern.symbol }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Side:</span>
                              <span class="ml-1 font-medium uppercase">{{ pattern.side }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Quantity:</span>
                              <span class="ml-1">{{ pattern.quantity }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Time:</span>
                              <span class="ml-1">{{ formatTime(pattern.entry_time) }}</span>
                            </div>
                          </div>

                          <!-- Price & Cost Info -->
                          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Entry:</span>
                              <span class="ml-1">${{ parseFloat(pattern.entry_price).toFixed(2) }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Exit:</span>
                              <span class="ml-1">${{ parseFloat(pattern.exit_price).toFixed(2) }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Total Cost:</span>
                              <span class="ml-1 font-medium">${{ parseFloat(pattern.total_cost).toLocaleString() }}</span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Fees:</span>
                              <span class="ml-1">${{ parseFloat(pattern.total_fees || 0).toFixed(2) }}</span>
                            </div>
                          </div>

                          <!-- P&L Info -->
                          <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-2">
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Gross P&L:</span>
                              <span class="ml-1 font-medium"
                                    :class="{
                                      'text-green-600 dark:text-green-400': parseFloat(pattern.gross_pnl) > 0,
                                      'text-red-600 dark:text-red-400': parseFloat(pattern.gross_pnl) < 0,
                                      'text-gray-600 dark:text-gray-400': parseFloat(pattern.gross_pnl) === 0
                                    }">
                                ${{ parseFloat(pattern.gross_pnl).toFixed(2) }}
                              </span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Net P&L:</span>
                              <span class="ml-1 font-medium"
                                    :class="{
                                      'text-green-600 dark:text-green-400': parseFloat(pattern.pnl) > 0,
                                      'text-red-600 dark:text-red-400': parseFloat(pattern.pnl) < 0,
                                      'text-gray-600 dark:text-gray-400': parseFloat(pattern.pnl) === 0
                                    }">
                                ${{ parseFloat(pattern.pnl).toFixed(2) }}
                              </span>
                            </div>
                            <div>
                              <span class="text-gray-600 dark:text-gray-400">Return:</span>
                              <span class="ml-1 font-medium"
                                    :class="{
                                      'text-green-600 dark:text-green-400': parseFloat(pattern.return_percent) > 0,
                                      'text-red-600 dark:text-red-400': parseFloat(pattern.return_percent) < 0,
                                      'text-gray-600 dark:text-gray-400': parseFloat(pattern.return_percent) === 0
                                    }">
                                {{ parseFloat(pattern.return_percent).toFixed(2) }}%
                              </span>
                            </div>
                          </div>
                          
                          <div class="text-xs" 
                               :class="{
                                 'text-orange-600 dark:text-orange-400': pattern.pattern_type === 'same_symbol_revenge',
                                 'text-purple-600 dark:text-purple-400': pattern.pattern_type === 'emotional_reactive_trading'
                               }">
                            <span v-if="pattern.pattern_type === 'same_symbol_revenge'">
                              📈 Tried to recover losses by trading {{ pattern.symbol }} again
                            </span>
                            <span v-else>
                              💭 Emotional reaction led to trading {{ pattern.symbol }} (different from trigger symbol)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Outcome Summary -->
                    <div class="mt-4 p-3 rounded-lg border-t border-gray-200 dark:border-gray-600 pt-4"
                         :class="{
                           'bg-red-50 dark:bg-red-900/10': event.outcome_type === 'loss',
                           'bg-green-50 dark:bg-green-900/10': event.outcome_type === 'profit',
                           'bg-gray-50 dark:bg-gray-900/10': event.outcome_type === 'neutral'
                         }">
                      <div class="flex items-center justify-between mb-2">
                        <h5 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          📊 Revenge Trading Outcome
                        </h5>
                        <span 
                          class="inline-flex px-3 py-1 text-sm font-semibold rounded-full"
                          :class="{
                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': event.outcome_type === 'loss',
                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': event.outcome_type === 'profit',
                            'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400': event.outcome_type === 'neutral'
                          }"
                        >
                          <span v-if="event.outcome_type === 'loss'">❌ Made it worse</span>
                          <span v-else-if="event.outcome_type === 'profit'">✅ Recovered losses</span>
                          <span v-else>➖ Broke even</span>
                        </span>
                      </div>
                      
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span class="text-gray-600 dark:text-gray-400">Time to revenge trade:</span>
                          <span class="ml-1 font-medium">{{ Math.round(event.time_window_minutes / 60) }}h {{ event.time_window_minutes % 60 }}m</span>
                        </div>
                        <div>
                          <span class="text-gray-600 dark:text-gray-400">
                            <span v-if="parseFloat(event.total_additional_loss) < 0">Losses recovered:</span>
                            <span v-else-if="parseFloat(event.total_additional_loss) > 0">Losses increased:</span>
                            <span v-else>Additional P&L:</span>
                          </span>
                          <span class="ml-1 font-medium"
                                :class="{
                                  'text-red-600 dark:text-red-400': parseFloat(event.total_additional_loss) > 0,
                                  'text-green-600 dark:text-green-400': parseFloat(event.total_additional_loss) < 0,
                                  'text-gray-600 dark:text-gray-400': parseFloat(event.total_additional_loss) === 0
                                }">
                            <span v-if="parseFloat(event.total_additional_loss) < 0">
                              ${{ Math.abs(parseFloat(event.total_additional_loss)).toFixed(2) }}
                            </span>
                            <span v-else>
                              ${{ parseFloat(event.total_additional_loss || 0).toFixed(2) }}
                            </span>
                          </span>
                        </div>
                        <div>
                          <span class="text-gray-600 dark:text-gray-400">Revenge trades:</span>
                          <span class="ml-1 font-medium">{{ event.total_revenge_trades }}</span>
                        </div>
                      </div>
                      
                      <div class="mt-3 text-xs"
                           :class="{
                             'text-red-700 dark:text-red-300': event.outcome_type === 'loss',
                             'text-green-700 dark:text-green-300': event.outcome_type === 'profit',
                             'text-gray-700 dark:text-gray-300': event.outcome_type === 'neutral'
                           }">
                        <span v-if="event.outcome_type === 'loss'">
                          💔 The revenge trading made the situation worse by adding ${{ Math.abs(parseFloat(event.total_additional_loss)).toFixed(2) }} in additional losses
                        </span>
                        <span v-else-if="event.outcome_type === 'profit'">
                          💰 The revenge trading actually worked this time, recovering ${{ Math.abs(parseFloat(event.total_additional_loss)).toFixed(2) }}
                        </span>
                        <span v-else>
                          ⚖️ The revenge trading broke even - no additional gains or losses
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Pagination -->  
              <div v-if="pagination.totalPages > 1" class="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6 rounded-lg">
                <div class="flex flex-1 justify-between sm:hidden">
                  <button
                    @click="prevPage"
                    :disabled="!pagination.hasPreviousPage"
                    class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  <button
                    @click="nextPage"
                    :disabled="!pagination.hasNextPage"
                    class="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Next
                  </button>
                </div>
                <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                      Showing
                      <span class="font-medium">{{ ((pagination.page - 1) * pagination.limit) + 1 }}</span>
                      to
                      <span class="font-medium">{{ Math.min(pagination.page * pagination.limit, pagination.total) }}</span>
                      of
                      <span class="font-medium">{{ pagination.total }}</span>
                      results
                    </p>
                  </div>
                  <div>
                    <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        @click="prevPage"
                        :disabled="!pagination.hasPreviousPage"
                        class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-gray-600 dark:hover:bg-gray-700"
                      >
                        <span class="sr-only">Previous</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
                        </svg>
                      </button>
                      
                      <template v-for="page in Math.min(pagination.totalPages, 5)" :key="page">
                        <button
                          @click="goToPage(page)"
                          :class="[
                            page === pagination.page
                              ? 'relative z-10 inline-flex items-center bg-primary-600 px-4 py-2 text-sm font-semibold text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
                              : 'relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700'
                          ]"
                        >
                          {{ page }}
                        </button>
                      </template>
                      
                      <button
                        @click="nextPage"
                        :disabled="!pagination.hasNextPage"
                        class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-gray-600 dark:hover:bg-gray-700"
                      >
                        <span class="sr-only">Next</span>
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Behavioral Insights -->
        <div v-if="insights" class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Behavioral Insights</h3>
            
            <!-- Overall Risk Score -->
            <div class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Risk Score</span>
                <span class="text-lg font-bold text-gray-900 dark:text-white">{{ insights.overallRisk.score }}/100</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                <div 
                  class="h-2 rounded-full transition-all duration-300"
                  :class="{
                    'bg-green-600': insights.overallRisk.level === 'low',
                    'bg-yellow-600': insights.overallRisk.level === 'medium',
                    'bg-red-600': insights.overallRisk.level === 'high'
                  }"
                  :style="{ width: `${insights.overallRisk.score}%` }"
                ></div>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">{{ insights.overallRisk.description }}</p>
            </div>

            <!-- Insights List -->
            <div class="space-y-4">
              <div 
                v-for="insight in insights.insights" 
                :key="insight.title"
                class="p-4 rounded-lg border"
                :class="{
                  'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10': insight.severity === 'high',
                  'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10': insight.severity === 'medium',
                  'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10': insight.severity === 'low'
                }"
              >
                <h4 class="font-medium text-gray-900 dark:text-white">{{ insight.title }}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ insight.message }}</p>
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                  💡 {{ insight.recommendation }}
                </p>
              </div>
            </div>

            <!-- Recommendations -->
            <div v-if="insights.recommendations?.length" class="mt-6">
              <h4 class="font-medium text-gray-900 dark:text-white mb-3">Recommended Actions</h4>
              <div class="space-y-3">
                <div 
                  v-for="rec in insights.recommendations" 
                  :key="rec.action"
                  class="flex items-start space-x-3"
                >
                  <span 
                    class="inline-flex px-2 py-1 text-xs font-semibold rounded whitespace-nowrap mt-0.5 flex-shrink-0 w-16 justify-center"
                    :class="{
                      'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': rec.priority === 'high',
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400': rec.priority === 'medium',
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400': rec.priority === 'low'
                    }"
                  >
                    {{ rec.priority.toUpperCase() }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">{{ rec.action }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{{ rec.benefit }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Risk Level Legend -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Risk Level Legend</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="flex items-center space-x-3">
                <span class="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  HIGH RISK
                </span>
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Poor trade quality indicators, large position increases
                </span>
              </div>
              <div class="flex items-center space-x-3">
                <span class="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  MEDIUM RISK
                </span>
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Some poor trade quality indicators, moderate position changes
                </span>
              </div>
              <div class="flex items-center space-x-3">
                <span class="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  LOW RISK
                </span>
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Good trade quality with minor behavioral patterns
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Loss Aversion Analysis -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Loss Aversion Metrics</h3>
              <button
                @click="analyzeLossAversion"
                :disabled="loadingLossAversion"
                class="btn btn-primary btn-sm"
              >
                <svg v-if="loadingLossAversion" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loadingLossAversion ? 'Analyzing...' : 'Analyze Exit Patterns' }}
              </button>
            </div>

            <div v-if="lossAversionData && lossAversionData.analysis">
              <!-- Main Insight Message -->
              <div v-if="lossAversionData.analysis.message" class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <p class="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      {{ lossAversionData.analysis.message }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Hold Time Comparison -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-green-800 dark:text-green-300">Winners Hold Time</h4>
                  <p class="text-2xl font-bold text-green-900 dark:text-green-200">
                    {{ formatMinutes(lossAversionData.analysis.avgWinnerHoldTime) }}
                  </p>
                  <p class="text-xs text-green-700 dark:text-green-400">Average</p>
                </div>
                
                <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-red-800 dark:text-red-300">Losers Hold Time</h4>
                  <p class="text-2xl font-bold text-red-900 dark:text-red-200">
                    {{ formatMinutes(lossAversionData.analysis.avgLoserHoldTime) }}
                  </p>
                  <p class="text-xs text-red-700 dark:text-red-400">Average</p>
                </div>
                
                <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-purple-800 dark:text-purple-300">Hold Time Ratio</h4>
                  <p class="text-2xl font-bold text-purple-900 dark:text-purple-200">
                    {{ lossAversionData.analysis.holdTimeRatio.toFixed(2) }}x
                  </p>
                  <p class="text-xs text-purple-700 dark:text-purple-400">Losers vs Winners</p>
                </div>
              </div>

              <!-- Financial Impact -->
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Financial Impact</h4>
                <div class="space-y-2">
                  <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">Estimated Monthly Cost:</span>
                    <span class="text-sm font-medium text-red-600 dark:text-red-400">
                      ${{ lossAversionData.analysis.financialImpact.estimatedMonthlyCost.toFixed(2) }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">Missed Profit Potential:</span>
                    <span class="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      ${{ lossAversionData.analysis.financialImpact.missedProfitPotential.toFixed(2) }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">Extended Loss Costs:</span>
                    <span class="text-sm font-medium text-red-600 dark:text-red-400">
                      ${{ lossAversionData.analysis.financialImpact.unnecessaryLossExtension.toFixed(2) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Risk/Reward Analysis -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Planned Risk/Reward</h4>
                  <p class="text-lg font-semibold text-gray-900 dark:text-white">
                    1:{{ lossAversionData.analysis.financialImpact.avgPlannedRiskReward.toFixed(1) }}
                  </p>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Actual Risk/Reward</h4>
                  <p class="text-lg font-semibold text-gray-900 dark:text-white">
                    1:{{ lossAversionData.analysis.financialImpact.avgActualRiskReward.toFixed(1) }}
                  </p>
                </div>
              </div>

              <!-- Price History Analysis Examples -->
              <div v-if="lossAversionData.analysis.priceHistoryAnalysis?.exampleTrades?.length > 0" class="mt-6">
                <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">Trades That Could Have Been More Profitable</h4>
                
                <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <p class="text-sm text-blue-700 dark:text-blue-300">Total Analyzed</p>
                      <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                        {{ lossAversionData.analysis.priceHistoryAnalysis.totalAnalyzed }}
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-blue-700 dark:text-blue-300">Total Missed Profit</p>
                      <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                        ${{ lossAversionData.analysis.priceHistoryAnalysis.totalMissedProfit.toFixed(2) }}
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-blue-700 dark:text-blue-300">Avg Missed %</p>
                      <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                        {{ lossAversionData.analysis.priceHistoryAnalysis.avgMissedProfitPercent.toFixed(1) }}%
                      </p>
                    </div>
                  </div>
                </div>

                <div class="space-y-4">
                  <div 
                    v-for="trade in lossAversionData.analysis.priceHistoryAnalysis.exampleTrades" 
                    :key="trade.tradeId"
                    class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div class="flex justify-between items-start mb-3">
                      <div>
                        <h5 class="font-medium text-gray-900 dark:text-white">{{ trade.symbol }}</h5>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                          {{ new Date(trade.exitTime).toLocaleDateString() }} • {{ trade.side.toUpperCase() }} • {{ trade.quantity }} shares
                        </p>
                      </div>
                      <div class="text-right">
                        <p class="text-sm text-orange-600 dark:text-orange-400 font-medium">
                          +{{ trade.missedOpportunityPercent }}% missed opportunity
                        </p>
                        <p class="text-xs text-gray-500">
                          ${{ trade.potentialAdditionalProfit.optimal.toFixed(2) }} additional profit
                        </p>
                      </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Exit Price</p>
                        <p class="font-medium">${{ trade.exitPrice.toFixed(2) }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Actual Profit</p>
                        <p class="font-medium">${{ trade.actualProfit.toFixed(2) }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Peak Price (24h)</p>
                        <p class="font-medium">${{ trade.side === 'long' ? trade.priceMovement.maxPriceWithin24Hours.toFixed(2) : trade.priceMovement.minPriceWithin24Hours.toFixed(2) }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Hold Time</p>
                        <p class="font-medium">{{ formatMinutes(trade.holdTimeMinutes) }}</p>
                      </div>
                    </div>

                    <!-- Technical Analysis Summary -->
                    <div v-if="trade.indicators && trade.indicators.signals" class="mt-3">
                      <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Technical Analysis at Exit:</p>
                      <div class="bg-gray-50 dark:bg-gray-700 rounded p-3">
                        <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {{ trade.indicators.technicalSummary || 'Technical analysis was not available at exit time' }}
                        </p>
                        
                        <div v-if="trade.indicators.signals.length > 0" class="flex flex-wrap gap-2">
                          <span 
                            v-for="signal in trade.indicators.signals.slice(0, 3)" 
                            :key="`${signal.type}-${signal.signal}`"
                            class="px-2 py-1 text-xs rounded"
                            :class="{
                              'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400': signal.signal.includes('bullish') || signal.signal.includes('crossover'),
                              'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400': signal.signal.includes('bearish') || signal.signal.includes('overbought'),
                              'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400': signal.signal.includes('pattern') || signal.signal.includes('room'),
                              'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300': !signal.signal.includes('bullish') && !signal.signal.includes('bearish') && !signal.signal.includes('pattern')
                            }"
                          >
                            {{ signal.type }}: {{ signal.signal.replace('_', ' ') }}
                          </span>
                        </div>
                        
                        <div class="mt-2">
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            <strong>Recommendation:</strong> {{ trade.recommendation }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No loss aversion analysis available yet.</p>
              <p class="text-sm mt-2">Click "Analyze Exit Patterns" to generate analysis.</p>
            </div>
          </div>
        </div>

        <!-- Overconfidence Analysis -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Overconfidence Indicators</h3>
              <button
                @click="analyzeOverconfidence"
                :disabled="loadingOverconfidence"
                class="btn btn-primary btn-sm"
              >
                <svg v-if="loadingOverconfidence" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loadingOverconfidence ? 'Analyzing...' : 'Analyze Overconfidence' }}
              </button>
            </div>

            <div v-if="overconfidenceData && overconfidenceData.analysis">
              <!-- Main Stats -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-300">Overconfidence Events</h4>
                  <p class="text-2xl font-bold text-yellow-900 dark:text-yellow-200">
                    {{ overconfidenceData.analysis.statistics?.totalEvents || 0 }}
                  </p>
                  <p class="text-xs text-yellow-700 dark:text-yellow-400">Total detected</p>
                </div>
                
                <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-red-800 dark:text-red-300">Avg Position Increase</h4>
                  <p class="text-2xl font-bold text-red-900 dark:text-red-200">
                    {{ overconfidenceData.analysis.statistics?.avgPositionIncrease?.toFixed(1) || 0 }}%
                  </p>
                  <p class="text-xs text-red-700 dark:text-red-400">During win streaks</p>
                </div>
                
                <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-orange-800 dark:text-orange-300">Performance Impact</h4>
                  <p class="text-2xl font-bold text-orange-900 dark:text-orange-200">
                    <span v-if="overconfidenceData.analysis.statistics?.performanceImpact >= 0" class="text-red-600 dark:text-red-400">
                      -${{ Math.abs(overconfidenceData.analysis.statistics?.performanceImpact || 0).toFixed(2) }}
                    </span>
                    <span v-else class="text-green-600 dark:text-green-400">
                      +${{ Math.abs(overconfidenceData.analysis.statistics?.performanceImpact || 0).toFixed(2) }}
                    </span>
                  </p>
                  <p class="text-xs text-orange-700 dark:text-orange-400">Net P&L impact</p>
                </div>
                
                <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <h4 class="text-sm font-medium text-purple-800 dark:text-purple-300">Success Rate</h4>
                  <p class="text-2xl font-bold text-purple-900 dark:text-purple-200">
                    {{ overconfidenceData.analysis.statistics?.successRate?.toFixed(1) || 0 }}%
                  </p>
                  <p class="text-xs text-purple-700 dark:text-purple-400">Of oversized trades</p>
                </div>
              </div>

              <!-- Win Streak Analysis -->
              <div v-if="overconfidenceData.analysis.winStreakAnalysis" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                <h4 class="text-lg font-medium text-blue-800 dark:text-blue-300 mb-3">Win Streak Patterns</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300">Longest Win Streak</p>
                    <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                      {{ overconfidenceData.analysis.winStreakAnalysis.longestStreak || 0 }} trades
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300">Avg Streak Length</p>
                    <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                      {{ overconfidenceData.analysis.winStreakAnalysis.avgStreakLength?.toFixed(1) || 0 }} trades
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300">Position Size Growth</p>
                    <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                      {{ overconfidenceData.analysis.winStreakAnalysis.avgPositionGrowth?.toFixed(1) || 0 }}%
                    </p>
                  </div>
                </div>
              </div>

              <!-- Overconfidence Events List -->
              <div v-if="overconfidenceData.analysis.events && overconfidenceData.analysis.events.length > 0" class="space-y-4">
                <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300">Recent Overconfidence Events</h4>
                
                <div 
                  v-for="event in overconfidenceData.analysis.events.slice(0, 5)" 
                  :key="event.id"
                  class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div class="flex justify-between items-start mb-3">
                    <div>
                      <h5 class="font-medium text-gray-900 dark:text-white">
                        {{ event.winStreakLength }} Win Streak → Position Size Increase
                      </h5>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ new Date(event.detectionDate).toLocaleDateString() }}
                      </p>
                    </div>
                    <div class="text-right">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            :class="{
                              'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300': event.severity === 'high',
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300': event.severity === 'medium',
                              'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300': event.severity === 'low'
                            }">
                        {{ event.severity.toUpperCase() }} RISK
                      </span>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p class="text-gray-500 dark:text-gray-400">Position Increase</p>
                      <p class="font-medium text-gray-900 dark:text-white">
                        +{{ event.positionSizeIncrease?.toFixed(1) || 0 }}%
                      </p>
                    </div>
                    <div>
                      <p class="text-gray-500 dark:text-gray-400">Streak P&L</p>
                      <p class="font-medium" :class="{
                        'text-green-600 dark:text-green-400': parseFloat(event.streakPnl || 0) > 0,
                        'text-red-600 dark:text-red-400': parseFloat(event.streakPnl || 0) < 0,
                        'text-gray-600 dark:text-gray-400': parseFloat(event.streakPnl || 0) === 0
                      }">
                        {{ parseFloat(event.streakPnl || 0) >= 0 ? '+' : '' }}${{ parseFloat(event.streakPnl || 0).toFixed(2) }}
                      </p>
                    </div>
                    <div>
                      <p class="text-gray-500 dark:text-gray-400">Next Trade Result</p>
                      <p class="font-medium" :class="{
                        'text-green-600 dark:text-green-400': parseFloat(event.subsequentTradeResult || 0) > 0,
                        'text-red-600 dark:text-red-400': parseFloat(event.subsequentTradeResult || 0) < 0,
                        'text-gray-600 dark:text-gray-400': parseFloat(event.subsequentTradeResult || 0) === 0
                      }">
                        {{ parseFloat(event.subsequentTradeResult || 0) >= 0 ? '+' : '' }}${{ parseFloat(event.subsequentTradeResult || 0).toFixed(2) }}
                      </p>
                    </div>
                    <div>
                      <p class="text-gray-500 dark:text-gray-400">Total Impact</p>
                      <p class="font-medium" :class="{
                        'text-green-600 dark:text-green-400': parseFloat(event.totalImpact || 0) > 0,
                        'text-red-600 dark:text-red-400': parseFloat(event.totalImpact || 0) < 0,
                        'text-gray-600 dark:text-gray-400': parseFloat(event.totalImpact || 0) === 0
                      }">
                        {{ parseFloat(event.totalImpact || 0) >= 0 ? '+' : '' }}${{ parseFloat(event.totalImpact || 0).toFixed(2) }}
                      </p>
                    </div>
                  </div>

                  <div v-if="event.recommendations && event.recommendations.length > 0" class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recommendations:</p>
                    <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <li v-for="rec in event.recommendations" :key="rec" class="flex items-start">
                        <span class="text-blue-500 mr-1">•</span>
                        {{ rec }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No overconfidence analysis available yet.</p>
              <p class="text-sm mt-2">Click "Analyze Overconfidence" to detect win streak patterns.</p>
            </div>
          </div>
        </div>

        <!-- Trading Personality Profiling -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Trading Personality Profiling</h3>
              <button
                @click="analyzePersonality"
                :disabled="loadingPersonality"
                class="btn btn-primary btn-sm"
              >
                <svg v-if="loadingPersonality" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loadingPersonality ? 'Analyzing...' : 'Analyze Trading Personality' }}
              </button>
            </div>

            <div v-if="personalityData && personalityData.profile">
              <!-- Personality Overview -->
              <div class="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h4 class="text-xl font-bold text-gray-900 dark:text-white capitalize">
                      {{ personalityData.profile.primary_personality.replace('_', ' ') }} Trader
                    </h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Confidence: {{ (personalityData.profile.personality_confidence * 100).toFixed(0) }}%
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Performance Score</p>
                    <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {{ personalityData.profile.personality_performance_score?.toFixed(2) || 'N/A' }}
                    </p>
                  </div>
                </div>

                <!-- Personality Score Breakdown -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Scalper</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-red-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.scalper || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.scalper || 0 }}%</p>
                  </div>
                  <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Momentum</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-green-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.momentum || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.momentum || 0 }}%</p>
                  </div>
                  <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Mean Reversion</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-blue-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.mean_reversion || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.mean_reversion || 0 }}%</p>
                  </div>
                  <div class="text-center">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Swing</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-purple-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.swing || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.swing || 0 }}%</p>
                  </div>
                </div>
              </div>

              <!-- Behavior Metrics -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Average Hold Time</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ formatMinutes(personalityData.profile.avg_hold_time_minutes) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Per trade</p>
                </div>
                
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Trading Frequency</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ personalityData.profile.avg_trade_frequency_per_day?.toFixed(1) || '0.0' }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Trades per day</p>
                </div>
                
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Position Consistency</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ (personalityData.profile.position_sizing_consistency * 100).toFixed(0) }}%
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Sizing discipline</p>
                </div>
              </div>

              <!-- Peer Comparison -->
              <div v-if="personalityData.peerComparison && !personalityData.peerComparison.insufficientData" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                <h5 class="text-lg font-medium text-blue-800 dark:text-blue-300 mb-4">
                  Peer Comparison ({{ personalityData.peerComparison.peerGroupSize }} {{ personalityData.profile.primary_personality.replace('_', ' ') }} traders)
                </h5>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div class="text-center">
                    <p class="text-sm text-blue-700 dark:text-blue-300">Your Percentile</p>
                    <p class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {{ personalityData.peerComparison.userPercentile }}th
                    </p>
                    <p class="text-xs text-blue-600 dark:text-blue-400">
                      {{ personalityData.peerComparison.userPercentile > 50 ? 'Above average' : 'Below average' }}
                    </p>
                  </div>
                  <div class="text-center">
                    <p class="text-sm text-blue-700 dark:text-blue-300">Your Performance</p>
                    <p class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {{ personalityData.peerComparison.performanceComparison?.user || 'N/A' }}
                    </p>
                    <p class="text-xs text-blue-600 dark:text-blue-400">
                      vs {{ personalityData.peerComparison.performanceComparison?.peers || 'N/A' }} peer avg
                    </p>
                  </div>
                  <div class="text-center">
                    <p class="text-sm text-blue-700 dark:text-blue-300">Top 10% Benchmark</p>
                    <p class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {{ personalityData.peerComparison.performanceComparison?.top10 || 'N/A' }}
                    </p>
                    <p class="text-xs text-blue-600 dark:text-blue-400">Elite performers</p>
                  </div>
                </div>

                <!-- Behavioral Comparison -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300 mb-1">Hold Time (You vs Peers vs Optimal)</p>
                    <div class="flex items-center space-x-2 text-sm">
                      <span class="font-medium">{{ personalityData.peerComparison.behaviorComparison?.holdTime?.user || 0 }}m</span>
                      <span class="text-gray-500">vs</span>
                      <span>{{ personalityData.peerComparison.behaviorComparison?.holdTime?.peers || 0 }}m</span>
                      <span class="text-gray-500">vs</span>
                      <span class="text-green-600 font-medium">{{ personalityData.peerComparison.behaviorComparison?.holdTime?.optimal || 0 }}m</span>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300 mb-1">Frequency (You vs Peers vs Optimal)</p>
                    <div class="flex items-center space-x-2 text-sm">
                      <span class="font-medium">{{ personalityData.peerComparison.behaviorComparison?.frequency?.user || 0 }}/d</span>
                      <span class="text-gray-500">vs</span>
                      <span>{{ personalityData.peerComparison.behaviorComparison?.frequency?.peers || 0 }}/d</span>
                      <span class="text-gray-500">vs</span>
                      <span class="text-green-600 font-medium">{{ personalityData.peerComparison.behaviorComparison?.frequency?.optimal || 0 }}/d</span>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-blue-700 dark:text-blue-300 mb-1">Consistency (You vs Peers vs Optimal)</p>
                    <div class="flex items-center space-x-2 text-sm">
                      <span class="font-medium">{{ personalityData.peerComparison.behaviorComparison?.consistency?.user || 0 }}</span>
                      <span class="text-gray-500">vs</span>
                      <span>{{ personalityData.peerComparison.behaviorComparison?.consistency?.peers || 0 }}</span>
                      <span class="text-gray-500">vs</span>
                      <span class="text-green-600 font-medium">{{ personalityData.peerComparison.behaviorComparison?.consistency?.optimal || 0 }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Behavioral Drift Analysis -->
              <div v-if="personalityData.driftAnalysis && personalityData.driftAnalysis.hasDrift" class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6">
                <h5 class="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-3">
                  Behavioral Drift Detection
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-2"
                        :class="{
                          'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300': personalityData.driftAnalysis.severity === 'high',
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300': personalityData.driftAnalysis.severity === 'medium',
                          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300': personalityData.driftAnalysis.severity === 'low'
                        }">
                    {{ personalityData.driftAnalysis.severity.toUpperCase() }}
                  </span>
                </h5>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Personality Shift</p>
                    <p class="font-medium">
                      {{ personalityData.driftAnalysis.previousPersonality }} → {{ personalityData.driftAnalysis.currentPersonality }}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Drift Score</p>
                    <p class="font-medium">{{ personalityData.driftAnalysis.driftScore }}/1.0</p>
                  </div>
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Performance Impact</p>
                    <p class="font-medium" :class="{
                      'text-green-600 dark:text-green-400': personalityData.driftAnalysis.performanceImpact < 0,
                      'text-red-600 dark:text-red-400': personalityData.driftAnalysis.performanceImpact > 0
                    }">
                      {{ personalityData.driftAnalysis.performanceImpact >= 0 ? '+' : '' }}${{ personalityData.driftAnalysis.performanceImpact }}
                    </p>
                  </div>
                </div>

                <div v-if="personalityData.driftAnalysis.driftMetrics" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Hold Time Change</p>
                    <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.holdTimeDrift >= 0 ? '+' : '' }}{{ personalityData.driftAnalysis.driftMetrics.holdTimeDrift }}%</p>
                  </div>
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Frequency Change</p>
                    <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.frequencyDrift >= 0 ? '+' : '' }}{{ personalityData.driftAnalysis.driftMetrics.frequencyDrift }}%</p>
                  </div>
                  <div>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">Risk Tolerance Change</p>
                    <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.riskToleranceDrift }}</p>
                  </div>
                </div>
              </div>

              <!-- Recommendations -->
              <div v-if="personalityData.recommendations && personalityData.recommendations.length > 0" class="space-y-4">
                <h5 class="text-lg font-medium text-gray-700 dark:text-gray-300">Personalized Recommendations</h5>
                
                <div 
                  v-for="rec in personalityData.recommendations" 
                  :key="rec.type"
                  class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div class="flex items-start">
                    <div class="flex-shrink-0">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            :class="{
                              'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300': rec.priority === 'high',
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300': rec.priority === 'medium',
                              'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300': rec.priority === 'low'
                            }">
                        {{ rec.priority.toUpperCase() }}
                      </span>
                    </div>
                    <div class="ml-3">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{{ rec.message }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No trading personality analysis available yet.</p>
              <p class="text-sm mt-2">Click "Analyze Trading Personality" to discover your trading style.</p>
            </div>
          </div>
        </div>

        <!-- Settings -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Behavioral Settings</h3>
            <div class="space-y-6">
              <!-- Revenge Trading Detection -->
              <div>
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">Revenge Trading Detection</h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Monitor for revenge trading patterns</p>
                  </div>
                  <button
                    @click="toggleSetting('revengeTrading', 'enabled')"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    :class="settings.revengeTrading?.enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      :class="settings.revengeTrading?.enabled ? 'translate-x-5' : 'translate-x-0'"
                    ></span>
                  </button>
                </div>
                
                <div v-if="settings.revengeTrading?.enabled" class="mt-4">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Detection Sensitivity
                  </label>
                  <select 
                    v-model="settings.revengeTrading.sensitivity"
                    @change="onSensitivityChange"
                    class="input"
                  >
                    <option value="low">Low - 5%+ account loss triggers detection</option>
                    <option value="medium">Medium - 3%+ account loss triggers detection</option>
                    <option value="high">High - 1%+ account loss triggers detection</option>
                  </select>
                </div>
              </div>

              <!-- Cooling Period -->
              <div>
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">Cooling Period</h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Recommended break time after losses</p>
                  </div>
                </div>
                <div class="mt-4">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Duration (minutes)
                  </label>
                  <input 
                    v-model.number="settings.coolingPeriod.minutes"
                    @change="updateSettings"
                    type="number"
                    min="0"
                    max="1440"
                    class="input"
                  />
                </div>
              </div>

              <!-- Trade Blocking -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'

const { showSuccess, showError } = useNotification()
const authStore = useAuthStore()
const router = useRouter()

const loading = ref(true)
const loadingHistorical = ref(false)
const loadingLossAversion = ref(false)
const loadingOverconfidence = ref(false)
const loadingPersonality = ref(false)
const hasAccess = ref(false)
const overview = ref(null)
const revengeAnalysis = ref(null)
const insights = ref(null)
const activeAlerts = ref([])
const lossAversionData = ref(null)
const overconfidenceData = ref(null)
const personalityData = ref(null)
const settings = ref({
  revengeTrading: { enabled: true, sensitivity: 'medium' },
  coolingPeriod: { minutes: 30 },
  alertPreferences: { email: false, push: true, toast: true }
})

const filters = ref({
  startDate: '',
  endDate: ''
})

const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false
})

// Track which revenge trade events are expanded
const expandedEvents = ref(new Set())

// Check if user has access to behavioral analytics
const checkAccess = async () => {
  try {
    const response = await api.get('/features/check/behavioral_analytics')
    hasAccess.value = response.data.hasAccess
  } catch (error) {
    hasAccess.value = false
  }
}

// Load behavioral analytics data
const loadData = async () => {
  if (!hasAccess.value) return
  
  try {
    loading.value = true
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    
    // Add pagination parameters for revenge trading
    const revengeQueryParams = new URLSearchParams(queryParams)
    revengeQueryParams.append('page', pagination.value.page)
    revengeQueryParams.append('limit', pagination.value.limit)
    
    const [overviewRes, revengeRes, insightsRes, alertsRes, settingsRes] = await Promise.all([
      api.get(`/behavioral-analytics/overview?${queryParams}`),
      api.get(`/behavioral-analytics/revenge-trading?${revengeQueryParams}`),
      api.get(`/behavioral-analytics/insights?${queryParams}`),
      api.get('/behavioral-analytics/alerts'),
      api.get('/behavioral-analytics/settings')
    ])
    
    overview.value = overviewRes.data.data
    revengeAnalysis.value = revengeRes.data.data
    insights.value = insightsRes.data.data
    activeAlerts.value = alertsRes.data.data
    settings.value = { ...settings.value, ...settingsRes.data.data }
    
    // Update pagination info
    if (revengeRes.data.data.pagination) {
      pagination.value = revengeRes.data.data.pagination
    }
  } catch (error) {
    if (error.response?.status === 403) {
      hasAccess.value = false
    } else {
      showError('Error', 'Failed to load behavioral analytics data')
    }
  } finally {
    loading.value = false
  }
}

// Apply date filters  
const applyFilters = async () => {
  // Reset pagination when applying filters
  pagination.value.page = 1
  // Save filters to localStorage
  saveFilters()
  await loadData()
}

// Clear filters
const clearFilters = async () => {
  filters.value.startDate = ''
  filters.value.endDate = ''
  
  // Reset pagination
  pagination.value.page = 1
  
  // Clear localStorage
  localStorage.removeItem('behavioralAnalyticsFilters')
  
  // Apply the cleared filters
  await applyFilters()
}

// Save filters to localStorage
const saveFilters = () => {
  localStorage.setItem('behavioralAnalyticsFilters', JSON.stringify(filters.value))
}

// Load filters from localStorage
const loadFilters = () => {
  const savedFilters = localStorage.getItem('behavioralAnalyticsFilters')
  if (savedFilters) {
    try {
      const parsed = JSON.parse(savedFilters)
      filters.value = parsed
    } catch (e) {
      console.error('Error loading saved filters:', e)
      setDefaultDateRange()
    }
  } else {
    setDefaultDateRange()
  }
}

// Set default date range
const setDefaultDateRange = () => {
  // Set default to cover actual trade data instead of current date
  filters.value.endDate = '2024-12-31'
  filters.value.startDate = '2024-01-01'
}

// Analyze historical trades for revenge trading patterns
const analyzeHistoricalTrades = async () => {
  try {
    loadingHistorical.value = true
    
    const response = await api.post('/behavioral-analytics/analyze-historical')
    
    showSuccess('Analysis Complete', `Analyzed historical trades. Found ${response.data.patternsDetected || 0} revenge trading patterns.`)
    
    // Reload data after analysis
    await loadData()
  } catch (error) {
    console.error('Error analyzing historical trades:', error)
    showError('Error', 'Failed to analyze historical trades')
  } finally {
    loadingHistorical.value = false
  }
}

// Acknowledge an alert
const acknowledgeAlert = async (alertId) => {
  try {
    await api.post(`/behavioral-analytics/alerts/${alertId}/acknowledge`)
    activeAlerts.value = activeAlerts.value.filter(alert => alert.id !== alertId)
    showSuccess('Success', 'Alert acknowledged')
  } catch (error) {
    showError('Error', 'Failed to acknowledge alert')
  }
}

// Toggle a setting
const toggleSetting = (category, key) => {
  if (!settings.value[category]) {
    settings.value[category] = {}
  }
  settings.value[category][key] = !settings.value[category][key]
  updateSettings()
}

// Update settings
const updateSettings = async () => {
  try {
    await api.put('/behavioral-analytics/settings', settings.value)
    showSuccess('Success', 'Settings updated')
  } catch (error) {
    showError('Error', 'Failed to update settings')
  }
}

// Handle sensitivity change with immediate data reload
const onSensitivityChange = async () => {
  try {
    await updateSettings()
    // Reset pagination and reload data with new sensitivity
    pagination.value.page = 1
    await loadData()
    showSuccess('Updated', 'Detection sensitivity updated and data refreshed')
  } catch (error) {
    showError('Error', 'Failed to update sensitivity')
  }
}

// Pagination functions
const goToPage = async (page) => {
  if (page < 1 || page > pagination.value.totalPages) return
  pagination.value.page = page
  await loadData()
}

const nextPage = async () => {
  if (pagination.value.hasNextPage) {
    await goToPage(pagination.value.page + 1)
  }
}

const prevPage = async () => {
  if (pagination.value.hasPreviousPage) {
    await goToPage(pagination.value.page - 1)
  }
}

// Re-run analysis with new thresholds
const reRunAnalysis = async () => {
  try {
    loadingHistorical.value = true
    
    const response = await api.post('/behavioral-analytics/re-run-historical')
    
    showSuccess('Analysis Complete', `Re-analyzed historical trades with new thresholds. Found ${response.data.data.revengeEventsCreated || 0} revenge trading events.`)
    
    // Reset pagination and reload data
    pagination.value.page = 1
    await loadData()
  } catch (error) {
    console.error('Error re-running analysis:', error)
    showError('Error', 'Failed to re-run analysis')
  } finally {
    loadingHistorical.value = false
  }
}

// Format date for display
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format time only
const formatTime = (dateString) => {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Calculate time between trades
const getTimeBetweenTrades = (startTime, endTime) => {
  if (!startTime || !endTime) return 'Unknown'
  
  const start = new Date(startTime)
  const end = new Date(endTime)
  const diffMs = end - start
  const diffMins = Math.round(diffMs / (1000 * 60))
  
  if (diffMins < 60) {
    return `${diffMins} minutes`
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  } else {
    const days = Math.floor(diffMins / 1440)
    const hours = Math.floor((diffMins % 1440) / 60)
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
}

// Get stored P&L value from the database
const getPnLValue = (trade) => {
  if (!trade) return 0
  
  // Use the stored pnl value from the database - no calculation needed
  if (trade.pnl !== null && trade.pnl !== undefined) {
    return parseFloat(trade.pnl)
  }
  
  // If pnl is missing, return 0 and log an error
  console.error('Missing pnl field in trade data:', trade)
  return 0
}

// Open trade detail page
const openTrade = (tradeId) => {
  if (tradeId) {
    // Navigate directly to the trade detail page in same window
    router.push(`/trades/${tradeId}`)
  }
}

// Toggle expanded state for revenge trading events
const toggleEventExpansion = (eventId) => {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId)
  } else {
    expandedEvents.value.add(eventId)
  }
}

// Go back to previous page
const goBack = () => {
  // Use Vue Router's go method to go back one step in history
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    // If no history, go to analytics page since this is a sub-page of analytics
    router.push('/analytics')
  }
}

// Analyze loss aversion patterns
const analyzeLossAversion = async () => {
  try {
    loadingLossAversion.value = true
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    
    const response = await api.get(`/behavioral-analytics/loss-aversion?${queryParams}`)
    
    if (response.data.data) {
      lossAversionData.value = response.data.data
      
      if (response.data.data.error) {
        showError('Analysis Error', response.data.data.message)
      } else {
        showSuccess('Analysis Complete', 'Loss aversion patterns analyzed successfully')
      }
    }
  } catch (error) {
    showError('Error', 'Failed to analyze loss aversion patterns')
  } finally {
    loadingLossAversion.value = false
  }
}

// Analyze overconfidence patterns
const analyzeOverconfidence = async () => {
  try {
    loadingOverconfidence.value = true
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    
    const response = await api.get(`/behavioral-analytics/overconfidence?${queryParams}`)
    
    if (response.data.data) {
      overconfidenceData.value = response.data.data
      
      if (response.data.data.error) {
        showError('Analysis Error', response.data.data.message)
      } else {
        showSuccess('Analysis Complete', 'Overconfidence patterns analyzed successfully')
      }
    }
  } catch (error) {
    console.error('Error analyzing overconfidence:', error)
    showError('Error', 'Failed to analyze overconfidence patterns')
  } finally {
    loadingOverconfidence.value = false
  }
}

// Analyze trading personality patterns
const analyzePersonality = async () => {
  try {
    loadingPersonality.value = true
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    
    const response = await api.get(`/behavioral-analytics/personality?${queryParams}`)
    
    if (response.data.data) {
      personalityData.value = response.data.data
      
      if (response.data.data.error) {
        showError('Analysis Error', response.data.data.message)
      } else {
        showSuccess('Analysis Complete', 'Trading personality analyzed successfully')
      }
    }
  } catch (error) {
    console.error('Error analyzing personality:', error)
    showError('Error', 'Failed to analyze trading personality')
  } finally {
    loadingPersonality.value = false
  }
}

// Format minutes to human-readable time
const formatMinutes = (minutes) => {
  if (minutes < 60) {
    return `${minutes}m`
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  } else {
    const days = Math.floor(minutes / 1440)
    const remainingMinutes = minutes % 1440
    const hours = Math.floor(remainingMinutes / 60)
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
}

// Generate loss aversion message based on hold time ratio
const generateLossAversionMessage = (holdTimeRatio, estimatedMonthlyCost) => {
  const cost = Number(estimatedMonthlyCost) || 0;
  if (holdTimeRatio > 3) {
    return `You exit winners ${holdTimeRatio.toFixed(1)}x faster than losers - this is costing you $${cost.toFixed(2)}/month`
  } else if (holdTimeRatio > 2) {
    return `You hold losers ${holdTimeRatio.toFixed(1)}x longer than winners - consider using tighter stops to save $${cost.toFixed(2)}/month`
  } else if (holdTimeRatio > 1.5) {
    return `Slight loss aversion detected - you could save $${cost.toFixed(2)}/month with better exit timing`
  } else {
    return `Good exit discipline - your hold time ratio of ${holdTimeRatio.toFixed(1)}x is within healthy range`
  }
}

onMounted(async () => {
  loadFilters()
  await checkAccess()
  if (hasAccess.value) {
    await loadData()
    // Also load latest loss aversion metrics
    try {
      const lossAversionRes = await api.get('/behavioral-analytics/loss-aversion/latest')
      if (lossAversionRes.data.data) {
        // Format the data to match what the template expects
        const metrics = lossAversionRes.data.data
        lossAversionData.value = {
          analysis: {
            message: generateLossAversionMessage(metrics.hold_time_ratio, metrics.estimated_monthly_cost),
            avgWinnerHoldTime: Number(metrics.avg_winner_hold_time_minutes) || 0,
            avgLoserHoldTime: Number(metrics.avg_loser_hold_time_minutes) || 0,
            holdTimeRatio: Number(metrics.hold_time_ratio) || 0,
            totalTrades: Number(metrics.total_winning_trades || 0) + Number(metrics.total_losing_trades || 0),
            winners: Number(metrics.total_winning_trades) || 0,
            losers: Number(metrics.total_losing_trades) || 0,
            financialImpact: {
              estimatedMonthlyCost: Number(metrics.estimated_monthly_cost) || 0,
              missedProfitPotential: Number(metrics.missed_profit_potential) || 0,
              unnecessaryLossExtension: Number(metrics.unnecessary_loss_extension) || 0,
              avgPlannedRiskReward: Number(metrics.avg_planned_risk_reward) || 2.0,
              avgActualRiskReward: Number(metrics.avg_actual_risk_reward) || 1.0
            },
            priceHistoryAnalysis: {
              totalMissedProfit: Number(metrics.total_missed_profit) || 0,
              avgMissedProfitPercent: Number(metrics.avg_missed_profit_percent) || 0,
              exampleTrades: metrics.example_trades || []
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load loss aversion metrics:', error)
    }
  } else {
    loading.value = false
  }
})
</script>