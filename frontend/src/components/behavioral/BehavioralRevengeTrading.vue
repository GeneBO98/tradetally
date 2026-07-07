<template>
            <div class="card">
                <div class="card-body">
                    <div
                        class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                        <div>
                            <h3
                                class="text-lg font-medium text-gray-900 dark:text-white"
                            >
                                Revenge Trading Detection
                            </h3>
                            <div
                                class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                            >
                                <span
                                    v-if="revengeFreshness.calculationVersion"
                                    class="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                    Version
                                    {{ revengeFreshness.calculationVersion }}
                                </span>
                                <span
                                    v-if="revengeFreshness.latestRunAt"
                                    class="rounded-full bg-gray-100 px-2 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                    Last run
                                    {{ formatDate(revengeFreshness.latestRunAt) }}
                                </span>
                                <span
                                    class="rounded-full px-2 py-1"
                                    :class="
                                        revengeFreshness.hasStaleResults
                                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                                            : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                                    "
                                >
                                    {{
                                        revengeFreshness.hasStaleResults
                                            ? `${revengeFreshness.staleEventCount} stale event${revengeFreshness.staleEventCount === 1 ? '' : 's'}`
                                            : 'Current calculation'
                                    }}
                                </span>
                            </div>
                        </div>
                        <button
                            @click="$emit('rerun')"
                            :disabled="loadingHistorical"
                            class="btn btn-primary btn-sm inline-flex items-center justify-center"
                        >
                            <div
                                v-if="loadingHistorical"
                                class="mr-2 h-4 w-4 animate-spin"
                            >
                                <div
                                    class="h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                                ></div>
                            </div>
                            <MdiIcon
                                v-else
                                :icon="mdiRefresh"
                                :size="16"
                                class="mr-2"
                            />
                            {{
                                loadingHistorical
                                    ? "Re-running..."
                                    : "Re-run Revenge Detection"
                            }}
                        </button>
                    </div>

                    <!-- No Data State -->
                    <div
                        v-if="!revengeAnalysis?.events?.length"
                        class="text-center py-12"
                    >
                        <div
                            class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20"
                        >
                            <svg
                                class="h-6 w-6 text-green-600 dark:text-green-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <h3
                            class="mt-2 text-sm font-medium text-gray-900 dark:text-white"
                        >
                            No Revenge Trading Detected
                        </h3>
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Great job! We haven't detected any revenge trading
                            patterns in the selected time period.
                        </p>
                    </div>

                    <!-- Events List -->
                    <div v-else class="space-y-4">
                        <div class="flex justify-between items-center mb-4">
                            <div
                                class="text-sm text-gray-500 dark:text-gray-400"
                            >
                                Showing
                                {{ revengeAnalysis.events.length }} of
                                {{ pagination.total }} revenge trading events
                            </div>
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
                                                'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400':
                                                    event.outcome_type ===
                                                    'loss',
                                                'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400':
                                                    event.outcome_type ===
                                                    'profit',
                                                'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400':
                                                    event.outcome_type ===
                                                    'neutral',
                                            }"
                                        >
                                            {{ event.outcome_type }}
                                        </span>
                                        <span
                                            class="text-sm text-gray-500 dark:text-gray-400"
                                        >
                                            {{ formatDate(event.created_at) }}
                                        </span>
                                    </div>
                                    <!-- Trigger Trade Information -->
                                    <div
                                        v-if="event.trigger_trade"
                                        class="mt-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border-l-4 border-red-500"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-3"
                                        >
                                            <h4
                                                class="text-sm font-semibold text-red-800 dark:text-red-400"
                                            >
                                                <MdiIcon
                                                    :icon="mdiTrendingDown"
                                                    :size="16"
                                                    class="mr-1"
                                                />
                                                Initial Loss Trade (Trigger)
                                            </h4>
                                            <button
                                                @click="
                                                    $emit('open-trade',
                                                        event.trigger_trade.id,
                                                    )
                                                "
                                                class="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                            >
                                                View Details
                                            </button>
                                        </div>
                                        <p
                                            class="text-xs text-red-700 dark:text-red-300 mb-3"
                                        >
                                            This losing trade triggered
                                            emotional revenge trading behavior
                                        </p>
                                        <div
                                            class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"
                                        >
                                            <div>
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Symbol:</span
                                                >
                                                <span class="ml-1">{{
                                                    event.trigger_trade.symbol
                                                }}</span>
                                            </div>
                                            <div
                                                v-if="
                                                    event.trigger_trade
                                                        .group_detected_strategy
                                                "
                                            >
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Strategy:</span
                                                >
                                                <span class="ml-1">{{
                                                    formatStrategyLabel(
                                                        event.trigger_trade
                                                            .group_detected_strategy,
                                                    )
                                                }}</span>
                                            </div>
                                            <div
                                                v-if="
                                                    event.trigger_trade
                                                        .group_leg_count
                                                "
                                            >
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Legs:</span
                                                >
                                                <span class="ml-1">{{
                                                    event.trigger_trade
                                                        .group_leg_count
                                                }}</span>
                                            </div>
                                            <div>
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Entry:</span
                                                >
                                                <span class="ml-1"
                                                    >${{
                                                        parseFloat(
                                                            event.trigger_trade
                                                                .entry_price,
                                                        ).toFixed(2)
                                                    }}</span
                                                >
                                            </div>
                                            <div>
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Exit:</span
                                                >
                                                <span class="ml-1"
                                                    >${{
                                                        parseFloat(
                                                            event.trigger_trade
                                                                .exit_price,
                                                        ).toFixed(2)
                                                    }}</span
                                                >
                                            </div>
                                            <div>
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Loss:</span
                                                >
                                                <span
                                                    class="ml-1 font-medium text-red-600 dark:text-red-400"
                                                >
                                                    ${{
                                                        getPnLValue(
                                                            event.trigger_trade,
                                                        ).toFixed(2)
                                                    }}
                                                </span>
                                            </div>
                                            <div
                                                class="col-span-2 md:col-span-4"
                                            >
                                                <span
                                                    class="text-red-600 dark:text-red-400 font-medium"
                                                    >Completed:</span
                                                >
                                                <span class="ml-1">{{
                                                    formatDate(
                                                        event.trigger_trade
                                                            .exit_time,
                                                    )
                                                }}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Revenge Trading Follow-up -->
                                    <div
                                        v-if="event.related_patterns?.length"
                                        class="mt-4"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-3"
                                        >
                                            <div
                                                class="flex items-center space-x-2"
                                            >
                                                <h4
                                                    class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center"
                                                >
                                                    <MdiIcon
                                                        :icon="mdiLightningBolt"
                                                        :size="16"
                                                        class="mr-1"
                                                    />
                                                    Revenge Trading Response
                                                </h4>
                                                <span
                                                    class="text-xs text-gray-500 dark:text-gray-400"
                                                >
                                                    ({{
                                                        getTimeBetweenTrades(
                                                            event.trigger_trade
                                                                .exit_time,
                                                            event
                                                                .related_patterns[0]
                                                                ?.entry_time,
                                                        )
                                                    }}
                                                    later)
                                                </span>
                                            </div>
                                            <button
                                                v-if="
                                                    event.related_patterns
                                                        .length > 3
                                                "
                                                @click="
                                                    toggleEventExpansion(
                                                        event.id,
                                                    )
                                                "
                                                class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
                                            >
                                                <span>{{
                                                    expandedEvents.has(event.id)
                                                        ? "Show Less"
                                                        : `Show All ${event.related_patterns.length}`
                                                }}</span>
                                                <svg
                                                    class="w-3 h-3 transition-transform"
                                                    :class="{
                                                        'rotate-180':
                                                            expandedEvents.has(
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

                                        <div class="space-y-3">
                                            <div
                                                v-for="(
                                                    pattern, index
                                                ) in expandedEvents.has(
                                                    event.id,
                                                )
                                                    ? event.related_patterns
                                                    : event.related_patterns.slice(
                                                          0,
                                                          3,
                                                      )"
                                                :key="
                                                    pattern.pattern_type + index
                                                "
                                                class="p-3 rounded-lg border-l-4 cursor-pointer transition-colors"
                                                :class="{
                                                    'bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border-orange-400':
                                                        pattern.pattern_type ===
                                                        'same_symbol_revenge',
                                                    'bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20 border-purple-400':
                                                        pattern.pattern_type ===
                                                        'emotional_reactive_trading',
                                                }"
                                                @click="
                                                    $emit('open-trade', pattern.trade_id)
                                                "
                                            >
                                                <div
                                                    class="flex items-center justify-between mb-2"
                                                >
                                                    <div
                                                        class="flex items-center space-x-2"
                                                    >
                                                        <span
                                                            v-if="
                                                                pattern.pattern_type ===
                                                                'same_symbol_revenge'
                                                            "
                                                            class="text-sm font-medium text-orange-800 dark:text-orange-400 flex items-center"
                                                        >
                                                            <MdiIcon
                                                                :icon="
                                                                    mdiTarget
                                                                "
                                                                :size="16"
                                                                class="mr-1"
                                                            />
                                                            Same Symbol Revenge
                                                        </span>
                                                        <span
                                                            v-else
                                                            class="text-sm font-medium text-purple-800 dark:text-purple-400 flex items-center"
                                                        >
                                                            <MdiIcon
                                                                :icon="
                                                                    mdiLightningBolt
                                                                "
                                                                :size="16"
                                                                class="mr-1"
                                                            />
                                                            Emotional Spillover
                                                        </span>
                                                        <span
                                                            class="px-2 py-0.5 text-xs rounded"
                                                            :class="{
                                                                'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400':
                                                                    pattern.severity ===
                                                                    'high',
                                                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400':
                                                                    pattern.severity ===
                                                                    'medium',
                                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400':
                                                                    pattern.severity ===
                                                                    'low',
                                                            }"
                                                        >
                                                            {{
                                                                pattern.severity
                                                            }}
                                                            risk
                                                        </span>
                                                    </div>
                                                    <button
                                                        class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                                    >
                                                        View Trade
                                                    </button>
                                                </div>

                                                <!-- Basic Trade Info -->
                                                <div
                                                    class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3"
                                                >
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Symbol:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            >{{
                                                                pattern.symbol
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div
                                                        v-if="
                                                            pattern.group_detected_strategy
                                                        "
                                                    >
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Strategy:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            >{{
                                                                formatStrategyLabel(
                                                                    pattern.group_detected_strategy,
                                                                )
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div
                                                        v-if="
                                                            pattern.group_leg_count
                                                        "
                                                    >
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Legs:</span
                                                        >
                                                        <span class="ml-1">{{
                                                            pattern.group_leg_count
                                                        }}</span>
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Side:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium uppercase"
                                                            >{{
                                                                pattern.side
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Quantity:</span
                                                        >
                                                        <span class="ml-1">{{
                                                            pattern.quantity
                                                        }}</span>
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Time:</span
                                                        >
                                                        <span class="ml-1">{{
                                                            formatTime(
                                                                pattern.entry_time,
                                                            )
                                                        }}</span>
                                                    </div>
                                                </div>

                                                <!-- Price & Cost Info -->
                                                <div
                                                    class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3"
                                                >
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Entry:</span
                                                        >
                                                        <span class="ml-1"
                                                            >${{
                                                                parseFloat(
                                                                    pattern.entry_price,
                                                                ).toFixed(2)
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Exit:</span
                                                        >
                                                        <span class="ml-1"
                                                            >${{
                                                                parseFloat(
                                                                    pattern.exit_price,
                                                                ).toFixed(2)
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Total Cost:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            >${{
                                                                parseFloat(
                                                                    pattern.total_cost,
                                                                ).toLocaleString()
                                                            }}</span
                                                        >
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Fees:</span
                                                        >
                                                        <span class="ml-1"
                                                            >${{
                                                                parseFloat(
                                                                    pattern.total_fees ||
                                                                        0,
                                                                ).toFixed(2)
                                                            }}</span
                                                        >
                                                    </div>
                                                </div>

                                                <!-- P&L Info -->
                                                <div
                                                    class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-2"
                                                >
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Gross P&L:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            :class="{
                                                                'text-green-600 dark:text-green-400':
                                                                    parseFloat(
                                                                        pattern.gross_pnl,
                                                                    ) > 0,
                                                                'text-red-600 dark:text-red-400':
                                                                    parseFloat(
                                                                        pattern.gross_pnl,
                                                                    ) < 0,
                                                                'text-gray-600 dark:text-gray-400':
                                                                    parseFloat(
                                                                        pattern.gross_pnl,
                                                                    ) === 0,
                                                            }"
                                                        >
                                                            ${{
                                                                parseFloat(
                                                                    pattern.gross_pnl,
                                                                ).toFixed(2)
                                                            }}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Net P&L:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            :class="{
                                                                'text-green-600 dark:text-green-400':
                                                                    parseFloat(
                                                                        pattern.pnl,
                                                                    ) > 0,
                                                                'text-red-600 dark:text-red-400':
                                                                    parseFloat(
                                                                        pattern.pnl,
                                                                    ) < 0,
                                                                'text-gray-600 dark:text-gray-400':
                                                                    parseFloat(
                                                                        pattern.pnl,
                                                                    ) === 0,
                                                            }"
                                                        >
                                                            ${{
                                                                parseFloat(
                                                                    pattern.pnl,
                                                                ).toFixed(2)
                                                            }}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span
                                                            class="text-gray-600 dark:text-gray-400"
                                                            >Return:</span
                                                        >
                                                        <span
                                                            class="ml-1 font-medium"
                                                            :class="{
                                                                'text-green-600 dark:text-green-400':
                                                                    parseFloat(
                                                                        pattern.return_percent,
                                                                    ) > 0,
                                                                'text-red-600 dark:text-red-400':
                                                                    parseFloat(
                                                                        pattern.return_percent,
                                                                    ) < 0,
                                                                'text-gray-600 dark:text-gray-400':
                                                                    parseFloat(
                                                                        pattern.return_percent,
                                                                    ) === 0,
                                                            }"
                                                        >
                                                            {{
                                                                parseFloat(
                                                                    pattern.return_percent,
                                                                ).toFixed(2)
                                                            }}%
                                                        </span>
                                                        <span
                                                            v-if="
                                                                pattern.return_basis
                                                            "
                                                            class="ml-1 text-gray-500 dark:text-gray-400"
                                                        >
                                                            {{
                                                                formatReturnBasis(
                                                                    pattern.return_basis,
                                                                )
                                                            }}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div
                                                    class="text-xs"
                                                    :class="{
                                                        'text-orange-600 dark:text-orange-400':
                                                            pattern.pattern_type ===
                                                            'same_symbol_revenge',
                                                        'text-purple-600 dark:text-purple-400':
                                                            pattern.pattern_type ===
                                                            'emotional_reactive_trading',
                                                    }"
                                                >
                                                    <span
                                                        v-if="
                                                            pattern.pattern_type ===
                                                            'same_symbol_revenge'
                                                        "
                                                        class="flex items-center"
                                                    >
                                                        <MdiIcon
                                                            :icon="mdiChartBox"
                                                            :size="16"
                                                            class="mr-1.5"
                                                        />
                                                        Tried to recover losses
                                                        by trading
                                                        {{ pattern.symbol }}
                                                        again
                                                    </span>
                                                    <span
                                                        v-else
                                                        class="flex items-center"
                                                    >
                                                        <MdiIcon
                                                            :icon="
                                                                mdiLightningBolt
                                                            "
                                                            :size="16"
                                                            class="mr-1.5"
                                                        />
                                                        Emotional reaction led
                                                        to trading
                                                        {{ pattern.symbol }}
                                                        (different from trigger
                                                        symbol)
                                                    </span>
                                                    <span
                                                        v-if="
                                                            pattern.cross_symbol_qualifier
                                                        "
                                                        class="mt-1 inline-flex rounded bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                                                    >
                                                        Qualified by
                                                        {{
                                                            formatCrossSymbolQualifier(
                                                                pattern.cross_symbol_qualifier,
                                                            )
                                                        }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Outcome Summary -->
                                    <div
                                        class="mt-4 p-3 rounded-lg border-t border-gray-200 dark:border-gray-600 pt-4"
                                        :class="{
                                            'bg-red-50 dark:bg-red-900/10':
                                                event.outcome_type === 'loss',
                                            'bg-green-50 dark:bg-green-900/10':
                                                event.outcome_type === 'profit',
                                            'bg-gray-50 dark:bg-gray-900/10':
                                                event.outcome_type ===
                                                'neutral',
                                        }"
                                    >
                                        <div
                                            class="flex items-center justify-between mb-2"
                                        >
                                            <h5
                                                class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center"
                                            >
                                                <MdiIcon
                                                    :icon="mdiChartBox"
                                                    :size="18"
                                                    class="mr-1.5"
                                                />
                                                Revenge Trading Outcome
                                            </h5>
                                            <span
                                                class="inline-flex px-3 py-1 text-sm font-semibold rounded-full"
                                                :class="{
                                                    'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400':
                                                        event.outcome_type ===
                                                        'loss',
                                                    'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400':
                                                        event.outcome_type ===
                                                        'profit',
                                                    'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400':
                                                        event.outcome_type ===
                                                        'neutral',
                                                }"
                                            >
                                                <span
                                                    v-if="
                                                        event.outcome_type ===
                                                        'loss'
                                                    "
                                                    class="flex items-center"
                                                >
                                                    <MdiIcon
                                                        :icon="mdiClose"
                                                        :size="16"
                                                        class="mr-1"
                                                    />
                                                    Made it worse
                                                </span>
                                                <span
                                                    v-else-if="
                                                        event.outcome_type ===
                                                        'profit'
                                                    "
                                                    class="flex items-center"
                                                >
                                                    <MdiIcon
                                                        :icon="mdiCheck"
                                                        :size="16"
                                                        class="mr-1"
                                                    />
                                                    Recovered losses
                                                </span>
                                                <span
                                                    v-else
                                                    class="flex items-center"
                                                >
                                                    <MdiIcon
                                                        :icon="mdiScale"
                                                        :size="16"
                                                        class="mr-1"
                                                    />
                                                    Broke even
                                                </span>
                                            </span>
                                        </div>

                                        <div
                                            class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"
                                        >
                                            <div>
                                                <span
                                                    class="text-gray-600 dark:text-gray-400"
                                                    >Time to revenge
                                                    trade:</span
                                                >
                                                <span class="ml-1 font-medium"
                                                    >{{
                                                        Math.round(
                                                            event.time_window_minutes /
                                                                60,
                                                        )
                                                    }}h
                                                    {{
                                                        event.time_window_minutes %
                                                        60
                                                    }}m</span
                                                >
                                            </div>
                                            <div>
                                                <span
                                                    class="text-gray-600 dark:text-gray-400"
                                                >
                                                    <span
                                                        v-if="
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) < 0
                                                        "
                                                        >Losses recovered:</span
                                                    >
                                                    <span
                                                        v-else-if="
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) > 0
                                                        "
                                                        >Losses increased:</span
                                                    >
                                                    <span v-else
                                                        >Additional P&L:</span
                                                    >
                                                </span>
                                                <span
                                                    class="ml-1 font-medium"
                                                    :class="{
                                                        'text-red-600 dark:text-red-400':
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) > 0,
                                                        'text-green-600 dark:text-green-400':
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) < 0,
                                                        'text-gray-600 dark:text-gray-400':
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) === 0,
                                                    }"
                                                >
                                                    <span
                                                        v-if="
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ) < 0
                                                        "
                                                    >
                                                        ${{
                                                            Math.abs(
                                                                parseFloat(
                                                                    event.total_additional_loss,
                                                                ),
                                                            ).toFixed(2)
                                                        }}
                                                    </span>
                                                    <span v-else>
                                                        ${{
                                                            parseFloat(
                                                                event.total_additional_loss ||
                                                                    0,
                                                            ).toFixed(2)
                                                        }}
                                                    </span>
                                                </span>
                                            </div>
                                            <div>
                                                <span
                                                    class="text-gray-600 dark:text-gray-400"
                                                    >Revenge trades:</span
                                                >
                                                <span
                                                    class="ml-1 font-medium"
                                                    >{{
                                                        event.total_revenge_trades
                                                    }}</span
                                                >
                                            </div>
                                        </div>

                                        <div
                                            class="mt-3 text-xs"
                                            :class="{
                                                'text-red-700 dark:text-red-300':
                                                    event.outcome_type ===
                                                    'loss',
                                                'text-green-700 dark:text-green-300':
                                                    event.outcome_type ===
                                                    'profit',
                                                'text-gray-700 dark:text-gray-300':
                                                    event.outcome_type ===
                                                    'neutral',
                                            }"
                                        >
                                            <span
                                                v-if="
                                                    event.outcome_type ===
                                                    'loss'
                                                "
                                                class="flex items-start"
                                            >
                                                <MdiIcon
                                                    :icon="mdiTrendingDown"
                                                    :size="16"
                                                    class="mr-1.5 mt-0.5 flex-shrink-0"
                                                />
                                                <span
                                                    >The revenge trading made
                                                    the situation worse by
                                                    adding ${{
                                                        Math.abs(
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ),
                                                        ).toFixed(2)
                                                    }}
                                                    in additional losses</span
                                                >
                                            </span>
                                            <span
                                                v-else-if="
                                                    event.outcome_type ===
                                                    'profit'
                                                "
                                                class="flex items-start"
                                            >
                                                <MdiIcon
                                                    :icon="mdiCurrencyUsd"
                                                    :size="16"
                                                    class="mr-1.5 mt-0.5 flex-shrink-0"
                                                />
                                                <span
                                                    >The revenge trading
                                                    actually worked this time,
                                                    recovering ${{
                                                        Math.abs(
                                                            parseFloat(
                                                                event.total_additional_loss,
                                                            ),
                                                        ).toFixed(2)
                                                    }}</span
                                                >
                                            </span>
                                            <span
                                                v-else
                                                class="flex items-start"
                                            >
                                                <MdiIcon
                                                    :icon="mdiScale"
                                                    :size="16"
                                                    class="mr-1.5 mt-0.5 flex-shrink-0"
                                                />
                                                <span
                                                    >The revenge trading broke
                                                    even - no additional gains
                                                    or losses</span
                                                >
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Pagination -->
                        <div
                            v-if="pagination.totalPages > 1"
                            class="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6 rounded-lg"
                        >
                            <div class="flex flex-1 justify-between sm:hidden">
                                <button
                                    @click="$emit('prev-page')"
                                    :disabled="!pagination.hasPreviousPage"
                                    class="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                                >
                                    Previous
                                </button>
                                <button
                                    @click="$emit('next-page')"
                                    :disabled="!pagination.hasNextPage"
                                    class="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                                >
                                    Next
                                </button>
                            </div>
                            <div
                                class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p
                                        class="text-sm text-gray-700 dark:text-gray-300"
                                    >
                                        Showing
                                        <span class="font-medium">{{
                                            (pagination.page - 1) *
                                                pagination.limit +
                                            1
                                        }}</span>
                                        to
                                        <span class="font-medium">{{
                                            Math.min(
                                                pagination.page *
                                                    pagination.limit,
                                                pagination.total,
                                            )
                                        }}</span>
                                        of
                                        <span class="font-medium">{{
                                            pagination.total
                                        }}</span>
                                        results
                                    </p>
                                </div>
                                <div>
                                    <nav
                                        class="isolate inline-flex -space-x-px rounded-md shadow-sm"
                                        aria-label="Pagination"
                                    >
                                        <button
                                            @click="$emit('prev-page')"
                                            :disabled="
                                                !pagination.hasPreviousPage
                                            "
                                            class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-gray-600 dark:hover:bg-gray-700"
                                        >
                                            <span class="sr-only"
                                                >Previous</span
                                            >
                                            <svg
                                                class="h-5 w-5"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                                                    clip-rule="evenodd"
                                                />
                                            </svg>
                                        </button>

                                        <template
                                            v-for="page in Math.min(
                                                pagination.totalPages,
                                                5,
                                            )"
                                            :key="page"
                                        >
                                            <button
                                                @click="$emit('go-to-page', page)"
                                                :class="[
                                                    page === pagination.page
                                                        ? 'relative z-10 inline-flex items-center bg-primary-600 px-4 py-2 text-sm font-semibold text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
                                                        : 'relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700',
                                                ]"
                                            >
                                                {{ page }}
                                            </button>
                                        </template>

                                        <button
                                            @click="$emit('next-page')"
                                            :disabled="!pagination.hasNextPage"
                                            class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-gray-600 dark:hover:bg-gray-700"
                                        >
                                            <span class="sr-only">Next</span>
                                            <svg
                                                class="h-5 w-5"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                                    clip-rule="evenodd"
                                                />
                                            </svg>
                                        </button>
                                    </nav>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
</template>

<script setup>
import { ref, computed } from "vue";
import MdiIcon from "@/components/MdiIcon.vue";
import { useUserTimezone } from "@/composables/useUserTimezone";
import {
    formatDate,
    getTimeBetweenTrades,
    getPnLValue,
    formatStrategyLabel,
} from "@/utils/behavioralFormatters";
import {
    mdiChartBox,
    mdiTrendingDown,
    mdiLightningBolt,
    mdiTarget,
    mdiClose,
    mdiCheck,
    mdiCurrencyUsd,
    mdiScale,
    mdiRefresh,
} from "@mdi/js";

const props = defineProps({
    revengeAnalysis: { type: Object, default: null },
    pagination: { type: Object, required: true },
    loadingHistorical: { type: Boolean, default: false },
});

defineEmits(["rerun", "open-trade", "prev-page", "next-page", "go-to-page"]);

const { formatTime: formatTimeTz } = useUserTimezone();
const formatTime = (dateString) => formatTimeTz(dateString);

// Track which revenge trade events are expanded (local UI state)
const expandedEvents = ref(new Set());
const toggleEventExpansion = (eventId) => {
    if (expandedEvents.value.has(eventId)) {
        expandedEvents.value.delete(eventId);
    } else {
        expandedEvents.value.add(eventId);
    }
};

const revengeFreshness = computed(() => {
    const freshness = props.revengeAnalysis?.analysis_freshness || {};
    return {
        calculationVersion: freshness.calculation_version || null,
        latestRunAt: freshness.latest_analysis_run_at || null,
        staleEventCount: Number(freshness.stale_event_count || 0),
        hasStaleResults: freshness.has_stale_results === true,
    };
});

const formatCrossSymbolQualifier = (qualifier) => {
    const labels = {
        position_escalation: "risk escalation",
        same_sector: "same sector",
    };
    return labels[qualifier] || String(qualifier || "").replace(/_/g, " ");
};

const formatReturnBasis = (basis) => {
    const labels = {
        max_loss: "on max loss",
        net_debit: "on net debit",
        stop_loss: "on stop risk",
        notional: "on notional",
        undefined_risk_notional: "on approximate notional",
        position_size: "on position size",
        grouped_position: "on grouped value",
        single_trade: "on trade value",
    };
    return labels[basis] || `on ${String(basis || "").replace(/_/g, " ")}`;
};
</script>
