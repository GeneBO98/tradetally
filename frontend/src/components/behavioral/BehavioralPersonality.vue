<template>
            <div class="card">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="heading-card">
                            Trading Personality Profiling
                        </h3>
                        <button
                            @click="$emit('analyze')"
                            :disabled="loadingPersonality"
                            class="btn btn-primary btn-sm"
                        >
                            <svg
                                v-if="loadingPersonality"
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
                                loadingPersonality
                                    ? "Analyzing..."
                                    : "Refresh Analysis"
                            }}
                        </button>
                    </div>

                    <!-- Show empty state when no personality data -->
                    <div
                        v-if="!personalityData || !personalityData.profile"
                        class="text-center py-12"
                    >
                        <div
                            class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 mb-4"
                        >
                            <svg
                                class="w-8 h-8 text-purple-600 dark:text-purple-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                ></path>
                            </svg>
                        </div>
                        <h4
                            class="text-lg font-medium text-gray-900 dark:text-white mb-2"
                        >
                            No Trading Personality Profile Yet
                        </h4>
                        <p
                            class="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto"
                        >
                            To generate your trading personality profile, you
                            need at least 20 completed trades. This helps us
                            analyze your patterns and provide meaningful
                            insights.
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-500">
                            Keep trading and check back once you've reached this
                            milestone!
                        </p>
                    </div>

                    <div v-else-if="personalityData && personalityData.profile">
                        <!-- Personality Overview -->
                        <div
                            class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-6 mb-6"
                        >
                            <div class="flex items-center justify-between mb-4">
                                <div>
                                    <h4
                                        class="text-xl font-bold text-gray-900 dark:text-white capitalize"
                                    >
                                        {{
                                            formatPersonalityName(
                                                personalityData.profile
                                                    .primary_personality,
                                            )
                                        }}
                                        Trader
                                    </h4>
                                    <p
                                        class="text-sm text-gray-600 dark:text-gray-400"
                                    >
                                        Confidence:
                                        {{
                                            (
                                                parseFloat(
                                                    personalityData.profile
                                                        .personality_confidence ||
                                                        0,
                                                ) * 100
                                            ).toFixed(0)
                                        }}%
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Performance Score
                                    </p>
                                    <p
                                        class="text-2xl font-bold text-purple-600 dark:text-purple-400"
                                    >
                                        {{
                                            parseFloat(
                                                personalityData.profile
                                                    .personality_performance_score ||
                                                    0,
                                            ).toFixed(2)
                                        }}
                                    </p>
                                </div>
                            </div>

                            <!-- Personality Score Breakdown -->
                            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div
                                    class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    @click="$emit('view-strategy', 'scalper')"
                                    :title="'Click to view trades matching Scalper strategy patterns'"
                                >
                                    <p
                                        class="text-xs text-gray-600 dark:text-gray-400 mb-1"
                                    >
                                        Scalper
                                    </p>
                                    <div
                                        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1"
                                    >
                                        <div
                                            class="bg-red-500 h-2 rounded-full"
                                            :style="{
                                                width: `${personalityData.personalityScores?.scalper || 0}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <p class="text-xs font-medium">
                                        {{
                                            personalityData.personalityScores
                                                ?.scalper || 0
                                        }}%
                                    </p>
                                    <p
                                        class="text-xs text-primary-600 dark:text-primary-400 mt-1 flex items-center justify-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiChartBox"
                                            :size="12"
                                            class="mr-1"
                                        />
                                        View trades
                                    </p>
                                </div>
                                <div
                                    class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    @click="$emit('view-strategy', 'momentum')"
                                    :title="'Click to view trades matching Momentum strategy patterns'"
                                >
                                    <p
                                        class="text-xs text-gray-600 dark:text-gray-400 mb-1"
                                    >
                                        Momentum
                                    </p>
                                    <div
                                        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1"
                                    >
                                        <div
                                            class="bg-green-500 h-2 rounded-full"
                                            :style="{
                                                width: `${personalityData.personalityScores?.momentum || 0}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <p class="text-xs font-medium">
                                        {{
                                            personalityData.personalityScores
                                                ?.momentum || 0
                                        }}%
                                    </p>
                                    <p
                                        class="text-xs text-primary-600 dark:text-primary-400 mt-1 flex items-center justify-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiChartBox"
                                            :size="12"
                                            class="mr-1"
                                        />
                                        View trades
                                    </p>
                                </div>
                                <div
                                    class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    @click="
                                        $emit('view-strategy', 'mean_reversion')
                                    "
                                    :title="'Click to view trades matching Mean Reversion strategy patterns'"
                                >
                                    <p
                                        class="text-xs text-gray-600 dark:text-gray-400 mb-1"
                                    >
                                        Mean Reversion
                                    </p>
                                    <div
                                        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1"
                                    >
                                        <div
                                            class="bg-primary-500 h-2 rounded-full"
                                            :style="{
                                                width: `${personalityData.personalityScores?.mean_reversion || 0}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <p class="text-xs font-medium">
                                        {{
                                            personalityData.personalityScores
                                                ?.mean_reversion || 0
                                        }}%
                                    </p>
                                    <p
                                        class="text-xs text-primary-600 dark:text-primary-400 mt-1 flex items-center justify-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiChartBox"
                                            :size="12"
                                            class="mr-1"
                                        />
                                        View trades
                                    </p>
                                </div>
                                <div
                                    class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    @click="$emit('view-strategy', 'swing')"
                                    :title="'Click to view trades matching Swing strategy patterns'"
                                >
                                    <p
                                        class="text-xs text-gray-600 dark:text-gray-400 mb-1"
                                    >
                                        Swing
                                    </p>
                                    <div
                                        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1"
                                    >
                                        <div
                                            class="bg-primary-500 h-2 rounded-full"
                                            :style="{
                                                width: `${personalityData.personalityScores?.swing || 0}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <p class="text-xs font-medium">
                                        {{
                                            personalityData.personalityScores
                                                ?.swing || 0
                                        }}%
                                    </p>
                                    <p
                                        class="text-xs text-primary-600 dark:text-primary-400 mt-1 flex items-center justify-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiChartBox"
                                            :size="12"
                                            class="mr-1"
                                        />
                                        View trades
                                    </p>
                                </div>
                                <div
                                    class="text-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    @click="$emit('view-strategy', 'option_strategy')"
                                    :title="'Click to view grouped option strategy trades'"
                                >
                                    <p
                                        class="text-xs text-gray-600 dark:text-gray-400 mb-1"
                                    >
                                        Options Strategy
                                    </p>
                                    <div
                                        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1"
                                    >
                                        <div
                                            class="bg-primary-500 h-2 rounded-full"
                                            :style="{
                                                width: `${personalityData.personalityScores?.option_strategy || 0}%`,
                                            }"
                                        ></div>
                                    </div>
                                    <p class="text-xs font-medium">
                                        {{
                                            personalityData.personalityScores
                                                ?.option_strategy || 0
                                        }}%
                                    </p>
                                    <p
                                        class="text-xs text-primary-600 dark:text-primary-400 mt-1 flex items-center justify-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiChartBox"
                                            :size="12"
                                            class="mr-1"
                                        />
                                        View trades
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Behavior Metrics -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div
                                class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
                            >
                                <h5
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Median Hold Time
                                </h5>
                                <p
                                    class="text-xl font-bold text-gray-900 dark:text-white"
                                >
                                    {{
                                        formatMinutes(
                                            personalityData.profile
                                                .avg_hold_time_minutes,
                                        )
                                    }}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    Per trade
                                </p>
                            </div>

                            <div
                                class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
                            >
                                <h5
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Trading Frequency
                                </h5>
                                <p
                                    class="text-xl font-bold text-gray-900 dark:text-white"
                                >
                                    {{
                                        parseFloat(
                                            personalityData.profile
                                                .avg_trade_frequency_per_day ||
                                                0,
                                        ).toFixed(1)
                                    }}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    Trades per day
                                </p>
                            </div>

                            <div
                                class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
                            >
                                <h5
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Position Consistency
                                </h5>
                                <p
                                    class="text-xl font-bold text-gray-900 dark:text-white"
                                >
                                    {{
                                        (
                                            parseFloat(
                                                personalityData.profile
                                                    .position_sizing_consistency ||
                                                    0,
                                            ) * 100
                                        ).toFixed(0)
                                    }}%
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    Sizing discipline
                                </p>
                            </div>
                        </div>

                        <!-- Peer Comparison -->
                        <div
                            v-if="
                                personalityData.peerComparison &&
                                !personalityData.peerComparison.insufficientData
                            "
                            class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6"
                        >
                            <h5
                                class="text-lg font-medium text-blue-800 dark:text-blue-300 mb-4"
                            >
                                Peer Comparison ({{
                                    personalityData.peerComparison.peerGroupSize
                                }}
                                {{
                                    personalityData.profile.primary_personality.replace(
                                        "_",
                                        " ",
                                    )
                                }}
                                traders)
                            </h5>

                            <div
                                class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"
                            >
                                <div class="text-center">
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Your Percentile
                                    </p>
                                    <p
                                        class="text-2xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            personalityData.peerComparison
                                                .userPercentile
                                        }}th
                                    </p>
                                    <p
                                        class="text-xs text-blue-600 dark:text-blue-400"
                                    >
                                        {{
                                            personalityData.peerComparison
                                                .userPercentile > 50
                                                ? "Above average"
                                                : "Below average"
                                        }}
                                    </p>
                                </div>
                                <div class="text-center">
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Your Performance
                                    </p>
                                    <p
                                        class="text-2xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            personalityData.peerComparison
                                                .performanceComparison?.user ||
                                            "N/A"
                                        }}
                                    </p>
                                    <p
                                        class="text-xs text-blue-600 dark:text-blue-400"
                                    >
                                        vs
                                        {{
                                            personalityData.peerComparison
                                                .performanceComparison?.peers ||
                                            "N/A"
                                        }}
                                        peer avg
                                    </p>
                                </div>
                                <div class="text-center">
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Top 10% Benchmark
                                    </p>
                                    <p
                                        class="text-2xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            personalityData.peerComparison
                                                .performanceComparison?.top10 ||
                                            "N/A"
                                        }}
                                    </p>
                                    <p
                                        class="text-xs text-blue-600 dark:text-blue-400"
                                    >
                                        Elite performers
                                    </p>
                                </div>
                            </div>

                            <!-- Behavioral Comparison -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300 mb-1"
                                    >
                                        Median Hold Time (You vs Peers vs
                                        Optimal)
                                    </p>
                                    <div
                                        class="flex items-center space-x-2 text-sm"
                                    >
                                        <span class="font-medium"
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.holdTime?.user || 0
                                            }}m</span
                                        >
                                        <span class="text-gray-500">vs</span>
                                        <span
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.holdTime?.peers || 0
                                            }}m</span
                                        >
                                        <span class="text-gray-500">vs</span>
                                        <span class="text-green-600 font-medium"
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.holdTime?.optimal || 0
                                            }}m</span
                                        >
                                    </div>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300 mb-1"
                                    >
                                        Frequency (You vs Peers vs Optimal)
                                    </p>
                                    <div
                                        class="flex items-center space-x-2 text-sm"
                                    >
                                        <span class="font-medium"
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.frequency?.user || 0
                                            }}/d</span
                                        >
                                        <span class="text-gray-500">vs</span>
                                        <span
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.frequency?.peers || 0
                                            }}/d</span
                                        >
                                        <span class="text-gray-500">vs</span>
                                        <span class="text-green-600 font-medium"
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.frequency?.optimal || 0
                                            }}/d</span
                                        >
                                    </div>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300 mb-1"
                                    >
                                        Consistency (You vs Peers vs Optimal)
                                    </p>
                                    <div
                                        class="flex items-center space-x-2 text-sm"
                                    >
                                        <span class="font-medium">{{
                                            personalityData.peerComparison
                                                .behaviorComparison?.consistency
                                                ?.user || 0
                                        }}</span>
                                        <span class="text-gray-500">vs</span>
                                        <span>{{
                                            personalityData.peerComparison
                                                .behaviorComparison?.consistency
                                                ?.peers || 0
                                        }}</span>
                                        <span class="text-gray-500">vs</span>
                                        <span
                                            class="text-green-600 font-medium"
                                            >{{
                                                personalityData.peerComparison
                                                    .behaviorComparison
                                                    ?.consistency?.optimal || 0
                                            }}</span
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Behavioral Drift Analysis -->
                        <div
                            v-if="
                                personalityData.driftAnalysis &&
                                personalityData.driftAnalysis.hasDrift
                            "
                            class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6"
                        >
                            <h5
                                class="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-3"
                            >
                                Behavioral Drift Detection
                                <div class="relative group inline-block">
                                    <span
                                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-help"
                                        :class="{
                                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300':
                                                personalityData.driftAnalysis
                                                    .severity === 'high',
                                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300':
                                                personalityData.driftAnalysis
                                                    .severity === 'medium',
                                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300':
                                                personalityData.driftAnalysis
                                                    .severity === 'low',
                                        }"
                                    >
                                        {{
                                            personalityData.driftAnalysis.severity.toUpperCase()
                                        }}
                                    </span>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64"
                                    >
                                        <div class="text-center">
                                            <strong
                                                >Drift Severity Levels</strong
                                            ><br />
                                            <strong>LOW (0-0.4):</strong>
                                            Minor behavioral changes<br />
                                            <strong>MEDIUM (0.4-0.7):</strong>
                                            Noticeable pattern shifts<br />
                                            <strong>HIGH (0.7-1.0):</strong>
                                            Significant behavioral
                                            transformation requiring attention
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                            </h5>

                            <div
                                class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"
                            >
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Personality Shift
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                personalityData.driftAnalysis
                                                    .previousPersonality
                                            }}
                                            →
                                            {{
                                                personalityData.driftAnalysis
                                                    .currentPersonality
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64"
                                    >
                                        <div class="text-center">
                                            <strong>Personality Shift</strong
                                            ><br />
                                            Shows your trading personality type
                                            change between analysis periods.
                                            Even if you're still primarily the
                                            same type (e.g., Scalper), this
                                            indicates if there's been any shift
                                            in your dominant trading behavior.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Drift Score
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                personalityData.driftAnalysis
                                                    .driftScore
                                            }}/1.0
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72"
                                    >
                                        <div class="text-center">
                                            <strong
                                                >Drift Score Explained</strong
                                            ><br />
                                            Overall behavioral change score from
                                            0-1.0. Combines personality shift,
                                            hold time changes, and trading
                                            frequency changes.
                                            <strong
                                                >1.0 means maximum drift
                                                detected</strong
                                            >
                                            - your behavior patterns have
                                            changed significantly even if your
                                            strategy type stayed the same.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Performance Impact
                                        </p>
                                        <p
                                            class="font-medium"
                                            :class="{
                                                'text-green-600 dark:text-green-400':
                                                    personalityData
                                                        .driftAnalysis
                                                        .performanceImpact < 0,
                                                'text-red-600 dark:text-red-400':
                                                    personalityData
                                                        .driftAnalysis
                                                        .performanceImpact > 0,
                                            }"
                                        >
                                            {{
                                                personalityData.driftAnalysis
                                                    .performanceImpact >= 0
                                                    ? "+"
                                                    : ""
                                            }}${{
                                                personalityData.driftAnalysis
                                                    .performanceImpact
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-64"
                                    >
                                        <div class="text-center">
                                            <strong>Performance Impact</strong
                                            ><br />
                                            Estimated financial impact of your
                                            behavioral changes.
                                            <strong>Positive values</strong>
                                            suggest the drift may be hurting
                                            performance, while
                                            <strong>negative values</strong>
                                            suggest it may be helping.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <div
                                v-if="
                                    personalityData.driftAnalysis.driftMetrics
                                "
                                class="grid grid-cols-1 md:grid-cols-3 gap-4"
                            >
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Hold Time Change
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                personalityData.driftAnalysis
                                                    .driftMetrics
                                                    .holdTimeDrift >= 0
                                                    ? "+"
                                                    : ""
                                            }}{{
                                                personalityData.driftAnalysis
                                                    .driftMetrics.holdTimeDrift
                                            }}%
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72"
                                    >
                                        <div class="text-center">
                                            <strong>Hold Time Change</strong
                                            ><br />
                                            Percentage change in how long you
                                            hold trades on average. Large
                                            changes (like going from 10 minutes
                                            to 50 minutes) contribute heavily to
                                            drift score. This measures whether
                                            you're becoming more patient or
                                            impatient with your trades.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Frequency Change
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                personalityData.driftAnalysis
                                                    .driftMetrics
                                                    .frequencyDrift >= 0
                                                    ? "+"
                                                    : ""
                                            }}{{
                                                personalityData.driftAnalysis
                                                    .driftMetrics
                                                    .frequencyDrift
                                            }}%
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72"
                                    >
                                        <div class="text-center">
                                            <strong>Frequency Change</strong
                                            ><br />
                                            Percentage change in how often you
                                            trade per day. Shows if you're
                                            becoming more or less active in your
                                            trading. Significant changes in
                                            trading frequency can indicate
                                            evolving market confidence or
                                            strategy adjustments.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                                <div class="relative group">
                                    <div class="cursor-help">
                                        <p
                                            class="text-sm text-yellow-700 dark:text-yellow-300"
                                        >
                                            Risk Tolerance Change
                                        </p>
                                        <p class="font-medium">
                                            {{
                                                personalityData.driftAnalysis
                                                    .driftMetrics
                                                    .riskToleranceDrift
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 delay-500 z-10 w-72"
                                    >
                                        <div class="text-center">
                                            <strong
                                                >Risk Tolerance Change</strong
                                            ><br />
                                            Change in your risk tolerance level
                                            based on position sizing
                                            consistency. Higher values indicate
                                            you're becoming less consistent with
                                            position sizes, potentially taking
                                            on more varied risk levels per
                                            trade.
                                        </div>
                                        <div
                                            class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Recommendations -->
                        <div
                            v-if="
                                personalityData.recommendations &&
                                personalityData.recommendations.length > 0
                            "
                            class="space-y-4"
                        >
                            <h5
                                class="text-lg font-medium text-gray-700 dark:text-gray-300"
                            >
                                Personalized Recommendations
                            </h5>

                            <div
                                v-for="rec in personalityData.recommendations"
                                :key="rec.type"
                                class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                            >
                                <div class="flex items-start">
                                    <div class="flex-shrink-0">
                                        <span
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                            :class="{
                                                'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300':
                                                    rec.priority === 'high',
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300':
                                                    rec.priority === 'medium',
                                                'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300':
                                                    rec.priority === 'low',
                                            }"
                                        >
                                            {{ rec.priority.toUpperCase() }}
                                        </span>
                                    </div>
                                    <div class="ml-3">
                                        <p
                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                        >
                                            {{ rec.message }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        v-else
                        class="text-center py-8 text-gray-500 dark:text-gray-400"
                    >
                        <p>No trading personality analysis available yet.</p>
                        <p class="text-sm mt-2">
                            Analysis will run automatically when you have enough
                            trade data.
                        </p>
                    </div>
                </div>
            </div>
</template>

<script setup>
import MdiIcon from "@/components/MdiIcon.vue";
import {
    formatPersonalityName,
    formatMinutes,
} from "@/utils/behavioralFormatters";
import { mdiChartBox } from "@mdi/js";

defineProps({
    personalityData: { type: Object, default: null },
    loadingPersonality: { type: Boolean, default: false },
});

defineEmits(["analyze", "view-strategy"]);
</script>
