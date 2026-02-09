<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="content-wrapper py-8">
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
        <!-- Summary Cards: stacked layout so they align at any viewport size -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col">
            <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="mt-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Users</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate" :title="formatNumber(analytics.summary.totalUsers)">{{ formatNumber(analytics.summary.totalUsers) }}</p>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col">
            <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <svg class="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div class="mt-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">New Signups</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate" :title="formatNumber(analytics.summary.newSignups)">{{ formatNumber(analytics.summary.newSignups) }}</p>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col">
            <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <svg class="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="mt-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Active Today</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate" :title="formatNumber(analytics.summary.activeToday)">{{ formatNumber(analytics.summary.activeToday) }}</p>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col">
            <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <svg class="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div class="mt-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Trades Imported</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate" :title="formatNumber(analytics.summary.tradesImported)">{{ formatNumber(analytics.summary.tradesImported) }}</p>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col">
            <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div class="mt-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Account Deletions</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate" :title="formatNumber(analytics.summary.accountDeletions || 0)">{{ formatNumber(analytics.summary.accountDeletions || 0) }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                {{ formatNumber(analytics.summary.selfDeletions || 0) }} self, {{ formatNumber(analytics.summary.adminDeletions || 0) }} admin
              </p>
            </div>
          </div>
        </div>

        <!-- Revenue / Subscriptions Section -->
        <div v-if="analytics.subscriptionMetrics" class="mb-8">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue & Subscriptions</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Paying Users</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.subscriptionMetrics.payingUsers)">{{ formatNumber(analytics.subscriptionMetrics.payingUsers) }}</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">MRR</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="'$' + formatCurrency(analytics.subscriptionMetrics.mrr)">${{ formatCurrency(analytics.subscriptionMetrics.mrr) }}</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Trial Start Rate</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mt-1">{{ analytics.subscriptionMetrics.trialStartRate }}%</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{{ analytics.subscriptionMetrics.trialsStartedInPeriod }} trials / {{ analytics.subscriptionMetrics.signupsInPeriod }} signups</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Trial to Paid</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mt-1">{{ analytics.subscriptionMetrics.trialConversionRate }}%</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{{ analytics.subscriptionMetrics.trialConvertedCount }} / {{ analytics.subscriptionMetrics.totalTrialUsers }} trial users</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">At-Risk (Canceling)</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.subscriptionMetrics.atRiskCancellations)">{{ formatNumber(analytics.subscriptionMetrics.atRiskCancellations) }}</p>
            </div>
          </div>
        </div>

        <!-- Activation Section -->
        <div v-if="analytics.activation" class="mb-8">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Activation</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Activation Rate</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mt-1">{{ analytics.activation.activationRatePercent }}%</p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">Import within 7 days of signup</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Activated</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.activation.activatedCount)">{{ formatNumber(analytics.activation.activatedCount) }}</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col justify-center min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Signups (period)</p>
              <p class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.activation.signupsCount)">{{ formatNumber(analytics.activation.signupsCount) }}</p>
            </div>
          </div>
        </div>

        <!-- Secondary Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Active (7 Days)</p>
              <p class="text-xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.summary.active7Days)">{{ formatNumber(analytics.summary.active7Days) }}</p>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 sm:text-right">
              {{ calculatePercentage(analytics.summary.active7Days, analytics.summary.totalUsers) }}% of users
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Active (30 Days)</p>
              <p class="text-xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.summary.active30Days)">{{ formatNumber(analytics.summary.active30Days) }}</p>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 sm:text-right">
              {{ calculatePercentage(analytics.summary.active30Days, analytics.summary.totalUsers) }}% of users
            </p>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 min-h-[7.5rem] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">API Calls</p>
              <p class="text-xl font-semibold text-gray-900 dark:text-white truncate mt-1" :title="formatNumber(analytics.summary.apiCalls)">{{ formatNumber(analytics.summary.apiCalls) }}</p>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 sm:text-right">
              {{ formatNumber(analytics.summary.importCount) }} imports
            </p>
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

          <!-- Account Deletions Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Account Deletions</h3>
            <div class="h-64">
              <AdminLineChart
                v-if="analytics.trends.deletions && analytics.trends.deletions.length > 0"
                :data="analytics.trends.deletions"
                label="Deletions"
                color="#EF4444"
                data-key="count"
              />
              <div v-else class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                No account deletions for this period
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

        <!-- Unknown CSV Headers (no parser match or parse failed) -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-8">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Unknown CSV Headers</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Imports that did not match a known broker or failed to parse. Use these to add or improve parsers.
          </p>
          <div v-if="unknownCsvHeadersLoading" class="flex justify-center py-4">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
          <div v-else-if="unknownCsvHeaders.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
            No unknown CSV headers recorded yet.
          </div>
          <div v-else>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Outcome</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Broker</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Headers</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">File</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Copy</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <template v-for="row in unknownCsvHeaders" :key="row.id">
                    <tr
                      class="text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      @click="toggleExpandedRow(row.id)"
                    >
                      <td class="px-3 py-2 text-gray-900 dark:text-white">
                        <span :class="outcomeClass(row.outcome)">{{ row.outcome }}</span>
                      </td>
                      <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ row.broker_attempted }}</td>
                      <td class="px-3 py-2 max-w-xs truncate text-gray-600 dark:text-gray-300" :title="row.header_line">{{ row.header_line }}</td>
                      <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ row.file_name || '-' }}</td>
                      <td class="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ formatUnknownCsvDate(row.created_at) }}</td>
                      <td class="px-3 py-2">
                        <button
                          @click.stop="copyHeaderLine(row)"
                          class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          :title="'Copy header line'"
                        >
                          {{ copiedRowId === row.id ? 'Copied!' : 'Copy' }}
                        </button>
                      </td>
                    </tr>
                    <!-- Expanded detail row -->
                    <tr v-if="expandedRowId === row.id">
                      <td colspan="6" class="px-3 py-4 bg-gray-50 dark:bg-gray-900/50">
                        <div class="space-y-3 text-sm">
                          <div>
                            <div class="flex items-center justify-between mb-1">
                              <span class="font-medium text-gray-700 dark:text-gray-300">Header Line</span>
                              <button
                                @click="copyToClipboard(row.header_line, 'header-' + row.id)"
                                class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                              >
                                {{ clipboardFeedback === 'header-' + row.id ? 'Copied!' : 'Copy' }}
                              </button>
                            </div>
                            <pre class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap break-all">{{ row.header_line }}</pre>
                          </div>
                          <div v-if="row.sample_data">
                            <div class="flex items-center justify-between mb-1">
                              <span class="font-medium text-gray-700 dark:text-gray-300">Sample Data (first rows)</span>
                              <button
                                @click="copyToClipboard(row.header_line + '\n' + row.sample_data, 'sample-' + row.id)"
                                class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                              >
                                {{ clipboardFeedback === 'sample-' + row.id ? 'Copied!' : 'Copy Header + Data' }}
                              </button>
                            </div>
                            <pre class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap break-all">{{ row.sample_data }}</pre>
                          </div>
                          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div v-if="row.detected_broker">
                              <span class="text-gray-500 dark:text-gray-400">Detected Broker:</span>
                              <span class="ml-1 text-gray-900 dark:text-white">{{ row.detected_broker }}</span>
                            </div>
                            <div v-if="row.selected_broker">
                              <span class="text-gray-500 dark:text-gray-400">Selected Broker:</span>
                              <span class="ml-1 text-gray-900 dark:text-white">{{ row.selected_broker }}</span>
                            </div>
                            <div v-if="row.row_count != null">
                              <span class="text-gray-500 dark:text-gray-400">CSV Rows:</span>
                              <span class="ml-1 text-gray-900 dark:text-white">{{ row.row_count }}</span>
                            </div>
                            <div v-if="row.trades_parsed != null">
                              <span class="text-gray-500 dark:text-gray-400">Trades Parsed:</span>
                              <span class="ml-1 text-gray-900 dark:text-white">{{ row.trades_parsed }}</span>
                            </div>
                          </div>
                          <div v-if="row.diagnostics_json">
                            <div class="flex items-center justify-between mb-1">
                              <span class="font-medium text-gray-700 dark:text-gray-300">Diagnostics</span>
                              <button
                                @click="copyToClipboard(JSON.stringify(row.diagnostics_json, null, 2), 'diag-' + row.id)"
                                class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                              >
                                {{ clipboardFeedback === 'diag-' + row.id ? 'Copied!' : 'Copy' }}
                              </button>
                            </div>
                            <pre class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto max-h-48 overflow-y-auto">{{ JSON.stringify(row.diagnostics_json, null, 2) }}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div v-if="csvPagination.totalPages > 1" class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Showing {{ ((csvPagination.page - 1) * csvPagination.limit) + 1 }}-{{ Math.min(csvPagination.page * csvPagination.limit, csvPagination.total) }} of {{ csvPagination.total }}
              </p>
              <div class="flex items-center space-x-2">
                <button
                  @click="changeCsvPage(csvPagination.page - 1)"
                  :disabled="csvPagination.page <= 1"
                  class="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Page {{ csvPagination.page }} of {{ csvPagination.totalPages }}
                </span>
                <button
                  @click="changeCsvPage(csvPagination.page + 1)"
                  :disabled="csvPagination.page >= csvPagination.totalPages"
                  class="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
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

// Load saved period from localStorage or default to '30d'
const savedPeriod = localStorage.getItem('adminAnalyticsPeriod')
const selectedPeriod = ref(savedPeriod || '30d')

const analytics = ref(null)
const loading = ref(true)
const error = ref(null)
const unknownCsvHeaders = ref([])
const unknownCsvHeadersLoading = ref(false)
const csvPagination = ref({ page: 1, limit: 25, total: 0, totalPages: 0 })
const expandedRowId = ref(null)
const copiedRowId = ref(null)
const clipboardFeedback = ref(null)

function formatNumber(num) {
  if (num === null || num === undefined) return '0'
  return num.toLocaleString()
}

function formatCurrency(num) {
  if (num === null || num === undefined) return '0.00'
  return Number(num).toFixed(2)
}

function formatUnknownCsvDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function fetchUnknownCsvHeaders() {
  unknownCsvHeadersLoading.value = true
  try {
    const response = await api.get('/admin/unknown-csv-headers', {
      params: { page: csvPagination.value.page, limit: csvPagination.value.limit }
    })
    unknownCsvHeaders.value = response.data.data || []
    if (response.data.pagination) {
      csvPagination.value = response.data.pagination
    }
  } catch (err) {
    console.warn('Failed to fetch unknown CSV headers:', err)
    unknownCsvHeaders.value = []
  } finally {
    unknownCsvHeadersLoading.value = false
  }
}

function changeCsvPage(newPage) {
  csvPagination.value.page = newPage
  expandedRowId.value = null
  fetchUnknownCsvHeaders()
}

function toggleExpandedRow(rowId) {
  expandedRowId.value = expandedRowId.value === rowId ? null : rowId
}

function outcomeClass(outcome) {
  const classes = {
    no_parser_match: 'text-red-600 dark:text-red-400',
    parse_failed: 'text-red-600 dark:text-red-400',
    zero_trades: 'text-orange-600 dark:text-orange-400',
    zero_imported: 'text-orange-600 dark:text-orange-400',
    high_skip_rate: 'text-yellow-600 dark:text-yellow-400',
    mismatch_override: 'text-blue-600 dark:text-blue-400'
  }
  return classes[outcome] || 'text-gray-900 dark:text-white'
}

async function copyHeaderLine(row) {
  try {
    await navigator.clipboard.writeText(row.header_line)
    copiedRowId.value = row.id
    setTimeout(() => { copiedRowId.value = null }, 2000)
  } catch {
    console.warn('[WARNING] Failed to copy to clipboard')
  }
}

async function copyToClipboard(text, feedbackKey) {
  try {
    await navigator.clipboard.writeText(text)
    clipboardFeedback.value = feedbackKey
    setTimeout(() => { clipboardFeedback.value = null }, 2000)
  } catch {
    console.warn('[WARNING] Failed to copy to clipboard')
  }
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

watch(selectedPeriod, (newPeriod) => {
  // Save to localStorage when period changes
  localStorage.setItem('adminAnalyticsPeriod', newPeriod)
  fetchAnalytics()
})

onMounted(() => {
  fetchAnalytics()
  fetchUnknownCsvHeaders()
})
</script>

