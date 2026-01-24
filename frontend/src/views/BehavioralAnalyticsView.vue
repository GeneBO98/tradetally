<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="content-wrapper">
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
      <ProUpgradePrompt 
        v-if="!hasAccess" 
        variant="card"
        description="Behavioral Analytics is a Pro feature that helps identify emotional trading patterns like revenge trading, overtrading, and FOMO."
      />

      <!-- Loading State -->
      <div v-else-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Main Content -->
      <div v-else class="space-y-8">
        <!-- Filters -->
        <div class="card">
          <div class="card-body">
            <TradeFilters @filter="handleFilter" />

            <!-- Analyze History Button -->
            <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                @click="analyzeHistoricalTrades"
                :disabled="loadingHistorical"
                class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span v-if="loadingHistorical" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Analyzing Historical Trades...
                </span>
                <span v-else>
                  Analyze Historical Trades
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Active Alerts -->
        <div v-if="activeAlerts.length > 0" class="space-y-4">
          <h2 class="heading-section">Active Alerts</h2>
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
                    <h3 class="heading-card">{{ alert.title }}</h3>
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

        <!-- Trading Personality Profiling -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="heading-card">Trading Personality Profiling</h3>
              <button
                @click="analyzePersonality"
                :disabled="loadingPersonality"
                class="btn btn-primary btn-sm"
              >
                <svg v-if="loadingPersonality" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loadingPersonality ? 'Analyzing...' : 'Refresh Analysis' }}
              </button>
            </div>

            <!-- Show empty state when no personality data -->
            <div v-if="!personalityData || !personalityData.profile" class="text-center py-12">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 mb-4">
                <svg class="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Trading Personality Profile Yet
              </h4>
              <p class="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
                To generate your trading personality profile, you need at least 20 completed trades. 
                This helps us analyze your patterns and provide meaningful insights.
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-500">
                Keep trading and check back once you've reached this milestone!
              </p>
            </div>
            
            <div v-else-if="personalityData && personalityData.profile">
              <!-- Personality Overview -->
              <div class="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h4 class="text-xl font-bold text-gray-900 dark:text-white capitalize">
                      {{ personalityData.profile.primary_personality.replace('_', ' ') }} Trader
                    </h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      Confidence: {{ (parseFloat(personalityData.profile.personality_confidence || 0) * 100).toFixed(0) }}%
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Performance Score</p>
                    <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {{ parseFloat(personalityData.profile.personality_performance_score || 0).toFixed(2) }}
                    </p>
                  </div>
                </div>

                <!-- Personality Score Breakdown -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" 
                       @click="viewTradesByStrategy('scalper')"
                       :title="'Click to view trades matching Scalper strategy patterns'">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Scalper</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-red-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.scalper || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.scalper || 0 }}%</p>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center">
                      <MdiIcon :icon="mdiChartBox" :size="12" class="mr-1" />
                      View trades
                    </p>
                  </div>
                  <div class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" 
                       @click="viewTradesByStrategy('momentum')"
                       :title="'Click to view trades matching Momentum strategy patterns'">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Momentum</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-green-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.momentum || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.momentum || 0 }}%</p>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center">
                      <MdiIcon :icon="mdiChartBox" :size="12" class="mr-1" />
                      View trades
                    </p>
                  </div>
                  <div class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" 
                       @click="viewTradesByStrategy('mean_reversion')"
                       :title="'Click to view trades matching Mean Reversion strategy patterns'">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Mean Reversion</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-blue-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.mean_reversion || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.mean_reversion || 0 }}%</p>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center">
                      <MdiIcon :icon="mdiChartBox" :size="12" class="mr-1" />
                      View trades
                    </p>
                  </div>
                  <div class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" 
                       @click="viewTradesByStrategy('swing')"
                       :title="'Click to view trades matching Swing strategy patterns'">
                    <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">Swing</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                      <div class="bg-purple-500 h-2 rounded-full" :style="{ width: `${personalityData.personalityScores?.swing || 0}%` }"></div>
                    </div>
                    <p class="text-xs font-medium">{{ personalityData.personalityScores?.swing || 0 }}%</p>
                    <p class="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center justify-center">
                      <MdiIcon :icon="mdiChartBox" :size="12" class="mr-1" />
                      View trades
                    </p>
                  </div>
                </div>
              </div>

              <!-- Behavior Metrics -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Median Hold Time</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ formatMinutes(personalityData.profile.avg_hold_time_minutes) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Per trade</p>
                </div>
                
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Trading Frequency</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ parseFloat(personalityData.profile.avg_trade_frequency_per_day || 0).toFixed(1) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Trades per day</p>
                </div>
                
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Position Consistency</h5>
                  <p class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ (parseFloat(personalityData.profile.position_sizing_consistency || 0) * 100).toFixed(0) }}%
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
                    <p class="text-sm text-blue-700 dark:text-blue-300 mb-1">Median Hold Time (You vs Peers vs Optimal)</p>
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
                  <div class="relative group inline-block">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-help"
                          :class="{
                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300': personalityData.driftAnalysis.severity === 'high',
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300': personalityData.driftAnalysis.severity === 'medium',
                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300': personalityData.driftAnalysis.severity === 'low'
                          }">
                      {{ personalityData.driftAnalysis.severity.toUpperCase() }}
                    </span>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64">
                      <div class="text-center">
                        <strong>Drift Severity Levels</strong><br>
                        <strong>LOW (0-0.4):</strong> Minor behavioral changes<br>
                        <strong>MEDIUM (0.4-0.7):</strong> Noticeable pattern shifts<br>
                        <strong>HIGH (0.7-1.0):</strong> Significant behavioral transformation requiring attention
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                </h5>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Personality Shift</p>
                      <p class="font-medium">
                        {{ personalityData.driftAnalysis.previousPersonality }} → {{ personalityData.driftAnalysis.currentPersonality }}
                      </p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64">
                      <div class="text-center">
                        <strong>Personality Shift</strong><br>
                        Shows your trading personality type change between analysis periods. Even if you're still primarily the same type (e.g., Scalper), this indicates if there's been any shift in your dominant trading behavior.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Drift Score</p>
                      <p class="font-medium">{{ personalityData.driftAnalysis.driftScore }}/1.0</p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72">
                      <div class="text-center">
                        <strong>Drift Score Explained</strong><br>
                        Overall behavioral change score from 0-1.0. Combines personality shift, hold time changes, and trading frequency changes. <strong>1.0 means maximum drift detected</strong> - your behavior patterns have changed significantly even if your strategy type stayed the same.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Performance Impact</p>
                      <p class="font-medium" :class="{
                        'text-green-600 dark:text-green-400': personalityData.driftAnalysis.performanceImpact < 0,
                        'text-red-600 dark:text-red-400': personalityData.driftAnalysis.performanceImpact > 0
                      }">
                        {{ personalityData.driftAnalysis.performanceImpact >= 0 ? '+' : '' }}${{ personalityData.driftAnalysis.performanceImpact }}
                      </p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64">
                      <div class="text-center">
                        <strong>Performance Impact</strong><br>
                        Estimated financial impact of your behavioral changes. <strong>Positive values</strong> suggest the drift may be hurting performance, while <strong>negative values</strong> suggest it may be helping.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                </div>

                <div v-if="personalityData.driftAnalysis.driftMetrics" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Hold Time Change</p>
                      <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.holdTimeDrift >= 0 ? '+' : '' }}{{ personalityData.driftAnalysis.driftMetrics.holdTimeDrift }}%</p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72">
                      <div class="text-center">
                        <strong>Hold Time Change</strong><br>
                        Percentage change in how long you hold trades on average. Large changes (like going from 10 minutes to 50 minutes) contribute heavily to drift score. This measures whether you're becoming more patient or impatient with your trades.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Frequency Change</p>
                      <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.frequencyDrift >= 0 ? '+' : '' }}{{ personalityData.driftAnalysis.driftMetrics.frequencyDrift }}%</p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72">
                      <div class="text-center">
                        <strong>Frequency Change</strong><br>
                        Percentage change in how often you trade per day. Shows if you're becoming more or less active in your trading. Significant changes in trading frequency can indicate evolving market confidence or strategy adjustments.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
                  </div>
                  <div class="relative group">
                    <div class="cursor-help">
                      <p class="text-sm text-yellow-700 dark:text-yellow-300">Risk Tolerance Change</p>
                      <p class="font-medium">{{ personalityData.driftAnalysis.driftMetrics.riskToleranceDrift }}</p>
                    </div>
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72">
                      <div class="text-center">
                        <strong>Risk Tolerance Change</strong><br>
                        Change in your risk tolerance level based on position sizing consistency. Higher values indicate you're becoming less consistent with position sizes, potentially taking on more varied risk levels per trade.
                      </div>
                      <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                    </div>
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
              <p class="text-sm mt-2">Analysis will run automatically when you have enough trade data.</p>
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
                          <MdiIcon :icon="mdiTrendingDown" :size="16" class="mr-1" />
                          Initial Loss Trade (Trigger)
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
                          <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                            <MdiIcon :icon="mdiLightningBolt" :size="16" class="mr-1" />
                            Revenge Trading Response
                          </h4>
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
                              <span v-if="pattern.pattern_type === 'same_symbol_revenge'" class="text-sm font-medium text-orange-800 dark:text-orange-400 flex items-center">
                                <MdiIcon :icon="mdiTarget" :size="16" class="mr-1" />
                                Same Symbol Revenge
                              </span>
                              <span v-else class="text-sm font-medium text-purple-800 dark:text-purple-400 flex items-center">
                                <MdiIcon :icon="mdiLightningBolt" :size="16" class="mr-1" />
                                Emotional Spillover
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
                            <span v-if="pattern.pattern_type === 'same_symbol_revenge'" class="flex items-center">
                              <MdiIcon :icon="mdiChartBox" :size="16" class="mr-1.5" />
                              Tried to recover losses by trading {{ pattern.symbol }} again
                            </span>
                            <span v-else class="flex items-center">
                              <MdiIcon :icon="mdiLightningBolt" :size="16" class="mr-1.5" />
                              Emotional reaction led to trading {{ pattern.symbol }} (different from trigger symbol)
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
                        <h5 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                          <MdiIcon :icon="mdiChartBox" :size="18" class="mr-1.5" />
                          Revenge Trading Outcome
                        </h5>
                        <span 
                          class="inline-flex px-3 py-1 text-sm font-semibold rounded-full"
                          :class="{
                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': event.outcome_type === 'loss',
                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': event.outcome_type === 'profit',
                            'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400': event.outcome_type === 'neutral'
                          }"
                        >
                          <span v-if="event.outcome_type === 'loss'" class="flex items-center">
                            <MdiIcon :icon="mdiClose" :size="16" class="mr-1" />
                            Made it worse
                          </span>
                          <span v-else-if="event.outcome_type === 'profit'" class="flex items-center">
                            <MdiIcon :icon="mdiCheck" :size="16" class="mr-1" />
                            Recovered losses
                          </span>
                          <span v-else class="flex items-center">
                            <MdiIcon :icon="mdiScale" :size="16" class="mr-1" />
                            Broke even
                          </span>
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
                        <span v-if="event.outcome_type === 'loss'" class="flex items-start">
                          <MdiIcon :icon="mdiTrendingDown" :size="16" class="mr-1.5 mt-0.5 flex-shrink-0" />
                          <span>The revenge trading made the situation worse by adding ${{ Math.abs(parseFloat(event.total_additional_loss)).toFixed(2) }} in additional losses</span>
                        </span>
                        <span v-else-if="event.outcome_type === 'profit'" class="flex items-start">
                          <MdiIcon :icon="mdiCurrencyUsd" :size="16" class="mr-1.5 mt-0.5 flex-shrink-0" />
                          <span>The revenge trading actually worked this time, recovering ${{ Math.abs(parseFloat(event.total_additional_loss)).toFixed(2) }}</span>
                        </span>
                        <span v-else class="flex items-start">
                          <MdiIcon :icon="mdiScale" :size="16" class="mr-1.5 mt-0.5 flex-shrink-0" />
                          <span>The revenge trading broke even - no additional gains or losses</span>
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
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 flex items-start">
                  <MdiIcon :icon="mdiLightbulb" :size="16" class="mr-1.5 mt-0.5 flex-shrink-0" />
                  <span>{{ insight.recommendation }}</span>
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

        <!-- Info Banner Explaining the Difference -->
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-blue-800 dark:text-blue-300">Understanding the Analytics</h3>
              <div class="mt-2 text-sm text-blue-700 dark:text-blue-200">
                <p class="mb-2">• <strong>Loss Aversion Analysis</strong>: Reveals your behavioral patterns - do you hold losers longer than winners?</p>
                <p>• <strong>Missed Profit Opportunities</strong>: Shows specific trades where you exited early and left money on the table.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Loss Aversion Analysis -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h3 class="heading-card">Loss Aversion Behavior Analysis</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Identifies psychological patterns: Do you hold losers too long and exit winners too early?</p>
              </div>
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
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300">Trades That Could Have Been More Profitable</h4>
                  <div class="flex space-x-2">
                    <button
                      @click="scrollToTopMissedTrades"
                      class="px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 flex items-center"
                    >
                      <MdiIcon :icon="mdiTarget" :size="16" class="mr-1" />
                      View Specific Trades You Exited Early
                    </button>
                    <button
                      @click="viewLossAversionTrades"
                      class="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      View All {{ lossAversionData.analysis.priceHistoryAnalysis.exampleTrades.length }} Trades
                    </button>
                  </div>
                </div>
                
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
                          ${{ (trade.potentialAdditionalProfit?.optimal || 0).toFixed(2) }} additional profit
                        </p>
                      </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Exit Price</p>
                        <p class="font-medium">${{ (trade.exitPrice || 0).toFixed(2) }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Actual Profit</p>
                        <p class="font-medium">${{ (trade.actualProfit || 0).toFixed(2) }}</p>
                      </div>
                      <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Peak Price (24h)</p>
                        <p class="font-medium">${{ trade.side === 'long' ? (trade.priceMovement?.maxPriceWithin24Hours || 0).toFixed(2) : (trade.priceMovement?.minPriceWithin24Hours || 0).toFixed(2) }}</p>
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

        <!-- Top Missed Trades Analysis -->
        <div class="card" ref="topMissedTradesSection">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h3 class="heading-card">Top Missed Profit Opportunities</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Specific trades where you left money on the table by exiting too early</p>
              </div>
              <div class="flex space-x-2">
                <button
                  @click="loadTopMissedTrades(true)"
                  :disabled="loadingTopMissedTrades"
                  class="btn btn-primary btn-sm"
                >
                  <svg v-if="loadingTopMissedTrades" class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ loadingTopMissedTrades ? 'Analyzing...' : 'Find Early Exit Trades' }}
                </button>
              </div>
            </div>

            <div v-if="topMissedTrades && topMissedTrades.topMissedTrades" class="relative">
              <!-- Loading Overlay -->
              <div v-if="loadingTopMissedTrades" class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-lg flex items-center justify-center z-10">
                <div class="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                  <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="text-sm font-medium">Updating analysis...</span>
                </div>
              </div>
              
              <!-- Summary Stats -->
              <div class="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 mb-6">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p class="text-sm text-orange-700 dark:text-orange-300">Trades Analyzed</p>
                    <p class="text-xl font-bold text-orange-900 dark:text-orange-100">
                      {{ topMissedTrades.totalAnalyzed }}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-orange-700 dark:text-orange-300">Trades Exited Too Early</p>
                    <p class="text-xl font-bold text-orange-900 dark:text-orange-100">
                      {{ topMissedTrades.totalEligibleTrades }}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-orange-700 dark:text-orange-300">Total Missed Profit</p>
                    <p class="text-xl font-bold text-orange-900 dark:text-orange-100">
                      ${{ topMissedTrades.totalMissedProfit.toFixed(2) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-orange-700 dark:text-orange-300">Avg Missed %</p>
                    <p class="text-xl font-bold text-orange-900 dark:text-orange-100">
                      {{ topMissedTrades.avgMissedOpportunityPercent.toFixed(1) }}%
                    </p>
                  </div>
                </div>
                
                <div v-if="topMissedTrades.tradesWithRealPriceData > 0" class="mt-3 text-center">
                  <div class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                    <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                    </svg>
                    {{ topMissedTrades.tradesWithRealPriceData }} trades with real price data analysis
                  </div>
                </div>
              </div>

              <!-- Top Missed Trades List -->
              <div v-if="topMissedTrades.topMissedTrades.length > 0" class="space-y-4">
                <h4 class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                  <MdiIcon :icon="mdiTarget" :size="20" class="mr-2" />
                  Specific Trades Where You Exited Too Early (Sorted by % Profit Missed)
                </h4>
                
                <div 
                  v-for="(trade, index) in topMissedTrades.topMissedTrades.slice(0, 10)" 
                  :key="trade.tradeId"
                  class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative"
                  :class="{
                    'ring-2 ring-red-200 dark:ring-red-800': index === 0,
                    'ring-1 ring-orange-200 dark:ring-orange-800': index === 1,
                    'ring-1 ring-yellow-200 dark:ring-yellow-800': index === 2
                  }"
                >
                  <!-- Rank Badge -->
                  <div class="absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                       :class="{
                         'bg-red-500': index === 0,
                         'bg-orange-500': index === 1,
                         'bg-yellow-500': index === 2,
                         'bg-gray-500': index > 2
                       }">
                    {{ index + 1 }}
                  </div>

                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <h5 class="font-medium text-gray-900 dark:text-white text-lg">{{ trade.symbol }}</h5>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ new Date(trade.exitTime).toLocaleDateString() }} • {{ trade.side.toUpperCase() }} • {{ trade.quantity }} shares
                      </p>
                      <div v-if="trade.hasRealPriceData" class="inline-flex items-center mt-1 px-2 py-1 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                        <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                        </svg>
                        Real price data
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="text-lg font-bold text-red-600 dark:text-red-400">
                        +{{ trade.missedOpportunityPercent }}%
                      </p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">missed opportunity</p>
                      <p class="text-sm font-medium text-green-600 dark:text-green-400">
                        +${{ (trade.potentialAdditionalProfit?.optimal || 0).toFixed(2) }}
                      </p>
                    </div>
                  </div>
                  
                  <!-- Trade Details Grid -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">Entry Price</p>
                      <p class="font-medium">${{ (trade.entryPrice || 0).toFixed(2) }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">Exit Price</p>
                      <p class="font-medium">${{ (trade.exitPrice || 0).toFixed(2) }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">Actual Profit</p>
                      <p class="font-medium text-green-600 dark:text-green-400">${{ (trade.actualProfit || 0).toFixed(2) }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">Hold Time</p>
                      <p class="font-medium">{{ formatMinutes(trade.holdTimeMinutes) }}</p>
                    </div>
                  </div>

                  <!-- Peak Price and Potential -->
                  <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p class="text-sm font-medium text-red-800 dark:text-red-300">
                          {{ trade.side === 'long' ? 'Peak Price Reached' : 'Lowest Price Reached' }}
                        </p>
                        <p class="text-lg font-bold text-red-900 dark:text-red-200">
                          ${{ trade.side === 'long' ? 
                            (trade.priceMovement?.maxPriceWithin24Hours || 0).toFixed(2) : 
                            (trade.priceMovement?.minPriceWithin24Hours || 0).toFixed(2) }}
                        </p>
                        <p class="text-xs text-red-700 dark:text-red-400">
                          {{ ((trade.side === 'long' ? 
                            ((trade.priceMovement?.maxPriceWithin24Hours || 0) - trade.exitPrice) / trade.exitPrice : 
                            (trade.exitPrice - (trade.priceMovement?.minPriceWithin24Hours || 0)) / trade.exitPrice) * 100).toFixed(1) }}% 
                          {{ trade.side === 'long' ? 'higher' : 'lower' }} than exit
                        </p>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-red-800 dark:text-red-300">Could Have Made</p>
                        <p class="text-lg font-bold text-red-900 dark:text-red-200">
                          ${{ ((trade.actualProfit || 0) + (trade.potentialAdditionalProfit?.optimal || 0)).toFixed(2) }}
                        </p>
                        <p class="text-xs text-red-700 dark:text-red-400">
                          vs ${{ (trade.actualProfit || 0).toFixed(2) }} actual profit
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Better Entry Price Analysis (if available) -->
                  <div v-if="trade.entryAnalysis && trade.entryAnalysis.improvementPercent > 0" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
                    <div class="flex items-start space-x-2 mb-2">
                      <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <div class="flex-1">
                        <p class="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">Better Entry Opportunity</p>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p class="text-xs text-blue-700 dark:text-blue-400">Optimal Entry Price</p>
                            <p class="font-bold text-blue-900 dark:text-blue-200">${{ trade.entryAnalysis.bestEntryPrice.toFixed(2) }}</p>
                            <p class="text-xs text-blue-600 dark:text-blue-500">{{ trade.entryAnalysis.minutesBeforeEntry }} min earlier</p>
                          </div>
                          <div>
                            <p class="text-xs text-blue-700 dark:text-blue-400">Entry Improvement</p>
                            <p class="font-bold text-blue-900 dark:text-blue-200">{{ trade.entryAnalysis.improvementPercent.toFixed(1) }}%</p>
                            <p class="text-xs text-blue-600 dark:text-blue-500">${{ trade.entryAnalysis.improvementDollar.toFixed(2) }} per share</p>
                          </div>
                          <div v-if="trade.entryAnalysis.improvedPnL">
                            <p class="text-xs text-blue-700 dark:text-blue-400">P&L with Better Entry</p>
                            <p class="font-bold text-blue-900 dark:text-blue-200">${{ trade.entryAnalysis.improvedPnL.withBetterEntry.toFixed(2) }}</p>
                            <p class="text-xs text-green-600 dark:text-green-500">+${{ trade.entryAnalysis.improvedPnL.improvement.toFixed(2) }}</p>
                          </div>
                        </div>
                        <p class="text-xs text-blue-700 dark:text-blue-400 mt-2 italic">{{ trade.entryAnalysis.recommendation }}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Exit Quality Score (if available) -->
                  <div v-if="trade.exitQualityScore !== null" class="flex items-center space-x-2 mb-3">
                    <span class="text-sm text-gray-600 dark:text-gray-400">Exit Quality Score:</span>
                    <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div class="h-2 rounded-full" 
                           :class="{
                             'bg-red-500': trade.exitQualityScore < 0.3,
                             'bg-yellow-500': trade.exitQualityScore >= 0.3 && trade.exitQualityScore < 0.7,
                             'bg-green-500': trade.exitQualityScore >= 0.7
                           }"
                           :style="{ width: `${trade.exitQualityScore * 100}%` }">
                      </div>
                    </div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {{ (trade.exitQualityScore * 100).toFixed(0) }}%
                    </span>
                  </div>

                  <!-- Recommendation -->
                  <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <div class="flex items-start space-x-2">
                      <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p class="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">Learning Opportunity</p>
                        <p class="text-sm text-blue-700 dark:text-blue-400">{{ trade.recommendation }}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Load More Button -->
                <div v-if="topMissedTrades.topMissedTrades.length > 10" class="text-center pt-4">
                  <button 
                    @click="showAllMissedTrades = !showAllMissedTrades"
                    class="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    {{ showAllMissedTrades ? 'Show Less' : `Show All ${topMissedTrades.topMissedTrades.length} Missed Opportunities` }}
                  </button>
                </div>

                <!-- All trades section when expanded -->
                <div v-if="showAllMissedTrades && topMissedTrades.topMissedTrades.length > 10" class="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div 
                    v-for="(trade, index) in topMissedTrades.topMissedTrades.slice(10)" 
                    :key="`full-${trade.tradeId}`"
                    class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                  >
                    <div class="flex justify-between items-center">
                      <div>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                          #{{ index + 11 }} {{ trade.symbol }}
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          {{ new Date(trade.exitTime).toLocaleDateString() }}
                        </span>
                      </div>
                      <div class="text-right">
                        <span class="text-sm font-bold text-red-600 dark:text-red-400">
                          +{{ trade.missedOpportunityPercent }}%
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          (+${{ (trade.potentialAdditionalProfit?.optimal || 0).toFixed(2) }})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- No Data State -->
              <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800">
                  <svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">{{ topMissedTrades.message || 'No missed opportunities found' }}</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ topMissedTrades.totalAnalyzed > 0 ? 
                    `Analyzed ${topMissedTrades.totalAnalyzed} trades - all had reasonable exit timing!` : 
                    'You need completed winning trades to analyze missed opportunities.' }}
                </p>
              </div>
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No missed opportunities analysis available yet.</p>
              <p class="text-sm mt-2">Click "Find Early Exit Trades" to see specific trades where you left profits on the table.</p>
            </div>
          </div>
        </div>

        <!-- Overconfidence Analysis -->
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="heading-card">Overconfidence Indicators</h3>
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

            <div v-if="overconfidenceData && overconfidenceData.analysis" class="relative">
              <!-- Loading Overlay -->
              <div v-if="loadingOverconfidence" class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-lg flex items-center justify-center z-10">
                <div class="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                  <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="text-sm font-medium">Updating analysis...</span>
                </div>
              </div>
              
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
                      <h5 class="font-medium text-gray-900 dark:text-white flex items-center">
                        <MdiIcon :icon="mdiFire" :size="18" class="mr-1.5 text-red-600" />
                        {{ event.winStreakLength }} Consecutive Wins → Overconfidence Risk
                      </h5>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ new Date(event.detectionDate).toLocaleDateString() }} • 
                        <span class="font-medium">{{ (event.streakTradeDetails || []).map(t => t.symbol).join(', ') }}</span>
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

                  <!-- Position Size Analysis -->
                  <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 mb-4">
                    <h6 class="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">Position Size Escalation</h6>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span class="text-orange-700 dark:text-orange-400">Baseline Size:</span>
                        <span class="font-medium ml-1">${{ (event.baselinePositionSize || 0).toLocaleString() }}</span>
                      </div>
                      <div>
                        <span class="text-orange-700 dark:text-orange-400">Peak Size:</span>
                        <span class="font-medium ml-1">${{ (event.peakPositionSize || 0).toLocaleString() }}</span>
                      </div>
                    </div>
                    <div class="mt-2 text-xs text-orange-700 dark:text-orange-400 flex items-start">
                      <MdiIcon :icon="mdiTrendingUp" :size="14" class="mr-1 mt-0.5 flex-shrink-0" />
                      <span>Position increased by <span class="font-bold">{{ event.positionSizeIncrease?.toFixed(1) || 0 }}%</span>
                      (from ${{ (event.baselinePositionSize || 0).toLocaleString() }} baseline to ${{ (event.peakPositionSize || 0).toLocaleString() }} peak)</span>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
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

                  <!-- Outcome Trade After Streak -->
                  <div v-if="event.outcomeTradeDetails" class="mt-4 p-4 rounded-lg border-2"
                       :class="{
                         'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800': parseFloat(event.outcomeTradeDetails.pnl || 0) < 0,
                         'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800': parseFloat(event.outcomeTradeDetails.pnl || 0) > 0,
                         'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800': parseFloat(event.outcomeTradeDetails.pnl || 0) === 0
                       }">
                    <div class="flex items-center mb-3">
                      <MdiIcon
                        :icon="parseFloat(event.outcomeTradeDetails.pnl || 0) < 0 ? mdiClose : mdiCheck"
                        :size="20"
                        class="mr-2"
                        :class="{
                          'text-red-600': parseFloat(event.outcomeTradeDetails.pnl || 0) < 0,
                          'text-green-600': parseFloat(event.outcomeTradeDetails.pnl || 0) > 0,
                          'text-gray-600': parseFloat(event.outcomeTradeDetails.pnl || 0) === 0
                        }" />
                      <h6 class="text-sm font-semibold"
                          :class="{
                            'text-red-900 dark:text-red-200': parseFloat(event.outcomeTradeDetails.pnl || 0) < 0,
                            'text-green-900 dark:text-green-200': parseFloat(event.outcomeTradeDetails.pnl || 0) > 0,
                            'text-gray-900 dark:text-gray-200': parseFloat(event.outcomeTradeDetails.pnl || 0) === 0
                          }">
                        Trade Taken After {{ event.winStreakLength }}-Win Streak
                      </h6>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-md p-3">
                      <div class="flex items-center justify-between mb-2">
                        <div>
                          <p class="font-semibold text-gray-900 dark:text-white">{{ event.outcomeTradeDetails.symbol }}</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            {{ new Date(event.outcomeTradeDetails.entry_time).toLocaleDateString() }} •
                            {{ event.outcomeTradeDetails.side?.toUpperCase() }} {{ event.outcomeTradeDetails.quantity }} shares
                          </p>
                        </div>
                        <div class="text-right">
                          <p class="text-lg font-bold"
                             :class="{
                               'text-red-600 dark:text-red-400': parseFloat(event.outcomeTradeDetails.pnl || 0) < 0,
                               'text-green-600 dark:text-green-400': parseFloat(event.outcomeTradeDetails.pnl || 0) > 0,
                               'text-gray-600 dark:text-gray-400': parseFloat(event.outcomeTradeDetails.pnl || 0) === 0
                             }">
                            {{ parseFloat(event.outcomeTradeDetails.pnl || 0) >= 0 ? '+' : '' }}${{ parseFloat(event.outcomeTradeDetails.pnl || 0).toFixed(2) }}
                          </p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">P&L</p>
                        </div>
                      </div>

                      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div>
                          <p class="text-gray-500 dark:text-gray-400">Entry Price</p>
                          <p class="font-medium">${{ parseFloat(event.outcomeTradeDetails.entry_price || 0).toFixed(2) }}</p>
                        </div>
                        <div>
                          <p class="text-gray-500 dark:text-gray-400">Exit Price</p>
                          <p class="font-medium">${{ parseFloat(event.outcomeTradeDetails.exit_price || 0).toFixed(2) }}</p>
                        </div>
                        <div>
                          <p class="text-gray-500 dark:text-gray-400">Position Size</p>
                          <p class="font-medium">${{ (parseFloat(event.outcomeTradeDetails.entry_price || 0) * parseFloat(event.outcomeTradeDetails.quantity || 0)).toLocaleString() }}</p>
                        </div>
                        <div>
                          <p class="text-gray-500 dark:text-gray-400">Fees</p>
                          <p class="font-medium">${{ (parseFloat(event.outcomeTradeDetails.commission || 0) + parseFloat(event.outcomeTradeDetails.fees || 0)).toFixed(2) }}</p>
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 text-xs flex items-start"
                         :class="{
                           'text-red-800 dark:text-red-200': parseFloat(event.outcomeTradeDetails.pnl || 0) < 0,
                           'text-green-800 dark:text-green-200': parseFloat(event.outcomeTradeDetails.pnl || 0) > 0,
                           'text-gray-800 dark:text-gray-200': parseFloat(event.outcomeTradeDetails.pnl || 0) === 0
                         }">
                      <MdiIcon :icon="mdiLightningBolt" :size="14" class="mr-1.5 mt-0.5 flex-shrink-0" />
                      <p v-if="parseFloat(event.outcomeTradeDetails.pnl || 0) < 0">
                        <strong>What happened:</strong> After {{ event.winStreakLength }} consecutive wins, overconfidence led to
                        <span v-if="event.positionSizeIncrease > 0">a {{ event.positionSizeIncrease.toFixed(1) }}% larger position size</span>
                        <span v-else>risky trading decisions</span>
                        that resulted in this losing trade, giving back
                        <strong>${{ Math.abs(parseFloat(event.outcomeTradeDetails.pnl || 0)).toFixed(2) }}</strong> of the streak's profits.
                      </p>
                      <p v-else-if="parseFloat(event.outcomeTradeDetails.pnl || 0) > 0">
                        <strong>Lucky break:</strong> After {{ event.winStreakLength }} consecutive wins,
                        <span v-if="event.positionSizeIncrease > 0">the {{ event.positionSizeIncrease.toFixed(1) }}% larger position size</span>
                        <span v-else>the elevated confidence</span>
                        resulted in a winning trade. However, this reinforces overconfidence and increases future risk.
                      </p>
                      <p v-else>
                        <strong>Break even:</strong> The trade after the {{ event.winStreakLength }}-win streak resulted in no gain or loss.
                      </p>
                    </div>

                    <!-- Detailed Outcome Analysis -->
                    <div v-if="event.outcomeAnalysis && event.outcomeAnalysis.verdict" class="mt-4 p-3 rounded-lg border-2"
                         :class="{
                           'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700': event.outcomeAnalysis.verdict.verdict === 'true_overconfidence',
                           'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700': event.outcomeAnalysis.verdict.verdict === 'partial_overconfidence',
                           'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700': event.outcomeAnalysis.verdict.verdict === 'prudent_trade',
                           'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700': event.outcomeAnalysis.verdict.verdict === 'bad_luck'
                         }">
                      <div class="flex items-center justify-between mb-2">
                        <h6 class="text-sm font-bold flex items-center"
                            :class="{
                              'text-red-900 dark:text-red-200': event.outcomeAnalysis.verdict.verdict === 'true_overconfidence',
                              'text-orange-900 dark:text-orange-200': event.outcomeAnalysis.verdict.verdict === 'partial_overconfidence',
                              'text-green-900 dark:text-green-200': event.outcomeAnalysis.verdict.verdict === 'prudent_trade',
                              'text-gray-900 dark:text-gray-200': event.outcomeAnalysis.verdict.verdict === 'bad_luck'
                            }">
                          <MdiIcon
                            :icon="event.outcomeAnalysis.verdict.isOverconfidence ? mdiClose : mdiCheck"
                            :size="16"
                            class="mr-1.5"
                          />
                          Trade Analysis: {{ event.outcomeAnalysis.verdict.verdictLabel }}
                        </h6>
                        <div class="text-xs font-semibold px-2 py-1 rounded"
                             :class="{
                               'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100': event.outcomeAnalysis.verdict.verdict === 'true_overconfidence',
                               'bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100': event.outcomeAnalysis.verdict.verdict === 'partial_overconfidence',
                               'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100': event.outcomeAnalysis.verdict.verdict === 'prudent_trade',
                               'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100': event.outcomeAnalysis.verdict.verdict === 'bad_luck'
                             }">
                          Score: {{ event.outcomeAnalysis.verdict.overconfidenceScore }}/{{ event.outcomeAnalysis.verdict.maxScore }}
                        </div>
                      </div>

                      <p class="text-xs mb-3"
                         :class="{
                           'text-red-800 dark:text-red-200': event.outcomeAnalysis.verdict.verdict === 'true_overconfidence',
                           'text-orange-800 dark:text-orange-200': event.outcomeAnalysis.verdict.verdict === 'partial_overconfidence',
                           'text-green-800 dark:text-green-200': event.outcomeAnalysis.verdict.verdict === 'prudent_trade',
                           'text-gray-800 dark:text-gray-200': event.outcomeAnalysis.verdict.verdict === 'bad_luck'
                         }">
                        {{ event.outcomeAnalysis.verdict.recommendation }}
                      </p>

                      <!-- Issues Found -->
                      <div v-if="event.outcomeAnalysis.verdict.reasons && event.outcomeAnalysis.verdict.reasons.length > 0" class="mb-2">
                        <p class="text-xs font-semibold text-red-900 dark:text-red-200 mb-1">Issues Found:</p>
                        <ul class="text-xs space-y-1">
                          <li v-for="(reason, idx) in event.outcomeAnalysis.verdict.reasons" :key="idx" class="flex items-start">
                            <span class="text-red-600 mr-1.5">•</span>
                            <span class="text-red-800 dark:text-red-300">{{ reason }}</span>
                          </li>
                        </ul>
                      </div>

                      <!-- Positive Factors -->
                      <div v-if="event.outcomeAnalysis.verdict.positiveFactors && event.outcomeAnalysis.verdict.positiveFactors.length > 0">
                        <p class="text-xs font-semibold text-green-900 dark:text-green-200 mb-1">What Went Well:</p>
                        <ul class="text-xs space-y-1">
                          <li v-for="(factor, idx) in event.outcomeAnalysis.verdict.positiveFactors" :key="idx" class="flex items-start">
                            <span class="text-green-600 mr-1.5">✓</span>
                            <span class="text-green-800 dark:text-green-300">{{ factor }}</span>
                          </li>
                        </ul>
                      </div>

                      <!-- Detailed Analysis Sections -->
                      <div v-if="event.outcomeAnalysis.stopLossAnalysis" class="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                        <p class="text-xs font-semibold mb-2">Stop Loss Analysis:</p>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p class="text-gray-600 dark:text-gray-400">Recommended Stop:</p>
                            <p class="font-medium">
                              {{ event.outcomeAnalysis.stopLossAnalysis.recommendedStopLoss ?
                                `$${event.outcomeAnalysis.stopLossAnalysis.recommendedStopLoss.toFixed(2)}` : 'N/A' }}
                            </p>
                          </div>
                          <div>
                            <p class="text-gray-600 dark:text-gray-400">Adherence:</p>
                            <p class="font-medium capitalize"
                               :class="{
                                 'text-green-600': event.outcomeAnalysis.stopLossAnalysis.adherenceRating === 'good',
                                 'text-red-600': event.outcomeAnalysis.stopLossAnalysis.adherenceRating === 'poor',
                                 'text-gray-600': event.outcomeAnalysis.stopLossAnalysis.adherenceRating === 'none'
                               }">
                              {{ event.outcomeAnalysis.stopLossAnalysis.adherenceRating }}
                            </p>
                          </div>
                        </div>
                        <p v-if="event.outcomeAnalysis.stopLossAnalysis.heldPastStopLoss" class="text-xs text-red-700 dark:text-red-300 mt-2">
                          Additional loss from not respecting stop: ${{ event.outcomeAnalysis.stopLossAnalysis.additionalLoss.toFixed(2) }}
                        </p>
                      </div>
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

                  <!-- Win Streak Trades Details -->
                  <div class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                    <div class="flex items-center justify-between mb-3">
                      <div>
                        <h6 class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                          <MdiIcon :icon="mdiTrophy" :size="16" class="mr-1.5 text-yellow-600" />
                          The {{ event.winStreakLength }} Consecutive Winning Trades
                        </h6>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          These {{ event.winStreakLength }} wins in a row led to escalating position sizes as confidence grew
                        </p>
                      </div>
                      <button 
                        @click="toggleOverconfidenceEventExpansion(event.id)"
                        class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center space-x-1"
                      >
                        <span>{{ expandedOverconfidenceEvents.has(event.id) ? 'Hide Details' : 'Show Details' }}</span>
                        <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-180': expandedOverconfidenceEvents.has(event.id) }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      </button>
                    </div>
                    
                    <div v-if="expandedOverconfidenceEvents.has(event.id)" class="space-y-2">
                      <div v-if="!event.streakTradeDetails || event.streakTradeDetails.length === 0" class="text-sm text-gray-500 dark:text-gray-400 italic">
                        Loading trade details...
                      </div>
                      <div v-else>
                        <div 
                          v-for="(trade, index) in event.streakTradeDetails" 
                          :key="trade.id"
                          class="flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors"
                          :class="{
                            'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/20': parseFloat(trade.pnl) > 0,
                            'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/20': parseFloat(trade.pnl) < 0,
                            'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600': parseFloat(trade.pnl) === 0
                          }"
                          @click="openTrade(trade.id)"
                        >
                          <div class="flex items-center space-x-3">
                            <div class="flex items-center space-x-1">
                              <span class="text-xs font-medium px-1.5 py-0.5 rounded"
                                    :class="{
                                      'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300': index === 0,
                                      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300': index > 0 && index < event.winStreakLength - 1,
                                      'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300': index === event.winStreakLength - 1
                                    }">
                                Win #{{ index + 1 }}
                              </span>
                              <span class="font-medium text-gray-900 dark:text-white">{{ trade.symbol }}</span>
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                              {{ new Date(trade.entry_time).toLocaleDateString() }}
                            </div>
                          </div>
                          
                          <div class="flex items-center space-x-4 text-xs">
                            <div class="text-right">
                              <div class="text-gray-500 dark:text-gray-400">Position Size</div>
                              <div class="flex items-center space-x-1">
                                <span class="font-medium">${{ (parseFloat(trade.position_size) || 0).toLocaleString() }}</span>
                                <span v-if="index > 0 && event.streakTradeDetails[index-1]" 
                                      class="text-xs px-1 py-0.5 rounded"
                                      :class="{
                                        'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400': parseFloat(trade.position_size) > parseFloat(event.streakTradeDetails[index-1].position_size),
                                        'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400': parseFloat(trade.position_size) < parseFloat(event.streakTradeDetails[index-1].position_size)
                                      }">
                                  {{ parseFloat(trade.position_size) > parseFloat(event.streakTradeDetails[index-1].position_size) ? '+' : '' }}{{ (((parseFloat(trade.position_size) - parseFloat(event.streakTradeDetails[index-1].position_size)) / parseFloat(event.streakTradeDetails[index-1].position_size)) * 100).toFixed(0) }}%
                                </span>
                              </div>
                            </div>
                            <div class="text-right">
                              <div class="text-gray-500 dark:text-gray-400">P&L</div>
                              <div class="font-medium" :class="{
                                'text-green-600 dark:text-green-400': parseFloat(trade.pnl) > 0,
                                'text-red-600 dark:text-red-400': parseFloat(trade.pnl) < 0,
                                'text-gray-600 dark:text-gray-400': parseFloat(trade.pnl) === 0
                              }">
                                {{ parseFloat(trade.pnl) >= 0 ? '+' : '' }}${{ parseFloat(trade.pnl || 0).toFixed(2) }}
                              </div>
                            </div>
                            <div class="text-blue-500 hover:text-blue-600">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
import { ref, onMounted, computed, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import { 
  mdiChartBox,
  mdiTrendingDown,
  mdiLightningBolt,
  mdiTarget,
  mdiTrendingUp,
  mdiClose,
  mdiCheck,
  mdiCurrencyUsd,
  mdiScale,
  mdiLightbulb,
  mdiFire,
  mdiTrophy
} from '@mdi/js'

const { showSuccess, showError } = useNotification()
const authStore = useAuthStore()
const { selectedAccount } = useGlobalAccountFilter()
const router = useRouter()
const route = useRoute()

const loading = ref(true)
const loadingHistorical = ref(false)
const loadingLossAversion = ref(false)
const loadingOverconfidence = ref(false)
const loadingPersonality = ref(false)
const loadingTopMissedTrades = ref(false)
const hasAccess = ref(false)
const overview = ref(null)
const revengeAnalysis = ref(null)
const insights = ref(null)
const activeAlerts = ref([])
const lossAversionData = ref(null)
const overconfidenceData = ref(null)
const personalityData = ref(null)
const topMissedTrades = ref(null)
const showAllMissedTrades = ref(false)
const topMissedTradesSection = ref(null)
const settings = ref({
  revengeTrading: { enabled: true, sensitivity: 'medium' },
  coolingPeriod: { minutes: 30 },
  alertPreferences: { email: false, push: true, toast: true }
})

const filters = ref({
  symbol: '',
  startDate: '',
  endDate: '',
  strategies: [],
  sectors: [],
  tags: [],
  status: '',
  side: '',
  instrumentTypes: [],
  optionTypes: [],
  qualityGrades: [],
  daysOfWeek: [],
  brokers: [],
  hasNews: null,
  pnlType: '',
  minPrice: null,
  maxPrice: null,
  minQuantity: null,
  maxQuantity: null,
  minPnl: null,
  maxPnl: null
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

// Track which overconfidence events are expanded
const expandedOverconfidenceEvents = ref(new Set())

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
    if (filters.value.accounts) queryParams.append('accounts', filters.value.accounts)
    
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
  
  // Load main data and existing analysis data with new filters
  await loadData()
  
  // Reload all existing analysis data with new date filters
  await Promise.all([
    loadExistingLossAversionData(),
    loadExistingOverconfidenceData(),
    loadExistingPersonalityData()
  ])
  
  // Auto-load top missed trades if loss aversion data exists
  if (lossAversionData.value?.analysis) {
    await loadTopMissedTrades()
  }
}

// Handle filter changes from TradeFilters component
const handleFilter = (newFilters) => {
  // Directly apply the filters from TradeFilters component
  filters.value = { ...newFilters }

  // Save filters and reload data
  saveFilters()
  applyFilters()
}

// Clear filters
const clearFilters = async () => {
  filters.value = {
    symbol: '',
    startDate: '',
    endDate: '',
    strategies: [],
    sectors: [],
    tags: [],
    status: '',
    side: '',
    instrumentTypes: [],
    optionTypes: [],
    qualityGrades: [],
    daysOfWeek: [],
    brokers: [],
    hasNews: null,
    pnlType: '',
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    minPnl: null,
    maxPnl: null
  }

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

// Navigate to trades page filtered by loss aversion trades
const viewLossAversionTrades = () => {
  if (lossAversionData.value?.analysis?.priceHistoryAnalysis?.exampleTrades) {
    const tradeIds = lossAversionData.value.analysis.priceHistoryAnalysis.exampleTrades.map(trade => trade.id)
    if (tradeIds.length > 0) {
      // Navigate to trades page with filtered trade IDs
      router.push({
        path: '/trades',
        query: {
          filter: 'loss_aversion',
          tradeIds: tradeIds.join(','),
          title: 'Loss Aversion Trades'
        }
      })
    }
  }
}

// Scroll to top missed trades section
const scrollToTopMissedTrades = async () => {
  // Load top missed trades if not already loaded
  if (!topMissedTrades.value || !topMissedTrades.value.topMissedTrades) {
    await loadTopMissedTrades()
  }
  
  // Scroll to the top missed trades section
  await nextTick()
  if (topMissedTradesSection.value) {
    topMissedTradesSection.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Briefly highlight the section
    topMissedTradesSection.value.classList.add('ring-2', 'ring-orange-400', 'ring-opacity-50')
    setTimeout(() => {
      topMissedTradesSection.value.classList.remove('ring-2', 'ring-orange-400', 'ring-opacity-50')
    }, 2000)
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

// Toggle expanded state for overconfidence events
const toggleOverconfidenceEventExpansion = async (eventId) => {
  if (expandedOverconfidenceEvents.value.has(eventId)) {
    expandedOverconfidenceEvents.value.delete(eventId)
  } else {
    expandedOverconfidenceEvents.value.add(eventId)
    
    // Load trade details if not already loaded
    const event = overconfidenceData.value?.analysis?.events?.find(e => e.id === eventId)
    if (event && (!event.streakTradeDetails || event.streakTradeDetails.length === 0)) {
      try {
        const response = await api.get(`/behavioral-analytics/overconfidence/${eventId}/trades`)
        if (response.data.success) {
          event.streakTradeDetails = response.data.data
        }
      } catch (error) {
        console.error('Error loading trade details:', error)
        showError('Error', 'Failed to load trade details')
      }
    }
  }
}

// Go back to previous page
const goBack = () => {
  // Use Vue Router's go method to go back one step in history
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    // If no history, go to metrics page since this is a sub-page of metrics
    router.push('/metrics')
  }
}

// Analyze loss aversion patterns
const analyzeLossAversion = async () => {
  try {
    loadingLossAversion.value = true
    
    // Clear any existing cache before running fresh analysis
    clearLossAversionCache()
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    if (filters.value.accounts) queryParams.append('accounts', filters.value.accounts)
    
    const response = await api.get(`/behavioral-analytics/loss-aversion?${queryParams}`)
    
    if (response.data.data) {
      lossAversionData.value = response.data.data
      
      // Cache the complete analysis results with fresh timestamp
      cacheLossAversionData(response.data.data)
      
      if (response.data.data.error) {
        showError('Analysis Error', response.data.data.message)
      } else {
        showSuccess('Analysis Complete', 'Loss aversion patterns analyzed successfully')
        
        // Auto-load top missed trades after successful analysis
        await loadTopMissedTrades()
      }
    }
  } catch (error) {
    console.error('Error analyzing loss aversion:', error)
    
    // Check if it's a 400 error with specific requirements message
    if (error.response?.status === 400 && error.response?.data?.message) {
      showError('Requirements Not Met', error.response.data.message)
    } else {
      showError('Error', 'Failed to analyze loss aversion patterns')
    }
  } finally {
    loadingLossAversion.value = false
  }
}

// Analyze overconfidence patterns
const analyzeOverconfidence = async () => {
  try {
    loadingOverconfidence.value = true

    // Clear frontend cache when user deliberately clicks "Analyze History"
    // This ensures fresh AI recommendations are generated
    const cacheKey = `overconfidence_analysis_${authStore.user?.id}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`
    localStorage.removeItem(cacheKey)
    console.log('[OVERCONFIDENCE] Cleared frontend cache - will generate fresh AI recommendations')

    // Build query params for date filters
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    if (filters.value.accounts) queryParams.append('accounts', filters.value.accounts)

    const response = await api.post(`/behavioral-analytics/overconfidence/analyze-historical?${queryParams}`)

    if (response.data.success) {
      // Get the analysis from the response - need to fetch the full analysis after historical processing
      const analysisResponse = await api.get(`/behavioral-analytics/overconfidence?${queryParams}`)
      if (analysisResponse.data.success && analysisResponse.data.data) {
        overconfidenceData.value = analysisResponse.data.data

        console.log('[OVERCONFIDENCE] Analysis response:', analysisResponse.data.data)
        console.log('[OVERCONFIDENCE] Events found:', analysisResponse.data.data.analysis?.events?.length || 0)
        console.log('[OVERCONFIDENCE] Statistics:', analysisResponse.data.data.analysis?.statistics)

        // Cache the overconfidence data
        const cacheData = {
          data: analysisResponse.data.data,
          timestamp: Date.now(),
          filters: { ...filters.value }
        }
        localStorage.setItem(cacheKey, JSON.stringify(cacheData))

        if (analysisResponse.data.data.error) {
          showError('Analysis Error', analysisResponse.data.data.message)
        } else {
          const eventsCount = analysisResponse.data.data.analysis?.events?.length || analysisResponse.data.data.analysis?.statistics?.totalEvents || 0
          showSuccess('Analysis Complete', response.data.message || `Found ${eventsCount} overconfidence events`)
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing overconfidence:', error)
    
    // Check if it's a 400 error with specific requirements message
    if (error.response?.status === 400 && error.response?.data?.message) {
      showError('Requirements Not Met', error.response.data.message)
    } else {
      showError('Error', 'Failed to analyze overconfidence patterns')
    }
  } finally {
    loadingOverconfidence.value = false
  }
}

// Load top missed trades by percentage of missed opportunity
const loadTopMissedTrades = async (forceRefresh = false) => {
  try {
    loadingTopMissedTrades.value = true
    showAllMissedTrades.value = false // Reset expanded state

    console.log(`Loading top missed trades... (forceRefresh: ${forceRefresh})`)

    // Check cache only if NOT force refreshing and load immediately to show existing data
    const cacheKey = `top_missed_trades_${authStore.user?.id}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`
    if (!forceRefresh) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData)
          const cacheAge = Date.now() - parsed.timestamp
          const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

          if (cacheAge < maxAge && parsed.data) {
            topMissedTrades.value = parsed.data
            console.log('Loaded top missed trades from cache (will update in background)')
          }
        } catch (e) {
          console.warn('Invalid cached top missed trades data')
        }
      }
    } else {
      console.log('Force refresh - clearing frontend cache')
      localStorage.removeItem(cacheKey)
    }

    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    if (filters.value.accounts) queryParams.append('accounts', filters.value.accounts)
    queryParams.append('limit', '50')
    if (forceRefresh) queryParams.append('forceRefresh', 'true')

    const response = await api.get(`/behavioral-analytics/loss-aversion/top-missed-trades?${queryParams}`)
    
    if (response.data.data) {
      topMissedTrades.value = response.data.data
      
      // Cache the top missed trades data
      const cacheData = {
        data: response.data.data,
        timestamp: Date.now(),
        filters: { ...filters.value }
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
      
      if (response.data.data.topMissedTrades && response.data.data.topMissedTrades.length > 0) {
        showSuccess('Analysis Complete', `Found ${response.data.data.topMissedTrades.length} trades with significant missed opportunities`)
      } else {
        showSuccess('Analysis Complete', response.data.data.message || 'No significant missed opportunities found')
      }
    }
  } catch (error) {
    console.error('Failed to load top missed trades:', error)
    if (error.response?.status === 403) {
      showError('Pro Tier Required', error.response.data.message)
    } else {
      showError('Error', 'Failed to load top missed trades analysis')
    }
  } finally {
    loadingTopMissedTrades.value = false
  }
}

// Analyze trading personality patterns
const analyzePersonality = async () => {
  try {
    loadingPersonality.value = true
    
    const queryParams = new URLSearchParams()
    if (filters.value.startDate) queryParams.append('startDate', filters.value.startDate)
    if (filters.value.endDate) queryParams.append('endDate', filters.value.endDate)
    if (filters.value.accounts) queryParams.append('accounts', filters.value.accounts)
    
    const response = await api.get(`/behavioral-analytics/personality?${queryParams}`)
    
    if (response.data.data) {
      personalityData.value = response.data.data
      
      // Cache the result
      const cacheKey = `personality_analysis_${authStore.user?.id}`
      const cacheData = {
        data: response.data.data,
        timestamp: Date.now()
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
      
      if (response.data.data.error) {
        showError('Analysis Error', response.data.data.message)
      } else {
        showSuccess('Analysis Complete', 'Trading personality analyzed successfully')
      }
    }
  } catch (error) {
    console.error('Error analyzing personality:', error)
    
    // Check if it's a 400 error with specific requirements message
    if (error.response?.status === 400 && error.response?.data?.message) {
      showError('Requirements Not Met', error.response.data.message)
    } else {
      showError('Error', 'Failed to analyze trading personality')
    }
  } finally {
    loadingPersonality.value = false
  }
}

// View trades by specific strategy pattern
const viewTradesByStrategy = (strategy) => {
  // Define strategy-specific filters based on trading patterns
  const strategyFilters = {
    scalper: {
      name: 'Scalper Trades',
      description: 'Very short-term trades (< 15 minutes)',
      filters: {
        maxHoldTime: 15, // minutes
        tradeTypes: ['scalp', 'momentum']
      }
    },
    momentum: {
      name: 'Momentum Trades', 
      description: 'Trend-following trades (15 minutes - 4 hours)',
      filters: {
        minHoldTime: 15,
        maxHoldTime: 240, // 4 hours
        tradeTypes: ['momentum', 'breakout']
      }
    },
    mean_reversion: {
      name: 'Mean Reversion Trades',
      description: 'Counter-trend trades expecting price reversal',
      filters: {
        minHoldTime: 30,
        maxHoldTime: 480, // 8 hours  
        tradeTypes: ['mean_reversion', 'support_resistance']
      }
    },
    swing: {
      name: 'Swing Trades',
      description: 'Multi-day position trades (> 1 day)',
      filters: {
        minHoldTime: 1440, // 1 day in minutes
        tradeTypes: ['swing', 'position']
      }
    }
  }

  const strategyConfig = strategyFilters[strategy]
  if (!strategyConfig) return

  // Build query parameters for the trades page
  const queryParams = new URLSearchParams()
  
  // Add strategy-specific filters
  if (strategyConfig.filters.minHoldTime) {
    queryParams.set('minHoldTime', strategyConfig.filters.minHoldTime.toString())
  }
  if (strategyConfig.filters.maxHoldTime) {
    queryParams.set('maxHoldTime', strategyConfig.filters.maxHoldTime.toString())
  }
  
  
  // Add strategy name for filtering - now that backend supports strategy filtering via hold time analysis
  queryParams.set('strategy', strategy)  // Enable strategy filtering
  queryParams.set('strategyName', strategyConfig.name)
  queryParams.set('strategyDescription', strategyConfig.description)
  
  // Navigate to trades page with filters
  router.push({
    path: '/trades',
    query: Object.fromEntries(queryParams)
  })
}

// Format minutes to human-readable time
const formatMinutes = (minutes) => {
  // Handle edge cases
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return 'N/A'
  }

  const mins = Math.round(Number(minutes))

  if (mins < 1) {
    return '< 1m'
  } else if (mins < 60) {
    return `${mins}m`
  } else if (mins < 1440) {
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
  } else {
    const days = Math.floor(mins / 1440)
    const remainingMinutes = mins % 1440
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

// Watch for global account filter changes
watch(selectedAccount, async () => {
  console.log('[BehavioralAnalytics] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  // Update filters with new account
  filters.value.accounts = selectedAccount.value || ''
  if (hasAccess.value) {
    await loadData()
  }
})

onMounted(async () => {
  loadFilters()
  // Initialize account filter from global state
  if (selectedAccount.value) {
    filters.value.accounts = selectedAccount.value
  }
  await checkAccess()
  if (hasAccess.value) {
    await loadData()
    
    // Load existing analysis data to maintain state when returning to page
    await Promise.all([
      loadExistingLossAversionData(),
      loadExistingOverconfidenceData(),
      loadExistingPersonalityData()
    ])
    
    // Always load cached data immediately on page load
    console.log('[PROCESS] Loading cached data on page mount...')
    await Promise.all([
      loadCachedTopMissedTrades(),
      loadCachedOverconfidenceData()
    ])
    
    // Log current state
    console.log('[STATS] Current state after cache loading:')
    console.log('topMissedTrades:', topMissedTrades.value)
    console.log('overconfidenceData:', overconfidenceData.value)
    
    // Auto-load fresh top missed trades if loss aversion data exists
    if (lossAversionData.value?.analysis) {
      await loadTopMissedTrades()
    }
  } else {
    loading.value = false
  }
})

// Load cached top missed trades immediately on page load
const loadCachedTopMissedTrades = () => {
  try {
    // Try multiple cache key variations to find data
    const userId = authStore.user?.id
    const cacheKeys = [
      `top_missed_trades_${userId}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`,
      `top_missed_trades_${userId}_all_all`, // Fallback to "all dates" version
      `top_missed_trades_${userId}` // Even simpler fallback
    ]
    
    for (const cacheKey of cacheKeys) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData)
          const cacheAge = Date.now() - parsed.timestamp
          const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
          
          if (cacheAge < maxAge && parsed.data) {
            topMissedTrades.value = parsed.data
            console.log(`[SUCCESS] Loaded top missed trades from cache on page load (key: ${cacheKey})`)
            console.log('Cache data:', parsed.data)
            return true
          }
        } catch (parseError) {
          console.warn(`Failed to parse cached data for key ${cacheKey}:`, parseError)
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load cached top missed trades:', e)
  }
  return false
}

// Load cached overconfidence data immediately on page load
const loadCachedOverconfidenceData = () => {
  try {
    // Try multiple cache key variations to find data
    const userId = authStore.user?.id
    const cacheKeys = [
      `overconfidence_analysis_${userId}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`,
      `overconfidence_analysis_${userId}_all_all`, // Fallback to "all dates" version
      `overconfidence_analysis_${userId}` // Even simpler fallback
    ]
    
    for (const cacheKey of cacheKeys) {
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData)
          const cacheAge = Date.now() - parsed.timestamp
          const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
          
          if (cacheAge < maxAge && parsed.data) {
            overconfidenceData.value = parsed.data
            console.log(`[SUCCESS] Loaded overconfidence analysis from cache on page load (key: ${cacheKey})`)
            console.log('Cache data:', parsed.data)
            return true
          }
        } catch (parseError) {
          console.warn(`Failed to parse cached data for key ${cacheKey}:`, parseError)
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load cached overconfidence data:', e)
  }
  return false
}

// Clear loss aversion cache
const clearLossAversionCache = () => {
  try {
    // Clear all loss aversion cache entries for current user
    const userId = route.params.userId || 'current'
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith(`loss_aversion_${userId}_`)) {
        localStorage.removeItem(key)
        console.log('Cleared cache:', key)
      }
    })
  } catch (error) {
    console.warn('Failed to clear loss aversion cache:', error)
  }
}

// Cache loss aversion data in localStorage
const cacheLossAversionData = (data) => {
  try {
    const cacheKey = `loss_aversion_${route.params.userId || 'current'}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`
    const cacheData = {
      data: data,
      timestamp: Date.now(),
      userId: route.params.userId || 'current'
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    console.log('Cached loss aversion data:', cacheKey)
  } catch (error) {
    console.warn('Failed to cache loss aversion data:', error)
  }
}

// Load cached loss aversion data
const loadCachedLossAversionData = () => {
  try {
    const cacheKey = `loss_aversion_${route.params.userId || 'current'}_${filters.value.startDate || 'all'}_${filters.value.endDate || 'all'}`
    const cached = localStorage.getItem(cacheKey)
    
    if (cached) {
      const cacheData = JSON.parse(cached)
      const age = Date.now() - cacheData.timestamp
      const maxAge = 30 * 60 * 1000 // 30 minutes
      
      if (age < maxAge) {
        console.log('Loaded cached loss aversion data:', cacheKey)
        return cacheData.data
      } else {
        // Remove expired cache
        localStorage.removeItem(cacheKey)
      }
    }
  } catch (error) {
    console.warn('Failed to load cached loss aversion data:', error)
  }
  return null
}

// Load existing loss aversion analysis data
const loadExistingLossAversionData = async () => {
  // Always try API first to get the latest data from database
  try {
    const lossAversionRes = await api.get('/behavioral-analytics/loss-aversion/complete')
    if (lossAversionRes.data.data) {
      // Use the complete analysis data which includes stored trade patterns
      lossAversionData.value = lossAversionRes.data.data
      // Cache the API response
      cacheLossAversionData(lossAversionRes.data.data)
      return
    }
  } catch (error) {
    console.log('Failed to load complete loss aversion data, trying cache...')
  }

  // Try cache as fallback
  const cachedData = loadCachedLossAversionData()
  if (cachedData) {
    lossAversionData.value = cachedData
    return
  }

  // Fallback to basic metrics if both API and cache fail
  try {
      const fallbackRes = await api.get('/behavioral-analytics/loss-aversion/latest')
      if (fallbackRes.data.data) {
        const metrics = fallbackRes.data.data
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
              totalMissedProfit: 0,
              avgMissedProfitPercent: 0,
              exampleTrades: []
            }
          }
        }
      }
    } catch (fallbackError) {
      console.error('Failed to load basic loss aversion metrics:', fallbackError)
    }
}

// Load existing overconfidence analysis data
const loadExistingOverconfidenceData = async () => {
  try {
    const response = await api.get('/behavioral-analytics/overconfidence')
    if (response.data.success && response.data.data) {
      overconfidenceData.value = response.data.data
      
      // Cache overconfidence data locally for persistence
      const cacheKey = `overconfidence_analysis_${authStore.user?.id}`
      const cacheData = {
        data: response.data.data,
        timestamp: Date.now(),
        filters: filters.value
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    } else {
      // Try to load from cache if API has no data
      const cacheKey = `overconfidence_analysis_${authStore.user?.id}`
      const cachedData = localStorage.getItem(cacheKey)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData)
          const cacheAge = Date.now() - parsed.timestamp
          const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
          
          if (cacheAge < maxAge && parsed.data) {
            overconfidenceData.value = parsed.data
            console.log('Loaded overconfidence data from cache')
          }
        } catch (e) {
          console.warn('Invalid cached overconfidence data')
        }
      }
    }
  } catch (error) {
    console.error('Failed to load existing overconfidence data:', error)
  }
}

// Load existing personality analysis data
const loadExistingPersonalityData = async () => {
  try {
    // First try to get the latest stored analysis from the database
    const response = await api.get('/behavioral-analytics/personality/latest')
    if (response.data.success && response.data.data) {
      personalityData.value = response.data.data
      console.log('Loaded personality data from database')
      
      // Also cache it locally for quick access
      const cacheKey = `personality_analysis_${authStore.user?.id}`
      const cacheData = {
        data: response.data.data,
        timestamp: Date.now()
      }
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
      return
    }
    
    // If no data from API, check localStorage cache as fallback
    const cacheKey = `personality_analysis_${authStore.user?.id}`
    const cachedData = localStorage.getItem(cacheKey)
    
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData)
        const cacheAge = Date.now() - parsed.timestamp
        const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days (increased from 24 hours)
        
        if (cacheAge < maxAge && parsed.data) {
          personalityData.value = parsed.data
          console.log('Loaded personality data from cache (API had no data)')
          return
        }
      } catch (e) {
        console.warn('Invalid cached personality data')
      }
    }
  } catch (error) {
    console.error('Failed to load existing personality data:', error)
  }
}

// Automatically analyze personality if conditions are met
const autoAnalyzePersonality = async () => {
  if (loadingPersonality.value) return
  
  try {
    // Check if user has enough trades for analysis
    const tradeCountResponse = await api.get('/trades/count')
    if (tradeCountResponse.data.count >= 20) {
      console.log('Auto-analyzing personality with sufficient trade data')
      await analyzePersonality()
    }
  } catch (error) {
    console.log('Could not auto-analyze personality:', error.message)
  }
}
</script>