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
              </div>
              <!-- Radial Progress Indicator -->
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
                            class="bg-primary-500 h-2 rounded-full transition-all duration-300"
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
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div
            v-for="leaderboard in leaderboards"
            :key="leaderboard.key"
            class="bg-white dark:bg-gray-800 shadow rounded-lg"
          >
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                {{ leaderboard.name }}
              </h3>
            </div>
            <div class="p-6">
              <div v-if="leaderboard.entries.length === 0" class="text-center py-8">
                <MdiIcon :icon="mdiChartBox" :size="48" class="text-gray-400 mx-auto mb-4" />
                <p class="mt-4 text-gray-500 dark:text-gray-400 text-sm">
                  No rankings available yet
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
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'
import MdiIcon from '@/components/MdiIcon.vue'
import { useNotification } from '@/composables/useNotification'
import { 
  mdiTrophy, 
  mdiChartLine, 
  mdiTarget, 
  mdiChartBox, 
  mdiFire, 
  mdiStar,
  mdiTrendingUp,
  mdiChevronRight,
  mdiChevronLeft
} from '@mdi/js'

export default {
  name: 'GamificationView',
  components: {
    MdiIcon
  },
  setup() {
    const { showSuccess, showError, showWarning } = useNotification()
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

    const loadLeaderboards = async () => {
      try {
        const response = await api.get('/gamification/leaderboards')
        
        if (response.data.success) {
          leaderboards.value = response.data.data || []
        }
      } catch (error) {
        console.error('Error loading leaderboards:', error)
      }
    }

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
      if (activeTab.value === 'achievements' && achievements.value.length === 0) {
        await loadAchievements()
      }
      if (activeTab.value === 'leaderboards' && leaderboards.value.length === 0) {
        await loadLeaderboards()
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
      formatDate,
      formatLeaderboardValue,
      loadTabData,
      checkForNewAchievements,
      viewFullLeaderboard,
      mdiTrophy,
      mdiChartLine,
      mdiTarget,
      mdiChartBox,
      mdiFire,
      mdiStar,
      mdiTrendingUp,
      mdiChevronRight,
      mdiChevronLeft
    }
  }
}
</script>