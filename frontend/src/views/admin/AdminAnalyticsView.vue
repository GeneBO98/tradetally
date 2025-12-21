<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="content-wrapper">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Platform Analytics</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Monitor user activity, imports, and API usage
        </p>
      </div>

      <!-- Period Selector -->
      <div class="mb-6">
        <div class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          <button
            v-for="p in periods"
            :key="p.value"
            @click="selectedPeriod = p.value"
            :class="[
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              selectedPeriod === p.value
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
            ]"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6">
        <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        <button
          @click="fetchAnalytics"
          class="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Try again
        </button>
      </div>

      <template v-else-if="analytics">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0 p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <svg class="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</p>
                <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.totalUsers) }}</p>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0 p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <svg class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">New Signups</p>
                <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.newSignups) }}</p>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0 p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <svg class="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Active Today</p>
                <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.activeToday) }}</p>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0 p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <svg class="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Trades Imported</p>
                <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.tradesImported) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Secondary Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Active (7 Days)</p>
                <p class="text-xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.active7Days) }}</p>
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ calculatePercentage(analytics.summary.active7Days, analytics.summary.totalUsers) }}% of users
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Active (30 Days)</p>
                <p class="text-xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.active30Days) }}</p>
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ calculatePercentage(analytics.summary.active30Days, analytics.summary.totalUsers) }}% of users
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">API Calls</p>
                <p class="text-xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.summary.apiCalls) }}</p>
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ formatNumber(analytics.summary.importCount) }} imports
              </div>
            </div>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <!-- Signup Trend Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Signup Trend</h3>
            <div class="h-64">
              <AdminLineChart
                v-if="analytics.trends.signups.length > 0"
                :data="analytics.trends.signups"
                label="Signups"
                color="#10B981"
                data-key="count"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No signup data for this period
              </div>
            </div>
          </div>

          <!-- Login Activity Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Login Activity</h3>
            <div class="h-64">
              <AdminLineChart
                v-if="analytics.trends.logins.length > 0"
                :data="analytics.trends.logins"
                label="Unique Logins"
                color="#3B82F6"
                data-key="uniqueUsers"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No login data for this period
              </div>
            </div>
          </div>

          <!-- Import Trend Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Import Activity</h3>
            <div class="h-64">
              <AdminLineChart
                v-if="analytics.trends.imports.length > 0"
                :data="analytics.trends.imports"
                label="Trades Imported"
                color="#F59E0B"
                data-key="tradesCount"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No import data for this period
              </div>
            </div>
          </div>

          <!-- API Usage Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">API Usage</h3>
            <div class="h-64">
              <AdminLineChart
                v-if="analytics.trends.apiUsage.length > 0"
                :data="analytics.trends.apiUsage"
                label="API Calls"
                color="#8B5CF6"
                data-key="total"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No API usage data for this period
              </div>
            </div>
          </div>
        </div>

        <!-- Broker Sync Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Broker Sync Statistics</h3>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div class="text-center">
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatNumber(analytics.brokerSync.totalSyncs) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Syncs</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-green-600 dark:text-green-400">{{ formatNumber(analytics.brokerSync.successfulSyncs) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Successful</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-red-600 dark:text-red-400">{{ formatNumber(analytics.brokerSync.failedSyncs) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Failed</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-blue-600 dark:text-blue-400">{{ formatNumber(analytics.brokerSync.tradesImported) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Trades Synced</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-gray-600 dark:text-gray-400">{{ formatNumber(analytics.brokerSync.tradesSkipped) }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Duplicates Skipped</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import api from '@/services/api'
import AdminLineChart from '@/components/admin/AdminLineChart.vue'

const periods = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All Time', value: 'all' }
]

const selectedPeriod = ref('30d')
const analytics = ref(null)
const loading = ref(true)
const error = ref(null)

function formatNumber(num) {
  if (num === null || num === undefined) return '0'
  return num.toLocaleString()
}

function calculatePercentage(part, total) {
  if (!total || total === 0) return '0'
  return Math.round((part / total) * 100)
}

async function fetchAnalytics() {
  loading.value = true
  error.value = null

  try {
    const response = await api.get(`/admin/analytics?period=${selectedPeriod.value}`)
    analytics.value = response.data
  } catch (err) {
    console.error('[ERROR] Failed to fetch analytics:', err)
    error.value = err.response?.data?.error || 'Failed to load analytics data'
  } finally {
    loading.value = false
  }
}

watch(selectedPeriod, () => {
  fetchAnalytics()
})

onMounted(() => {
  fetchAnalytics()
})
</script>

<style scoped>
.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem;
}

@media (min-width: 640px) {
  .content-wrapper {
    padding: 0 1.5rem;
  }
}

@media (min-width: 1024px) {
  .content-wrapper {
    padding: 0 2rem;
  }
}
</style>
