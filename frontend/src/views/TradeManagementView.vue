<template>
    <div class="content-wrapper py-8" data-testid="trade-management-view">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8">
            <div>
                <h1 class="heading-page">Trade Management</h1>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                    Analyze trade execution quality with R-Multiple analysis
                </p>
            </div>
        </div>

        <!-- Pro onboarding: step 3 -->
        <OnboardingCard
            v-if="authStore.proOnboardingStep === 3"
            :step="3"
            :total-steps="3"
            :next-step="4"
            tour-type="pro"
            title="Trade Management"
            description="Advanced stop loss analysis, R-value tracking, and position sizing tools."
            cta-label="Done"
        />

        <!-- Filters: collapsed by default, mirrors the Performance page. Drives
             both the R-Multiple Performance chart and the trade list below. -->
        <div class="card mb-8">
            <div class="card-body">
                <button
                    type="button"
                    class="flex w-full items-center justify-between text-left"
                    :aria-expanded="filtersExpanded"
                    @click="filtersExpanded = !filtersExpanded"
                >
                    <span class="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                        <FunnelIcon class="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        Filters
                        <span
                            v-if="activeFilterCount > 0"
                            class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white"
                        >{{ activeFilterCount }}</span>
                    </span>
                    <ChevronDownIcon
                        class="h-4 w-4 text-gray-500 transition-transform dark:text-gray-400"
                        :class="{ 'rotate-180': filtersExpanded }"
                    />
                </button>

                <div v-show="filtersExpanded" class="mt-4">
                    <TradeFilters @filter="handleFilter" />
                </div>
            </div>
        </div>

        <ExecutionRunPanel
            :filters="filters"
            :trade-count="trades.length"
        />

        <!-- R-Multiple Performance Chart -->
        <RPerformanceChart
            :filters="filters"
            :refresh-trigger="rPerfRefreshTrigger"
            class="mb-8"
            data-testid="r-performance-chart"
        />

        <!-- Divider -->
        <div class="border-t border-gray-200 dark:border-gray-700 my-8"></div>

        <!-- Individual Trade Analysis Section -->
        <div class="mb-6">
            <h2
                class="text-xl font-semibold text-gray-900 dark:text-white mb-2"
            >
                Individual Trade Analysis
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Select a trade to view detailed R-Multiple breakdown and chart
                visualization
            </p>
        </div>

        <!-- Trade Selector -->
        <TradeSelector
            :trades="trades"
            :loading="loading"
            :pagination="pagination"
            :selected-trade-id="selectedTradeId"
            data-testid="trade-selector"
            @trade-selected="onTradeSelected"
            @load-more="loadMoreTrades"
        />

        <!-- Stop Loss / Take Profit Form (conditional) -->
        <StopLossTakeProfitForm
            v-if="selectedTrade && (needsRiskLevels || editingLevels)"
            :trade="selectedTrade"
            :saving="savingLevels"
            @levels-saved="onLevelsSaved"
            @cancel="cancelEditing"
        />

        <!-- Analysis Section (shown when trade has required data) -->
        <div
            v-if="selectedTrade && !needsRiskLevels && analysis"
            class="space-y-6 mt-6"
        >
            <!-- Candlestick Chart with Markers (only shown when chart data loads successfully and instrument is supported) -->
            <TradeManagementChart
                v-if="chartAvailable && isChartSupportedInstrument"
                :trade="selectedTrade"
                :loading="chartLoading"
                data-testid="trade-management-chart"
                @chart-loaded="onChartLoaded"
            />

            <!-- Message for unsupported instruments -->
            <div
                v-else-if="!isChartSupportedInstrument"
                class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
                <p class="text-gray-600 dark:text-gray-400 text-sm">
                    Chart visualization is not available for
                    {{ selectedTrade?.instrument_type }} trades.
                </p>
            </div>

            <!-- R-Multiple Analysis -->
            <RMultipleAnalysis :analysis="analysis" :trade="selectedTrade" />

            <!-- Summary Metrics (with inline editing) -->
            <TradeSummaryMetrics
                :trade="selectedTrade"
                :analysis="analysis"
                @levels-updated="onLevelsUpdated"
                @target-hit-updated="onTargetHitUpdated"
            />

            <!-- TradingView Charts (if any) -->
            <TradeCharts
                v-if="selectedTrade.charts && selectedTrade.charts.length > 0"
                :trade-id="selectedTrade.id"
                :charts="selectedTrade.charts"
                :can-delete="true"
                @deleted="onChartDeleted"
            />
        </div>

        <!-- Loading State for Analysis -->
        <div
            v-if="selectedTrade && !needsRiskLevels && analysisLoading"
            class="mt-6 bg-white dark:bg-gray-800 shadow-sm rounded-lg p-8 text-center"
        >
            <div
                class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"
            ></div>
            <p class="text-gray-600 dark:text-gray-400">
                Calculating R-Multiple analysis...
            </p>
        </div>

        <!-- Error State -->
        <div
            v-if="error"
            class="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
        >
            <p class="text-red-800 dark:text-red-200">{{ error }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { FunnelIcon, ChevronDownIcon } from "@heroicons/vue/24/outline";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
import { useGlobalAccountFilter } from "@/composables/useGlobalAccountFilter";
import TradeFilters from "@/components/trades/TradeFilters.vue";
import TradeSelector from "@/components/trade-management/TradeSelector.vue";
import StopLossTakeProfitForm from "@/components/trade-management/StopLossTakeProfitForm.vue";
import ExecutionRunPanel from "@/components/trade-management/ExecutionRunPanel.vue";
import TradeManagementChart from "@/components/trade-management/TradeManagementChart.vue";
import RMultipleAnalysis from "@/components/trade-management/RMultipleAnalysis.vue";
import TradeSummaryMetrics from "@/components/trade-management/TradeSummaryMetrics.vue";
import RPerformanceChart from "@/components/trade-management/RPerformanceChart.vue";
import TradeCharts from "@/components/trades/TradeCharts.vue";

const route = useRoute();
const router = useRouter();
const { selectedAccount } = useGlobalAccountFilter();

// State
const trades = ref([]);
const loading = ref(false);
const pagination = ref({
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false,
});
// Rich filter object emitted by TradeFilters (the same shape the Performance
// page uses). Seeded synchronously with the global account filter so the
// R-Performance chart's initial fetch already respects it.
const filters = ref({ accounts: selectedAccount.value || "" });
const filtersExpanded = ref(false);
const activeFilterCount = ref(0);

// Selected trade is restorable from the URL independently of the filter set.
const initialTradeId = route.query.tradeId || null;
// True once TradeFilters has emitted its (possibly localStorage-restored)
// filters on mount and driven the first fetch, so onMounted doesn't double-fetch.
let initialFetchDone = false;

const selectedTradeId = ref(null);
const selectedTrade = ref(null);
const analysis = ref(null);
const analysisLoading = ref(false);
const chartLoading = ref(false);
const chartAvailable = ref(false);
const savingLevels = ref(false);
const editingLevels = ref(false);
const error = ref(null);
const rPerfRefreshTrigger = ref(0);

// Computed
const needsRiskLevels = computed(() => {
    if (!selectedTrade.value) return false;
    return !selectedTrade.value.stop_loss;
});

// Check if chart should be available for this instrument type
// Futures are not supported by Alpha Vantage
const isChartSupportedInstrument = computed(() => {
    if (!selectedTrade.value) return true;
    const instrumentType = selectedTrade.value.instrument_type;
    // Futures are not supported
    if (instrumentType === "future") return false;
    return true;
});

// URL State Management — only the selected trade is tracked in the URL so it
// can be deep-linked/shared. TradeFilters owns filter persistence (localStorage).
function updateUrlParams() {
    const query = {};
    if (selectedTradeId.value) query.tradeId = selectedTradeId.value;

    if (query.tradeId !== route.query.tradeId) {
        router.replace({ query });
    }
}

// Build query params from the active filter set (matches the Performance page).
// Arrays are sent comma-separated; empty values are dropped. The global account
// filter always wins for the `accounts` param.
function buildTradeParams(extra = {}) {
    const params = { ...extra };
    const f = filters.value || {};
    for (const [key, value] of Object.entries(f)) {
        if (value === null || value === undefined || value === "" || value === false) continue;
        if (Array.isArray(value)) {
            if (value.length > 0) params[key] = value.join(",");
        } else {
            params[key] = typeof value === "string" ? value.trim() : value;
        }
    }
    if (selectedAccount.value) params.accounts = selectedAccount.value;
    return params;
}

// Methods
async function fetchTrades() {
    loading.value = true;
    error.value = null;

    try {
        const params = buildTradeParams({
            limit: pagination.value.limit,
            offset: pagination.value.offset,
        });

        console.log("[TRADE-MGMT] Fetching trades with params:", params);
        const response = await api.get("/trade-management/trades", { params });
        trades.value = response.data.trades;
        pagination.value = response.data.pagination;
        console.log("[TRADE-MGMT] Fetched", trades.value.length, "trades");
    } catch (err) {
        error.value = err.response?.data?.error || "Failed to fetch trades";
        console.error("Error fetching trades:", err);
    } finally {
        loading.value = false;
    }
}

async function loadMoreTrades() {
    if (!pagination.value.has_more || loading.value) return;

    loading.value = true;
    error.value = null;

    try {
        const params = buildTradeParams({
            limit: pagination.value.limit,
            offset: pagination.value.offset + pagination.value.limit,
        });

        const response = await api.get("/trade-management/trades", { params });
        trades.value = [...trades.value, ...response.data.trades];
        pagination.value = response.data.pagination;
    } catch (err) {
        error.value = err.response?.data?.error || "Failed to load more trades";
    } finally {
        loading.value = false;
    }
}

function handleFilter(newFilters) {
    // TradeFilters only emits non-empty values, so their count is the badge.
    activeFilterCount.value = Object.values(newFilters || {}).filter(
        (v) =>
            v !== "" &&
            v !== null &&
            v !== undefined &&
            v !== false &&
            !(Array.isArray(v) && v.length === 0),
    ).length;

    // Replace wholesale so cleared filters actually clear. Keep the global
    // account filter (managed separately from TradeFilters) in sync so the
    // R-Performance chart, which reads `filters` directly, stays scoped.
    filters.value = { ...(newFilters || {}), accounts: selectedAccount.value || "" };
    pagination.value.offset = 0;
    clearSelection();
    initialFetchDone = true;
    fetchTrades();
}

async function onTradeSelected(trade) {
    selectedTradeId.value = trade.id;
    selectedTrade.value = trade;
    analysis.value = null;
    error.value = null;
    editingLevels.value = false;
    chartAvailable.value = false;

    // Update URL with selected trade
    updateUrlParams();

    // If trade has stop loss, fetch analysis
    if (trade.stop_loss) {
        await fetchAnalysis(trade.id);
    }
}

function onChartLoaded({ success }) {
    chartAvailable.value = success;
}

async function fetchAnalysis(tradeId) {
    analysisLoading.value = true;
    chartLoading.value = true;
    chartAvailable.value = true; // Optimistically show chart, will hide if load fails
    error.value = null;

    try {
        const response = await api.get(`/trade-management/analysis/${tradeId}`);
        selectedTrade.value = response.data.trade;
        analysis.value = response.data.analysis;

        // Skip chart visualization for futures (not supported)
        if (selectedTrade.value?.instrument_type === "future") {
            chartAvailable.value = false;
            chartLoading.value = false;
        }
    } catch (err) {
        if (err.response?.data?.needs_stop_loss) {
            // Trade needs stop loss - this is handled by needsRiskLevels computed
        } else {
            error.value =
                err.response?.data?.error || "Failed to fetch analysis";
        }
    } finally {
        analysisLoading.value = false;
        chartLoading.value = false;
    }
}

async function onLevelsSaved(updatedTrade) {
    selectedTrade.value = updatedTrade;
    editingLevels.value = false;
    // Re-fetch analysis with new levels
    await fetchAnalysis(updatedTrade.id);
    updateTradeInList(updatedTrade);
    rPerfRefreshTrigger.value++;
}

async function refreshAnalysisOnly(tradeId) {
    try {
        const response = await api.get(`/trade-management/analysis/${tradeId}`);
        analysis.value = response.data.analysis;
        // Keep chart data fresh if present
        if (response.data.trade?.charts && selectedTrade.value) {
            selectedTrade.value.charts = response.data.trade.charts;
        }
    } catch (err) {
        console.log('[TRADE-MGMT] Analysis-only refresh error:', err.message);
    }
}

async function onLevelsUpdated(updatedTrade) {
    // Merge specific fields into existing object instead of replacing entirely
    // This avoids triggering the take_profit_targets watcher in child components
    if (selectedTrade.value) {
        selectedTrade.value.stop_loss = updatedTrade.stop_loss;
        selectedTrade.value.take_profit = updatedTrade.take_profit;
        selectedTrade.value.take_profit_targets = updatedTrade.take_profit_targets;
        selectedTrade.value.r_value = updatedTrade.r_value;
        selectedTrade.value.management_r = updatedTrade.management_r;
        selectedTrade.value.risk_level_history = updatedTrade.risk_level_history;
    } else {
        selectedTrade.value = updatedTrade;
    }
    // Refresh analysis without replacing selectedTrade
    await refreshAnalysisOnly(updatedTrade.id);
    updateTradeInList(updatedTrade);
    rPerfRefreshTrigger.value++;
}

async function onTargetHitUpdated(data) {
    // Mutate individual properties to avoid triggering full reactivity cascade
    if (selectedTrade.value) {
        selectedTrade.value.manual_target_hit_first = data.manual_target_hit_first;
        selectedTrade.value.management_r = data.management_r;
        if (data.take_profit_targets) {
            selectedTrade.value.take_profit_targets = data.take_profit_targets;
        }
    }
    if (data.analysis && analysis.value) {
        Object.assign(analysis.value, data.analysis);
    }
    // Trigger refresh of the R-Performance chart to reflect updated management R values
    rPerfRefreshTrigger.value++;
}

function onChartDeleted(chartId) {
    // Remove the deleted chart from selectedTrade's charts array
    if (selectedTrade.value && selectedTrade.value.charts) {
        selectedTrade.value.charts = selectedTrade.value.charts.filter(
            (chart) => chart.id !== chartId,
        );
    }
}

function updateTradeInList(updatedTrade) {
    // Update the trade in the list
    const index = trades.value.findIndex((t) => t.id === updatedTrade.id);
    if (index !== -1) {
        trades.value[index] = {
            ...trades.value[index],
            stop_loss: updatedTrade.stop_loss,
            take_profit: updatedTrade.take_profit,
            needs_stop_loss: !updatedTrade.stop_loss,
            needs_take_profit: !updatedTrade.take_profit,
            can_analyze: !!updatedTrade.stop_loss,
        };
    }
}

function cancelEditing() {
    editingLevels.value = false;
    // If trade doesn't have stop loss, clear selection entirely
    if (!selectedTrade.value?.stop_loss) {
        clearSelection();
    }
}

function clearSelection() {
    selectedTradeId.value = null;
    selectedTrade.value = null;
    analysis.value = null;
    error.value = null;
    editingLevels.value = false;
    chartAvailable.value = false;
    updateUrlParams();
}

// Lifecycle
// Watch for global account filter changes
watch(selectedAccount, () => {
    console.log(
        "[TRADE-MGMT] Global account filter changed to:",
        selectedAccount.value || "All Accounts",
    );
    // Update filters with the new account so RPerformanceChart also refreshes
    filters.value = { ...filters.value, accounts: selectedAccount.value || "" };
    pagination.value.offset = 0;
    clearSelection();
    fetchTrades();
});

onMounted(async () => {
    // TradeFilters emits its saved filters on mount (before this runs) when any
    // exist, which drives the first fetch via handleFilter. Only fetch here when
    // it didn't, so we don't double-load.
    if (!initialFetchDone) {
        await fetchTrades();
    }

    // If there was a selected trade ID in the URL, try to restore it
    if (initialTradeId) {
        // First check if the trade is in the current list
        const trade = trades.value.find((t) => t.id === initialTradeId);
        if (trade) {
            // Trade is in the list, select it
            await onTradeSelected(trade);
        } else {
            // Trade not in current list - fetch it directly and load analysis
            try {
                const response = await api.get(
                    `/trade-management/analysis/${initialTradeId}`,
                );
                selectedTradeId.value = initialTradeId;
                selectedTrade.value = response.data.trade;
                analysis.value = response.data.analysis;
                updateUrlParams();
            } catch (err) {
                console.error(
                    "[TRADE-MGMT] Could not restore selected trade:",
                    err,
                );
                // Clear the invalid trade ID from URL
                updateUrlParams();
            }
        }
    }
});
</script>
