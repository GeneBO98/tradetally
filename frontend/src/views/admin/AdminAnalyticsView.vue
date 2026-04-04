<template>
    <div class="content-wrapper py-8">
        <div class="mb-8 flex items-start justify-between">
            <div>
                <h1 class="heading-page">Platform Analytics</h1>
                <p class="mt-2 text-gray-600 dark:text-gray-400">
                    Monitor user activity, imports, and API usage
                </p>
            </div>
            <div class="flex items-center gap-3">
                <!-- Auto-refresh indicator -->
                <div v-if="!initialLoading && analytics" class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <button
                        @click="fetchAnalytics"
                        :disabled="loading"
                        class="hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                        title="Refresh now"
                    >
                        <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <span v-if="lastUpdated">{{ lastUpdatedText }}</span>
                </div>
                <!-- Active connections -->
                <div
                    v-if="activeConnections !== null"
                    class="flex items-center space-x-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm px-3 py-2 border border-gray-200 dark:border-gray-700"
                >
                    <span class="relative flex h-2.5 w-2.5">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                            :class="activeConnections > 0 ? 'bg-green-400' : 'bg-gray-400'"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-2.5 w-2.5"
                            :class="activeConnections > 0 ? 'bg-green-500' : 'bg-gray-400'"
                        ></span>
                    </span>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                        {{ activeConnections }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Period Selector -->
        <div class="mb-6">
            <div
                class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1"
            >
                <button
                    v-for="p in periods"
                    :key="p.value"
                    @click="selectedPeriod = p.value"
                    :class="[
                        'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                        selectedPeriod === p.value
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700',
                    ]"
                >
                    {{ p.label }}
                </button>
            </div>
        </div>

        <!-- Full-page spinner only on initial load -->
        <div v-if="initialLoading" class="flex justify-center items-center h-64">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
            ></div>
        </div>

        <!-- Error state -->
        <div
            v-else-if="error"
            class="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6"
        >
            <p class="text-sm text-red-800 dark:text-red-400">
                {{ error }}
            </p>
            <button
                @click="fetchAnalytics"
                class="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
            >
                Try again
            </button>
        </div>

        <template v-else-if="analytics">
            <!-- Refresh overlay indicator -->
            <div v-if="loading" class="fixed top-4 right-4 z-50">
                <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-600 border-t-transparent"></div>
                    <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                    <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Total Users</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                        {{ formatNumber(analytics.summary.totalUsers) }}
                    </p>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                    <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">New Signups</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                        {{ formatNumber(analytics.summary.newSignups) }}
                    </p>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                    <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Active Today</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                        {{ formatNumber(analytics.summary.activeToday) }}
                    </p>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                    <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Trades Imported</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                        {{ formatNumber(analytics.summary.tradesImported) }}
                    </p>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                    <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Account Deletions</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                        {{ formatNumber(analytics.summary.accountDeletions || 0) }}
                    </p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {{ formatNumber(analytics.summary.selfDeletions || 0) }} self,
                        {{ formatNumber(analytics.summary.adminDeletions || 0) }} admin
                    </p>
                </div>
            </div>

            <div v-if="analytics.monthOverMonth" class="mb-8">
                <div class="flex items-center justify-between mb-4 gap-3">
                    <div>
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                            Month on Month Growth
                        </h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {{ analytics.monthOverMonth.currentMonthLabel }} vs {{ analytics.monthOverMonth.previousMonthLabel }}
                        </p>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Signups</p>
                        <div class="mt-2 flex items-end justify-between gap-3">
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                    {{ formatNumber(analytics.monthOverMonth.signups.current) }}
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {{ formatNumber(analytics.monthOverMonth.signups.previous) }} last month
                                </p>
                            </div>
                            <span :class="growthTextClass(analytics.monthOverMonth.signups.delta)" class="text-sm font-semibold whitespace-nowrap">
                                {{ formatGrowth(analytics.monthOverMonth.signups) }}
                            </span>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Active Users</p>
                        <div class="mt-2 flex items-end justify-between gap-3">
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                    {{ formatNumber(analytics.monthOverMonth.activeUsers.current) }}
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {{ formatNumber(analytics.monthOverMonth.activeUsers.previous) }} last month
                                </p>
                            </div>
                            <span :class="growthTextClass(analytics.monthOverMonth.activeUsers.delta)" class="text-sm font-semibold whitespace-nowrap">
                                {{ formatGrowth(analytics.monthOverMonth.activeUsers) }}
                            </span>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Trades Imported</p>
                        <div class="mt-2 flex items-end justify-between gap-3">
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                    {{ formatNumber(analytics.monthOverMonth.tradesImported.current) }}
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {{ formatNumber(analytics.monthOverMonth.tradesImported.previous) }} last month
                                </p>
                            </div>
                            <span :class="growthTextClass(analytics.monthOverMonth.tradesImported.delta)" class="text-sm font-semibold whitespace-nowrap">
                                {{ formatGrowth(analytics.monthOverMonth.tradesImported) }}
                            </span>
                        </div>
                    </div>

                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Account Deletions</p>
                        <div class="mt-2 flex items-end justify-between gap-3">
                            <div>
                                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                                    {{ formatNumber(analytics.monthOverMonth.accountDeletions.current) }}
                                </p>
                                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {{ formatNumber(analytics.monthOverMonth.accountDeletions.previous) }} last month
                                </p>
                            </div>
                            <span :class="growthTextClass(analytics.monthOverMonth.accountDeletions.delta, true)" class="text-sm font-semibold whitespace-nowrap">
                                {{ formatGrowth(analytics.monthOverMonth.accountDeletions) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Revenue & Subscriptions Section -->
            <div v-if="analytics.subscriptionMetrics" class="mb-8">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Revenue & Subscriptions
                </h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <!-- Combined: Revenue + Paying Users -->
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Monthly Revenue</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatCurrency(analytics.subscriptionMetrics.mrr) }}
                        </p>
                        <div class="flex items-center gap-1.5 mt-2">
                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-50 dark:bg-primary-900/30">
                                <svg class="w-3 h-3 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                {{ formatNumber(analytics.subscriptionMetrics.payingUsers) }} paying users
                            </span>
                        </div>
                    </div>

                    <!-- Combined: Conversion Funnel -->
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Conversion Funnel</p>
                        <div class="mt-2.5 space-y-2">
                            <!-- Trial start rate -->
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600 dark:text-gray-300">Signups to Trial</span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ analytics.subscriptionMetrics.trialStartRate }}%</span>
                            </div>
                            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                    class="bg-primary-500 h-1.5 rounded-full transition-all duration-500"
                                    :style="{ width: Math.min(analytics.subscriptionMetrics.trialStartRate, 100) + '%' }"
                                ></div>
                            </div>
                            <!-- Trial to paid -->
                            <div class="flex items-center justify-between mt-1">
                                <span class="text-sm text-gray-600 dark:text-gray-300">Trial to Paid</span>
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ analytics.subscriptionMetrics.trialConversionRate }}%</span>
                            </div>
                            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                    class="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                                    :style="{ width: Math.min(analytics.subscriptionMetrics.trialConversionRate, 100) + '%' }"
                                ></div>
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            {{ analytics.subscriptionMetrics.trialsStartedInPeriod }} trials / {{ analytics.subscriptionMetrics.signupsInPeriod }} signups
                            &middot;
                            {{ analytics.subscriptionMetrics.trialConvertedCount }} / {{ analytics.subscriptionMetrics.totalTrialUsers }} converted
                        </p>
                    </div>

                    <!-- At-Risk -->
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">At-Risk (Canceling)</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatNumber(analytics.subscriptionMetrics.atRiskCancellations) }}
                        </p>
                    </div>

                    <!-- Expired (clickable) -->
                    <div
                        class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                        @click="showExpiredTrialUsers = !showExpiredTrialUsers"
                    >
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Expired (Not Converted)</p>
                            <svg
                                class="w-4 h-4 text-gray-400 transition-transform"
                                :class="{ 'rotate-180': showExpiredTrialUsers }"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatNumber(analytics.subscriptionMetrics.expiredTrialNotConverted) }}
                        </p>
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            trial ended, no subscription
                        </p>
                    </div>

                    <!-- Conversion Emails Sent -->
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Conversion Emails Sent</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatNumber(analytics.subscriptionMetrics.conversionEmailsSent) }}
                        </p>
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {{ formatNumber(analytics.subscriptionMetrics.convertedAfterEmail) }} converted
                            <template v-if="analytics.subscriptionMetrics.conversionEmailsPending > 0">
                                &middot; {{ formatNumber(analytics.subscriptionMetrics.conversionEmailsPending) }} pending
                            </template>
                        </p>
                    </div>
                </div>

                <!-- Expired Trial Users Detail -->
                <div
                    v-if="showExpiredTrialUsers && analytics.subscriptionMetrics.expiredTrialUsers?.length"
                    class="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 overflow-hidden"
                >
                    <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                            Expired Trial Users ({{ analytics.subscriptionMetrics.expiredTrialUsers.length }})
                        </h3>
                        <button
                            @click.stop="copyExpiredTrialEmails"
                            class="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                        >
                            {{ clipboardFeedback === 'expiredEmails' ? 'Copied' : 'Copy All Emails' }}
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Username</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Signed Up</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trial Expired</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Conversion Email</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr
                                    v-for="user in analytics.subscriptionMetrics.expiredTrialUsers"
                                    :key="user.id"
                                    class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <td class="px-4 py-2 text-sm text-gray-900 dark:text-white">{{ user.email }}</td>
                                    <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{{ user.username || '-' }}</td>
                                    <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{{ formatShortDate(user.created_at) }}</td>
                                    <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{{ formatShortDate(user.trial_expired_at) }}</td>
                                    <td class="px-4 py-2 text-sm">
                                        <span v-if="user.conversion_email_sent_at" class="text-green-600 dark:text-green-400">
                                            Sent {{ formatShortDate(user.conversion_email_sent_at) }}
                                        </span>
                                        <span v-else class="text-gray-400 dark:text-gray-500">Not sent</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Activation Section -->
            <div v-if="analytics.activation" class="mb-8">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Activation
                </h2>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Activation Rate</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ analytics.activation.activationRatePercent }}%
                        </p>
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Import within 7 days of signup
                        </p>
                    </div>
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Activated</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatNumber(analytics.activation.activatedCount) }}
                        </p>
                    </div>
                    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Signups (period)</p>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1.5">
                            {{ formatNumber(analytics.activation.signupsCount) }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Secondary Stats Row -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 flex items-center justify-between">
                    <div class="min-w-0">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Active (7 Days)</p>
                        <p class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                            {{ formatNumber(analytics.summary.active7Days) }}
                        </p>
                    </div>
                    <span class="text-sm font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {{ calculatePercentage(analytics.summary.active7Days, analytics.summary.totalUsers) }}%
                    </span>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 flex items-center justify-between">
                    <div class="min-w-0">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Active (30 Days)</p>
                        <p class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                            {{ formatNumber(analytics.summary.active30Days) }}
                        </p>
                    </div>
                    <span class="text-sm font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {{ calculatePercentage(analytics.summary.active30Days, analytics.summary.totalUsers) }}%
                    </span>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 flex items-center justify-between">
                    <div class="min-w-0">
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">API Calls</p>
                        <p class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                            {{ formatNumber(analytics.summary.apiCalls) }}
                        </p>
                    </div>
                    <span class="text-sm font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {{ formatNumber(analytics.summary.importCount) }} imports
                    </span>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        Signup Trend
                    </h3>
                    <div class="h-64">
                        <AdminLineChart
                            v-if="analytics.trends.signups.length > 0"
                            :data="analytics.trends.signups"
                            label="Signups"
                            color="#10B981"
                            data-key="count"
                        />
                        <div
                            v-else
                            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
                        >
                            No signup data for this period
                        </div>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        Login Activity
                    </h3>
                    <div class="h-64">
                        <AdminLineChart
                            v-if="analytics.trends.logins.length > 0"
                            :data="analytics.trends.logins"
                            label="Unique Logins"
                            color="#3B82F6"
                            data-key="uniqueUsers"
                        />
                        <div
                            v-else
                            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
                        >
                            No login data for this period
                        </div>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        Import Activity
                    </h3>
                    <div class="h-64">
                        <AdminLineChart
                            v-if="analytics.trends.imports.length > 0"
                            :data="analytics.trends.imports"
                            label="Trades Imported"
                            color="#F59E0B"
                            data-key="tradesCount"
                        />
                        <div
                            v-else
                            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
                        >
                            No import data for this period
                        </div>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        API Usage
                    </h3>
                    <div class="h-64">
                        <AdminLineChart
                            v-if="analytics.trends.apiUsage.length > 0"
                            :data="analytics.trends.apiUsage"
                            label="API Calls"
                            color="#8B5CF6"
                            data-key="total"
                        />
                        <div
                            v-else
                            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
                        >
                            No API usage data for this period
                        </div>
                    </div>
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                        Account Deletions
                    </h3>
                    <div class="h-64">
                        <AdminLineChart
                            v-if="
                                analytics.trends.deletions &&
                                analytics.trends.deletions.length > 0
                            "
                            :data="analytics.trends.deletions"
                            label="Deletions"
                            color="#EF4444"
                            data-key="count"
                        />
                        <div
                            v-else
                            class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
                        >
                            No account deletions for this period
                        </div>
                    </div>
                </div>
            </div>

            <!-- Broker Sync Stats -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Broker Sync Statistics
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div class="text-center">
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {{ formatNumber(analytics.brokerSync.totalSyncs) }}
                        </p>
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
                            Total Syncs
                        </p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                            {{ formatNumber(analytics.brokerSync.successfulSyncs) }}
                        </p>
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
                            Successful
                        </p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold text-red-600 dark:text-red-400">
                            {{ formatNumber(analytics.brokerSync.failedSyncs) }}
                        </p>
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
                            Failed
                        </p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                            {{ formatNumber(analytics.brokerSync.tradesImported) }}
                        </p>
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
                            Trades Synced
                        </p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold text-gray-600 dark:text-gray-400">
                            {{ formatNumber(analytics.brokerSync.tradesSkipped) }}
                        </p>
                        <p class="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">
                            Duplicates Skipped
                        </p>
                    </div>
                </div>
            </div>

            <!-- Unknown CSV Headers -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 p-6 mt-6">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Unknown CSV Headers
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Imports that did not match a known broker or failed to parse.
                </p>
                <div
                    v-if="unknownCsvHeadersLoading"
                    class="flex justify-center py-4"
                >
                    <div
                        class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
                    ></div>
                </div>
                <div
                    v-else-if="unknownCsvHeaders.length === 0"
                    class="text-sm text-gray-500 dark:text-gray-400"
                >
                    No unknown CSV headers recorded yet.
                </div>
                <div v-else>
                    <div class="overflow-x-auto">
                        <table
                            class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                        >
                            <thead>
                                <tr>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Outcome
                                    </th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Broker
                                    </th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Headers
                                    </th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        File
                                    </th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Date
                                    </th>
                                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                        Copy
                                    </th>
                                </tr>
                            </thead>
                            <tbody
                                class="divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <template
                                    v-for="row in unknownCsvHeaders"
                                    :key="row.id"
                                >
                                    <tr
                                        class="text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        @click="toggleExpandedRow(row.id)"
                                    >
                                        <td class="px-3 py-2 text-gray-900 dark:text-white">
                                            <span :class="outcomeClass(row.outcome)">{{ row.outcome }}</span>
                                        </td>
                                        <td class="px-3 py-2 text-gray-600 dark:text-gray-300">
                                            {{ row.broker_attempted }}
                                        </td>
                                        <td
                                            class="px-3 py-2 max-w-xs truncate text-gray-600 dark:text-gray-300"
                                            :title="row.header_line"
                                        >
                                            {{ row.header_line }}
                                        </td>
                                        <td class="px-3 py-2 text-gray-600 dark:text-gray-300">
                                            {{ row.file_name || "-" }}
                                        </td>
                                        <td class="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                            {{ formatUnknownCsvDate(row.created_at) }}
                                        </td>
                                        <td class="px-3 py-2">
                                            <button
                                                @click.stop="copyHeaderLine(row)"
                                                class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                                :title="'Copy header line'"
                                            >
                                                {{ copiedRowId === row.id ? "Copied!" : "Copy" }}
                                            </button>
                                        </td>
                                    </tr>
                                    <!-- Expanded detail row -->
                                    <tr v-if="expandedRowId === row.id">
                                        <td
                                            colspan="6"
                                            class="px-3 py-4 bg-gray-50 dark:bg-gray-900/50"
                                        >
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
                    <div
                        v-if="csvPagination.totalPages > 1"
                        class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Showing
                            {{ (csvPagination.page - 1) * csvPagination.limit + 1 }}-{{
                                Math.min(csvPagination.page * csvPagination.limit, csvPagination.total)
                            }}
                            of {{ csvPagination.total }}
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
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import api from "@/services/api";
import AdminLineChart from "@/components/admin/AdminLineChart.vue";
import { useCurrencyFormatter } from "@/composables/useCurrencyFormatter";

const { formatCurrency } = useCurrencyFormatter();

const REFRESH_INTERVAL = 60000; // 60 seconds

const periods = [
    { label: "Today", value: "today" },
    { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "30d" },
    { label: "90 Days", value: "90d" },
    { label: "All Time", value: "all" },
];

// Load saved period from localStorage or default to '30d'
const savedPeriod = localStorage.getItem("adminAnalyticsPeriod");
const selectedPeriod = ref(savedPeriod || "30d");

const analytics = ref(null);
const loading = ref(true);
const initialLoading = ref(true);
const error = ref(null);
const unknownCsvHeaders = ref([]);
const unknownCsvHeadersLoading = ref(false);
const csvPagination = ref({ page: 1, limit: 25, total: 0, totalPages: 0 });
const expandedRowId = ref(null);
const showExpiredTrialUsers = ref(false);
const copiedRowId = ref(null);
const clipboardFeedback = ref(null);
const activeConnections = ref(null);
const lastUpdated = ref(null);
let connectionsInterval = null;
let refreshInterval = null;

const lastUpdatedText = computed(() => {
    if (!lastUpdated.value) return "";
    const seconds = Math.round((Date.now() - lastUpdated.value) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}m ago`;
});

// Update the "X ago" text every 10 seconds
let lastUpdatedTimer = null;
function startLastUpdatedTimer() {
    lastUpdatedTimer = setInterval(() => {
        // Force reactivity by touching the ref
        if (lastUpdated.value) lastUpdated.value = lastUpdated.value;
    }, 10000);
}

function formatNumber(num) {
    if (num === null || num === undefined) return "0";
    return num.toLocaleString();
}

function formatCurrency(num) {
    if (num === null || num === undefined) return "0.00";
    return Number(num).toFixed(2);
}

function growthTextClass(delta, invert = false) {
    if (delta === 0) {
        return "text-gray-500 dark:text-gray-400";
    }

    const positiveClass = "text-green-600 dark:text-green-400";
    const negativeClass = "text-red-600 dark:text-red-400";

    if (invert) {
        return delta > 0 ? negativeClass : positiveClass;
    }

    return delta > 0 ? positiveClass : negativeClass;
}

function formatGrowth(metric) {
    if (!metric) return "0%";

    if (metric.growthPercent === null) {
        return metric.current > 0 ? "New" : "0%";
    }

    const sign = metric.delta > 0 ? "+" : "";
    return `${sign}${metric.growthPercent}%`;
}
function formatShortDate(iso) {
    if (!iso) return "-";
    try {
        return new Date(iso).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}

async function copyExpiredTrialEmails() {
    try {
        const emails = analytics.value?.subscriptionMetrics?.expiredTrialUsers
            ?.map((u) => u.email)
            .join(", ");
        if (emails) {
            await navigator.clipboard.writeText(emails);
            clipboardFeedback.value = "expiredEmails";
            setTimeout(() => {
                clipboardFeedback.value = null;
            }, 2000);
        }
    } catch {
        console.warn("[WARNING] Failed to copy to clipboard");
    }
}

function formatUnknownCsvDate(iso) {
    if (!iso) return "-";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

async function fetchUnknownCsvHeaders() {
    unknownCsvHeadersLoading.value = true;
    try {
        const response = await api.get("/admin/unknown-csv-headers", {
            params: {
                page: csvPagination.value.page,
                limit: csvPagination.value.limit,
            },
        });
        unknownCsvHeaders.value = response.data.data || [];
        if (response.data.pagination) {
            csvPagination.value = response.data.pagination;
        }
    } catch (err) {
        console.warn("Failed to fetch unknown CSV headers:", err);
        unknownCsvHeaders.value = [];
    } finally {
        unknownCsvHeadersLoading.value = false;
    }
}

function changeCsvPage(newPage) {
    csvPagination.value.page = newPage;
    expandedRowId.value = null;
    fetchUnknownCsvHeaders();
}

function toggleExpandedRow(rowId) {
    expandedRowId.value = expandedRowId.value === rowId ? null : rowId;
}

function outcomeClass(outcome) {
    const classes = {
        no_parser_match: "text-red-600 dark:text-red-400",
        parse_failed: "text-red-600 dark:text-red-400",
        zero_trades: "text-orange-600 dark:text-orange-400",
        zero_imported: "text-orange-600 dark:text-orange-400",
        high_skip_rate: "text-yellow-600 dark:text-yellow-400",
        mismatch_override: "text-primary-600 dark:text-primary-400",
    };
    return classes[outcome] || "text-gray-900 dark:text-white";
}

async function copyHeaderLine(row) {
    try {
        await navigator.clipboard.writeText(row.header_line);
        copiedRowId.value = row.id;
        setTimeout(() => {
            copiedRowId.value = null;
        }, 2000);
    } catch {
        console.warn("[WARNING] Failed to copy to clipboard");
    }
}

async function copyToClipboard(text, feedbackKey) {
    try {
        await navigator.clipboard.writeText(text);
        clipboardFeedback.value = feedbackKey;
        setTimeout(() => {
            clipboardFeedback.value = null;
        }, 2000);
    } catch {
        console.warn("[WARNING] Failed to copy to clipboard");
    }
}

function calculatePercentage(part, total) {
    if (!total || total === 0) return "0";
    return Math.round((part / total) * 100);
}

async function fetchAnalytics() {
    loading.value = true;
    error.value = null;

    try {
        const response = await api.get(
            `/admin/analytics?period=${selectedPeriod.value}`,
        );
        analytics.value = response.data;
        lastUpdated.value = Date.now();
    } catch (err) {
        console.error("[ERROR] Failed to fetch analytics:", err);
        // Only show error on initial load — silent fail on auto-refresh
        if (initialLoading.value) {
            error.value =
                err.response?.data?.error || "Failed to load analytics data";
        }
    } finally {
        loading.value = false;
        initialLoading.value = false;
    }
}

watch(selectedPeriod, (newPeriod) => {
    localStorage.setItem("adminAnalyticsPeriod", newPeriod);
    fetchAnalytics();
});

async function fetchActiveConnections() {
    try {
        const response = await api.get("/admin/analytics/active-connections");
        activeConnections.value = response.data.active_connections;
    } catch {
        // Silently fail - not critical
    }
}

onMounted(() => {
    fetchAnalytics();
    fetchUnknownCsvHeaders();
    fetchActiveConnections();
    connectionsInterval = setInterval(fetchActiveConnections, 30000);
    refreshInterval = setInterval(fetchAnalytics, REFRESH_INTERVAL);
    startLastUpdatedTimer();
});

onUnmounted(() => {
    if (connectionsInterval) clearInterval(connectionsInterval);
    if (refreshInterval) clearInterval(refreshInterval);
    if (lastUpdatedTimer) clearInterval(lastUpdatedTimer);
});
</script>
