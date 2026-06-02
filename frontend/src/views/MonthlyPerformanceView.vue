<template>
    <div class="content-wrapper py-8">
        <!-- Header -->
        <div class="mb-8">
            <div
                class="flex flex-col sm:flex-row sm:items-center sm:justify-between"
            >
                <div>
                    <h1 class="heading-page">Monthly Performance</h1>
                    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Compare your trading performance month-by-month
                    </p>
                </div>

                <div class="mt-4 sm:mt-0 flex items-center gap-3">
                    <label
                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >Year:</label
                    >
                    <div class="text-sm">
                        <BaseSelect
                            v-model="selectedYear"
                            :options="availableYears"
                            @change="loadMonthlyData"
                        />
                    </div>
                </div>
            </div>

            <!-- Filter bar: tags + strategy (no time filter — the page is
                 organized by month, so a date range would compete with the
                 axis). -->
            <div
                class="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
                <div class="w-full sm:w-64" data-monthly-dropdown="tags">
                    <label class="label">Tags</label>
                    <div class="relative">
                        <button
                            type="button"
                            @click.stop="toggleDropdown('tags')"
                            class="input w-full text-left flex items-center justify-between"
                        >
                            <span class="truncate">{{ tagsButtonLabel }}</span>
                            <svg
                                class="h-4 w-4 text-gray-400"
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
                        <div
                            v-if="openDropdown === 'tags'"
                            class="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none"
                        >
                            <div class="p-1">
                                <label
                                    class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        :checked="selectedTags.length === 0"
                                        @change="selectedTags = []"
                                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                                    />
                                    <span
                                        class="ml-3 text-sm text-gray-900 dark:text-white"
                                        >All Tags</span
                                    >
                                </label>
                            </div>
                            <div
                                v-if="availableTags.length > 0"
                                class="border-t border-gray-200 dark:border-gray-600"
                            >
                                <div
                                    v-for="tag in availableTags"
                                    :key="tag"
                                    class="p-1"
                                >
                                    <label
                                        class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            :value="tag"
                                            v-model="selectedTags"
                                            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                                        />
                                        <span
                                            class="ml-3 text-sm text-gray-900 dark:text-white"
                                            >{{ tag }}</span
                                        >
                                    </label>
                                </div>
                            </div>
                            <div
                                v-else
                                class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600"
                            >
                                No tags yet
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    class="w-full sm:w-64"
                    data-monthly-dropdown="strategies"
                >
                    <label class="label">Strategy / Setup</label>
                    <div class="relative">
                        <button
                            type="button"
                            @click.stop="toggleDropdown('strategies')"
                            class="input w-full text-left flex items-center justify-between"
                        >
                            <span class="truncate">{{
                                strategiesButtonLabel
                            }}</span>
                            <svg
                                class="h-4 w-4 text-gray-400"
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
                        <div
                            v-if="openDropdown === 'strategies'"
                            class="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none"
                        >
                            <div class="p-1">
                                <label
                                    class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        :checked="selectedStrategies.length === 0"
                                        @change="selectedStrategies = []"
                                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                                    />
                                    <span
                                        class="ml-3 text-sm text-gray-900 dark:text-white"
                                        >All Strategies</span
                                    >
                                </label>
                            </div>
                            <div
                                v-if="availableStrategies.length > 0"
                                class="border-t border-gray-200 dark:border-gray-600"
                            >
                                <div
                                    v-for="strategy in availableStrategies"
                                    :key="strategy"
                                    class="p-1"
                                >
                                    <label
                                        class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            :value="strategy"
                                            v-model="selectedStrategies"
                                            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                                        />
                                        <span
                                            class="ml-3 text-sm text-gray-900 dark:text-white"
                                            >{{ strategy }}</span
                                        >
                                    </label>
                                </div>
                            </div>
                            <div
                                v-else
                                class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600"
                            >
                                No strategies yet
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    v-if="hasActiveFilters"
                    class="flex items-center sm:pb-2"
                >
                    <button
                        type="button"
                        @click="clearFilters"
                        class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                        Clear filters
                    </button>
                </div>
            </div>
        </div>

        <!-- Full page spinner only on initial load -->
        <div v-if="initialLoading" class="flex justify-center py-12">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
            ></div>
        </div>

        <div v-else-if="error" class="card p-8 text-center">
            <p class="text-danger mb-4">{{ error }}</p>
            <button @click="loadMonthlyData" class="btn-primary">Retry</button>
        </div>

        <!-- Content with optional refresh indicator -->
        <div v-else class="space-y-6 relative">
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
            <!-- Year Summary -->
            <div class="card">
                <div class="card-body">
                    <h2
                        class="text-xl font-semibold text-gray-900 dark:text-white mb-6"
                    >
                        {{ selectedYear }} Year Summary
                    </h2>
                    <div
                        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
                    >
                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div
                                class="text-2xl font-bold text-gray-900 dark:text-white"
                            >
                                {{ yearTotals.trades.total.toLocaleString() }}
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Total Trades
                            </div>
                        </div>

                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div
                                class="text-2xl font-bold"
                                :class="
                                    yearTotals.metrics.winRate >= 50
                                        ? 'text-success'
                                        : 'text-danger'
                                "
                            >
                                {{
                                    formatPercentage(yearTotals.metrics.winRate)
                                }}
                            </div>
                            <div
                                v-if="yearTotals.trades.breakeven > 0"
                                class="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5"
                            >
                                {{ formatPercentage(yearTotals.metrics.winRateExcludingBreakeven) }} excl. BE
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Win Rate (incl. BE)
                            </div>
                        </div>

                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div
                                class="text-2xl font-bold"
                                :class="getPnLClass(yearTotals.pnl.total)"
                            >
                                {{ formatCurrency(yearTotals.pnl.total) }}
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Total P&L
                            </div>
                        </div>

                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div
                                class="text-2xl font-bold"
                                :class="
                                    getRValueClass(
                                        yearTotals.metrics.totalRValue,
                                    )
                                "
                            >
                                {{
                                    formatNumber(
                                        yearTotals.metrics.totalRValue,
                                        2,
                                    )
                                }}R
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Total R
                            </div>
                        </div>

                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div class="text-2xl font-bold text-success">
                                {{ formatCurrency(yearTotals.pnl.best) }}
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Best Trade
                            </div>
                        </div>

                        <div
                            class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                            <div class="text-2xl font-bold text-danger">
                                {{ formatCurrency(yearTotals.pnl.worst) }}
                            </div>
                            <div
                                class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                            >
                                Worst Trade
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Monthly Performance Table -->
            <div class="card">
                <div class="card-body">
                    <h2
                        class="text-xl font-semibold text-gray-900 dark:text-white mb-6"
                    >
                        Month-by-Month Breakdown
                    </h2>
                    <div class="overflow-x-auto">
                        <table
                            class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                        >
                            <thead class="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th
                                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Month
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Trades
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Wins
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Losses
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Breakeven
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Win Rate
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Total P&L
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Avg P&L
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Avg Win
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Avg Loss
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Avg R
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Total R
                                    </th>
                                    <th
                                        class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Days
                                    </th>
                                </tr>
                            </thead>
                            <tbody
                                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <tr
                                    v-for="month in monthlyData"
                                    :key="month.month"
                                    :class="
                                        month.trades.total === 0
                                            ? 'opacity-40'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                    "
                                >
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span
                                            class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
                                        >
                                            {{ month.monthName }}
                                        </span>
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900 dark:text-white"
                                    >
                                        {{ month.trades.total || "-" }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center"
                                    >
                                        <span
                                            v-if="month.trades.wins > 0"
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                        >
                                            {{ month.trades.wins }}
                                        </span>
                                        <span v-else class="text-gray-400"
                                            >-</span
                                        >
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center"
                                    >
                                        <span
                                            v-if="month.trades.losses > 0"
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                        >
                                            {{ month.trades.losses }}
                                        </span>
                                        <span v-else class="text-gray-400"
                                            >-</span
                                        >
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center"
                                    >
                                        <span
                                            v-if="month.trades.breakeven > 0"
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                                        >
                                            {{ month.trades.breakeven }}
                                        </span>
                                        <span v-else class="text-gray-400"
                                            >-</span
                                        >
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center"
                                    >
                                        <div
                                            v-if="month.trades.total > 0"
                                            class="flex flex-col items-center"
                                        >
                                            <span
                                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                                :class="
                                                    getWinRateBadgeClass(
                                                        month.metrics.winRate,
                                                    )
                                                "
                                            >
                                                {{
                                                    formatPercentage(
                                                        month.metrics.winRate,
                                                    )
                                                }}
                                            </span>
                                            <span
                                                v-if="month.trades.breakeven > 0"
                                                class="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400"
                                            >
                                                {{
                                                    formatPercentage(
                                                        month.metrics
                                                            .winRateExcludingBreakeven,
                                                    )
                                                }}
                                                excl. BE
                                            </span>
                                        </div>
                                        <span v-else class="text-gray-400"
                                            >-</span
                                        >
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold"
                                        :class="
                                            month.trades.total > 0
                                                ? getPnLClass(month.pnl.total)
                                                : 'text-gray-400'
                                        "
                                    >
                                        {{
                                            month.trades.total > 0
                                                ? formatCurrency(
                                                      month.pnl.total,
                                                  )
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-right text-sm"
                                        :class="
                                            month.trades.total > 0
                                                ? getPnLClass(month.pnl.average)
                                                : 'text-gray-400'
                                        "
                                    >
                                        {{
                                            month.trades.total > 0
                                                ? formatCurrency(
                                                      month.pnl.average,
                                                  )
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-right text-sm text-success"
                                    >
                                        {{
                                            month.trades.wins > 0
                                                ? formatCurrency(
                                                      month.pnl.avgWin,
                                                  )
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-right text-sm text-danger"
                                    >
                                        {{
                                            month.trades.losses > 0
                                                ? formatCurrency(
                                                      month.pnl.avgLoss,
                                                  )
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-primary-600"
                                    >
                                        {{
                                            month.metrics.avgRValue !== 0
                                                ? formatNumber(
                                                      month.metrics.avgRValue,
                                                      2,
                                                  ) + "R"
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold"
                                        :class="
                                            month.trades.total > 0
                                                ? getRValueClass(
                                                      month.metrics.totalRValue,
                                                  )
                                                : 'text-gray-400'
                                        "
                                    >
                                        {{
                                            month.trades.total > 0 &&
                                            month.metrics.totalRValue !== 0
                                                ? formatNumber(
                                                      month.metrics.totalRValue,
                                                      2,
                                                  ) + "R"
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-center"
                                    >
                                        <span
                                            v-if="month.metrics.tradingDays > 0"
                                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                        >
                                            {{ month.metrics.tradingDays }}
                                        </span>
                                        <span v-else class="text-gray-400"
                                            >-</span
                                        >
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="card">
                    <div class="card-body">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="heading-card">
                                Monthly
                                {{ showRValue ? "R-Value" : "P&L" }} Trend
                            </h3>
                            <button
                                @click="toggleRValue"
                                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                                :class="
                                    showRValue
                                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                "
                            >
                                {{
                                    showRValue
                                        ? `Show P&L (${currencySymbol})`
                                        : "Show R-Value"
                                }}
                            </button>
                        </div>
                        <div class="h-80">
                            <canvas
                                ref="pnlChartCanvas"
                                id="pnl-chart"
                            ></canvas>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        <h3
                            class="text-lg font-semibold text-gray-900 dark:text-white mb-4"
                        >
                            Win Rate by Month
                        </h3>
                        <div class="h-80">
                            <canvas
                                ref="winRateChartCanvas"
                                id="winrate-chart"
                            ></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useTradesStore } from "@/stores/trades";
import { useUiPreferencesStore } from "@/stores/uiPreferences";
import { Chart, registerables } from "chart.js";
import { useGlobalAccountFilter } from "@/composables/useGlobalAccountFilter";
import { useCurrencyFormatter } from "@/composables/useCurrencyFormatter";
import api from "@/services/api";
import BaseSelect from "@/components/common/BaseSelect.vue";

Chart.register(...registerables);

const tradesStore = useTradesStore();
const uiPreferencesStore = useUiPreferencesStore();
const { selectedAccount } = useGlobalAccountFilter();
const { formatCurrency, currencySymbol } = useCurrencyFormatter();

const loading = ref(false);
const initialLoading = ref(true); // Track initial load separately to preserve scroll on refresh
const error = ref(null);

// Load saved year from localStorage, or default to current year
const getSavedYear = () => {
    const saved = localStorage.getItem("monthlyPerformanceYear");
    if (saved) {
        const year = parseInt(saved);
        const currentYear = new Date().getFullYear();
        // Validate year is reasonable (within 10 years of current)
        if (!isNaN(year) && year >= currentYear - 10 && year <= currentYear) {
            return year;
        }
    }
    return new Date().getFullYear();
};

const selectedYear = ref(getSavedYear());

// Filter state — Tags and Strategy multi-select. The monthly page intentionally
// omits a time filter because the page IS the time axis; date range would
// conflict with the month-by-month layout.
const STORAGE_KEYS = {
    tags: "monthlyPerformanceTags",
    strategies: "monthlyPerformanceStrategies",
};
const readStoredArray = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
const selectedTags = ref(readStoredArray(STORAGE_KEYS.tags));
const selectedStrategies = ref(readStoredArray(STORAGE_KEYS.strategies));
const availableTags = ref([]);
const availableStrategies = ref([]);
const openDropdown = ref(null);

const tagsButtonLabel = computed(() => {
    const count = selectedTags.value.length;
    if (count === 0) return "All Tags";
    if (count === 1) return selectedTags.value[0];
    return `${count} tags selected`;
});

const strategiesButtonLabel = computed(() => {
    const count = selectedStrategies.value.length;
    if (count === 0) return "All Strategies";
    if (count === 1) return selectedStrategies.value[0];
    return `${count} strategies selected`;
});

const hasActiveFilters = computed(
    () =>
        selectedTags.value.length > 0 || selectedStrategies.value.length > 0,
);

const toggleDropdown = (name) => {
    openDropdown.value = openDropdown.value === name ? null : name;
};

const handleOutsideClick = (event) => {
    if (!openDropdown.value) return;
    if (!event.target.closest("[data-monthly-dropdown]")) {
        openDropdown.value = null;
    }
};

const clearFilters = () => {
    selectedTags.value = [];
    selectedStrategies.value = [];
};

const fetchAvailableTags = async () => {
    try {
        const response = await api.get("/tags");
        const tags = response.data?.tags || [];
        // /tags returns either string[] or [{ name }]; normalize to string[].
        availableTags.value = tags
            .map((t) => (typeof t === "string" ? t : t?.name))
            .filter((t) => typeof t === "string" && t.trim() !== "")
            .sort((a, b) => a.localeCompare(b));
    } catch (err) {
        console.warn("[MONTHLY] Failed to load tags:", err);
        availableTags.value = [];
    }
};

const fetchAvailableStrategies = async () => {
    try {
        const response = await api.get("/trades/strategies");
        const strategies = response.data?.strategies || [];
        availableStrategies.value = strategies
            .filter((s) => typeof s === "string" && s.trim() !== "")
            .sort((a, b) => a.localeCompare(b));
    } catch (err) {
        console.warn("[MONTHLY] Failed to load strategies:", err);
        availableStrategies.value = [];
    }
};

const monthlyData = ref([]);
const yearTotals = ref({
    trades: { total: 0, wins: 0, losses: 0, breakeven: 0 },
    pnl: { total: 0, best: 0, worst: 0, avgMonthly: 0 },
    metrics: { winRate: 0, winRateExcludingBreakeven: 0, avgRValue: 0, totalRValue: 0 },
});

const showRValue = ref(false);

const pnlChartCanvas = ref(null);
const winRateChartCanvas = ref(null);
let pnlChartInstance = null;
let winRateChartInstance = null;

const availableYears = computed(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i < 5; i++) {
        years.push(currentYear - i);
    }
    return years;
});

// Computed property for total R-values per month
const monthlyTotalRValues = computed(() => {
    return monthlyData.value.map((month) => {
        // Use the correct totalRValue from backend (which is SUM of r_value)
        return month.metrics.totalRValue;
    });
});

// Watch for year changes and save to localStorage
watch(selectedYear, (newYear) => {
    localStorage.setItem("monthlyPerformanceYear", newYear.toString());
    uiPreferencesStore.notifyChanged("monthlyPerformanceYear", newYear);
});

// Watch for global account filter changes
watch(selectedAccount, () => {
    loadMonthlyData();
});

// Filter changes — persist and reload. `deep: true` is correct here since the
// arrays mutate in place via v-model checkboxes.
watch(
    selectedTags,
    (next) => {
        localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(next));
        loadMonthlyData();
    },
    { deep: true },
);
watch(
    selectedStrategies,
    (next) => {
        localStorage.setItem(STORAGE_KEYS.strategies, JSON.stringify(next));
        loadMonthlyData();
    },
    { deep: true },
);

const toggleRValue = () => {
    showRValue.value = !showRValue.value;
    createPnLChart();
};

const loadMonthlyData = async () => {
    loading.value = true;
    error.value = null;

    try {
        const response = await tradesStore.getMonthlyPerformance(
            selectedYear.value,
            {
                accounts: selectedAccount.value,
                tags: selectedTags.value,
                strategies: selectedStrategies.value,
            },
        );
        console.log("[MONTHLY] Response received:", response);

        if (response) {
            monthlyData.value = response.monthly || [];
            yearTotals.value = response.yearTotals || {
                trades: { total: 0, wins: 0, losses: 0, breakeven: 0 },
                pnl: { total: 0, best: 0, worst: 0, avgMonthly: 0 },
                metrics: { winRate: 0, avgRValue: 0, totalRValue: 0 },
            };

            console.log(
                "[MONTHLY] Data loaded - months:",
                monthlyData.value.length,
            );

            // Wait for DOM to update
            await nextTick();
            setTimeout(() => {
                console.log("[CHARTS] Rendering charts after timeout");
                renderCharts();
            }, 100);
        }
    } catch (err) {
        console.error("[ERROR] Failed to load monthly performance:", err);
        error.value =
            "Failed to load monthly performance data. Please try again.";
    } finally {
        loading.value = false;
        initialLoading.value = false;
    }
};

const renderCharts = () => {
    console.log("[CHARTS] renderCharts called");
    console.log("[CHARTS] Canvas refs:", {
        pnl: !!pnlChartCanvas.value,
        winRate: !!winRateChartCanvas.value,
    });
    console.log("[CHARTS] Data length:", monthlyData.value.length);

    if (monthlyData.value.length > 0) {
        createPnLChart();
        createWinRateChart();
    } else {
        console.warn("[CHARTS] No data available for charts");
    }
};

const createPnLChart = () => {
    if (!pnlChartCanvas.value) {
        console.error("[CHARTS] P&L canvas element not found!");
        return;
    }

    console.log("[CHARTS] Creating chart... showRValue:", showRValue.value);

    // Destroy existing chart
    if (pnlChartInstance) {
        pnlChartInstance.destroy();
    }

    const ctx = pnlChartCanvas.value.getContext("2d");
    const labels = monthlyData.value.map((m) =>
        m.monthName.trim().substring(0, 3),
    );

    // Use R-values or P&L based on toggle
    const data = showRValue.value
        ? monthlyTotalRValues.value
        : monthlyData.value.map((m) => m.pnl.total);

    const colors = data.map((value) => {
        if (value > 0) return "rgba(16, 185, 129, 0.8)"; // green
        if (value < 0) return "rgba(239, 68, 68, 0.8)"; // red
        return "rgba(156, 163, 175, 0.8)"; // gray
    });

    console.log("[CHARTS] Chart data:", {
        labels,
        data,
        showRValue: showRValue.value,
    });

    pnlChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: showRValue.value ? "Monthly R-Value" : "Monthly P&L",
                    data,
                    backgroundColor: colors,
                    borderColor: colors.map((c) => c.replace("0.8", "1")),
                    borderWidth: 2,
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            showRValue.value
                                ? `R-Value: ${context.raw.toFixed(2)}R`
                                : `P&L: ${formatCurrency(context.raw)}`,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) =>
                            showRValue.value
                                ? `${value.toFixed(1)}R`
                                : formatCurrency(value, { compact: true }),
                    },
                },
            },
        },
    });

    console.log("[CHARTS] Chart created successfully");
};

const createWinRateChart = () => {
    if (!winRateChartCanvas.value) {
        console.error("[CHARTS] Win Rate canvas element not found!");
        return;
    }

    console.log("[CHARTS] Creating Win Rate chart...");

    // Destroy existing chart
    if (winRateChartInstance) {
        winRateChartInstance.destroy();
    }

    const ctx = winRateChartCanvas.value.getContext("2d");
    const labels = monthlyData.value.map((m) =>
        m.monthName.trim().substring(0, 3),
    );
    const data = monthlyData.value.map((m) => m.metrics.winRate);

    console.log("[CHARTS] Win Rate data:", { labels, data });

    winRateChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Win Rate %",
                    data,
                    borderColor: "rgb(59, 130, 246)",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `Win Rate: ${context.raw.toFixed(1)}%`,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: (value) => `${value}%`,
                    },
                },
            },
        },
    });

    console.log("[CHARTS] Win Rate chart created successfully");
};

// Formatting helpers
const formatPercentage = (value) => {
    if (value === null || value === undefined) return "-";
    return `${value.toFixed(1)}%`;
};

const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return "-";
    return value.toFixed(decimals);
};

const getPnLClass = (value) => {
    if (value > 0) return "text-success";
    if (value < 0) return "text-danger";
    return "text-gray-500";
};

const getWinRateBadgeClass = (value) => {
    if (value >= 60)
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (value >= 50)
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
};

const getRValueClass = (value) => {
    if (value > 0) return "text-success";
    if (value < 0) return "text-danger";
    return "text-gray-500";
};

onMounted(() => {
    console.log("[MONTHLY] Component mounted");
    loadMonthlyData();
    fetchAvailableTags();
    fetchAvailableStrategies();
    document.addEventListener("click", handleOutsideClick);
});

onUnmounted(() => {
    document.removeEventListener("click", handleOutsideClick);
});
</script>
