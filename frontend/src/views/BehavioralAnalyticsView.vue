<template>
    <div class="content-wrapper py-8">
        <!-- Back Button and Title -->
        <div class="flex items-center justify-between mb-6">
            <button
                @click="goBack"
                class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <svg
                    class="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 19l-7-7 7-7"
                    ></path>
                </svg>
                Back
            </button>
        </div>

        <div class="mb-8">
            <h1 class="heading-page">Behavioral Analytics</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
                Analyze your trading behavior patterns and emotional
                decision-making
            </p>
        </div>

        <!-- Pro onboarding: step 1 -->
        <OnboardingCard
            v-if="authStore.proOnboardingStep === 1"
            :step="1"
            :total-steps="3"
            :next-step="2"
            tour-type="pro"
            title="Behavioral Analytics"
            description="Detect revenge trading, overtrading, and FOMO patterns. Understand your psychological edge."
            cta-label="Next: Watchlists"
            cta-route="markets"
        />

        <!-- Pro Tier Gate -->
        <ProUpgradePrompt
            v-if="!hasAccess"
            variant="card"
            description="Behavioral Analytics is a Pro feature that helps identify emotional trading patterns like revenge trading, overtrading, and FOMO."
        />

        <!-- Initial Loading State - only shows on first load -->
        <div v-else-if="initialLoading" class="flex justify-center py-12">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
            ></div>
        </div>

        <!-- Main Content - stays mounted after initial load to prevent infinite loop -->
        <div v-else class="space-y-8 relative">
            <!-- Subtle refresh indicator -->
            <div v-if="loading" class="absolute top-0 right-0 z-10">
                <div
                    class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700"
                >
                    <div
                        class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"
                    ></div>
                    <span class="text-xs text-gray-600 dark:text-gray-400"
                        >Updating...</span
                    >
                </div>
            </div>
            <!-- Filters -->
            <div class="card">
                <div class="card-body">
                    <TradeFilters @filter="handleFilter" />

                    <!-- Analyze History Button -->
                    <div
                        class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4"
                    >
                        <button
                            @click="analyzeHistoricalTrades"
                            :disabled="loadingHistorical"
                            class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            <svg
                                class="w-4 h-4 mr-2 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                            </svg>
                            <span
                                v-if="loadingHistorical"
                                class="flex items-center"
                            >
                                <div
                                    class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"
                                ></div>
                                Analyzing Historical Trades...
                            </span>
                            <span v-else> Analyze Historical Trades </span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Section Tabs -->
            <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Behavioral analytics sections">
                    <button
                        v-for="tab in behavioralTabs"
                        :key="tab.id"
                        @click="activeBehavioralTab = tab.id"
                        :class="[
                            'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                            activeBehavioralTab === tab.id
                                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        ]"
                    >
                        {{ tab.label }}
                    </button>
                </nav>
            </div>

            <!-- Active Alerts -->
            <div v-if="activeBehavioralTab === 'overview' && activeAlerts.length > 0" class="space-y-4">
                <h2 class="heading-section">Active Alerts</h2>
                <div class="grid gap-4">
                    <div
                        v-for="alert in activeAlerts"
                        :key="alert.id"
                        class="card border-l-4"
                        :class="{
                            'border-l-red-500 bg-red-50 dark:bg-red-900/10':
                                alert.alert_type === 'warning',
                            'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10':
                                alert.alert_type === 'recommendation',
                            'border-l-red-600 bg-red-100 dark:bg-red-900/20':
                                alert.alert_type === 'blocking',
                        }"
                    >
                        <div class="card-body">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <h3 class="heading-card">
                                        {{ alert.title }}
                                    </h3>
                                    <p
                                        class="text-gray-600 dark:text-gray-400 mt-1"
                                    >
                                        {{ alert.message }}
                                    </p>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-500 mt-2"
                                    >
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
            <div v-if="activeBehavioralTab === 'overview'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Revenge Trading Score -->
                <div class="card">
                    <div class="card-body">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div
                                    class="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center"
                                >
                                    <svg
                                        class="h-5 w-5 text-red-600 dark:text-red-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="ml-5 w-0 flex-1">
                                <dl>
                                    <dt
                                        class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate"
                                    >
                                        Revenge Trading Events
                                    </dt>
                                    <dd
                                        class="text-lg font-medium text-gray-900 dark:text-white"
                                    >
                                        {{
                                            revengeAnalysis?.statistics
                                                ?.total_events || 0
                                        }}
                                    </dd>
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
                                <div
                                    class="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center"
                                >
                                    <svg
                                        class="h-5 w-5 text-orange-600 dark:text-orange-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="ml-5 w-0 flex-1">
                                <dl>
                                    <dt
                                        class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate"
                                    >
                                        Revenge Trading Loss Rate
                                    </dt>
                                    <dd
                                        class="text-lg font-medium text-gray-900 dark:text-white"
                                    >
                                        {{
                                            revengeAnalysis?.statistics
                                                ?.loss_rate || 0
                                        }}%
                                    </dd>
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
                                <div
                                    class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center"
                                >
                                    <svg
                                        class="h-5 w-5 text-blue-600 dark:text-blue-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="ml-5 w-0 flex-1">
                                <dl>
                                    <dt
                                        class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate"
                                    >
                                        Avg Duration
                                    </dt>
                                    <dd
                                        class="text-lg font-medium text-gray-900 dark:text-white"
                                    >
                                        {{
                                            Math.round(
                                                revengeAnalysis?.statistics
                                                    ?.avg_duration_minutes || 0,
                                            )
                                        }}m
                                    </dd>
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
                                <div
                                    class="h-8 w-8 rounded-full flex items-center justify-center"
                                    :class="{
                                        'bg-green-100 dark:bg-green-900/20':
                                            parseFloat(
                                                revengeAnalysis?.statistics
                                                    ?.total_additional_loss ||
                                                    0,
                                            ) < 0,
                                        'bg-red-100 dark:bg-red-900/20':
                                            parseFloat(
                                                revengeAnalysis?.statistics
                                                    ?.total_additional_loss ||
                                                    0,
                                            ) > 0,
                                        'bg-gray-100 dark:bg-gray-900/20':
                                            parseFloat(
                                                revengeAnalysis?.statistics
                                                    ?.total_additional_loss ||
                                                    0,
                                            ) === 0,
                                    }"
                                >
                                    <svg
                                        class="h-5 w-5"
                                        :class="{
                                            'text-green-600 dark:text-green-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) < 0,
                                            'text-red-600 dark:text-red-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) > 0,
                                            'text-gray-600 dark:text-gray-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) === 0,
                                        }"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="ml-5 w-0 flex-1">
                                <dl>
                                    <dt
                                        class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate"
                                    >
                                        <span
                                            v-if="
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) < 0
                                            "
                                            >Total Losses Recovered</span
                                        >
                                        <span
                                            v-else-if="
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) > 0
                                            "
                                            >Total Losses Increased</span
                                        >
                                        <span v-else>Total Revenge P&L</span>
                                    </dt>
                                    <dd
                                        class="text-lg font-medium"
                                        :class="{
                                            'text-green-600 dark:text-green-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) < 0,
                                            'text-red-600 dark:text-red-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) > 0,
                                            'text-gray-600 dark:text-gray-400':
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) === 0,
                                        }"
                                    >
                                        <span
                                            v-if="
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ) < 0
                                            "
                                        >
                                            ${{
                                                Math.abs(
                                                    parseFloat(
                                                        revengeAnalysis
                                                            ?.statistics
                                                            ?.total_additional_loss ||
                                                            0,
                                                    ),
                                                ).toFixed(2)
                                            }}
                                        </span>
                                        <span v-else>
                                            ${{
                                                parseFloat(
                                                    revengeAnalysis?.statistics
                                                        ?.total_additional_loss ||
                                                        0,
                                                ).toFixed(2)
                                            }}
                                        </span>
                                    </dd>
                                </dl>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Revenge Trading Analysis -->
            <BehavioralRevengeTrading
                v-if="activeBehavioralTab === 'patterns'"
                :revenge-analysis="revengeAnalysis"
                :pagination="pagination"
                :loading-historical="loadingHistorical"
                @rerun="reRunAnalysis"
                @open-trade="openTrade"
                @prev-page="prevPage"
                @next-page="nextPage"
                @go-to-page="goToPage"
            />

            <!-- Behavioral Insights -->
            <div v-if="activeBehavioralTab === 'overview' && insights" class="card">
                <div class="card-body">
                    <h3
                        class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                    >
                        Behavioral Insights
                    </h3>

                    <!-- Overall Risk Score -->
                    <div class="mb-6">
                        <div class="flex items-center justify-between mb-2">
                            <span
                                class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >Overall Risk Score</span
                            >
                            <span
                                class="text-lg font-bold text-gray-900 dark:text-white"
                                >{{ insights.overallRisk.score }}/100</span
                            >
                        </div>
                        <div
                            class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700"
                        >
                            <div
                                class="h-2 rounded-full transition-all duration-300"
                                :class="{
                                    'bg-green-600':
                                        insights.overallRisk.level === 'low',
                                    'bg-yellow-600':
                                        insights.overallRisk.level === 'medium',
                                    'bg-red-600':
                                        insights.overallRisk.level === 'high',
                                }"
                                :style="{
                                    width: `${insights.overallRisk.score}%`,
                                }"
                            ></div>
                        </div>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mt-2"
                        >
                            {{ insights.overallRisk.description }}
                        </p>
                        <div
                            v-if="insights.overallRisk.components"
                            class="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2"
                        >
                            <div
                                v-for="component in riskComponentRows"
                                :key="component.key"
                                class="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2"
                            >
                                <p
                                    class="text-[11px] text-gray-500 dark:text-gray-400"
                                >
                                    {{ component.label }}
                                </p>
                                <p
                                    class="text-sm font-semibold text-gray-900 dark:text-white"
                                >
                                    {{ component.value }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Insights List -->
                    <div class="space-y-4">
                        <div
                            v-for="insight in insights.insights"
                            :key="insight.title"
                            class="p-4 rounded-lg border"
                            :class="{
                                'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10':
                                    insight.severity === 'high',
                                'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10':
                                    insight.severity === 'medium',
                                'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10':
                                    insight.severity === 'low',
                            }"
                        >
                            <h4
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                {{ insight.title }}
                            </h4>
                            <p
                                class="text-sm text-gray-600 dark:text-gray-400 mt-1"
                            >
                                {{ insight.message }}
                            </p>
                            <p
                                class="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 flex items-start"
                            >
                                <MdiIcon
                                    :icon="mdiLightbulb"
                                    :size="16"
                                    class="mr-1.5 mt-0.5 flex-shrink-0"
                                />
                                <span>{{ insight.recommendation }}</span>
                            </p>
                        </div>
                    </div>

                    <!-- Recommendations -->
                    <div v-if="insights.recommendations?.length" class="mt-6">
                        <h4
                            class="font-medium text-gray-900 dark:text-white mb-3"
                        >
                            Recommended Actions
                        </h4>
                        <div class="space-y-3">
                            <div
                                v-for="rec in insights.recommendations"
                                :key="rec.action"
                                class="flex items-start space-x-3"
                            >
                                <span
                                    class="inline-flex px-2 py-1 text-xs font-semibold rounded whitespace-nowrap mt-0.5 flex-shrink-0 w-16 justify-center"
                                    :class="{
                                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400':
                                            rec.priority === 'high',
                                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400':
                                            rec.priority === 'medium',
                                        'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400':
                                            rec.priority === 'low',
                                    }"
                                >
                                    {{ rec.priority.toUpperCase() }}
                                </span>
                                <div class="flex-1 min-w-0">
                                    <p
                                        class="text-sm font-medium text-gray-900 dark:text-white leading-relaxed"
                                    >
                                        {{ rec.action }}
                                    </p>
                                    <p
                                        class="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed"
                                    >
                                        {{ rec.benefit }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Trading Personality Profiling -->
            <BehavioralPersonality
                v-if="activeBehavioralTab === 'overview'"
                :personality-data="personalityData"
                :loading-personality="loadingPersonality"
                @analyze="analyzePersonality"
                @view-strategy="viewTradesByStrategy"
            />

            <!-- Risk Level Legend -->
            <div v-if="activeBehavioralTab === 'settings'" class="card">
                <div class="card-body">
                    <h3
                        class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                    >
                        Risk Level Legend
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="flex items-center space-x-3">
                            <span
                                class="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                            >
                                HIGH RISK
                            </span>
                            <span
                                class="text-sm text-gray-600 dark:text-gray-400"
                            >
                                Poor trade quality indicators, large position
                                increases
                            </span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <span
                                class="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
                            >
                                MEDIUM RISK
                            </span>
                            <span
                                class="text-sm text-gray-600 dark:text-gray-400"
                            >
                                Some poor trade quality indicators, moderate
                                position changes
                            </span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <span
                                class="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            >
                                LOW RISK
                            </span>
                            <span
                                class="text-sm text-gray-600 dark:text-gray-400"
                            >
                                Good trade quality with minor behavioral
                                patterns
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Info Banner Explaining the Difference -->
            <div v-if="activeBehavioralTab === 'settings'" class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg
                            class="h-5 w-5 text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3
                            class="text-sm font-medium text-blue-800 dark:text-blue-300"
                        >
                            Understanding the Analytics
                        </h3>
                        <div
                            class="mt-2 text-sm text-blue-700 dark:text-blue-200"
                        >
                            <p class="mb-2">
                                • <strong>Loss Aversion Analysis</strong>:
                                Reveals your behavioral patterns - do you hold
                                losers longer than winners?
                            </p>
                            <p>
                                •
                                <strong>Missed Profit Opportunities</strong>:
                                Shows specific trades where you exited early and
                                left money on the table.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Loss Aversion Analysis -->
            <BehavioralLossAversion
                v-if="activeBehavioralTab === 'patterns'"
                :loss-aversion-data="lossAversionData"
                :loading-loss-aversion="loadingLossAversion"
                @analyze="analyzeLossAversion"
                @scroll-to-missed="scrollToTopMissedTrades"
                @view-trades="viewLossAversionTrades"
            />

            <!-- Top Missed Trades Analysis -->
            <div v-if="activeBehavioralTab === 'patterns'" class="card" ref="topMissedTradesSection">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h3 class="heading-card">
                                Top Missed Profit Opportunities
                            </h3>
                            <p
                                class="text-sm text-gray-500 dark:text-gray-400 mt-1"
                            >
                                Specific trades where you left money on the
                                table by exiting too early
                            </p>
                        </div>
                        <div class="flex space-x-2">
                            <button
                                @click="loadTopMissedTrades(true)"
                                :disabled="loadingTopMissedTrades"
                                class="btn btn-primary btn-sm"
                            >
                                <svg
                                    v-if="loadingTopMissedTrades"
                                    class="animate-spin -ml-1 mr-2 h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                {{
                                    loadingTopMissedTrades
                                        ? "Analyzing..."
                                        : "Find Early Exit Trades"
                                }}
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="
                            topMissedTrades && topMissedTrades.topMissedTrades
                        "
                        class="relative"
                    >
                        <!-- Loading Overlay -->
                        <div
                            v-if="loadingTopMissedTrades"
                            class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-lg flex items-center justify-center z-10"
                        >
                            <div
                                class="flex items-center space-x-2 text-gray-600 dark:text-gray-400"
                            >
                                <svg
                                    class="animate-spin h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                <span class="text-sm font-medium"
                                    >Updating analysis...</span
                                >
                            </div>
                        </div>

                        <!-- Summary Stats -->
                        <div
                            class="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 mb-6"
                        >
                            <div
                                class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center"
                            >
                                <div>
                                    <p
                                        class="text-sm text-orange-700 dark:text-orange-300"
                                    >
                                        Trades Analyzed
                                    </p>
                                    <p
                                        class="text-xl font-bold text-orange-900 dark:text-orange-100"
                                    >
                                        {{ topMissedTrades.totalAnalyzed }}
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-orange-700 dark:text-orange-300"
                                    >
                                        Trades Exited Too Early
                                    </p>
                                    <p
                                        class="text-xl font-bold text-orange-900 dark:text-orange-100"
                                    >
                                        {{
                                            topMissedTrades.totalEligibleTrades
                                        }}
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-orange-700 dark:text-orange-300"
                                    >
                                        Total Missed Profit
                                    </p>
                                    <p
                                        class="text-xl font-bold text-orange-900 dark:text-orange-100"
                                    >
                                        ${{
                                            topMissedTrades.totalMissedProfit.toFixed(
                                                2,
                                            )
                                        }}
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-orange-700 dark:text-orange-300"
                                    >
                                        Avg Missed %
                                    </p>
                                    <p
                                        class="text-xl font-bold text-orange-900 dark:text-orange-100"
                                    >
                                        {{
                                            topMissedTrades.avgMissedOpportunityPercent.toFixed(
                                                1,
                                            )
                                        }}%
                                    </p>
                                </div>
                            </div>

                            <div
                                v-if="
                                    topMissedTrades.tradesWithRealPriceData > 0
                                "
                                class="mt-3 text-center"
                            >
                                <div
                                    class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                                >
                                    <svg
                                        class="w-4 h-4 mr-1"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fill-rule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                            clip-rule="evenodd"
                                        ></path>
                                    </svg>
                                    {{
                                        topMissedTrades.tradesWithRealPriceData
                                    }}
                                    trades with real price data analysis
                                </div>
                            </div>
                        </div>

                        <!-- Top Missed Trades List -->
                        <div
                            v-if="topMissedTrades.topMissedTrades.length > 0"
                            class="space-y-4"
                        >
                            <h4
                                class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center"
                            >
                                <MdiIcon
                                    :icon="mdiTarget"
                                    :size="20"
                                    class="mr-2"
                                />
                                Specific Trades Where You Exited Too Early
                                (Sorted by % Profit Missed)
                            </h4>

                            <div
                                v-for="(
                                    trade, index
                                ) in topMissedTrades.topMissedTrades.slice(
                                    0,
                                    10,
                                )"
                                :key="trade.tradeId"
                                class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative"
                                :class="{
                                    'ring-2 ring-red-200 dark:ring-red-800':
                                        index === 0,
                                    'ring-1 ring-orange-200 dark:ring-orange-800':
                                        index === 1,
                                    'ring-1 ring-yellow-200 dark:ring-yellow-800':
                                        index === 2,
                                }"
                            >
                                <!-- Rank Badge -->
                                <div
                                    class="absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                    :class="{
                                        'bg-red-500': index === 0,
                                        'bg-orange-500': index === 1,
                                        'bg-yellow-500': index === 2,
                                        'bg-gray-500': index > 2,
                                    }"
                                >
                                    {{ index + 1 }}
                                </div>

                                <div
                                    class="flex justify-between items-start mb-4"
                                >
                                    <div>
                                        <h5
                                            class="font-medium text-gray-900 dark:text-white text-lg"
                                        >
                                            {{ trade.symbol }}
                                        </h5>
                                        <p
                                            class="text-sm text-gray-500 dark:text-gray-400"
                                        >
                                            {{
                                                new Date(
                                                    trade.exitTime,
                                                ).toLocaleDateString()
                                            }}
                                            •
                                            {{ trade.side.toUpperCase() }} •
                                            {{ trade.quantity }} shares
                                        </p>
                                        <div
                                            v-if="trade.hasRealPriceData"
                                            class="inline-flex items-center mt-1 px-2 py-1 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                                        >
                                            <svg
                                                class="w-3 h-3 mr-1"
                                                fill="currentColor"
                                                viewBox="0 0 20 20"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                    clip-rule="evenodd"
                                                ></path>
                                            </svg>
                                            Real price data
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <p
                                            class="text-lg font-bold text-red-600 dark:text-red-400"
                                        >
                                            +{{
                                                trade.missedOpportunityPercent
                                            }}%
                                        </p>
                                        <p
                                            class="text-sm text-gray-600 dark:text-gray-400"
                                        >
                                            missed opportunity
                                        </p>
                                        <p
                                            class="text-sm font-medium text-green-600 dark:text-green-400"
                                        >
                                            +${{
                                                (
                                                    trade
                                                        .potentialAdditionalProfit
                                                        ?.optimal || 0
                                                ).toFixed(2)
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Trade Details Grid -->
                                <div
                                    class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"
                                >
                                    <div>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            Entry Price
                                        </p>
                                        <p class="font-medium">
                                            ${{
                                                (trade.entryPrice || 0).toFixed(
                                                    2,
                                                )
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            Exit Price
                                        </p>
                                        <p class="font-medium">
                                            ${{
                                                (trade.exitPrice || 0).toFixed(
                                                    2,
                                                )
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            Actual Profit
                                        </p>
                                        <p
                                            class="font-medium text-green-600 dark:text-green-400"
                                        >
                                            ${{
                                                (
                                                    trade.actualProfit || 0
                                                ).toFixed(2)
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            Hold Time
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                formatMinutes(
                                                    trade.holdTimeMinutes,
                                                )
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Peak Price and Potential -->
                                <div
                                    class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-4"
                                >
                                    <div
                                        class="grid grid-cols-1 md:grid-cols-2 gap-4"
                                    >
                                        <div>
                                            <p
                                                class="text-sm font-medium text-red-800 dark:text-red-300"
                                            >
                                                {{
                                                    trade.side === "long"
                                                        ? "Peak Price Reached"
                                                        : "Lowest Price Reached"
                                                }}
                                            </p>
                                            <p
                                                class="text-lg font-bold text-red-900 dark:text-red-200"
                                            >
                                                ${{
                                                    trade.side === "long"
                                                        ? (
                                                              trade
                                                                  .priceMovement
                                                                  ?.maxPriceWithin24Hours ||
                                                              0
                                                          ).toFixed(2)
                                                        : (
                                                              trade
                                                                  .priceMovement
                                                                  ?.minPriceWithin24Hours ||
                                                              0
                                                          ).toFixed(2)
                                                }}
                                            </p>
                                            <p
                                                class="text-xs text-red-700 dark:text-red-400"
                                            >
                                                {{
                                                    (
                                                        (trade.side === "long"
                                                            ? ((trade
                                                                  .priceMovement
                                                                  ?.maxPriceWithin24Hours ||
                                                                  0) -
                                                                  trade.exitPrice) /
                                                              trade.exitPrice
                                                            : (trade.exitPrice -
                                                                  (trade
                                                                      .priceMovement
                                                                      ?.minPriceWithin24Hours ||
                                                                      0)) /
                                                              trade.exitPrice) *
                                                        100
                                                    ).toFixed(1)
                                                }}%
                                                {{
                                                    trade.side === "long"
                                                        ? "higher"
                                                        : "lower"
                                                }}
                                                than exit
                                            </p>
                                        </div>
                                        <div>
                                            <p
                                                class="text-sm font-medium text-red-800 dark:text-red-300"
                                            >
                                                Could Have Made
                                            </p>
                                            <p
                                                class="text-lg font-bold text-red-900 dark:text-red-200"
                                            >
                                                ${{
                                                    (
                                                        (trade.actualProfit ||
                                                            0) +
                                                        (trade
                                                            .potentialAdditionalProfit
                                                            ?.optimal || 0)
                                                    ).toFixed(2)
                                                }}
                                            </p>
                                            <p
                                                class="text-xs text-red-700 dark:text-red-400"
                                            >
                                                vs ${{
                                                    (
                                                        trade.actualProfit || 0
                                                    ).toFixed(2)
                                                }}
                                                actual profit
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Better Entry Price Analysis (if available) -->
                                <div
                                    v-if="
                                        trade.entryAnalysis &&
                                        trade.entryAnalysis.improvementPercent >
                                            0
                                    "
                                    class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4"
                                >
                                    <div
                                        class="flex items-start space-x-2 mb-2"
                                    >
                                        <svg
                                            class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                            />
                                        </svg>
                                        <div class="flex-1">
                                            <p
                                                class="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1"
                                            >
                                                Better Entry Opportunity
                                            </p>
                                            <div
                                                class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"
                                            >
                                                <div>
                                                    <p
                                                        class="text-xs text-blue-700 dark:text-blue-400"
                                                    >
                                                        Optimal Entry Price
                                                    </p>
                                                    <p
                                                        class="font-bold text-blue-900 dark:text-blue-200"
                                                    >
                                                        ${{
                                                            trade.entryAnalysis.bestEntryPrice.toFixed(
                                                                2,
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-xs text-blue-600 dark:text-blue-500"
                                                    >
                                                        {{
                                                            trade.entryAnalysis
                                                                .minutesBeforeEntry
                                                        }}
                                                        min earlier
                                                    </p>
                                                </div>
                                                <div>
                                                    <p
                                                        class="text-xs text-blue-700 dark:text-blue-400"
                                                    >
                                                        Entry Improvement
                                                    </p>
                                                    <p
                                                        class="font-bold text-blue-900 dark:text-blue-200"
                                                    >
                                                        {{
                                                            trade.entryAnalysis.improvementPercent.toFixed(
                                                                1,
                                                            )
                                                        }}%
                                                    </p>
                                                    <p
                                                        class="text-xs text-blue-600 dark:text-blue-500"
                                                    >
                                                        ${{
                                                            trade.entryAnalysis.improvementDollar.toFixed(
                                                                2,
                                                            )
                                                        }}
                                                        per share
                                                    </p>
                                                </div>
                                                <div
                                                    v-if="
                                                        trade.entryAnalysis
                                                            .improvedPnL
                                                    "
                                                >
                                                    <p
                                                        class="text-xs text-blue-700 dark:text-blue-400"
                                                    >
                                                        P&L with Better Entry
                                                    </p>
                                                    <p
                                                        class="font-bold text-blue-900 dark:text-blue-200"
                                                    >
                                                        ${{
                                                            trade.entryAnalysis.improvedPnL.withBetterEntry.toFixed(
                                                                2,
                                                            )
                                                        }}
                                                    </p>
                                                    <p
                                                        class="text-xs text-green-600 dark:text-green-500"
                                                    >
                                                        +${{
                                                            trade.entryAnalysis.improvedPnL.improvement.toFixed(
                                                                2,
                                                            )
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                            <p
                                                class="text-xs text-blue-700 dark:text-blue-400 mt-2 italic"
                                            >
                                                {{
                                                    trade.entryAnalysis
                                                        .recommendation
                                                }}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Exit Quality Score (if available) -->
                                <div
                                    v-if="trade.exitQualityScore !== null"
                                    class="flex items-center space-x-2 mb-3"
                                >
                                    <span
                                        class="text-sm text-gray-600 dark:text-gray-400"
                                        >Exit Quality Score:</span
                                    >
                                    <div
                                        class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"
                                    >
                                        <div
                                            class="h-2 rounded-full"
                                            :class="{
                                                'bg-red-500':
                                                    trade.exitQualityScore <
                                                    0.3,
                                                'bg-yellow-500':
                                                    trade.exitQualityScore >=
                                                        0.3 &&
                                                    trade.exitQualityScore <
                                                        0.7,
                                                'bg-green-500':
                                                    trade.exitQualityScore >=
                                                    0.7,
                                            }"
                                            :style="{
                                                width: `${trade.exitQualityScore * 100}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <span
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        {{
                                            (
                                                trade.exitQualityScore * 100
                                            ).toFixed(0)
                                        }}%
                                    </span>
                                </div>

                                <!-- Recommendation -->
                                <div
                                    class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3"
                                >
                                    <div class="flex items-start space-x-2">
                                        <svg
                                            class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <div>
                                            <p
                                                class="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1"
                                            >
                                                Learning Opportunity
                                            </p>
                                            <p
                                                class="text-sm text-blue-700 dark:text-blue-400"
                                            >
                                                {{ trade.recommendation }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Load More Button -->
                            <div
                                v-if="
                                    topMissedTrades.topMissedTrades.length > 10
                                "
                                class="text-center pt-4"
                            >
                                <button
                                    @click="
                                        showAllMissedTrades =
                                            !showAllMissedTrades
                                    "
                                    class="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
                                >
                                    {{
                                        showAllMissedTrades
                                            ? "Show Less"
                                            : `Show All ${topMissedTrades.topMissedTrades.length} Missed Opportunities`
                                    }}
                                </button>
                            </div>

                            <!-- All trades section when expanded -->
                            <div
                                v-if="
                                    showAllMissedTrades &&
                                    topMissedTrades.topMissedTrades.length > 10
                                "
                                class="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700"
                            >
                                <div
                                    v-for="(
                                        trade, index
                                    ) in topMissedTrades.topMissedTrades.slice(
                                        10,
                                    )"
                                    :key="`full-${trade.tradeId}`"
                                    class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                                >
                                    <div
                                        class="flex justify-between items-center"
                                    >
                                        <div>
                                            <span
                                                class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                            >
                                                #{{ index + 11 }}
                                                {{ trade.symbol }}
                                            </span>
                                            <span
                                                class="text-xs text-gray-500 dark:text-gray-400 ml-2"
                                            >
                                                {{
                                                    new Date(
                                                        trade.exitTime,
                                                    ).toLocaleDateString()
                                                }}
                                            </span>
                                        </div>
                                        <div class="text-right">
                                            <span
                                                class="text-sm font-bold text-red-600 dark:text-red-400"
                                            >
                                                +{{
                                                    trade.missedOpportunityPercent
                                                }}%
                                            </span>
                                            <span
                                                class="text-xs text-gray-500 dark:text-gray-400 ml-2"
                                            >
                                                (+${{
                                                    (
                                                        trade
                                                            .potentialAdditionalProfit
                                                            ?.optimal || 0
                                                    ).toFixed(2)
                                                }})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- No Data State -->
                        <div
                            v-else
                            class="text-center py-8 text-gray-500 dark:text-gray-400"
                        >
                            <div
                                class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800"
                            >
                                <svg
                                    class="h-6 w-6 text-gray-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                    />
                                </svg>
                            </div>
                            <h3
                                class="mt-2 text-sm font-medium text-gray-900 dark:text-white"
                            >
                                {{
                                    topMissedTrades.message ||
                                    "No missed opportunities found"
                                }}
                            </h3>
                            <p
                                class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                            >
                                {{
                                    topMissedTrades.totalAnalyzed > 0
                                        ? `Analyzed ${topMissedTrades.totalAnalyzed} trades - all had reasonable exit timing!`
                                        : "You need completed winning trades to analyze missed opportunities."
                                }}
                            </p>
                        </div>
                    </div>

                    <div
                        v-else
                        class="text-center py-8 text-gray-500 dark:text-gray-400"
                    >
                        <p>No missed opportunities analysis available yet.</p>
                        <p class="text-sm mt-2">
                            Click "Find Early Exit Trades" to see specific
                            trades where you left profits on the table.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Overconfidence Analysis -->
            <BehavioralOverconfidence
                v-if="activeBehavioralTab === 'patterns'"
                :overconfidence-data="overconfidenceData"
                :loading-overconfidence="loadingOverconfidence"
                :expanded-overconfidence-events="expandedOverconfidenceEvents"
                @analyze="analyzeOverconfidence"
                @toggle-event="toggleOverconfidenceEventExpansion"
                @open-trade="openTrade"
            />

            <!-- Settings -->
            <div v-if="activeBehavioralTab === 'settings'" class="card">
                <div class="card-body">
                    <h3
                        class="text-lg font-medium text-gray-900 dark:text-white mb-6"
                    >
                        Behavioral Settings
                    </h3>
                    <div class="space-y-6">
                        <!-- Revenge Trading Detection -->
                        <div>
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4
                                        class="text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        Revenge Trading Detection
                                    </h4>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Monitor for revenge trading patterns
                                    </p>
                                </div>
                                <button
                                    @click="
                                        toggleSetting(
                                            'revengeTrading',
                                            'enabled',
                                        )
                                    "
                                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                                    :class="
                                        settings.revengeTrading?.enabled
                                            ? 'bg-primary-600'
                                            : 'bg-gray-200 dark:bg-gray-700'
                                    "
                                >
                                    <span
                                        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                                        :class="
                                            settings.revengeTrading?.enabled
                                                ? 'translate-x-5'
                                                : 'translate-x-0'
                                        "
                                    ></span>
                                </button>
                            </div>

                            <div
                                v-if="settings.revengeTrading?.enabled"
                                class="mt-4"
                            >
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Detection Sensitivity
                                </label>
                                <BaseSelect
                                    v-model="settings.revengeTrading.sensitivity"
                                    :options="[
                                        { value: 'low', label: 'Low - 5%+ account loss triggers detection' },
                                        { value: 'medium', label: 'Medium - 3%+ account loss triggers detection' },
                                        { value: 'high', label: 'High - 1%+ account loss triggers detection' }
                                    ]"
                                    @change="onSensitivityChange"
                                />
                            </div>
                        </div>

                        <!-- Cooling Period -->
                        <div>
                            <div class="flex items-center justify-between">
                                <div>
                                    <h4
                                        class="text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        Cooling Period
                                    </h4>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Recommended break time after losses
                                    </p>
                                </div>
                            </div>
                            <div class="mt-4">
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Duration (minutes)
                                </label>
                                <input
                                    v-model.number="
                                        settings.coolingPeriod.minutes
                                    "
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
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import api from "@/services/api";
import { useNotification } from "@/composables/useNotification";
import { useAuthStore } from "@/stores/auth";
import { useUiPreferencesStore } from "@/stores/uiPreferences";
import OnboardingCard from "@/components/onboarding/OnboardingCard.vue";
import { useGlobalAccountFilter } from "@/composables/useGlobalAccountFilter";
import ProUpgradePrompt from "@/components/ProUpgradePrompt.vue";
import MdiIcon from "@/components/MdiIcon.vue";
import TradeFilters from "@/components/trades/TradeFilters.vue";
import BaseSelect from "@/components/common/BaseSelect.vue";
import BehavioralRevengeTrading from "@/components/behavioral/BehavioralRevengeTrading.vue";
import BehavioralPersonality from "@/components/behavioral/BehavioralPersonality.vue";
import BehavioralLossAversion from "@/components/behavioral/BehavioralLossAversion.vue";
import BehavioralOverconfidence from "@/components/behavioral/BehavioralOverconfidence.vue";
import { formatDate, formatMinutes } from "@/utils/behavioralFormatters";
import { mdiTarget, mdiLightbulb } from "@mdi/js";

const { showSuccess, showError } = useNotification();
const authStore = useAuthStore();
const uiPreferencesStore = useUiPreferencesStore();
const { selectedAccount } = useGlobalAccountFilter();
const router = useRouter();
const route = useRoute();

const behavioralTabs = [
    { id: "overview", label: "Overview" },
    { id: "patterns", label: "Patterns" },
    { id: "settings", label: "Settings" },
];
const activeBehavioralTab = ref("overview");

const loading = ref(true);
const initialLoading = ref(true); // Track initial load separately to preserve scroll position and prevent TradeFilters remount
const initialLoadComplete = ref(false); // Prevents duplicate load from TradeFilters emit on mount
const loadingHistorical = ref(false);
const loadingLossAversion = ref(false);
const loadingOverconfidence = ref(false);
const loadingPersonality = ref(false);
const loadingTopMissedTrades = ref(false);
const hasAccess = ref(false);
const overview = ref(null);
const revengeAnalysis = ref(null);
const insights = ref(null);
const activeAlerts = ref([]);
const lossAversionData = ref(null);
const overconfidenceData = ref(null);
const personalityData = ref(null);
const topMissedTrades = ref(null);
const showAllMissedTrades = ref(false);
const topMissedTradesSection = ref(null);
const settings = ref({
    revengeTrading: { enabled: true, sensitivity: "medium" },
    coolingPeriod: { minutes: 30 },
    alertPreferences: { email: false, push: true, toast: true },
});

const filters = ref({
    symbol: "",
    startDate: "",
    endDate: "",
    strategies: [],
    sectors: [],
    tags: [],
    status: "",
    side: "",
    instrumentTypes: [],
    optionTypes: [],
    qualityGrades: [],
    daysOfWeek: [],
    brokers: [],
    hasNews: null,
    pnlType: "",
    minPrice: null,
    maxPrice: null,
    minQuantity: null,
    maxQuantity: null,
    minPnl: null,
    maxPnl: null,
});

const pagination = ref({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
});

const riskComponentRows = computed(() => {
    const components = insights.value?.overallRisk?.components || {};
    return [
        { key: "event_frequency", label: "Events", value: components.event_frequency ?? 0 },
        { key: "loss_rate", label: "Loss Rate", value: components.loss_rate ?? 0 },
        { key: "position_size_escalation", label: "Size Escalation", value: components.position_size_escalation ?? 0 },
        { key: "cooling_period_gap", label: "Cooling Gap", value: components.cooling_period_gap ?? 0 },
        { key: "pattern_severity", label: "Severity", value: components.pattern_severity ?? 0 },
    ];
});

// Track which overconfidence events are expanded (toggled from the
// BehavioralOverconfidence child; the async trade-detail fetch lives here
// because it populates parent-owned overconfidenceData)
const expandedOverconfidenceEvents = ref(new Set());

// Check if user has access to behavioral analytics
const checkAccess = async () => {
    try {
        const response = await api.get("/features/check/behavioral_analytics");
        hasAccess.value = response.data.hasAccess;
    } catch (error) {
        hasAccess.value = false;
    }
};

const getAccountFilterParam = () => {
    if (selectedAccount.value) return selectedAccount.value;
    if (Array.isArray(filters.value.accounts)) {
        return filters.value.accounts.join(",");
    }
    return filters.value.accounts || "";
};

const buildBehavioralQueryParams = () => {
    const queryParams = new URLSearchParams();
    if (filters.value.startDate)
        queryParams.append("startDate", filters.value.startDate);
    if (filters.value.endDate)
        queryParams.append("endDate", filters.value.endDate);

    const accounts = getAccountFilterParam();
    if (accounts) queryParams.append("accounts", accounts);

    return queryParams;
};

// Load behavioral analytics data
const loadData = async () => {
    if (!hasAccess.value) return;

    try {
        loading.value = true;

        const queryParams = buildBehavioralQueryParams();

        // Add pagination parameters for revenge trading
        const revengeQueryParams = new URLSearchParams(queryParams);
        revengeQueryParams.append("page", pagination.value.page);
        revengeQueryParams.append("limit", pagination.value.limit);

        const [overviewRes, revengeRes, insightsRes, alertsRes, settingsRes] =
            await Promise.all([
                api.get(`/behavioral-analytics/overview?${queryParams}`),
                api.get(
                    `/behavioral-analytics/revenge-trading?${revengeQueryParams}`,
                ),
                api.get(`/behavioral-analytics/insights?${queryParams}`),
                api.get("/behavioral-analytics/alerts"),
                api.get("/behavioral-analytics/settings"),
            ]);

        overview.value = overviewRes.data.data;
        revengeAnalysis.value = revengeRes.data.data;
        insights.value = insightsRes.data.data;
        activeAlerts.value = alertsRes.data.data;
        settings.value = { ...settings.value, ...settingsRes.data.data };

        // Update pagination info
        if (revengeRes.data.data.pagination) {
            pagination.value = revengeRes.data.data.pagination;
        }
    } catch (error) {
        if (error.response?.status === 403) {
            hasAccess.value = false;
        } else {
            showError("Error", "Failed to load behavioral analytics data");
        }
    } finally {
        loading.value = false;
        initialLoading.value = false;
    }
};

// Apply date filters
const applyFilters = async () => {
    // Reset pagination when applying filters
    pagination.value.page = 1;
    // Save filters to localStorage
    saveFilters();

    // Load main data and existing analysis data with new filters
    await loadData();

    // Reload all existing analysis data with new date filters
    await Promise.all([
        loadExistingLossAversionData(),
        loadExistingOverconfidenceData(),
        loadExistingPersonalityData(),
    ]);

    // Auto-load top missed trades if loss aversion data exists
    if (lossAversionData.value?.analysis) {
        await loadTopMissedTrades();
    }
};

// Handle filter changes from TradeFilters component
const handleFilter = (newFilters) => {
    // Directly apply the filters from TradeFilters component
    filters.value = { ...newFilters };

    // Save filters and reload data
    saveFilters();

    // Skip if this is the initial emit from TradeFilters on mount (we already loaded in onMounted)
    if (!initialLoadComplete.value) {
        console.log(
            "[BehavioralAnalytics] Skipping handleFilter - initial load not complete yet",
        );
        return;
    }

    applyFilters();
};

// Clear filters
const clearFilters = async () => {
    filters.value = {
        symbol: "",
        startDate: "",
        endDate: "",
        strategies: [],
        sectors: [],
        tags: [],
        status: "",
        side: "",
        instrumentTypes: [],
        optionTypes: [],
        qualityGrades: [],
        daysOfWeek: [],
        brokers: [],
        hasNews: null,
        pnlType: "",
        minPrice: null,
        maxPrice: null,
        minQuantity: null,
        maxQuantity: null,
        minPnl: null,
        maxPnl: null,
    };

    // Reset pagination
    pagination.value.page = 1;

    // Clear localStorage
    localStorage.removeItem("behavioralAnalyticsFilters");
    uiPreferencesStore.notifyChanged("behavioralAnalyticsFilters", null);

    // Apply the cleared filters
    await applyFilters();
};

// Save filters to localStorage
const saveFilters = () => {
    localStorage.setItem(
        "behavioralAnalyticsFilters",
        JSON.stringify(filters.value),
    );
    uiPreferencesStore.notifyChanged("behavioralAnalyticsFilters", filters.value);
};

// Load filters from localStorage
const loadFilters = () => {
    const savedFilters = localStorage.getItem("behavioralAnalyticsFilters");
    if (savedFilters) {
        try {
            const parsed = JSON.parse(savedFilters);
            filters.value = parsed;
        } catch (e) {
            console.error("Error loading saved filters:", e);
            setDefaultDateRange();
        }
    } else {
        setDefaultDateRange();
    }
};

// Set default date range
const setDefaultDateRange = () => {
    // Set default to cover actual trade data instead of current date
    filters.value.endDate = "2024-12-31";
    filters.value.startDate = "2024-01-01";
};

// Analyze historical trades for revenge trading patterns
const analyzeHistoricalTrades = async () => {
    try {
        loadingHistorical.value = true;

        const queryParams = buildBehavioralQueryParams();
        const response = await api.post(
            `/behavioral-analytics/analyze-historical?${queryParams}`,
        );

        showSuccess(
            "Analysis Complete",
            `Analyzed historical trades. Found ${response.data.data?.revengeEventsCreated || response.data.patternsDetected || 0} revenge trading patterns.`,
        );

        // Reload data after analysis
        await loadData();
    } catch (error) {
        console.error("Error analyzing historical trades:", error);
        showError("Error", "Failed to analyze historical trades");
    } finally {
        loadingHistorical.value = false;
    }
};

// Acknowledge an alert
const acknowledgeAlert = async (alertId) => {
    try {
        await api.post(`/behavioral-analytics/alerts/${alertId}/acknowledge`);
        activeAlerts.value = activeAlerts.value.filter(
            (alert) => alert.id !== alertId,
        );
        showSuccess("Success", "Alert acknowledged");
    } catch (error) {
        showError("Error", "Failed to acknowledge alert");
    }
};

// Toggle a setting
const toggleSetting = (category, key) => {
    if (!settings.value[category]) {
        settings.value[category] = {};
    }
    settings.value[category][key] = !settings.value[category][key];
    updateSettings();
};

// Update settings
const updateSettings = async () => {
    try {
        await api.put("/behavioral-analytics/settings", settings.value);
        showSuccess("Success", "Settings updated");
    } catch (error) {
        showError("Error", "Failed to update settings");
    }
};

// Handle sensitivity change with immediate data reload
const onSensitivityChange = async () => {
    try {
        await updateSettings();
        // Reset pagination and reload data with new sensitivity
        pagination.value.page = 1;
        await loadData();
        showSuccess(
            "Updated",
            "Detection sensitivity updated and data refreshed",
        );
    } catch (error) {
        showError("Error", "Failed to update sensitivity");
    }
};

// Pagination functions
const goToPage = async (page) => {
    if (page < 1 || page > pagination.value.totalPages) return;
    pagination.value.page = page;
    await loadData();
};

const nextPage = async () => {
    if (pagination.value.hasNextPage) {
        await goToPage(pagination.value.page + 1);
    }
};

const prevPage = async () => {
    if (pagination.value.hasPreviousPage) {
        await goToPage(pagination.value.page - 1);
    }
};

// Re-run analysis with new thresholds
const reRunAnalysis = async () => {
    try {
        loadingHistorical.value = true;

        const queryParams = buildBehavioralQueryParams();
        const response = await api.post(
            `/behavioral-analytics/re-run-historical?${queryParams}`,
        );

        showSuccess(
            "Analysis Complete",
            `Re-analyzed historical trades with new thresholds. Found ${response.data.data.revengeEventsCreated || 0} revenge trading events.`,
        );

        // Reset pagination and reload data
        pagination.value.page = 1;
        await loadData();
    } catch (error) {
        console.error("Error re-running analysis:", error);
        showError("Error", "Failed to re-run analysis");
    } finally {
        loadingHistorical.value = false;
    }
};

// Open trade detail page
const openTrade = (tradeId) => {
    if (tradeId) {
        // Navigate directly to the trade detail page in same window
        router.push(`/trades/${tradeId}`);
    }
};

// Navigate to trades page filtered by loss aversion trades
const viewLossAversionTrades = () => {
    if (lossAversionData.value?.analysis?.priceHistoryAnalysis?.exampleTrades) {
        const tradeIds =
            lossAversionData.value.analysis.priceHistoryAnalysis.exampleTrades.map(
                (trade) => trade.id,
            );
        if (tradeIds.length > 0) {
            // Navigate to trades page with filtered trade IDs
            router.push({
                path: "/trades",
                query: {
                    filter: "loss_aversion",
                    tradeIds: tradeIds.join(","),
                    title: "Loss Aversion Trades",
                },
            });
        }
    }
};

// Scroll to top missed trades section
const scrollToTopMissedTrades = async () => {
    // Load top missed trades if not already loaded
    if (!topMissedTrades.value || !topMissedTrades.value.topMissedTrades) {
        await loadTopMissedTrades();
    }

    // Scroll to the top missed trades section
    await nextTick();
    if (topMissedTradesSection.value) {
        topMissedTradesSection.value.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
        // Briefly highlight the section
        topMissedTradesSection.value.classList.add(
            "ring-2",
            "ring-orange-400",
            "ring-opacity-50",
        );
        setTimeout(() => {
            topMissedTradesSection.value.classList.remove(
                "ring-2",
                "ring-orange-400",
                "ring-opacity-50",
            );
        }, 2000);
    }
};

// Toggle expanded state for overconfidence events
const toggleOverconfidenceEventExpansion = async (eventId) => {
    if (expandedOverconfidenceEvents.value.has(eventId)) {
        expandedOverconfidenceEvents.value.delete(eventId);
    } else {
        expandedOverconfidenceEvents.value.add(eventId);

        // Load trade details if not already loaded
        const event = overconfidenceData.value?.analysis?.events?.find(
            (e) => e.id === eventId,
        );
        if (
            event &&
            (!event.streakTradeDetails || event.streakTradeDetails.length === 0)
        ) {
            try {
                const response = await api.get(
                    `/behavioral-analytics/overconfidence/${eventId}/trades`,
                );
                if (response.data.success) {
                    event.streakTradeDetails = response.data.data;
                }
            } catch (error) {
                console.error("Error loading trade details:", error);
                showError("Error", "Failed to load trade details");
            }
        }
    }
};

// Go back to previous page
const goBack = () => {
    // Use Vue Router's go method to go back one step in history
    if (window.history.length > 1) {
        router.go(-1);
    } else {
        // If no history, go to metrics page since this is a sub-page of metrics
        router.push("/metrics");
    }
};

// Analyze loss aversion patterns
const analyzeLossAversion = async () => {
    try {
        loadingLossAversion.value = true;

        // Clear any existing cache before running fresh analysis
        clearLossAversionCache();

        const queryParams = buildBehavioralQueryParams();

        const response = await api.get(
            `/behavioral-analytics/loss-aversion?${queryParams}`,
        );

        if (response.data.data) {
            lossAversionData.value = response.data.data;

            // Cache the complete analysis results with fresh timestamp
            cacheLossAversionData(response.data.data);

            if (response.data.data.error) {
                showError("Analysis Error", response.data.data.message);
            } else {
                showSuccess(
                    "Analysis Complete",
                    "Loss aversion patterns analyzed successfully",
                );

                // Auto-load top missed trades after successful analysis
                await loadTopMissedTrades();
            }
        }
    } catch (error) {
        console.error("Error analyzing loss aversion:", error);

        // Check if it's a 400 error with specific requirements message
        if (error.response?.status === 400 && error.response?.data?.message) {
            showError("Requirements Not Met", error.response.data.message);
        } else {
            showError("Error", "Failed to analyze loss aversion patterns");
        }
    } finally {
        loadingLossAversion.value = false;
    }
};

// Analyze overconfidence patterns
const analyzeOverconfidence = async () => {
    try {
        loadingOverconfidence.value = true;

        // Clear frontend cache when user deliberately clicks "Analyze History"
        // This ensures fresh AI recommendations are generated
        const cacheKey = `overconfidence_analysis_${authStore.user?.id}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`;
        localStorage.removeItem(cacheKey);
        console.log(
            "[OVERCONFIDENCE] Cleared frontend cache - will generate fresh AI recommendations",
        );

        // Build query params for date filters
        const queryParams = buildBehavioralQueryParams();

        const response = await api.post(
            `/behavioral-analytics/overconfidence/analyze-historical?${queryParams}`,
        );

        if (response.data.success) {
            // Get the analysis from the response - need to fetch the full analysis after historical processing
            const analysisResponse = await api.get(
                `/behavioral-analytics/overconfidence?${queryParams}`,
            );
            if (analysisResponse.data.success && analysisResponse.data.data) {
                overconfidenceData.value = analysisResponse.data.data;

                console.log(
                    "[OVERCONFIDENCE] Analysis response:",
                    analysisResponse.data.data,
                );
                console.log(
                    "[OVERCONFIDENCE] Events found:",
                    analysisResponse.data.data.analysis?.events?.length || 0,
                );
                console.log(
                    "[OVERCONFIDENCE] Statistics:",
                    analysisResponse.data.data.analysis?.statistics,
                );

                // Cache the overconfidence data
                const cacheData = {
                    data: analysisResponse.data.data,
                    timestamp: Date.now(),
                    filters: { ...filters.value },
                };
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));

                if (analysisResponse.data.data.error) {
                    showError(
                        "Analysis Error",
                        analysisResponse.data.data.message,
                    );
                } else {
                    const eventsCount =
                        analysisResponse.data.data.analysis?.events?.length ||
                        analysisResponse.data.data.analysis?.statistics
                            ?.totalEvents ||
                        0;
                    showSuccess(
                        "Analysis Complete",
                        response.data.message ||
                            `Found ${eventsCount} overconfidence events`,
                    );
                }
            }
        }
    } catch (error) {
        console.error("Error analyzing overconfidence:", error);

        // Check if it's a 400 error with specific requirements message
        if (error.response?.status === 400 && error.response?.data?.message) {
            showError("Requirements Not Met", error.response.data.message);
        } else {
            showError("Error", "Failed to analyze overconfidence patterns");
        }
    } finally {
        loadingOverconfidence.value = false;
    }
};

// Load top missed trades by percentage of missed opportunity
const loadTopMissedTrades = async (forceRefresh = false) => {
    try {
        loadingTopMissedTrades.value = true;
        showAllMissedTrades.value = false; // Reset expanded state

        console.log(
            `Loading top missed trades... (forceRefresh: ${forceRefresh})`,
        );

        // Check cache only if NOT force refreshing and load immediately to show existing data
        const cacheKey = `top_missed_trades_${authStore.user?.id}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`;
        if (!forceRefresh) {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    const cacheAge = Date.now() - parsed.timestamp;
                    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

                    if (cacheAge < maxAge && parsed.data) {
                        topMissedTrades.value = parsed.data;
                        console.log(
                            "Loaded top missed trades from cache (will update in background)",
                        );
                    }
                } catch (e) {
                    console.warn("Invalid cached top missed trades data");
                }
            }
        } else {
            console.log("Force refresh - clearing frontend cache");
            localStorage.removeItem(cacheKey);
        }

        const queryParams = buildBehavioralQueryParams();
        queryParams.append("limit", "50");
        if (forceRefresh) queryParams.append("forceRefresh", "true");

        const response = await api.get(
            `/behavioral-analytics/loss-aversion/top-missed-trades?${queryParams}`,
        );

        if (response.data.data) {
            topMissedTrades.value = response.data.data;

            // Cache the top missed trades data
            const cacheData = {
                data: response.data.data,
                timestamp: Date.now(),
                filters: { ...filters.value },
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));

            if (
                response.data.data.topMissedTrades &&
                response.data.data.topMissedTrades.length > 0
            ) {
                showSuccess(
                    "Analysis Complete",
                    `Found ${response.data.data.topMissedTrades.length} trades with significant missed opportunities`,
                );
            } else {
                showSuccess(
                    "Analysis Complete",
                    response.data.data.message ||
                        "No significant missed opportunities found",
                );
            }
        }
    } catch (error) {
        console.error("Failed to load top missed trades:", error);
        if (error.response?.status === 403) {
            showError("Pro Tier Required", error.response.data.message);
        } else {
            showError("Error", "Failed to load top missed trades analysis");
        }
    } finally {
        loadingTopMissedTrades.value = false;
    }
};

// Analyze trading personality patterns
const analyzePersonality = async () => {
    try {
        loadingPersonality.value = true;

        const queryParams = buildBehavioralQueryParams();

        const response = await api.get(
            `/behavioral-analytics/personality?${queryParams}`,
        );

        if (response.data.data) {
            personalityData.value = response.data.data;

            // Cache the result
            const cacheKey = `personality_analysis_${authStore.user?.id}`;
            const cacheData = {
                data: response.data.data,
                timestamp: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));

            if (response.data.data.error) {
                showError("Analysis Error", response.data.data.message);
            } else {
                showSuccess(
                    "Analysis Complete",
                    "Trading personality analyzed successfully",
                );
            }
        }
    } catch (error) {
        console.error("Error analyzing personality:", error);

        // Check if it's a 400 error with specific requirements message
        if (error.response?.status === 400 && error.response?.data?.message) {
            showError("Requirements Not Met", error.response.data.message);
        } else {
            showError("Error", "Failed to analyze trading personality");
        }
    } finally {
        loadingPersonality.value = false;
    }
};

// View trades by specific strategy pattern
const viewTradesByStrategy = (strategy) => {
    // Define strategy-specific filters based on trading patterns
    const strategyFilters = {
        scalper: {
            name: "Scalper Trades",
            description: "Very short-term trades (< 15 minutes)",
            filters: {
                maxHoldTime: 15, // minutes
                tradeTypes: ["scalp", "momentum"],
            },
        },
        momentum: {
            name: "Momentum Trades",
            description: "Trend-following trades (15 minutes - 4 hours)",
            filters: {
                minHoldTime: 15,
                maxHoldTime: 240, // 4 hours
                tradeTypes: ["momentum", "breakout"],
            },
        },
        mean_reversion: {
            name: "Mean Reversion Trades",
            description: "Counter-trend trades expecting price reversal",
            filters: {
                minHoldTime: 30,
                maxHoldTime: 480, // 8 hours
                tradeTypes: ["mean_reversion", "support_resistance"],
            },
        },
        swing: {
            name: "Swing Trades",
            description: "Multi-day position trades (> 1 day)",
            filters: {
                minHoldTime: 1440, // 1 day in minutes
                tradeTypes: ["swing", "position"],
            },
        },
        option_strategy: {
            name: "Option Strategy Trades",
            description: "Grouped multi-leg option structures and option strategy trades",
            filters: {
                instrumentTypes: ["option"],
            },
        },
    };

    const strategyConfig = strategyFilters[strategy];
    if (!strategyConfig) return;

    // Build query parameters for the trades page
    const queryParams = new URLSearchParams();

    // Add strategy-specific filters
    if (strategyConfig.filters.minHoldTime) {
        queryParams.set(
            "minHoldTime",
            strategyConfig.filters.minHoldTime.toString(),
        );
    }
    if (strategyConfig.filters.maxHoldTime) {
        queryParams.set(
            "maxHoldTime",
            strategyConfig.filters.maxHoldTime.toString(),
        );
    }
    if (strategyConfig.filters.instrumentTypes) {
        queryParams.set(
            "instrumentTypes",
            strategyConfig.filters.instrumentTypes.join(","),
        );
    }

    // Add strategy name for filtering where it maps to a stored strategy.
    if (strategy !== "option_strategy") {
        queryParams.set("strategy", strategy);
    }
    queryParams.set("strategyName", strategyConfig.name);
    queryParams.set("strategyDescription", strategyConfig.description);

    const accounts = getAccountFilterParam();
    if (accounts) queryParams.set("accounts", accounts);

    // Navigate to trades page with filters
    router.push({
        path: "/trades",
        query: Object.fromEntries(queryParams),
    });
};

// Generate loss aversion message based on hold time ratio
const generateLossAversionMessage = (holdTimeRatio, estimatedMonthlyCost) => {
    const cost = Number(estimatedMonthlyCost) || 0;
    if (holdTimeRatio > 3) {
        return `You exit winners ${holdTimeRatio.toFixed(1)}x faster than losers - this is costing you $${cost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 2) {
        return `You hold losers ${holdTimeRatio.toFixed(1)}x longer than winners - consider using tighter stops to save $${cost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 1.5) {
        return `Slight loss aversion detected - you could save $${cost.toFixed(2)}/month with better exit timing`;
    } else {
        return `Good exit discipline - your hold time ratio of ${holdTimeRatio.toFixed(1)}x is within healthy range`;
    }
};

watch(selectedAccount, async () => {
    filters.value.accounts = selectedAccount.value || "";
    pagination.value.page = 1;

    if (!initialLoadComplete.value || !hasAccess.value) return;

    console.log(
        "[BehavioralAnalytics] Global account filter changed to:",
        selectedAccount.value || "All Accounts",
    );
    await applyFilters();
});

onMounted(async () => {
    loadFilters();
    // Initialize account filter from global state
    if (selectedAccount.value) {
        filters.value.accounts = selectedAccount.value;
    }
    await checkAccess();
    if (hasAccess.value) {
        await loadData();

        // Load existing analysis data to maintain state when returning to page
        await Promise.all([
            loadExistingLossAversionData(),
            loadExistingOverconfidenceData(),
            loadExistingPersonalityData(),
        ]);

        // Always load cached data immediately on page load
        console.log("[PROCESS] Loading cached data on page mount...");
        await Promise.all([
            loadCachedTopMissedTrades(),
            loadCachedOverconfidenceData(),
        ]);

        // Log current state
        console.log("[STATS] Current state after cache loading:");
        console.log("topMissedTrades:", topMissedTrades.value);
        console.log("overconfidenceData:", overconfidenceData.value);

        // Auto-load fresh top missed trades if loss aversion data exists
        if (lossAversionData.value?.analysis) {
            await loadTopMissedTrades();
        }

        // Mark initial load as complete - future handleFilter calls will reload data
        initialLoadComplete.value = true;
    } else {
        loading.value = false;
        initialLoading.value = false;
        initialLoadComplete.value = true;
    }
});

// Load cached top missed trades immediately on page load
const loadCachedTopMissedTrades = () => {
    try {
        // Try multiple cache key variations to find data
        const userId = authStore.user?.id;
        const cacheKeys = [
            `top_missed_trades_${userId}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`,
            `top_missed_trades_${userId}_all_all`, // Fallback to "all dates" version
            `top_missed_trades_${userId}`, // Even simpler fallback
        ];

        for (const cacheKey of cacheKeys) {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    const cacheAge = Date.now() - parsed.timestamp;
                    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

                    if (cacheAge < maxAge && parsed.data) {
                        topMissedTrades.value = parsed.data;
                        console.log(
                            `[SUCCESS] Loaded top missed trades from cache on page load (key: ${cacheKey})`,
                        );
                        console.log("Cache data:", parsed.data);
                        return true;
                    }
                } catch (parseError) {
                    console.warn(
                        `Failed to parse cached data for key ${cacheKey}:`,
                        parseError,
                    );
                }
            }
        }
    } catch (e) {
        console.warn("Failed to load cached top missed trades:", e);
    }
    return false;
};

// Load cached overconfidence data immediately on page load
const loadCachedOverconfidenceData = () => {
    try {
        // Try multiple cache key variations to find data
        const userId = authStore.user?.id;
        const cacheKeys = [
            `overconfidence_analysis_${userId}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`,
            `overconfidence_analysis_${userId}_all_all`, // Fallback to "all dates" version
            `overconfidence_analysis_${userId}`, // Even simpler fallback
        ];

        for (const cacheKey of cacheKeys) {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    const cacheAge = Date.now() - parsed.timestamp;
                    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

                    if (cacheAge < maxAge && parsed.data) {
                        overconfidenceData.value = parsed.data;
                        console.log(
                            `[SUCCESS] Loaded overconfidence analysis from cache on page load (key: ${cacheKey})`,
                        );
                        console.log("Cache data:", parsed.data);
                        return true;
                    }
                } catch (parseError) {
                    console.warn(
                        `Failed to parse cached data for key ${cacheKey}:`,
                        parseError,
                    );
                }
            }
        }
    } catch (e) {
        console.warn("Failed to load cached overconfidence data:", e);
    }
    return false;
};

// Clear loss aversion cache
const clearLossAversionCache = () => {
    try {
        // Clear all loss aversion cache entries for current user
        const userId = route.params.userId || "current";
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
            if (key.startsWith(`loss_aversion_${userId}_`)) {
                localStorage.removeItem(key);
                console.log("Cleared cache:", key);
            }
        });
    } catch (error) {
        console.warn("Failed to clear loss aversion cache:", error);
    }
};

// Cache loss aversion data in localStorage
const cacheLossAversionData = (data) => {
    try {
        const cacheKey = `loss_aversion_${route.params.userId || "current"}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`;
        const cacheData = {
            data: data,
            timestamp: Date.now(),
            userId: route.params.userId || "current",
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log("Cached loss aversion data:", cacheKey);
    } catch (error) {
        console.warn("Failed to cache loss aversion data:", error);
    }
};

// Load cached loss aversion data
const loadCachedLossAversionData = () => {
    try {
        const cacheKey = `loss_aversion_${route.params.userId || "current"}_${filters.value.startDate || "all"}_${filters.value.endDate || "all"}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            const cacheData = JSON.parse(cached);
            const age = Date.now() - cacheData.timestamp;
            const maxAge = 30 * 60 * 1000; // 30 minutes

            if (age < maxAge) {
                console.log("Loaded cached loss aversion data:", cacheKey);
                return cacheData.data;
            } else {
                // Remove expired cache
                localStorage.removeItem(cacheKey);
            }
        }
    } catch (error) {
        console.warn("Failed to load cached loss aversion data:", error);
    }
    return null;
};

// Load existing loss aversion analysis data
const loadExistingLossAversionData = async () => {
    // Always try API first to get the latest data from database
    try {
        const lossAversionRes = await api.get(
            "/behavioral-analytics/loss-aversion/complete",
        );
        if (lossAversionRes.data.data) {
            // Use the complete analysis data which includes stored trade patterns
            lossAversionData.value = lossAversionRes.data.data;
            // Cache the API response
            cacheLossAversionData(lossAversionRes.data.data);
            return;
        }
    } catch (error) {
        console.log(
            "Failed to load complete loss aversion data, trying cache...",
        );
    }

    // Try cache as fallback
    const cachedData = loadCachedLossAversionData();
    if (cachedData) {
        lossAversionData.value = cachedData;
        return;
    }

    // Fallback to basic metrics if both API and cache fail
    try {
        const fallbackRes = await api.get(
            "/behavioral-analytics/loss-aversion/latest",
        );
        if (fallbackRes.data.data) {
            const metrics = fallbackRes.data.data;
            lossAversionData.value = {
                analysis: {
                    message: generateLossAversionMessage(
                        metrics.hold_time_ratio,
                        metrics.estimated_monthly_cost,
                    ),
                    avgWinnerHoldTime:
                        Number(metrics.avg_winner_hold_time_minutes) || 0,
                    avgLoserHoldTime:
                        Number(metrics.avg_loser_hold_time_minutes) || 0,
                    holdTimeRatio: Number(metrics.hold_time_ratio) || 0,
                    totalTrades:
                        Number(metrics.total_winning_trades || 0) +
                        Number(metrics.total_losing_trades || 0),
                    winners: Number(metrics.total_winning_trades) || 0,
                    losers: Number(metrics.total_losing_trades) || 0,
                    financialImpact: {
                        estimatedMonthlyCost:
                            Number(metrics.estimated_monthly_cost) || 0,
                        missedProfitPotential:
                            Number(metrics.missed_profit_potential) || 0,
                        unnecessaryLossExtension:
                            Number(metrics.unnecessary_loss_extension) || 0,
                        avgPlannedRiskReward:
                            Number(metrics.avg_planned_risk_reward) || 2.0,
                        avgActualRiskReward:
                            Number(metrics.avg_actual_risk_reward) || 1.0,
                    },
                    priceHistoryAnalysis: {
                        totalMissedProfit: 0,
                        avgMissedProfitPercent: 0,
                        exampleTrades: [],
                    },
                },
            };
        }
    } catch (fallbackError) {
        console.error(
            "Failed to load basic loss aversion metrics:",
            fallbackError,
        );
    }
};

// Load existing overconfidence analysis data
const loadExistingOverconfidenceData = async () => {
    try {
        const response = await api.get("/behavioral-analytics/overconfidence");
        if (response.data.success && response.data.data) {
            overconfidenceData.value = response.data.data;

            // Cache overconfidence data locally for persistence
            const cacheKey = `overconfidence_analysis_${authStore.user?.id}`;
            const cacheData = {
                data: response.data.data,
                timestamp: Date.now(),
                filters: filters.value,
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } else {
            // Try to load from cache if API has no data
            const cacheKey = `overconfidence_analysis_${authStore.user?.id}`;
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    const cacheAge = Date.now() - parsed.timestamp;
                    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

                    if (cacheAge < maxAge && parsed.data) {
                        overconfidenceData.value = parsed.data;
                        console.log("Loaded overconfidence data from cache");
                    }
                } catch (e) {
                    console.warn("Invalid cached overconfidence data");
                }
            }
        }
    } catch (error) {
        console.error("Failed to load existing overconfidence data:", error);
    }
};

// Load existing personality analysis data
const loadExistingPersonalityData = async () => {
    try {
        // First try to get the latest stored analysis from the database
        const response = await api.get(
            "/behavioral-analytics/personality/latest",
        );
        if (response.data.success && response.data.data) {
            personalityData.value = response.data.data;
            console.log("Loaded personality data from database");

            // Also cache it locally for quick access
            const cacheKey = `personality_analysis_${authStore.user?.id}`;
            const cacheData = {
                data: response.data.data,
                timestamp: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            return;
        }

        // If no data from API, check localStorage cache as fallback
        const cacheKey = `personality_analysis_${authStore.user?.id}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                const cacheAge = Date.now() - parsed.timestamp;
                const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days (increased from 24 hours)

                if (cacheAge < maxAge && parsed.data) {
                    personalityData.value = parsed.data;
                    console.log(
                        "Loaded personality data from cache (API had no data)",
                    );
                    return;
                }
            } catch (e) {
                console.warn("Invalid cached personality data");
            }
        }
    } catch (error) {
        console.error("Failed to load existing personality data:", error);
    }
};

// Automatically analyze personality if conditions are met
const autoAnalyzePersonality = async () => {
    if (loadingPersonality.value) return;

    try {
        // Check if user has enough trades for analysis
        const tradeCountResponse = await api.get("/trades/count");
        if (tradeCountResponse.data.count >= 20) {
            console.log(
                "Auto-analyzing personality with sufficient trade data",
            );
            await analyzePersonality();
        }
    } catch (error) {
        console.log("Could not auto-analyze personality:", error.message);
    }
};
</script>
