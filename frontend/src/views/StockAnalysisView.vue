<template>
    <div class="content-wrapper py-8">
        <!-- Header -->
        <div class="flex items-center mb-8">
            <button
                @click="goBack"
                class="mr-4 p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <svg
                    class="w-5 h-5"
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
            </button>
            <div class="flex-1">
                <div class="flex items-center">
                    <img
                        v-if="analysis?.logo"
                        :src="analysis.logo"
                        :alt="symbol"
                        class="w-10 h-10 rounded-lg mr-3"
                    />
                    <div>
                        <h1 class="heading-page">{{ symbol }}</h1>
                        <p
                            v-if="analysis?.companyName"
                            class="text-gray-600 dark:text-gray-400"
                        >
                            {{ analysis.companyName }}
                        </p>
                    </div>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                <button
                    @click="refreshAnalysis"
                    :disabled="loading"
                    class="btn-secondary"
                >
                    {{ loading ? "Refreshing..." : "Refresh" }}
                </button>
                <button @click="showAddHoldingModal = true" class="btn-primary">
                    Add to Holdings
                </button>
            </div>
        </div>

        <!-- Loading State -->
        <div
            v-if="loading && !analysis"
            class="flex justify-center items-center py-12"
        >
            <div
                class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
            ></div>
        </div>

        <!-- Error State -->
        <div
            v-else-if="error"
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
        >
            <p class="text-red-700 dark:text-red-400">{{ error }}</p>
            <button
                @click="loadAnalysis"
                class="mt-2 text-red-600 hover:text-red-800 text-sm"
            >
                Try Again
            </button>
        </div>

        <!-- Analysis Content -->
        <div v-else-if="analysis">
            <!-- Summary Card -->
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6 mb-6"
            >
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Current Price
                        </p>
                        <p
                            class="text-2xl font-bold text-gray-900 dark:text-white"
                        >
                            {{
                                analysis.currentPrice
                                    ? formatCurrency(analysis.currentPrice)
                                    : "N/A"
                            }}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Market Cap
                        </p>
                        <p
                            class="text-2xl font-bold text-gray-900 dark:text-white"
                        >
                            {{ formatMarketCap(analysis.marketCap) }}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Industry
                        </p>
                        <p
                            class="text-lg font-medium text-gray-900 dark:text-white"
                        >
                            {{ analysis.industry || "N/A" }}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            Data Periods
                        </p>
                        <p
                            class="text-lg font-medium text-gray-900 dark:text-white"
                        >
                            {{ analysis.periodsAnalyzed }} years
                        </p>
                    </div>
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500">
                    Last updated: {{ formatDate(analysis.analysisDate) }}
                </p>
            </div>

            <!-- Price Chart -->
            <div class="mb-6">
                <StockPriceChart :symbol="symbol" />
            </div>

            <!-- 8 Pillars Analysis -->
            <div
                class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
            >
                <div
                    class="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
                >
                    <h2
                        class="text-lg font-medium text-gray-900 dark:text-white"
                    >
                        8 Pillars Analysis
                    </h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Based on Paul Gabrail's value investing methodology.
                        Click any pillar to see calculation details.
                    </p>
                </div>

                <div class="divide-y divide-gray-200 dark:divide-gray-700">
                    <!-- Pillar 1 -->
                    <PillarRow
                        pillar-number="1"
                        :pillar="analysis.pillars.pillar1"
                    />

                    <!-- Pillar 2 -->
                    <PillarRow
                        pillar-number="2"
                        :pillar="analysis.pillars.pillar2"
                    />

                    <!-- Pillar 3 -->
                    <PillarRow
                        pillar-number="3"
                        :pillar="analysis.pillars.pillar3"
                    />

                    <!-- Pillar 4 -->
                    <PillarRow
                        pillar-number="4"
                        :pillar="analysis.pillars.pillar4"
                    />

                    <!-- Pillar 5 -->
                    <PillarRow
                        pillar-number="5"
                        :pillar="analysis.pillars.pillar5"
                    />

                    <!-- Pillar 6 -->
                    <PillarRow
                        pillar-number="6"
                        :pillar="analysis.pillars.pillar6"
                    />

                    <!-- Pillar 7 -->
                    <PillarRow
                        pillar-number="7"
                        :pillar="analysis.pillars.pillar7"
                    />

                    <!-- Pillar 8 -->
                    <PillarRow
                        pillar-number="8"
                        :pillar="analysis.pillars.pillar8"
                    />
                </div>

                <!-- Summary -->
                <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700">
                    <div class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300"
                            >Pillars Passed</span
                        >
                        <span
                            class="text-xl font-bold text-gray-900 dark:text-white"
                        >
                            {{ analysis.pillarsPassed }} / 8
                        </span>
                    </div>
                </div>
            </div>

            <!-- Financial Statements Section -->
            <div class="mt-6">
                <FinancialStatementTabs :symbol="symbol" />
            </div>

            <!-- DCF Valuation Calculator -->
            <div class="mt-6">
                <DCFValuationSection :symbol="symbol" :analysis="analysis" />
            </div>
        </div>

        <!-- Add Holding Modal -->
        <AddHoldingModal
            v-if="showAddHoldingModal"
            :initial-symbol="symbol"
            @close="showAddHoldingModal = false"
            @created="onHoldingCreated"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useInvestmentsStore } from "@/stores/investments";
import { format } from "date-fns";
import { useUserTimezone } from "@/composables/useUserTimezone";
import PillarRow from "@/components/investments/PillarRow.vue";

const { formatDateTime: formatDateTimeTz } = useUserTimezone();
import AddHoldingModal from "@/components/investments/AddHoldingModal.vue";
import StockPriceChart from "@/components/investments/StockPriceChart.vue";
import FinancialStatementTabs from "@/components/investments/financials/FinancialStatementTabs.vue";
import DCFValuationSection from "@/components/investments/dcf/DCFValuationSection.vue";

const route = useRoute();
const router = useRouter();
const investmentsStore = useInvestmentsStore();

// Initialize symbol from route params - this ensures it works on refresh
const symbol = ref("");
const analysis = ref(null);
const loading = ref(false);
const error = ref(null);
const showAddHoldingModal = ref(false);

// Initialize symbol immediately
if (route.params.symbol) {
    symbol.value = route.params.symbol.toUpperCase();
}

onMounted(() => {
    // Ensure symbol is set from route params (handles refresh)
    if (route.params.symbol && !symbol.value) {
        symbol.value = route.params.symbol.toUpperCase();
    }
    if (symbol.value) {
        loadAnalysis();
    }
});

watch(
    () => route.params.symbol,
    (newSymbol) => {
        if (newSymbol) {
            symbol.value = newSymbol.toUpperCase();
            loadAnalysis();
        }
    },
    { immediate: true },
);

async function loadAnalysis() {
    if (!symbol.value) return;

    loading.value = true;
    error.value = null;

    try {
        // Always force refresh when loading analysis (user explicitly navigated to this page)
        analysis.value = await investmentsStore.analyzeStock(
            symbol.value,
            true,
        );
    } catch (err) {
        error.value = err.response?.data?.error || "Failed to load analysis";
        console.error("Load analysis failed:", err);
    } finally {
        loading.value = false;
    }
}

async function refreshAnalysis() {
    loading.value = true;
    error.value = null;

    try {
        analysis.value = await investmentsStore.analyzeStock(
            symbol.value,
            true,
        );
    } catch (err) {
        error.value = err.response?.data?.error || "Failed to refresh analysis";
    } finally {
        loading.value = false;
    }
}

function onHoldingCreated() {
    showAddHoldingModal.value = false;
    router.push("/analysis");
}

function goBack() {
    // Check if we came from the scanner tab via query param
    const fromScanner = route.query.from === "scanner";
    if (fromScanner) {
        router.push("/analysis?tab=scanner");
    } else if (window.history.length > 1) {
        router.back();
    } else {
        router.push("/analysis");
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
    }).format(value);
}

function formatMarketCap(value) {
    if (!value) return "N/A";

    if (value >= 1e12) {
        return `$${(value / 1e12).toFixed(2)}T`;
    } else if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(2)}M`;
    }
    return formatCurrency(value);
}

function formatDate(date) {
    if (!date) return "";
    return formatDateTimeTz(date);
}
</script>
