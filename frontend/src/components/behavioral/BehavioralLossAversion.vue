<template>
            <div class="card">
                <div class="card-body">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h3 class="heading-card">
                                Loss Aversion Behavior Analysis
                            </h3>
                            <p
                                class="text-sm text-gray-500 dark:text-gray-400 mt-1"
                            >
                                Identifies psychological patterns: Do you hold
                                losers too long and exit winners too early?
                            </p>
                        </div>
                        <button
                            @click="$emit('analyze')"
                            :disabled="loadingLossAversion"
                            class="btn btn-primary btn-sm"
                        >
                            <svg
                                v-if="loadingLossAversion"
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
                                loadingLossAversion
                                    ? "Analyzing..."
                                    : "Analyze Exit Patterns"
                            }}
                        </button>
                    </div>

                    <div v-if="lossAversionData && lossAversionData.analysis">
                        <!-- Main Insight Message -->
                        <div
                            v-if="lossAversionData.analysis.message"
                            class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6"
                        >
                            <div class="flex">
                                <div class="flex-shrink-0">
                                    <svg
                                        class="h-5 w-5 text-yellow-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                    </svg>
                                </div>
                                <div class="ml-3">
                                    <p
                                        class="text-sm font-medium text-yellow-800 dark:text-yellow-300"
                                    >
                                        {{ lossAversionData.analysis.message }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Hold Time Comparison -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div
                                class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-green-800 dark:text-green-300"
                                >
                                    Winners Hold Time
                                </h4>
                                <p
                                    class="text-2xl font-bold text-green-900 dark:text-green-200"
                                >
                                    {{
                                        formatMinutes(
                                            lossAversionData.analysis
                                                .avgWinnerHoldTime,
                                        )
                                    }}
                                </p>
                                <p
                                    class="text-xs text-green-700 dark:text-green-400"
                                >
                                    Average
                                </p>
                            </div>

                            <div
                                class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-red-800 dark:text-red-300"
                                >
                                    Losers Hold Time
                                </h4>
                                <p
                                    class="text-2xl font-bold text-red-900 dark:text-red-200"
                                >
                                    {{
                                        formatMinutes(
                                            lossAversionData.analysis
                                                .avgLoserHoldTime,
                                        )
                                    }}
                                </p>
                                <p
                                    class="text-xs text-red-700 dark:text-red-400"
                                >
                                    Average
                                </p>
                            </div>

                            <div
                                class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4"
                            >
                                <h4
                                    class="text-sm font-medium text-purple-800 dark:text-purple-300"
                                >
                                    Hold Time Ratio
                                </h4>
                                <p
                                    class="text-2xl font-bold text-purple-900 dark:text-purple-200"
                                >
                                    {{
                                        lossAversionData.analysis.holdTimeRatio.toFixed(
                                            2,
                                        )
                                    }}x
                                </p>
                                <p
                                    class="text-xs text-purple-700 dark:text-purple-400"
                                >
                                    Losers vs Winners
                                </p>
                            </div>
                        </div>

                        <!-- Financial Impact -->
                        <div
                            class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6"
                        >
                            <h4
                                class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
                            >
                                Financial Impact
                            </h4>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span
                                        class="text-sm text-gray-600 dark:text-gray-400"
                                        >Estimated Monthly Cost:</span
                                    >
                                    <span
                                        class="text-sm font-medium text-red-600 dark:text-red-400"
                                    >
                                        ${{
                                            lossAversionData.analysis.financialImpact.estimatedMonthlyCost.toFixed(
                                                2,
                                            )
                                        }}
                                    </span>
                                </div>
                                <div class="flex justify-between">
                                    <span
                                        class="text-sm text-gray-600 dark:text-gray-400"
                                        >Missed Profit Potential:</span
                                    >
                                    <span
                                        class="text-sm font-medium text-yellow-600 dark:text-yellow-400"
                                    >
                                        ${{
                                            lossAversionData.analysis.financialImpact.missedProfitPotential.toFixed(
                                                2,
                                            )
                                        }}
                                    </span>
                                </div>
                                <div class="flex justify-between">
                                    <span
                                        class="text-sm text-gray-600 dark:text-gray-400"
                                        >Extended Loss Costs:</span
                                    >
                                    <span
                                        class="text-sm font-medium text-red-600 dark:text-red-400"
                                    >
                                        ${{
                                            lossAversionData.analysis.financialImpact.unnecessaryLossExtension.toFixed(
                                                2,
                                            )
                                        }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Risk/Reward Analysis -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <h4
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    Planned Risk/Reward
                                </h4>
                                <p
                                    class="text-lg font-semibold text-gray-900 dark:text-white"
                                >
                                    1:{{
                                        lossAversionData.analysis.financialImpact.avgPlannedRiskReward.toFixed(
                                            2,
                                        )
                                    }}
                                </p>
                            </div>
                            <div>
                                <h4
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    Actual Risk/Reward
                                </h4>
                                <p
                                    class="text-lg font-semibold text-gray-900 dark:text-white"
                                >
                                    1:{{
                                        lossAversionData.analysis.financialImpact.avgActualRiskReward.toFixed(
                                            2,
                                        )
                                    }}
                                </p>
                            </div>
                        </div>

                        <!-- Price History Analysis Examples -->
                        <div
                            v-if="
                                lossAversionData.analysis.priceHistoryAnalysis
                                    ?.exampleTrades?.length > 0
                            "
                            class="mt-6"
                        >
                            <div class="flex items-center justify-between mb-4">
                                <h4
                                    class="text-lg font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Trades That Could Have Been More Profitable
                                </h4>
                                <div class="flex space-x-2">
                                    <button
                                        @click="$emit('scroll-to-missed')"
                                        class="px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 flex items-center"
                                    >
                                        <MdiIcon
                                            :icon="mdiTarget"
                                            :size="16"
                                            class="mr-1"
                                        />
                                        View Specific Trades You Exited Early
                                    </button>
                                    <button
                                        @click="$emit('view-trades')"
                                        class="px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                    >
                                        View All
                                        {{
                                            lossAversionData.analysis
                                                .priceHistoryAnalysis
                                                .exampleTrades.length
                                        }}
                                        Trades
                                    </button>
                                </div>
                            </div>

                            <div
                                class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4"
                            >
                                <div
                                    class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center"
                                >
                                    <div>
                                        <p
                                            class="text-sm text-blue-700 dark:text-blue-300"
                                        >
                                            Total Analyzed
                                        </p>
                                        <p
                                            class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                        >
                                            {{
                                                lossAversionData.analysis
                                                    .priceHistoryAnalysis
                                                    .totalAnalyzed
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-sm text-blue-700 dark:text-blue-300"
                                        >
                                            Total Missed Profit
                                        </p>
                                        <p
                                            class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                        >
                                            ${{
                                                lossAversionData.analysis.priceHistoryAnalysis.totalMissedProfit.toFixed(
                                                    2,
                                                )
                                            }}
                                        </p>
                                    </div>
                                    <div>
                                        <p
                                            class="text-sm text-blue-700 dark:text-blue-300"
                                        >
                                            Avg Missed %
                                        </p>
                                        <p
                                            class="text-xl font-bold text-blue-900 dark:text-blue-100"
                                        >
                                            {{
                                                lossAversionData.analysis.priceHistoryAnalysis.avgMissedProfitPercent.toFixed(
                                                    1,
                                                )
                                            }}%
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-4">
                                <div
                                    v-for="trade in lossAversionData.analysis
                                        .priceHistoryAnalysis.exampleTrades"
                                    :key="trade.tradeId"
                                    class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                                >
                                    <div
                                        class="flex justify-between items-start mb-3"
                                    >
                                        <div>
                                            <h5
                                                class="font-medium text-gray-900 dark:text-white"
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
                                                {{ trade.side.toUpperCase() }}
                                                •
                                                {{ trade.quantity }} shares
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p
                                                class="text-sm text-orange-600 dark:text-orange-400 font-medium"
                                            >
                                                +{{
                                                    trade.missedOpportunityPercent
                                                }}% missed opportunity
                                            </p>
                                            <p class="text-xs text-gray-500">
                                                ${{
                                                    (
                                                        trade
                                                            .potentialAdditionalProfit
                                                            ?.optimal || 0
                                                    ).toFixed(2)
                                                }}
                                                additional profit
                                            </p>
                                        </div>
                                    </div>

                                    <div
                                        class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3"
                                    >
                                        <div>
                                            <p
                                                class="text-xs text-gray-500 dark:text-gray-400"
                                            >
                                                Exit Price
                                            </p>
                                            <p class="font-medium">
                                                ${{
                                                    (
                                                        trade.exitPrice || 0
                                                    ).toFixed(2)
                                                }}
                                            </p>
                                        </div>
                                        <div>
                                            <p
                                                class="text-xs text-gray-500 dark:text-gray-400"
                                            >
                                                Actual Profit
                                            </p>
                                            <p class="font-medium">
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
                                                Peak Price (24h)
                                            </p>
                                            <p class="font-medium">
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

                                    <!-- Technical Analysis Summary -->
                                    <div
                                        v-if="
                                            trade.indicators &&
                                            trade.indicators.signals
                                        "
                                        class="mt-3"
                                    >
                                        <p
                                            class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                        >
                                            Technical Analysis at Exit:
                                        </p>
                                        <div
                                            class="bg-gray-50 dark:bg-gray-700 rounded p-3"
                                        >
                                            <p
                                                class="text-sm text-gray-600 dark:text-gray-400 mb-2"
                                            >
                                                {{
                                                    trade.indicators
                                                        .technicalSummary ||
                                                    "Technical analysis was not available at exit time"
                                                }}
                                            </p>

                                            <div
                                                v-if="
                                                    trade.indicators.signals
                                                        .length > 0
                                                "
                                                class="flex flex-wrap gap-2"
                                            >
                                                <span
                                                    v-for="signal in trade.indicators.signals.slice(
                                                        0,
                                                        3,
                                                    )"
                                                    :key="`${signal.type}-${signal.signal}`"
                                                    class="px-2 py-1 text-xs rounded"
                                                    :class="{
                                                        'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400':
                                                            signal.signal.includes(
                                                                'bullish',
                                                            ) ||
                                                            signal.signal.includes(
                                                                'crossover',
                                                            ),
                                                        'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400':
                                                            signal.signal.includes(
                                                                'bearish',
                                                            ) ||
                                                            signal.signal.includes(
                                                                'overbought',
                                                            ),
                                                        'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400':
                                                            signal.signal.includes(
                                                                'pattern',
                                                            ) ||
                                                            signal.signal.includes(
                                                                'room',
                                                            ),
                                                        'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300':
                                                            !signal.signal.includes(
                                                                'bullish',
                                                            ) &&
                                                            !signal.signal.includes(
                                                                'bearish',
                                                            ) &&
                                                            !signal.signal.includes(
                                                                'pattern',
                                                            ),
                                                    }"
                                                >
                                                    {{ signal.type }}:
                                                    {{
                                                        signal.signal.replace(
                                                            "_",
                                                            " ",
                                                        )
                                                    }}
                                                </span>
                                            </div>

                                            <div class="mt-2">
                                                <p
                                                    class="text-xs text-gray-500 dark:text-gray-400"
                                                >
                                                    <strong
                                                        >Recommendation:</strong
                                                    >
                                                    {{ trade.recommendation }}
                                                </p>
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
                        <p>No loss aversion analysis available yet.</p>
                        <p class="text-sm mt-2">
                            Click "Analyze Exit Patterns" to generate analysis.
                        </p>
                    </div>
                </div>
            </div>
</template>

<script setup>
import MdiIcon from "@/components/MdiIcon.vue";
import { formatMinutes } from "@/utils/behavioralFormatters";
import { mdiTarget } from "@mdi/js";

defineProps({
    lossAversionData: { type: Object, default: null },
    loadingLossAversion: { type: Boolean, default: false },
});

defineEmits(["analyze", "scroll-to-missed", "view-trades"]);
</script>
