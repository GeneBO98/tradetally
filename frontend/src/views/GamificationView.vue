<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <div class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
                <MdiIcon :icon="mdiTrophy" :size="32" class="mr-3 text-yellow-500" />
                Leaderboard
              </h1>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Track your achievements, compete with peers, and level up your trading skills
              </p>
              <div v-if="anonymousName" class="mt-2 flex items-center">
                <span class="text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 px-2 py-1 rounded-full">
                  Your leaderboard name: {{ anonymousName }}
                </span>
              </div>
            </div>
              <div class="flex items-center space-x-4">
                <div class="text-right">
                  <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                    Level {{ userStats.level || 1 }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ userStats.total_points || 0 }} total points
                  </div>
                  <div v-if="userStats.level_progress" class="text-xs text-gray-500 dark:text-gray-500">
                    {{ userStats.level_progress.points_needed_for_next_level }} XP to next level
                  </div>
                </div>              <!-- Radial Progress Indicator -->
              <div class="relative w-20 h-20 flex items-center justify-center">
                <svg class="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                  <!-- Background circle -->
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="currentColor"
                    :class="'text-gray-200 dark:text-gray-700'"
                    stroke-width="6"
                    fill="transparent"
                  />
                  <!-- Progress circle -->
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="currentColor"
                    :class="'text-primary-500'"
                    stroke-width="6"
                    fill="transparent"
                    :stroke-dasharray="`${2 * Math.PI * 32}`"
                    :stroke-dashoffset="`${2 * Math.PI * 32 * (1 - (userStats.level_progress?.progress_percentage || 0) / 100)}`"
                    stroke-linecap="round"
                    class="transition-all duration-500 ease-out"
                  />
                </svg>
                <!-- Level number in center -->
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-lg font-bold text-primary-600 dark:text-primary-400">
                    {{ userStats.level || 1 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav class="-mb-px flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            :class="[
              'py-3 px-1 border-b-2 font-medium text-sm',
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
          >
            <MdiIcon :icon="tab.icon" :size="20" class="mr-2" />
            {{ tab.name }}
          </button>
        </nav>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'">
        <!-- Quick Stats -->
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <MdiIcon :icon="mdiTrophy" :size="24" class="text-yellow-500" />
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Achievements
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ userStats.achievement_count }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <MdiIcon :icon="mdiChartLine" :size="24" class="text-blue-500" />
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Rank
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      #{{ userStats.rank || '-' }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <MdiIcon :icon="mdiFire" :size="24" class="text-red-500" />
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Current Streak
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ userStats.current_streak_days }} days
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <MdiIcon :icon="mdiStar" :size="24" class="text-purple-500" />
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Progress
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      <div v-if="userStats.level_progress">
                        {{ userStats.level_progress.points_in_current_level }}/{{ userStats.level_progress.total_points_for_current_level }} XP
                        <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {{ Math.round(userStats.level_progress.progress_percentage) }}% to Level {{ (userStats.level || 1) + 1 }}
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                          <div 
                            class="bg-primary-500 h-2 rounded-full transition-all duration-150 ease-out"
                            :style="{ width: `${userStats.level_progress.progress_percentage}%` }"
                          ></div>
                        </div>
                      </div>
                      <div v-else>
                        {{ userStats.experience_points || 0 }} XP
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Achievements -->
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg mb-8">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
              <MdiIcon :icon="mdiTrophy" :size="20" class="mr-2 text-yellow-500" />
              Recent Achievements
            </h3>
          </div>
          <div class="p-6">
            <div v-if="recentAchievements.length === 0" class="text-center py-8">
              <MdiIcon :icon="mdiTarget" :size="72" class="text-gray-400 mx-auto mb-4" />
              <p class="mt-4 text-gray-500 dark:text-gray-400">
                No achievements yet. Start trading to unlock your first achievement!
              </p>
            </div>
            <div v-else class="space-y-4">
              <div 
                v-for="achievement in recentAchievements" 
                :key="achievement.id"
                class="flex items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div class="flex-shrink-0">
                  <MdiIcon :icon="mdiTrophy" :size="24" class="text-yellow-500" />
                </div>
                <div class="ml-4 flex-1">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ achievement.name }}
                  </h4>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ achievement.description }}
                  </p>
                </div>
                <div class="text-right">
                  <div class="text-sm font-medium text-primary-600 dark:text-primary-400">
                    +{{ achievement.points }} XP
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-between">
              <button 
                @click="activeTab = 'achievements'"
                class="text-primary-600 dark:text-primary-400 hover:text-primary-500 text-sm font-medium"
              >
                View all achievements →
              </button>
              <button 
                @click="checkForNewAchievements"
                :disabled="checkingAchievements"
                :class="[
                  'px-3 py-1 rounded text-xs font-medium transition-colors flex items-center',
                  checkingAchievements 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800'
                ]"
              >
                <div v-if="checkingAchievements" class="inline-block animate-spin rounded-full h-3 w-3 border-b border-current mr-2"></div>
                {{ checkingAchievements ? 'Checking...' : 'Check for new achievements' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Achievements Tab -->
      <div v-if="activeTab === 'achievements'">
        <div v-if="achievementsLoading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-gray-600 dark:text-gray-400">Loading achievements...</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="achievement in achievements"
            :key="achievement.id"
            :class="[
              'bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 transition-all duration-200 hover:shadow-md',
              achievement.is_earned 
                ? 'border-primary-200 dark:border-primary-700 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-gray-800' 
                : 'border-gray-200 dark:border-gray-700'
            ]"
          >
            <div class="p-6">
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center">
                  <div 
                    :class="[
                      'w-12 h-12 rounded-full flex items-center justify-center text-2xl',
                      achievement.is_earned 
                        ? 'bg-primary-100 dark:bg-primary-900' 
                        : 'bg-gray-100 dark:bg-gray-700'
                    ]"
                  >
                    <MdiIcon 
                      :icon="mdiTrophy" 
                      :size="24" 
                      :class="achievement.is_earned ? 'text-yellow-500' : 'text-gray-400 grayscale opacity-50'" 
                    />
                  </div>
                  <div class="ml-3">
                    <h3 
                      :class="[
                        'text-lg font-semibold',
                        achievement.is_earned 
                          ? 'text-gray-900 dark:text-white' 
                          : 'text-gray-600 dark:text-gray-400'
                      ]"
                    >
                      {{ achievement.name }}
                    </h3>
                    <span 
                      :class="[
                        'text-sm font-medium',
                        achievement.is_earned 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : 'text-gray-500 dark:text-gray-500'
                      ]"
                    >
                      +{{ achievement.points }} XP
                    </span>
                  </div>
                </div>
                
                <div class="flex-shrink-0">
                  <span
                    v-if="achievement.is_earned"
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  >
                    ✓ Earned
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    Locked
                  </span>
                </div>
              </div>

              <p 
                :class="[
                  'text-sm mb-4',
                  achievement.is_earned 
                    ? 'text-gray-700 dark:text-gray-300' 
                    : 'text-gray-500 dark:text-gray-400'
                ]"
              >
                {{ achievement.description }}
              </p>

              <div v-if="achievement.is_earned" class="text-xs text-gray-500 dark:text-gray-400">
                Earned {{ formatDate(achievement.earned_at) }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="!achievementsLoading && achievements.length === 0" class="text-center py-12">
          <MdiIcon :icon="mdiTarget" :size="72" class="text-gray-400 mx-auto mb-4" />
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            No achievements found
          </h3>
          <p class="mt-2 text-gray-500 dark:text-gray-400">
            Start trading to unlock achievements!
          </p>
          <button 
            @click="loadAchievements"
            class="mt-4 bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 transition-colors"
          >
            Reload Achievements
          </button>
        </div>
      </div>

      <!-- Leaderboards Tab -->
      <div v-if="activeTab === 'leaderboards'">
        <!-- My Rankings Section -->
        <div class="mb-8">
          <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                  <MdiIcon :icon="mdiAccount" :size="20" class="mr-2 text-primary-500" />
                  My Rankings
                </h3>
                <button 
                  @click="showFilters = !showFilters"
                  :class="[
                    'px-3 py-1 rounded text-sm font-medium transition-colors flex items-center',
                    showFilters 
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  ]"
                >
                  <MdiIcon :icon="mdiFilter" :size="16" class="mr-1" />
                  {{ showFilters ? 'Hide Filters' : 'Filter by Peers' }}
                </button>
              </div>
            </div>

            <!-- Filters Section -->
            <div v-if="showFilters" class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
              <div v-if="loadingFilters" class="text-center py-4">
                <div class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading filter options...</span>
              </div>
              
              <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Strategy Filter -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Trading Strategy
                  </label>
                  <select 
                    v-model="filters.strategy"
                    @change="applyFilters"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="all">All Strategies</option>
                    <option 
                      v-for="strategy in filterOptions.strategies || []" 
                      :key="strategy.value" 
                      :value="strategy.value"
                    >
                      {{ strategy.label }}
                    </option>
                  </select>
                </div>

                <!-- Position Size Filter -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Average Position Size
                  </label>
                  <select 
                    v-model="filters.volumeRange"
                    @change="applyFilters"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option 
                      v-for="range in volumeRanges" 
                      :key="range.value" 
                      :value="range.value"
                    >
                      {{ range.label }}
                    </option>
                  </select>
                </div>

                <!-- Profit Per Trade Filter -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Average Profit Per Trade
                  </label>
                  <select 
                    v-model="filters.pnlRange"
                    @change="applyFilters"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option 
                      v-for="range in pnlRanges" 
                      :key="range.value" 
                      :value="range.value"
                    >
                      {{ range.label }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Clear Filters Button -->
              <div class="mt-4 flex justify-end">
                <button 
                  @click="clearFilters"
                  class="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <!-- Rankings Content -->
            <div class="p-6">
              <div v-if="rankingsLoading || applyingFilters" class="text-center py-8">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                <p class="mt-2 text-gray-600 dark:text-gray-400">
                  {{ applyingFilters ? 'Applying filters...' : 'Loading your rankings...' }}
                </p>
              </div>

              <div v-else-if="userRankings.length === 0" class="text-center py-8">
                <MdiIcon :icon="mdiChartBox" :size="48" class="text-gray-400 mx-auto mb-4" />
                <p class="mt-4 text-gray-500 dark:text-gray-400 text-sm">
                  {{ hasFiltersApplied ? 'No rankings found matching your filter criteria' : 'No rankings available yet' }}
                </p>
                <p v-if="hasFiltersApplied" class="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Try adjusting your filters to find peers with similar trading patterns
                </p>
              </div>

              <div v-else class="space-y-4">
                <div v-if="hasFiltersApplied" class="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-700">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center text-sm text-primary-700 dark:text-primary-300">
                      <MdiIcon :icon="mdiFilter" :size="16" class="mr-2" />
                      Showing filtered rankings
                      <span v-if="userRankings[0]?.total_filtered_users" class="ml-2 px-2 py-1 bg-primary-100 dark:bg-primary-800 rounded-full text-xs">
                        {{ userRankings[0].total_filtered_users }} peers found
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  v-for="ranking in userRankings"
                  :key="`${ranking.key}-${ranking.rank}-${hasFiltersApplied ? 'filtered' : 'all'}`"
                  class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div class="flex items-center">
                    <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-sm font-bold text-primary-600 dark:text-primary-400">
                      #{{ ranking.rank }}
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        {{ ranking.name }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ ranking.period_type === 'all_time' ? 'All Time' : ranking.period_type }}
                        <span v-if="ranking.total_participants">
                          • {{ ranking.total_participants }} participants
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ formatLeaderboardValue(ranking.score, ranking.key) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- All Leaderboards Section -->
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {{ hasFiltersApplied ? 'Filtered Leaderboards' : 'All Leaderboards' }}
          </h3>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div
              v-for="leaderboard in leaderboards"
              :key="leaderboard.key"
              class="bg-white dark:bg-gray-800 shadow rounded-lg"
            >
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                    {{ leaderboard.name }}
                  </h3>
                  <span v-if="leaderboard.filtered && leaderboard.totalFilteredUsers !== null" class="text-xs text-gray-500 dark:text-gray-400">
                    {{ leaderboard.totalFilteredUsers }} peers
                  </span>
                </div>
              </div>
              <div class="p-6">
                <div v-if="leaderboard.entries.length === 0" class="text-center py-8">
                  <MdiIcon :icon="mdiChartBox" :size="48" class="text-gray-400 mx-auto mb-4" />
                  <p class="mt-4 text-gray-500 dark:text-gray-400 text-sm">
                    {{ leaderboard.filtered ? 'No peers match the selected filters' : 'No rankings available yet' }}
                  </p>
                </div>
                <div v-else class="space-y-4">
                  <div
                    v-for="(entry, index) in leaderboard.entries.slice(0, 10)"
                    :key="entry.user_id"
                    :class="[
                      'flex items-center justify-between p-3 rounded-lg',
                      entry.is_current_user 
                        ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700' 
                        : 'bg-gray-50 dark:bg-gray-700'
                    ]"
                  >
                    <div class="flex items-center">
                      <div 
                        :class="[
                          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                          index === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          index === 1 ? 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200' :
                          index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                          'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'
                        ]"
                      >
                        {{ index + 1 }}
                      </div>
                      <div class="ml-3">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ entry.display_name || entry.anonymous_name }}
                        </div>
                        <div v-if="entry.is_current_user" class="text-xs text-primary-600 dark:text-primary-400">
                          You
                        </div>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        {{ formatLeaderboardValue(entry.value, leaderboard.key) }}
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="leaderboard.entries.length > 0" class="mt-6 text-center">
                  <button 
                    @click="viewFullLeaderboard(leaderboard)"
                    class="text-primary-600 dark:text-primary-400 hover:text-primary-500 text-sm font-medium flex items-center mx-auto"
                  >
                    View all rankings
                    <MdiIcon :icon="mdiChevronRight" :size="16" class="ml-1" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Full Leaderboard View -->
      <div v-if="activeTab === 'full-leaderboard'">
        <div class="mb-6">
          <button 
            @click="activeTab = 'leaderboards'"
            class="flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-500 mb-4"
          >
            <MdiIcon :icon="mdiChevronLeft" :size="20" class="mr-1" />
            Back to Rankings
          </button>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ selectedLeaderboard?.name }} - Full Rankings
          </h2>
        </div>

        <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div v-if="fullLeaderboardLoading" class="text-center py-12">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p class="mt-2 text-gray-600 dark:text-gray-400">Loading full rankings...</p>
          </div>

          <div v-else-if="fullLeaderboardEntries.length === 0" class="text-center py-12">
            <MdiIcon :icon="mdiChartBox" :size="48" class="text-gray-400 mx-auto mb-4" />
            <p class="text-gray-500 dark:text-gray-400">No rankings available</p>
          </div>

          <div v-else class="p-6">
            <div class="space-y-3">
              <div
                v-for="(entry, index) in fullLeaderboardEntries"
                :key="entry.user_id"
                :class="[
                  'flex items-center justify-between p-4 rounded-lg',
                  entry.is_current_user 
                    ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700' 
                    : 'bg-gray-50 dark:bg-gray-700'
                ]"
              >
                <div class="flex items-center">
                  <div 
                    :class="[
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                      index === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      index === 1 ? 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200' :
                      index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                      'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'
                    ]"
                  >
                    {{ entry.rank || index + 1 }}
                  </div>
                  <div class="ml-4">
                    <div class="text-base font-medium text-gray-900 dark:text-white">
                      {{ entry.display_name || entry.anonymous_name }}
                    </div>
                    <div v-if="entry.is_current_user" class="text-sm text-primary-600 dark:text-primary-400">
                      You
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-base font-bold text-gray-900 dark:text-white">
                    {{ formatLeaderboardValue(entry.score || entry.value, selectedLeaderboard?.key) }}
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

<script>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/services/api'
import MdiIcon from '@/components/MdiIcon.vue'
import { useNotification } from '@/composables/useNotification'
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'
import { 
  mdiTrophy, 
  mdiChartLine, 
  mdiTarget, 
  mdiChartBox, 
  mdiFire, 
  mdiStar,
  mdiTrendingUp,
  mdiChevronRight,
  mdiChevronLeft,
  mdiAccount,
  mdiFilter
} from '@mdi/js'

export default {
  name: 'GamificationView',
  components: {
    MdiIcon
  },
  setup() {
    const { showSuccess, showError, showWarning } = useNotification()
    const { celebrationQueue } = usePriceAlertNotifications()
    const activeTab = ref('overview')
    
    const tabs = [
      { key: 'overview', name: 'Overview', icon: mdiChartBox },
      { key: 'achievements', name: 'Achievements', icon: mdiTrophy },
      { key: 'leaderboards', name: 'Rankings', icon: mdiTrendingUp }
    ]

    const userStats = ref({
      level: 1,
      total_points: 0,
      achievement_count: 0,
      rank: null,
      current_streak_days: 0,
      experience_points: 0
    })

    const anonymousName = ref('')
    const recentAchievements = ref([])
    const achievements = ref([])
    const leaderboards = ref([])
    const loading = ref(true)
    const achievementsLoading = ref(false)
    const fullLeaderboardLoading = ref(false)
    const fullLeaderboardEntries = ref([])
    const selectedLeaderboard = ref(null)
    const checkingAchievements = ref(false)
    
    // Filter-related reactive data
    const showFilters = ref(false)
    const loadingFilters = ref(false)
    const rankingsLoading = ref(false)
    const applyingFilters = ref(false)
    const userRankings = ref([])
    const filterOptions = ref({
      strategies: [],
      volumeRanges: {},
      pnlRanges: {}
    })
    const filters = ref({
      strategy: 'all',
      volumeRange: 'all',
      pnlRange: 'all'
    })

    // Predefined volume ranges (average position size per trade)
    const volumeRanges = [
      { value: 'all', label: 'All Position Sizes', min: null, max: null },
      { value: 'micro', label: 'Micro Positions (Under $1K per trade)', min: 0, max: 1000 },
      { value: 'small', label: 'Small Positions ($1K - $10K per trade)', min: 1000, max: 10000 },
      { value: 'medium', label: 'Medium Positions ($10K - $50K per trade)', min: 10000, max: 50000 },
      { value: 'large', label: 'Large Positions ($50K - $250K per trade)', min: 50000, max: 250000 },
      { value: 'xl', label: 'Extra Large Positions ($250K+ per trade)', min: 250000, max: null }
    ]

    // Predefined P&L ranges (average profit/loss per trade)
    const pnlRanges = [
      { value: 'all', label: 'All Profit Levels', min: null, max: null },
      { value: 'small_profit', label: 'Small Profits ($0 - $50 per trade)', min: 0, max: 50 },
      { value: 'moderate_profit', label: 'Moderate Profits ($50 - $100 per trade)', min: 50, max: 100 },
      { value: 'good_profit', label: 'Good Profits ($100 - $200 per trade)', min: 100, max: 200 },
      { value: 'high_profit', label: 'High Profits ($200 - $500 per trade)', min: 200, max: 500 },
      { value: 'exceptional_profit', label: 'Exceptional Profits ($500+ per trade)', min: 500, max: null }
    ]

    const loadDashboard = async () => {
      try {
        loading.value = true
        const response = await api.get('/gamification/dashboard')
        
        if (response.data.success) {
          const data = response.data.data
          console.log('Dashboard data received:', data)
          userStats.value = data.stats || {
            level: 1,
            total_points: 0,
            achievement_count: 0,
            rank: null,
            current_streak_days: 0,
            experience_points: 0
          }
          anonymousName.value = data.anonymousName || ''
          recentAchievements.value = data.recentAchievements || []
          
          // Show achievement celebrations on initial load if on overview tab
          if (activeTab.value === 'overview') {
            await celebrateUnseenEarned()
          }
        }
      } catch (error) {
        console.error('Error loading gamification dashboard:', error)
      } finally {
        loading.value = false
      }
    }

    const loadAchievements = async () => {
      try {
        achievementsLoading.value = true
        console.log('Loading achievements...')
        const response = await api.get(`/gamification/achievements?t=${Date.now()}`)
        
        console.log('Achievements API response:', response.data)
        
        if (response.data.success) {
          achievements.value = response.data.data.achievements || []
          console.log(`Loaded ${achievements.value.length} achievements:`, achievements.value)
          
          // If no earned achievements, show upcoming ones from dashboard
          if (achievements.value.length === 0) {
            console.log('No achievements found, checking dashboard for upcoming...')
            const dashboardResponse = await api.get('/gamification/dashboard')
            if (dashboardResponse.data.success && dashboardResponse.data.data.upcomingAchievements) {
              achievements.value = dashboardResponse.data.data.upcomingAchievements.map(achievement => ({
                ...achievement,
                is_earned: false,
                id: achievement.name.toLowerCase().replace(/\s+/g, '_')
              }))
              console.log('Loaded upcoming achievements from dashboard:', achievements.value)
            }
          }
          
          // Sort achievements by XP points (lowest to highest)
          achievements.value.sort((a, b) => (a.points || 0) - (b.points || 0))
        }
      } catch (error) {
        console.error('Error loading achievements:', error)
      } finally {
        achievementsLoading.value = false
      }
    }

    const loadLeaderboards = async (appliedFilters = {}) => {
      try {
        // Build query parameters from filters
        const params = new URLSearchParams()
        
        // Strategy filter
        if (appliedFilters.strategy && appliedFilters.strategy !== 'all') {
          params.append('strategy', appliedFilters.strategy)
        }
        
        // Volume range filter
        if (appliedFilters.volumeRange && appliedFilters.volumeRange !== 'all') {
          const volumeRange = volumeRanges.find(r => r.value === appliedFilters.volumeRange)
          if (volumeRange) {
            if (volumeRange.min !== null) {
              params.append('minVolume', volumeRange.min)
            }
            if (volumeRange.max !== null) {
              params.append('maxVolume', volumeRange.max)
            }
          }
        }
        
        // P&L range filter
        if (appliedFilters.pnlRange && appliedFilters.pnlRange !== 'all') {
          const pnlRange = pnlRanges.find(r => r.value === appliedFilters.pnlRange)
          if (pnlRange) {
            if (pnlRange.min !== null) {
              params.append('minPnl', pnlRange.min)
            }
            if (pnlRange.max !== null) {
              params.append('maxPnl', pnlRange.max)
            }
          }
        }
        
        const url = `/gamification/leaderboards${params.toString() ? '?' + params.toString() : ''}`
        console.log('Loading leaderboards with URL:', url)
        const response = await api.get(url)
        
        if (response.data.success) {
          console.log('Loaded leaderboards:', response.data.data)
          leaderboards.value = response.data.data || []
        }
      } catch (error) {
        console.error('Error loading leaderboards:', error)
      }
    }

    // Convert strategy key to friendly label
    const formatStrategyLabel = (strategy) => {
      if (!strategy) return strategy
      
      // Convert snake_case and kebab-case to Title Case
      return strategy
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/\bDay\b/g, 'Day')
        .replace(/\bSwing\b/g, 'Swing')
        .replace(/\bScalp/g, 'Scalp')
        .replace(/\bMomentum/g, 'Momentum')
        .replace(/\bMean Reversion/g, 'Mean Reversion')
        .replace(/\bBreakout/g, 'Breakout')
        .replace(/\bNews/g, 'News')
        .replace(/\bEarnings/g, 'Earnings')
    }

    // Load filter options from the API
    const loadFilterOptions = async () => {
      try {
        loadingFilters.value = true
        const response = await api.get('/gamification/rankings/filters')
        
        if (response.data.success) {
          const data = response.data.data || {
            strategies: [],
            volumeRanges: {},
            pnlRanges: {}
          }
          
          // Format strategy labels
          data.strategies = data.strategies.map(strategy => ({
            value: strategy.value,
            label: formatStrategyLabel(strategy.label || strategy.value)
          }))
          
          filterOptions.value = data
        }
      } catch (error) {
        console.error('Error loading filter options:', error)
      } finally {
        loadingFilters.value = false
      }
    }

    // Load user rankings (with optional filters)
    const loadUserRankings = async (appliedFilters = {}) => {
      try {
        rankingsLoading.value = true
        
        // Build query parameters
        const params = new URLSearchParams()
        
        // Strategy filter
        if (appliedFilters.strategy && appliedFilters.strategy !== 'all') {
          params.append('strategy', appliedFilters.strategy)
        }
        
        // Volume range filter
        if (appliedFilters.volumeRange && appliedFilters.volumeRange !== 'all') {
          const volumeRange = volumeRanges.find(r => r.value === appliedFilters.volumeRange)
          if (volumeRange) {
            if (volumeRange.min !== null) {
              params.append('minVolume', volumeRange.min)
            }
            if (volumeRange.max !== null) {
              params.append('maxVolume', volumeRange.max)
            }
          }
        }
        
        // P&L range filter
        if (appliedFilters.pnlRange && appliedFilters.pnlRange !== 'all') {
          const pnlRange = pnlRanges.find(r => r.value === appliedFilters.pnlRange)
          if (pnlRange) {
            if (pnlRange.min !== null) {
              params.append('minPnl', pnlRange.min)
            }
            if (pnlRange.max !== null) {
              params.append('maxPnl', pnlRange.max)
            }
          }
        }
        
        const url = `/gamification/rankings${params.toString() ? '?' + params.toString() : ''}`
        console.log('Loading rankings with URL:', url)
        const response = await api.get(url)
        
        if (response.data.success) {
          console.log('Loaded rankings:', response.data.data)
          // Ensure we completely replace the array to trigger reactivity
          userRankings.value = [...(response.data.data || [])]
        }
      } catch (error) {
        console.error('Error loading user rankings:', error)
        userRankings.value = []
      } finally {
        rankingsLoading.value = false
      }
    }

    // Apply filters to the rankings
    const applyFilters = async () => {
      console.log('Applying filters:', filters.value)
      applyingFilters.value = true
      try {
        // Load both user rankings and all leaderboards with filters
        await Promise.all([
          loadUserRankings(filters.value),
          loadLeaderboards(filters.value)
        ])
        console.log('Filters applied successfully, rankings updated:', userRankings.value.length)
      } catch (error) {
        console.error('Error applying filters:', error)
      } finally {
        applyingFilters.value = false
      }
    }

    // Clear all filters
    const clearFilters = async () => {
      console.log('Clearing all filters')
      filters.value = {
        strategy: 'all',
        volumeRange: 'all',
        pnlRange: 'all'
      }
      try {
        // Reload both without filters
        await Promise.all([
          loadUserRankings(),
          loadLeaderboards()
        ])
        console.log('Filters cleared successfully, rankings reset:', userRankings.value.length)
      } catch (error) {
        console.error('Error clearing filters:', error)
      }
    }

    // Computed property to check if any filters are applied
    const hasFiltersApplied = computed(() => {
      return filters.value.strategy !== 'all' ||
             filters.value.volumeRange !== 'all' ||
             filters.value.pnlRange !== 'all'
    })

    const formatDate = (dateString) => {
      if (!dateString) return ''
      const date = new Date(dateString)
      const now = new Date()
      const diffInHours = (now - date) / (1000 * 60 * 60)
      
      if (diffInHours < 24) {
        if (diffInHours < 1) return 'just now'
        return `${Math.floor(diffInHours)}h ago`
      } else if (diffInHours < 24 * 7) {
        return `${Math.floor(diffInHours / 24)}d ago`
      } else {
        return date.toLocaleDateString()
      }
    }

    const formatLeaderboardValue = (value, key) => {
      // P&L-based leaderboards
      if (key.includes('pnl') || key.includes('trade')) {
        const amount = parseFloat(value)
        if (amount >= 0) {
          return `+$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        } else {
          return `-$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }
      }
      
      // Consistency score
      if (key.includes('consistent')) {
        return `${parseFloat(value).toFixed(2)}`
      }
      
      // Legacy formats
      if (key.includes('discipline') || key.includes('score')) {
        return `${Math.round(value)}%`
      }
      if (key.includes('streak')) {
        return `${value} days`
      }
      if (key.includes('points')) {
        return `${value} pts`
      }
      return value
    }

    // Load data based on active tab
    const loadTabData = async () => {
      if (activeTab.value === 'overview') {
        // Only trigger celebrations on Overview tab
        await celebrateUnseenEarned()
      }
      if (activeTab.value === 'achievements') {
        // Mark achievements as viewed when visiting achievements tab
        markAchievementsAsViewed()
        if (achievements.value.length === 0) {
          await loadAchievements()
        }
      }
      if (activeTab.value === 'leaderboards') {
        // Load filter options first
        if (filterOptions.value.strategies.length === 0) {
          await loadFilterOptions()
        }
        // Always load both rankings and leaderboards with current filters
        await Promise.all([
          loadUserRankings(filters.value),
          loadLeaderboards(filters.value)
        ])
      }
    }

    onMounted(() => {
      loadDashboard()
      // Temporarily disabled automatic achievement checking due to 500 error
      // checkForNewAchievements()
    })

    const checkForNewAchievements = async () => {
      try {
        checkingAchievements.value = true
        // Get stats before for XP animation context
        const beforeRes = await api.get('/gamification/dashboard')
        const beforeStats = beforeRes.data?.data?.stats || {}
        const beforeXP = beforeStats.experience_points || 0
        const beforeLevel = beforeStats.level || 1
        const beforeMin = beforeStats.level_progress?.current_level_min_xp || 0
        const beforeNext = beforeStats.level_progress?.next_level_min_xp || 100

        const response = await api.post('/gamification/achievements/check')
        
        if (response.data.success && response.data.data.count > 0) {
          console.log(`Earned ${response.data.data.count} new achievements!`)
          
          // Show achievement names
          const achievementNames = response.data.data.newAchievements.map(a => a.name).join(', ')
          console.log(`New achievements: ${achievementNames}`)
          
          // Show success message to user
          showSuccess(
            `🎉 ${response.data.data.count} New Achievement${response.data.data.count > 1 ? 's' : ''}!`,
            achievementNames
          )
          
          // Queue celebrations for each achievement
          response.data.data.newAchievements.forEach(a => {
            celebrationQueue.value.push({ type: 'achievement', payload: { achievement: a } })
          })
          // Fetch stats after to animate XP/level change
          const afterRes = await api.get('/gamification/dashboard')
          const afterStats = afterRes.data?.data?.stats || {}
          const afterXP = afterStats.experience_points || beforeXP
          const afterLevel = afterStats.level || beforeLevel
          const afterMin = afterStats.level_progress?.current_level_min_xp || beforeMin
          const afterNext = afterStats.level_progress?.next_level_min_xp || beforeNext
          const deltaXP = Math.max(0, afterXP - beforeXP)
          celebrationQueue.value.push({
            type: 'xp_update',
            payload: {
              oldXP: beforeXP,
              newXP: afterXP,
              deltaXP,
              oldLevel: beforeLevel,
              newLevel: afterLevel,
              currentLevelMinXPBefore: beforeMin,
              nextLevelMinXPBefore: beforeNext,
              currentLevelMinXPAfter: afterMin,
              nextLevelMinXPAfter: afterNext
            }
          })
          if (afterLevel > beforeLevel) {
            celebrationQueue.value.push({ type: 'level_up', payload: { oldLevel: beforeLevel, newLevel: afterLevel } })
          }
          
          // Reload dashboard to show updated stats
          await loadDashboard()
          
          // Optionally reload achievements if we're on that tab
          if (activeTab.value === 'achievements') {
            await loadAchievements()
          }
        } else {
          console.log('No new achievements found')
          // Show info message to user
          showWarning('No New Achievements', 'Keep trading to unlock more achievements!')
        }
      } catch (error) {
        console.error('Error checking achievements:', error)
        showError('Achievement Check Failed', 'Please try again later.')
      } finally {
        checkingAchievements.value = false
      }
    }

    // Achievement celebration logic - now handles all uncelebrated achievements at once

    const celebrateUnseenEarned = async () => {
      try {
        const [earnedRes, dashRes] = await Promise.all([
          api.get('/gamification/achievements/earned'),
          api.get('/gamification/dashboard')
        ])
        const earned = earnedRes.data?.data?.achievements || earnedRes.data?.achievements || []
        const stats = dashRes.data?.data?.stats || {}
        const levelProgress = stats.level_progress || {}

        const storageIds = localStorage.getItem('tt_celebrated_achievements')
        const seenIds = storageIds ? JSON.parse(storageIds) : []
        
        console.log(`Total earned achievements: ${earned.length}`)
        console.log(`Previously celebrated IDs:`, seenIds)
        console.log(`All earned achievements:`, earned.map(a => ({ id: a.id, name: a.name })))
        
        // Only filter out achievements that are already in localStorage (permanently celebrated)
        // Don't filter by shownInSession here - we want to show all uncelebrated achievements
        const unseen = earned.filter(a => a.id && !seenIds.includes(a.id))
        
        console.log(`Found ${unseen.length} uncelebrated achievements:`, unseen.map(a => a.name))
        
        if (unseen.length > 0) {
          // Add all unseen achievements to the celebration queue
          unseen.forEach(a => {
            celebrationQueue.value.push({ type: 'achievement', payload: { achievement: a } })
          })
          
          // Mark all as celebrated in localStorage so they don't show again
          const newSeen = [...new Set([...seenIds, ...unseen.map(a => a.id)])]
          localStorage.setItem('tt_celebrated_achievements', JSON.stringify(newSeen))
          
          console.log(`Queued ${unseen.length} achievements for celebration`)
        }

        const lastLevel = parseInt(localStorage.getItem('tt_seen_level') || '0')
        const lastXP = parseInt(localStorage.getItem('tt_seen_xp') || '0')
        const currentLevel = stats.level || 1
        const currentXP = stats.experience_points || 0
        if (currentLevel > lastLevel) {
          celebrationQueue.value.push({ type: 'level_up', payload: { oldLevel: lastLevel || currentLevel - 1, newLevel: currentLevel } })
        }
        if (currentXP > lastXP && levelProgress.current_level_min_xp !== undefined) {
          celebrationQueue.value.push({
            type: 'xp_update',
            payload: {
              oldXP: lastXP,
              newXP: currentXP,
              deltaXP: Math.max(0, currentXP - lastXP),
              oldLevel: lastLevel || currentLevel,
              newLevel: currentLevel,
              currentLevelMinXPBefore: levelProgress.current_level_min_xp,
              nextLevelMinXPBefore: levelProgress.next_level_min_xp,
              currentLevelMinXPAfter: levelProgress.current_level_min_xp,
              nextLevelMinXPAfter: levelProgress.next_level_min_xp
            }
          })
        }
        localStorage.setItem('tt_seen_level', String(currentLevel))
        localStorage.setItem('tt_seen_xp', String(currentXP))
      } catch (e) {
        console.error('Error in celebrateUnseenEarned:', e)
      }
    }

    const markAchievementsAsViewed = () => {
      // This function can be used for additional logic when visiting achievements tab
      // For now, we rely on the localStorage tracking
    }

    const resetCelebratedAchievements = () => {
      localStorage.removeItem('tt_celebrated_achievements')
      localStorage.removeItem('tt_seen_level')
      localStorage.removeItem('tt_seen_xp')
      console.log('Reset all celebrated achievements and level/XP tracking')
    }

    // Expose reset function to window for debugging
    if (typeof window !== 'undefined') {
      window.resetCelebratedAchievements = resetCelebratedAchievements
    }

    const viewFullLeaderboard = async (leaderboard) => {
      selectedLeaderboard.value = leaderboard
      activeTab.value = 'full-leaderboard'
      await loadFullLeaderboard(leaderboard.key)
    }

    const loadFullLeaderboard = async (leaderboardKey) => {
      try {
        fullLeaderboardLoading.value = true
        
        // Use limit=0 to get all entries (no limit)
        const response = await api.get(`/gamification/leaderboards/${leaderboardKey}?limit=0`)
        
        if (response.data.success) {
          fullLeaderboardEntries.value = response.data.data.entries || []
        }
      } catch (error) {
        console.error('Error loading full leaderboard:', error)
        showError('Failed to Load Rankings', 'Unable to load complete leaderboard data.')
        fullLeaderboardEntries.value = []
      } finally {
        fullLeaderboardLoading.value = false
      }
    }

    // Watch for tab changes to load data
    watch(activeTab, loadTabData)
    
    // Watch for manual filter changes (helpful for debugging)
    watch(filters, (newFilters, oldFilters) => {
      console.log('Filters changed:', { old: oldFilters, new: newFilters })
    }, { deep: true })

    return {
      activeTab,
      tabs,
      userStats,
      anonymousName,
      recentAchievements,
      achievements,
      leaderboards,
      loading,
      achievementsLoading,
      fullLeaderboardLoading,
      fullLeaderboardEntries,
      selectedLeaderboard,
      checkingAchievements,
      // Filter-related
      showFilters,
      loadingFilters,
      rankingsLoading,
      applyingFilters,
      userRankings,
      filterOptions,
      filters,
      volumeRanges,
      pnlRanges,
      hasFiltersApplied,
      applyFilters,
      clearFilters,
      formatDate,
      formatLeaderboardValue,
      loadTabData,
      checkForNewAchievements,
      resetCelebratedAchievements,
      viewFullLeaderboard,
      mdiTrophy,
      mdiChartLine,
      mdiTarget,
      mdiChartBox,
      mdiFire,
      mdiStar,
      mdiTrendingUp,
      mdiChevronRight,
      mdiChevronLeft,
      mdiAccount,
      mdiFilter
    }
  }
}
</script>