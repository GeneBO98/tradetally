<template>
            <div class="card">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="heading-card">Overconfidence Indicators</h3>
                        <button
                            @click="$emit('analyze')"
                            :disabled="loadingOverconfidence"
                            class="btn btn-primary btn-sm"
                        >
                            <svg
                                v-if="loadingOverconfidence"
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
                                loadingOverconfidence
                                    ? "Analyzing..."
                                    : "Analyze Overconfidence"
                            }}
                        </button>
                    </div>

                    <div
                        v-if="overconfidenceData && overconfidenceData.analysis"
                        class="relative"
                    >
                        <!-- Loading Overlay -->
                        <div
                            v-if="loadingOverconfidence"
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

                        <!-- Main Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <div
                                class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-yellow-800 dark:text-yellow-300"
                                >
                                    Overconfidence Events
                                </h4>
                                <p
                                    class="text-2xl font-bold text-yellow-900 dark:text-yellow-200"
                                >
                                    {{
                                        overconfidenceData.analysis.statistics
                                            ?.totalEvents || 0
                                    }}
                                </p>
                                <p
                                    class="text-xs text-yellow-700 dark:text-yellow-400"
                                >
                                    Total detected
                                </p>
                            </div>

                            <div
                                class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-red-800 dark:text-red-300"
                                >
                                    Avg Position Increase
                                </h4>
                                <p
                                    class="text-2xl font-bold text-red-900 dark:text-red-200"
                                >
                                    {{
                                        overconfidenceData.analysis.statistics?.avgPositionIncrease?.toFixed(
                                            1,
                                        ) || 0
                                    }}%
                                </p>
                                <p
                                    class="text-xs text-red-700 dark:text-red-400"
                                >
                                    {{ overconfidenceRiskBasisLabel }}
                                </p>
                            </div>

                            <div
                                class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-orange-800 dark:text-orange-300"
                                >
                                    Performance Impact
                                </h4>
                                <p
                                    class="text-2xl font-bold text-orange-900 dark:text-orange-200"
                                >
                                    <span
                                        v-if="
                                            overconfidenceData.analysis
                                                .statistics
                                                ?.performanceImpact >= 0
                                        "
                                        class="text-red-600 dark:text-red-400"
                                    >
                                        -${{
                                            Math.abs(
                                                overconfidenceData.analysis
                                                    .statistics
                                                    ?.performanceImpact || 0,
                                            ).toFixed(2)
                                        }}
                                    </span>
                                    <span
                                        v-else
                                        class="text-green-600 dark:text-green-400"
                                    >
                                        +${{
                                            Math.abs(
                                                overconfidenceData.analysis
                                                    .statistics
                                                    ?.performanceImpact || 0,
                                            ).toFixed(2)
                                        }}
                                    </span>
                                </p>
                                <p
                                    class="text-xs text-orange-700 dark:text-orange-400"
                                >
                                    Net P&L impact
                                </p>
                            </div>

                            <div
                                class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-purple-800 dark:text-purple-300"
                                >
                                    Success Rate
                                </h4>
                                <p
                                    class="text-2xl font-bold text-purple-900 dark:text-purple-200"
                                >
                                    {{
                                        overconfidenceData.analysis.statistics?.successRate?.toFixed(
                                            1,
                                        ) || 0
                                    }}%
                                </p>
                                <p
                                    class="text-xs text-purple-700 dark:text-purple-400"
                                >
                                    Of oversized trades
                                </p>
                            </div>
                        </div>

                        <!-- Win Streak Analysis -->
                        <div
                            v-if="overconfidenceData.analysis.winStreakAnalysis"
                            class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6"
                        >
                            <h4
                                class="text-lg font-medium text-blue-800 dark:text-blue-300 mb-3"
                            >
                                Win Streak Patterns
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Longest Win Streak
                                    </p>
                                    <p
                                        class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            overconfidenceData.analysis
                                                .winStreakAnalysis
                                                .longestStreak || 0
                                        }}
                                        trades
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Avg Streak Length
                                    </p>
                                    <p
                                        class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            overconfidenceData.analysis.winStreakAnalysis.avgStreakLength?.toFixed(
                                                1,
                                            ) || 0
                                        }}
                                        trades
                                    </p>
                                </div>
                                <div>
                                    <p
                                        class="text-sm text-blue-700 dark:text-blue-300"
                                    >
                                        Position Size Growth
                                    </p>
                                    <p
                                        class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                    >
                                        {{
                                            overconfidenceData.analysis.winStreakAnalysis.avgPositionGrowth?.toFixed(
                                                1,
                                            ) || 0
                                        }}%
                                    </p>
                                    <p
                                        class="mt-1 text-xs text-primary-700 dark:text-primary-300"
                                    >
                                        {{ overconfidenceRiskBasisLabel }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Overconfidence Events List -->
                        <div
                            v-if="
                                overconfidenceData.analysis.events &&
                                overconfidenceData.analysis.events.length > 0
                            "
                            class="space-y-4"
                        >
                            <h4
                                class="text-lg font-medium text-gray-700 dark:text-gray-300"
                            >
                                Recent Overconfidence Events
                            </h4>

                            <div
                                v-for="event in overconfidenceData.analysis.events.slice(
                                    0,
                                    5,
                                )"
                                :key="event.id"
                                class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                            >
                                <div
                                    class="flex justify-between items-start mb-3"
                                >
                                    <div>
                                        <h5
                                            class="font-medium text-gray-900 dark:text-white flex items-center"
                                        >
                                            <MdiIcon
                                                :icon="mdiFire"
                                                :size="18"
                                                class="mr-1.5 text-red-600"
                                            />
                                            {{ event.winStreakLength }}
                                            Consecutive Wins → Overconfidence
                                            Risk
                                        </h5>
                                        <p
                                            class="text-sm text-gray-500 dark:text-gray-400"
                                        >
                                            {{
                                                new Date(
                                                    event.detectionDate,
                                                ).toLocaleDateString()
                                            }}
                                            •
                                            <span class="font-medium">{{
                                                (event.streakTradeDetails || [])
                                                    .map((t) => t.symbol)
                                                    .join(", ")
                                            }}</span>
                                        </p>
                                    </div>
                                    <div class="text-right">
                                        <span
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                            :class="{
                                                'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300':
                                                    event.severity === 'high',
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300':
                                                    event.severity === 'medium',
                                                'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300':
                                                    event.severity === 'low',
                                            }"
                                        >
                                            {{ event.severity.toUpperCase() }}
                                            RISK
                                        </span>
                                    </div>
                                </div>

                                <!-- Position Size Analysis -->
                                <div
                                    class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 mb-4"
                                >
                                    <h6
                                        class="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2"
                                    >
                                        Position Risk Escalation
                                    </h6>
                                    <p
                                        class="mb-2 text-xs text-orange-700 dark:text-orange-400"
                                    >
                                        Based on
                                        {{
                                            formatRiskBasisLabel(
                                                event.riskBasis?.peak?.basis,
                                            )
                                        }}
                                    </p>
                                    <div class="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <span
                                                class="text-orange-700 dark:text-orange-400"
                                                >Baseline Size:</span
                                            >
                                            <span class="font-medium ml-1"
                                                >${{
                                                    (
                                                        event.baselinePositionSize ||
                                                        0
                                                    ).toLocaleString()
                                                }}</span
                                            >
                                        </div>
                                        <div>
                                            <span
                                                class="text-orange-700 dark:text-orange-400"
                                                >Peak Size:</span
                                            >
                                            <span class="font-medium ml-1"
                                                >${{
                                                    (
                                                        event.peakPositionSize ||
                                                        0
                                                    ).toLocaleString()
                                                }}</span
                                            >
                                        </div>
                                    </div>
                                    <div
                                        class="mt-2 text-xs text-orange-700 dark:text-orange-400 flex items-start"
                                    >
                                        <MdiIcon
                                            :icon="mdiTrendingUp"
                                            :size="14"
                                            class="mr-1 mt-0.5 flex-shrink-0"
                                        />
                                        <span
                                            >Position increased by
                                            <span class="font-bold"
                                                >{{
                                                    event.positionSizeIncrease?.toFixed(
                                                        1,
                                                    ) || 0
                                                }}%</span
                                            >
                                            (from ${{
                                                (
                                                    event.baselinePositionSize ||
                                                    0
                                                ).toLocaleString()
                                            }}
                                            baseline to ${{
                                                (
                                                    event.peakPositionSize || 0
                                                ).toLocaleString()
                                            }}
                                            peak)</span
                                        >
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm"
                                >
                                    <div>
                                        <p
                                            class="text-gray-500 dark:text-gray-400"
                                        >
                                            Streak P&L
                                        </p>
                                        <p
                                            class="font-medium"
                                            :class="{
                                                'text-green-600 dark:text-green-400':
                                                    parseFloat(
                                                        event.streakPnl || 0,
                                                    ) > 0,
                                                'text-red-600 dark:text-red-400':
                                                    parseFloat(
                                                        event.streakPnl || 0,
                                                    ) < 0,
                                                'text-gray-600 dark:text-gray-400':
                                                    parseFloat(
                                                        event.streakPnl || 0,
                                                    ) === 0,
                                            }"
                                        >
                                            {{
                                                parseFloat(
                                                    event.streakPnl || 0,
                                                ) >= 0
                                                    ? "+"
                                                    : ""
                                            }}${{
                                                parseFloat(
                                                    event.streakPnl || 0,
                                                ).toFixed(2)
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-gray-500 dark:text-gray-400"
                                        >
                                            Next Trade Result
                                        </p>
                                        <p
                                            class="font-medium"
                                            :class="{
                                                'text-green-600 dark:text-green-400':
                                                    parseFloat(
                                                        event.subsequentTradeResult ||
                                                            0,
                                                    ) > 0,
                                                'text-red-600 dark:text-red-400':
                                                    parseFloat(
                                                        event.subsequentTradeResult ||
                                                            0,
                                                    ) < 0,
                                                'text-gray-600 dark:text-gray-400':
                                                    parseFloat(
                                                        event.subsequentTradeResult ||
                                                            0,
                                                    ) === 0,
                                            }"
                                        >
                                            {{
                                                parseFloat(
                                                    event.subsequentTradeResult ||
                                                        0,
                                                ) >= 0
                                                    ? "+"
                                                    : ""
                                            }}${{
                                                parseFloat(
                                                    event.subsequentTradeResult ||
                                                        0,
                                                ).toFixed(2)
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-gray-500 dark:text-gray-400"
                                        >
                                            Total Impact
                                        </p>
                                        <p
                                            class="font-medium"
                                            :class="{
                                                'text-green-600 dark:text-green-400':
                                                    parseFloat(
                                                        event.totalImpact || 0,
                                                    ) > 0,
                                                'text-red-600 dark:text-red-400':
                                                    parseFloat(
                                                        event.totalImpact || 0,
                                                    ) < 0,
                                                'text-gray-600 dark:text-gray-400':
                                                    parseFloat(
                                                        event.totalImpact || 0,
                                                    ) === 0,
                                            }"
                                        >
                                            {{
                                                parseFloat(
                                                    event.totalImpact || 0,
                                                ) >= 0
                                                    ? "+"
                                                    : ""
                                            }}${{
                                                parseFloat(
                                                    event.totalImpact || 0,
                                                ).toFixed(2)
                                            }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Outcome Trade After Streak -->
                                <div
                                    v-if="event.outcomeTradeDetails"
                                    class="mt-4 p-4 rounded-lg border-2"
                                    :class="{
                                        'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800':
                                            parseFloat(
                                                event.outcomeTradeDetails.pnl ||
                                                    0,
                                            ) < 0,
                                        'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800':
                                            parseFloat(
                                                event.outcomeTradeDetails.pnl ||
                                                    0,
                                            ) > 0,
                                        'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800':
                                            parseFloat(
                                                event.outcomeTradeDetails.pnl ||
                                                    0,
                                            ) === 0,
                                    }"
                                >
                                    <div class="flex items-center mb-3">
                                        <MdiIcon
                                            :icon="
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) < 0
                                                    ? mdiClose
                                                    : mdiCheck
                                            "
                                            :size="20"
                                            class="mr-2"
                                            :class="{
                                                'text-red-600':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) < 0,
                                                'text-green-600':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) > 0,
                                                'text-gray-600':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) === 0,
                                            }"
                                        />
                                        <h6
                                            class="text-sm font-semibold"
                                            :class="{
                                                'text-red-900 dark:text-red-200':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) < 0,
                                                'text-green-900 dark:text-green-200':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) > 0,
                                                'text-gray-900 dark:text-gray-200':
                                                    parseFloat(
                                                        event
                                                            .outcomeTradeDetails
                                                            .pnl || 0,
                                                    ) === 0,
                                            }"
                                        >
                                            Trade Taken After
                                            {{ event.winStreakLength }}-Win
                                            Streak
                                        </h6>
                                    </div>

                                    <div
                                        class="bg-white dark:bg-gray-800 rounded-md p-3"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-2"
                                        >
                                            <div>
                                                <p
                                                    class="font-semibold text-gray-900 dark:text-white"
                                                >
                                                    {{
                                                        event
                                                            .outcomeTradeDetails
                                                            .symbol
                                                    }}
                                                </p>
                                                <p
                                                    class="text-xs text-gray-500 dark:text-gray-400"
                                                >
                                                    {{
                                                        new Date(
                                                            event
                                                                .outcomeTradeDetails
                                                                .entry_time,
                                                        ).toLocaleDateString()
                                                    }}
                                                    •
                                                    {{
                                                        event.outcomeTradeDetails.side?.toUpperCase()
                                                    }}
                                                    {{
                                                        event
                                                            .outcomeTradeDetails
                                                            .quantity
                                                    }}
                                                    {{
                                                        event.outcomeTradeDetails
                                                            .instrument_type ===
                                                        "option"
                                                            ? "contracts"
                                                            : "shares"
                                                    }}
                                                </p>
                                            </div>
                                            <div class="text-right">
                                                <p
                                                    class="text-lg font-bold"
                                                    :class="{
                                                        'text-red-600 dark:text-red-400':
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .pnl || 0,
                                                            ) < 0,
                                                        'text-green-600 dark:text-green-400':
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .pnl || 0,
                                                            ) > 0,
                                                        'text-gray-600 dark:text-gray-400':
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .pnl || 0,
                                                            ) === 0,
                                                    }"
                                                >
                                                    {{
                                                        parseFloat(
                                                            event
                                                                .outcomeTradeDetails
                                                                .pnl || 0,
                                                        ) >= 0
                                                            ? "+"
                                                            : ""
                                                    }}${{
                                                        parseFloat(
                                                            event
                                                                .outcomeTradeDetails
                                                                .pnl || 0,
                                                        ).toFixed(2)
                                                    }}
                                                </p>
                                                <p
                                                    class="text-xs text-gray-500 dark:text-gray-400"
                                                >
                                                    P&L
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                                        >
                                            <div>
                                                <p
                                                    class="text-gray-500 dark:text-gray-400"
                                                >
                                                    Entry Price
                                                </p>
                                                <p class="font-medium">
                                                    ${{
                                                        parseFloat(
                                                            event
                                                                .outcomeTradeDetails
                                                                .entry_price ||
                                                                0,
                                                        ).toFixed(2)
                                                    }}
                                                </p>
                                            </div>
                                            <div>
                                                <p
                                                    class="text-gray-500 dark:text-gray-400"
                                                >
                                                    Exit Price
                                                </p>
                                                <p class="font-medium">
                                                    ${{
                                                        parseFloat(
                                                            event
                                                                .outcomeTradeDetails
                                                                .exit_price ||
                                                                0,
                                                        ).toFixed(2)
                                                    }}
                                                </p>
                                            </div>
                                            <div>
                                                <p
                                                    class="text-gray-500 dark:text-gray-400"
                                                >
                                                    Position Size
                                                </p>
                                                <p class="font-medium">
                                                    ${{
                                                        (
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .position_size ||
                                                                    0,
                                                            )
                                                        ).toLocaleString()
                                                    }}
                                                </p>
                                            </div>
                                            <div>
                                                <p
                                                    class="text-gray-500 dark:text-gray-400"
                                                >
                                                    Fees
                                                </p>
                                                <p class="font-medium">
                                                    ${{
                                                        (
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .commission ||
                                                                    0,
                                                            ) +
                                                            parseFloat(
                                                                event
                                                                    .outcomeTradeDetails
                                                                    .fees || 0,
                                                            )
                                                        ).toFixed(2)
                                                    }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        class="mt-3 text-xs flex items-start"
                                        :class="{
                                            'text-red-800 dark:text-red-200':
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) < 0,
                                            'text-green-800 dark:text-green-200':
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) > 0,
                                            'text-gray-800 dark:text-gray-200':
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) === 0,
                                        }"
                                    >
                                        <MdiIcon
                                            :icon="mdiLightningBolt"
                                            :size="14"
                                            class="mr-1.5 mt-0.5 flex-shrink-0"
                                        />
                                        <p
                                            v-if="
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) < 0
                                            "
                                        >
                                            <strong>What happened:</strong>
                                            After
                                            {{ event.winStreakLength }}
                                            consecutive wins, overconfidence led
                                            to
                                            <span
                                                v-if="
                                                    event.positionSizeIncrease >
                                                    0
                                                "
                                                >a
                                                {{
                                                    event.positionSizeIncrease.toFixed(
                                                        1,
                                                    )
                                                }}% larger position size</span
                                            >
                                            <span v-else
                                                >risky trading decisions</span
                                            >
                                            that resulted in this losing trade,
                                            giving back
                                            <strong
                                                >${{
                                                    Math.abs(
                                                        parseFloat(
                                                            event
                                                                .outcomeTradeDetails
                                                                .pnl || 0,
                                                        ),
                                                    ).toFixed(2)
                                                }}</strong
                                            >
                                            of the streak's profits.
                                        </p>
                                        <p
                                            v-else-if="
                                                parseFloat(
                                                    event.outcomeTradeDetails
                                                        .pnl || 0,
                                                ) > 0
                                            "
                                        >
                                            <strong>Lucky break:</strong>
                                            After
                                            {{ event.winStreakLength }}
                                            consecutive wins,
                                            <span
                                                v-if="
                                                    event.positionSizeIncrease >
                                                    0
                                                "
                                                >the
                                                {{
                                                    event.positionSizeIncrease.toFixed(
                                                        1,
                                                    )
                                                }}% larger position size</span
                                            >
                                            <span v-else
                                                >the elevated confidence</span
                                            >
                                            resulted in a winning trade.
                                            However, this reinforces
                                            overconfidence and increases future
                                            risk.
                                        </p>
                                        <p v-else>
                                            <strong>Break even:</strong> The
                                            trade after the
                                            {{ event.winStreakLength }}-win
                                            streak resulted in no gain or loss.
                                        </p>
                                    </div>

                                    <!-- Detailed Outcome Analysis -->
                                    <div
                                        v-if="
                                            event.outcomeAnalysis &&
                                            event.outcomeAnalysis.verdict
                                        "
                                        class="mt-4 p-3 rounded-lg border-2"
                                        :class="{
                                            'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700':
                                                event.outcomeAnalysis.verdict
                                                    .verdict ===
                                                'true_overconfidence',
                                            'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700':
                                                event.outcomeAnalysis.verdict
                                                    .verdict ===
                                                'partial_overconfidence',
                                            'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700':
                                                event.outcomeAnalysis.verdict
                                                    .verdict ===
                                                'prudent_trade',
                                            'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700':
                                                event.outcomeAnalysis.verdict
                                                    .verdict === 'bad_luck',
                                        }"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-2"
                                        >
                                            <h6
                                                class="text-sm font-bold flex items-center"
                                                :class="{
                                                    'text-red-900 dark:text-red-200':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'true_overconfidence',
                                                    'text-orange-900 dark:text-orange-200':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'partial_overconfidence',
                                                    'text-green-900 dark:text-green-200':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'prudent_trade',
                                                    'text-gray-900 dark:text-gray-200':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'bad_luck',
                                                }"
                                            >
                                                <MdiIcon
                                                    :icon="
                                                        event.outcomeAnalysis
                                                            .verdict
                                                            .isOverconfidence
                                                            ? mdiClose
                                                            : mdiCheck
                                                    "
                                                    :size="16"
                                                    class="mr-1.5"
                                                />
                                                Trade Analysis:
                                                {{
                                                    event.outcomeAnalysis
                                                        .verdict.verdictLabel
                                                }}
                                            </h6>
                                            <div
                                                class="text-xs font-semibold px-2 py-1 rounded"
                                                :class="{
                                                    'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'true_overconfidence',
                                                    'bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'partial_overconfidence',
                                                    'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'prudent_trade',
                                                    'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100':
                                                        event.outcomeAnalysis
                                                            .verdict.verdict ===
                                                        'bad_luck',
                                                }"
                                            >
                                                Score:
                                                {{
                                                    event.outcomeAnalysis
                                                        .verdict
                                                        .overconfidenceScore
                                                }}/{{
                                                    event.outcomeAnalysis
                                                        .verdict.maxScore
                                                }}
                                            </div>
                                        </div>

                                        <p
                                            class="text-xs mb-3"
                                            :class="{
                                                'text-red-800 dark:text-red-200':
                                                    event.outcomeAnalysis
                                                        .verdict.verdict ===
                                                    'true_overconfidence',
                                                'text-orange-800 dark:text-orange-200':
                                                    event.outcomeAnalysis
                                                        .verdict.verdict ===
                                                    'partial_overconfidence',
                                                'text-green-800 dark:text-green-200':
                                                    event.outcomeAnalysis
                                                        .verdict.verdict ===
                                                    'prudent_trade',
                                                'text-gray-800 dark:text-gray-200':
                                                    event.outcomeAnalysis
                                                        .verdict.verdict ===
                                                    'bad_luck',
                                            }"
                                        >
                                            {{
                                                event.outcomeAnalysis.verdict
                                                    .recommendation
                                            }}
                                        </p>

                                        <!-- Issues Found -->
                                        <div
                                            v-if="
                                                event.outcomeAnalysis.verdict
                                                    .reasons &&
                                                event.outcomeAnalysis.verdict
                                                    .reasons.length > 0
                                            "
                                            class="mb-2"
                                        >
                                            <p
                                                class="text-xs font-semibold text-red-900 dark:text-red-200 mb-1"
                                            >
                                                Issues Found:
                                            </p>
                                            <ul class="text-xs space-y-1">
                                                <li
                                                    v-for="(
                                                        reason, idx
                                                    ) in event.outcomeAnalysis
                                                        .verdict.reasons"
                                                    :key="idx"
                                                    class="flex items-start"
                                                >
                                                    <span
                                                        class="text-red-600 mr-1.5"
                                                        >•</span
                                                    >
                                                    <span
                                                        class="text-red-800 dark:text-red-300"
                                                        >{{ reason }}</span
                                                    >
                                                </li>
                                            </ul>
                                        </div>

                                        <!-- Positive Factors -->
                                        <div
                                            v-if="
                                                event.outcomeAnalysis.verdict
                                                    .positiveFactors &&
                                                event.outcomeAnalysis.verdict
                                                    .positiveFactors.length > 0
                                            "
                                        >
                                            <p
                                                class="text-xs font-semibold text-green-900 dark:text-green-200 mb-1"
                                            >
                                                What Went Well:
                                            </p>
                                            <ul class="text-xs space-y-1">
                                                <li
                                                    v-for="(
                                                        factor, idx
                                                    ) in event.outcomeAnalysis
                                                        .verdict
                                                        .positiveFactors"
                                                    :key="idx"
                                                    class="flex items-start"
                                                >
                                                    <CheckIcon
                                                        class="h-4 w-4 text-green-600 mr-1.5 mt-0.5 shrink-0"
                                                    />
                                                    <span
                                                        class="text-green-800 dark:text-green-300"
                                                        >{{ factor }}</span
                                                    >
                                                </li>
                                            </ul>
                                        </div>

                                        <!-- Detailed Analysis Sections -->
                                        <div
                                            v-if="
                                                event.outcomeAnalysis
                                                    .stopLossAnalysis
                                            "
                                            class="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600"
                                        >
                                            <p
                                                class="text-xs font-semibold mb-2"
                                            >
                                                Stop Loss Analysis:
                                            </p>
                                            <div
                                                class="grid grid-cols-2 gap-2 text-xs"
                                            >
                                                <div>
                                                    <p
                                                        class="text-gray-600 dark:text-gray-400"
                                                    >
                                                        Recommended Stop:
                                                    </p>
                                                    <p class="font-medium">
                                                        {{
                                                            event
                                                                .outcomeAnalysis
                                                                .stopLossAnalysis
                                                                .recommendedStopLoss
                                                                ? `$${event.outcomeAnalysis.stopLossAnalysis.recommendedStopLoss.toFixed(2)}`
                                                                : "N/A"
                                                        }}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p
                                                        class="text-gray-600 dark:text-gray-400"
                                                    >
                                                        Adherence:
                                                    </p>
                                                    <p
                                                        class="font-medium capitalize"
                                                        :class="{
                                                            'text-green-600':
                                                                event
                                                                    .outcomeAnalysis
                                                                    .stopLossAnalysis
                                                                    .adherenceRating ===
                                                                'good',
                                                            'text-red-600':
                                                                event
                                                                    .outcomeAnalysis
                                                                    .stopLossAnalysis
                                                                    .adherenceRating ===
                                                                'poor',
                                                            'text-gray-600':
                                                                event
                                                                    .outcomeAnalysis
                                                                    .stopLossAnalysis
                                                                    .adherenceRating ===
                                                                'none',
                                                        }"
                                                    >
                                                        {{
                                                            event
                                                                .outcomeAnalysis
                                                                .stopLossAnalysis
                                                                .adherenceRating
                                                        }}
                                                    </p>
                                                </div>
                                            </div>
                                            <p
                                                v-if="
                                                    event.outcomeAnalysis
                                                        .stopLossAnalysis
                                                        .heldPastStopLoss
                                                "
                                                class="text-xs text-red-700 dark:text-red-300 mt-2"
                                            >
                                                Additional loss from not
                                                respecting stop: ${{
                                                    event.outcomeAnalysis.stopLossAnalysis.additionalLoss.toFixed(
                                                        2,
                                                    )
                                                }}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    v-if="
                                        event.recommendations &&
                                        event.recommendations.length > 0
                                    "
                                    class="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                                >
                                    <p
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                    >
                                        Recommendations:
                                    </p>
                                    <ul
                                        class="text-sm text-gray-600 dark:text-gray-400 space-y-1"
                                    >
                                        <li
                                            v-for="rec in event.recommendations"
                                            :key="rec"
                                            class="flex items-start"
                                        >
                                            <span class="text-blue-500 mr-1"
                                                >•</span
                                            >
                                            {{ rec }}
                                        </li>
                                    </ul>
                                </div>

                                <!-- Win Streak Trades Details -->
                                <div
                                    class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4"
                                >
                                    <div
                                        class="flex items-center justify-between mb-3"
                                    >
                                        <div>
                                            <h6
                                                class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                                            >
                                                <MdiIcon
                                                    :icon="mdiTrophy"
                                                    :size="16"
                                                    class="mr-1.5 text-yellow-600"
                                                />
                                                The
                                                {{ event.winStreakLength }}
                                                Consecutive Winning Positions
                                            </h6>
                                            <p
                                                class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                            >
                                                These
                                                {{ event.winStreakLength }}
                                                completed winning positions led
                                                to escalating risk as confidence
                                                grew
                                            </p>
                                        </div>
                                        <button
                                            @click="
                                                $emit('toggle-event', 
                                                    event.id,
                                                )
                                            "
                                            class="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors flex items-center space-x-1"
                                        >
                                            <span>{{
                                                expandedOverconfidenceEvents.has(
                                                    event.id,
                                                )
                                                    ? "Hide Details"
                                                    : "Show Details"
                                            }}</span>
                                            <svg
                                                class="w-3 h-3 transition-transform"
                                                :class="{
                                                    'rotate-180':
                                                        expandedOverconfidenceEvents.has(
                                                            event.id,
                                                        ),
                                                }"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M19 9l-7 7-7-7"
                                                ></path>
                                            </svg>
                                        </button>
                                    </div>

                                    <div
                                        v-if="
                                            expandedOverconfidenceEvents.has(
                                                event.id,
                                            )
                                        "
                                        class="space-y-2"
                                    >
                                        <div
                                            v-if="
                                                !event.streakTradeDetails ||
                                                event.streakTradeDetails
                                                    .length === 0
                                            "
                                            class="text-sm text-gray-500 dark:text-gray-400 italic"
                                        >
                                            Loading position details...
                                        </div>
                                        <div v-else>
                                            <div
                                                v-for="(
                                                    trade, index
                                                ) in event.streakTradeDetails"
                                                :key="trade.id"
                                                class="flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors"
                                                :class="{
                                                    'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/20':
                                                        parseFloat(trade.pnl) >
                                                        0,
                                                    'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/20':
                                                        parseFloat(trade.pnl) <
                                                        0,
                                                    'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600':
                                                        parseFloat(
                                                            trade.pnl,
                                                        ) === 0,
                                                }"
                                                @click="$emit('open-trade', trade.id)"
                                            >
                                                <div
                                                    class="flex items-center space-x-3"
                                                >
                                                    <div
                                                        class="flex items-center space-x-1"
                                                    >
                                                        <span
                                                            class="text-xs font-medium px-1.5 py-0.5 rounded"
                                                            :class="{
                                                                'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300':
                                                                    index === 0,
                                                                'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300':
                                                                    index > 0 &&
                                                                    index <
                                                                        event.winStreakLength -
                                                                            1,
                                                                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300':
                                                                    index ===
                                                                    event.winStreakLength -
                                                                        1,
                                                            }"
                                                        >
                                                            Win #{{ index + 1 }}
                                                        </span>
                                                        <span
                                                            class="font-medium text-gray-900 dark:text-white"
                                                            >{{
                                                                trade.symbol
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div
                                                        class="text-xs text-gray-500 dark:text-gray-400"
                                                    >
                                                        {{
                                                            new Date(
                                                                trade.entry_time,
                                                            ).toLocaleDateString()
                                                        }}
                                                    </div>
                                                </div>

                                                <div
                                                    class="flex items-center space-x-4 text-xs"
                                                >
                                                    <div class="text-right">
                                                        <div
                                                            class="text-gray-500 dark:text-gray-400"
                                                        >
                                                            Position Risk
                                                        </div>
                                                        <div
                                                            class="flex items-center space-x-1"
                                                        >
                                                            <span
                                                                class="font-medium"
                                                                >${{
                                                                    (
                                                                        parseFloat(
                                                                            trade.position_size,
                                                                        ) || 0
                                                                    ).toLocaleString()
                                                                }}</span
                                                            >
                                                            <span
                                                                v-if="
                                                                    trade.position_risk_basis ||
                                                                    trade
                                                                        .position_risk
                                                                        ?.basis
                                                                "
                                                                class="text-gray-400 dark:text-gray-500"
                                                            >
                                                                {{
                                                                    formatRiskBasisLabel(
                                                                        trade.position_risk_basis ||
                                                                            trade
                                                                                .position_risk
                                                                                ?.basis,
                                                                    )
                                                                }}
                                                            </span>
                                                            <span
                                                                v-if="
                                                                    index > 0 &&
                                                                    event
                                                                        .streakTradeDetails[
                                                                        index -
                                                                            1
                                                                    ]
                                                                "
                                                                class="text-xs px-1 py-0.5 rounded"
                                                                :class="{
                                                                    'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400':
                                                                        parseFloat(
                                                                            trade.position_size,
                                                                        ) >
                                                                        parseFloat(
                                                                            event
                                                                                .streakTradeDetails[
                                                                                index -
                                                                                    1
                                                                            ]
                                                                                .position_size,
                                                                        ),
                                                                    'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400':
                                                                        parseFloat(
                                                                            trade.position_size,
                                                                        ) <
                                                                        parseFloat(
                                                                            event
                                                                                .streakTradeDetails[
                                                                                index -
                                                                                    1
                                                                            ]
                                                                                .position_size,
                                                                        ),
                                                                }"
                                                            >
                                                                {{
                                                                    parseFloat(
                                                                        trade.position_size,
                                                                    ) >
                                                                    parseFloat(
                                                                        event
                                                                            .streakTradeDetails[
                                                                            index -
                                                                                1
                                                                        ]
                                                                            .position_size,
                                                                    )
                                                                        ? "+"
                                                                        : ""
                                                                }}{{
                                                                    (
                                                                        ((parseFloat(
                                                                            trade.position_size,
                                                                        ) -
                                                                            parseFloat(
                                                                                event
                                                                                    .streakTradeDetails[
                                                                                    index -
                                                                                        1
                                                                                ]
                                                                                    .position_size,
                                                                            )) /
                                                                            parseFloat(
                                                                                event
                                                                                    .streakTradeDetails[
                                                                                    index -
                                                                                        1
                                                                                ]
                                                                                    .position_size,
                                                                            )) *
                                                                        100
                                                                    ).toFixed(
                                                                        0,
                                                                    )
                                                                }}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div class="text-right">
                                                        <div
                                                            class="text-gray-500 dark:text-gray-400"
                                                        >
                                                            P&L
                                                        </div>
                                                        <div
                                                            class="font-medium"
                                                            :class="{
                                                                'text-green-600 dark:text-green-400':
                                                                    parseFloat(
                                                                        trade.pnl,
                                                                    ) > 0,
                                                                'text-red-600 dark:text-red-400':
                                                                    parseFloat(
                                                                        trade.pnl,
                                                                    ) < 0,
                                                                'text-gray-600 dark:text-gray-400':
                                                                    parseFloat(
                                                                        trade.pnl,
                                                                    ) === 0,
                                                            }"
                                                        >
                                                            {{
                                                                parseFloat(
                                                                    trade.pnl,
                                                                ) >= 0
                                                                    ? "+"
                                                                    : ""
                                                            }}${{
                                                                parseFloat(
                                                                    trade.pnl ||
                                                                        0,
                                                                ).toFixed(2)
                                                            }}
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="text-blue-500 hover:text-blue-600"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                            ></path>
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

                    <div
                        v-else
                        class="text-center py-8 text-gray-500 dark:text-gray-400"
                    >
                        <p>No overconfidence analysis available yet.</p>
                        <p class="text-sm mt-2">
                            Click "Analyze Overconfidence" to detect win streak
                            patterns.
                        </p>
                    </div>
                </div>
            </div>
</template>

<script setup>
import { computed } from "vue";
import { CheckIcon } from "@heroicons/vue/24/outline";
import MdiIcon from "@/components/MdiIcon.vue";
import { formatRiskBasisLabel } from "@/utils/behavioralFormatters";
import {
    mdiTrendingUp,
    mdiClose,
    mdiCheck,
    mdiLightningBolt,
    mdiFire,
    mdiTrophy,
} from "@mdi/js";

const props = defineProps({
    overconfidenceData: { type: Object, default: null },
    loadingOverconfidence: { type: Boolean, default: false },
    expandedOverconfidenceEvents: { type: Object, default: () => new Set() },
});

defineEmits(["analyze", "toggle-event", "open-trade"]);

const overconfidenceRiskBasisLabel = computed(() => {
    const eventWithBasis = props.overconfidenceData?.analysis?.events?.find(
        (event) => event.riskBasis?.peak?.basis,
    );
    if (eventWithBasis) {
        return `Based on ${formatRiskBasisLabel(eventWithBasis.riskBasis.peak.basis)}`;
    }
    return "Based on position size fallback";
});
</script>
