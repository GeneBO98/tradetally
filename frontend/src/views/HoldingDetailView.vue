<template>
    <div class="content-wrapper py-8">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-16">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
            ></div>
        </div>

        <!-- Error State -->
        <div
            v-else-if="error"
            class="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 text-center"
        >
            <p class="text-red-700 dark:text-red-400">{{ error }}</p>
            <button @click="loadHolding" class="mt-4 btn-primary">
                Try Again
            </button>
        </div>

        <!-- Content -->
        <div v-else-if="holding">
            <!-- Header -->
            <div class="mb-6">
                <button
                    @click="$router.push('/analysis')"
                    class="flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
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
                    Back to Holdings
                </button>

                <div class="flex items-start justify-between">
                    <div class="flex items-center">
                        <img
                            v-if="profile?.logo"
                            :src="profile.logo"
                            :alt="holding.symbol"
                            class="w-16 h-16 rounded-lg mr-4"
                        />
                        <div
                            v-else
                            class="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-4"
                        >
                            <span class="text-xl font-bold text-gray-500">{{
                                holding.symbol.slice(0, 2)
                            }}</span>
                        </div>
                        <div>
                            <h1 class="heading-page">{{ holding.symbol }}</h1>
                            <p
                                v-if="profile?.name"
                                class="text-gray-500 dark:text-gray-400"
                            >
                                {{ profile.name }}
                            </p>
                            <p
                                v-if="holding.broker"
                                class="text-sm text-gray-400 dark:text-gray-500"
                            >
                                {{ holding.broker }}
                            </p>
                        </div>
                    </div>

                    <div class="flex items-center space-x-3">
                        <button
                            @click="showAddLot = true"
                            class="btn-secondary"
                        >
                            Add Shares
                        </button>
                        <button
                            @click="showRecordDividend = true"
                            class="btn-secondary"
                        >
                            Record Dividend
                        </button>
                        <button
                            @click="confirmDelete"
                            class="btn-secondary text-red-600 hover:text-red-700"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            <!-- Overview Cards -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
            >
                <!-- Shares -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Shares
                    </p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {{ formatNumber(holding.shares) }}
                    </p>
                </div>

                <!-- Current Value -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Current Value
                    </p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {{ formatCurrency(holding.currentValue) }}
                    </p>
                    <p
                        v-if="holding.currentPrice"
                        class="text-xs text-gray-400"
                    >
                        @ {{ formatCurrency(holding.currentPrice) }}/share
                    </p>
                </div>

                <!-- Cost Basis -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Cost Basis
                    </p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {{ formatCurrency(holding.costBasis) }}
                    </p>
                    <p class="text-xs text-gray-400">
                        @ {{ formatCurrency(holding.averageCost) }}/share
                    </p>
                </div>

                <!-- Unrealized P&L -->
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Unrealized P&L
                    </p>
                    <p
                        :class="[
                            'text-2xl font-bold',
                            holding.unrealizedPnL >= 0
                                ? 'text-green-600'
                                : 'text-red-600',
                        ]"
                    >
                        {{ formatCurrency(holding.unrealizedPnL) }}
                    </p>
                    <p
                        v-if="holding.unrealizedPnLPercent !== undefined"
                        :class="[
                            'text-xs',
                            holding.unrealizedPnL >= 0
                                ? 'text-green-500'
                                : 'text-red-500',
                        ]"
                    >
                        {{ holding.unrealizedPnL >= 0 ? "+" : ""
                        }}{{ holding.unrealizedPnLPercent.toFixed(2) }}%
                    </p>
                </div>
            </div>

            <!-- Tabs -->
            <div class="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav class="-mb-px flex space-x-8">
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        @click="activeTab = tab.id"
                        :class="[
                            'py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap',
                            activeTab === tab.id
                                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400',
                        ]"
                    >
                        {{ tab.name }}
                        <span
                            v-if="tab.count !== undefined"
                            class="ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-xs"
                        >
                            {{ tab.count }}
                        </span>
                    </button>
                </nav>
            </div>

            <!-- Tab Content -->
            <div>
                <!-- Lots Tab -->
                <div v-if="activeTab === 'lots'">
                    <div
                        class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
                    >
                        <table
                            class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                        >
                            <thead class="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th
                                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Purchase Date
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Shares
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Cost/Share
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Total Cost
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Current Value
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Gain/Loss
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody
                                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <tr v-for="lot in lots" :key="lot.id">
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
                                    >
                                        {{ formatDate(lot.purchaseDate) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                                    >
                                        {{ formatNumber(lot.shares) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                                    >
                                        {{ formatCurrency(lot.costPerShare) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                                    >
                                        {{ formatCurrency(lot.totalCost) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                                    >
                                        {{ formatCurrency(lot.currentValue) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right"
                                        :class="
                                            lot.gainLoss >= 0
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                        "
                                    >
                                        {{ formatCurrency(lot.gainLoss) }}
                                        <span class="text-xs ml-1"
                                            >({{
                                                lot.gainLossPercent.toFixed(1)
                                            }}%)</span
                                        >
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right"
                                    >
                                        <button
                                            @click="deleteLot(lot.id)"
                                            class="text-red-600 hover:text-red-800"
                                            title="Delete lot"
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
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                ></path>
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                                <tr v-if="lots.length === 0">
                                    <td
                                        colspan="7"
                                        class="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        No purchase lots recorded. Add shares to
                                        track your cost basis.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Dividends Tab -->
                <div v-if="activeTab === 'dividends'">
                    <div
                        class="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
                    >
                        <!-- Summary -->
                        <div
                            class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700"
                        >
                            <div class="flex items-center justify-between">
                                <div>
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Total Dividends Received
                                    </p>
                                    <p class="text-xl font-bold text-green-600">
                                        {{ formatCurrency(totalDividends) }}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Yield on Cost
                                    </p>
                                    <p
                                        class="text-xl font-bold text-gray-900 dark:text-white"
                                    >
                                        {{
                                            holding.costBasis > 0
                                                ? (
                                                      (totalDividends /
                                                          holding.costBasis) *
                                                      100
                                                  ).toFixed(2)
                                                : 0
                                        }}%
                                    </p>
                                </div>
                            </div>
                        </div>

                        <table
                            class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                        >
                            <thead class="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th
                                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Date
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Amount
                                    </th>
                                    <th
                                        class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Per Share
                                    </th>
                                    <th
                                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Type
                                    </th>
                                    <th
                                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                    >
                                        Notes
                                    </th>
                                </tr>
                            </thead>
                            <tbody
                                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <tr
                                    v-for="dividend in dividends"
                                    :key="dividend.id"
                                >
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
                                    >
                                        {{ formatDate(dividend.paymentDate) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-medium"
                                    >
                                        {{ formatCurrency(dividend.amount) }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400"
                                    >
                                        {{
                                            dividend.perShare
                                                ? formatCurrency(
                                                      dividend.perShare,
                                                  )
                                                : "-"
                                        }}
                                    </td>
                                    <td
                                        class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize"
                                    >
                                        {{ dividend.dividendType || "regular" }}
                                    </td>
                                    <td
                                        class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate"
                                    >
                                        {{ dividend.notes || "-" }}
                                    </td>
                                </tr>
                                <tr v-if="dividends.length === 0">
                                    <td
                                        colspan="5"
                                        class="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        No dividends recorded yet.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Analysis Tab -->
                <div v-if="activeTab === 'analysis'">
                    <div
                        v-if="analysisLoading"
                        class="flex items-center justify-center py-16"
                    >
                        <div
                            class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
                        ></div>
                        <span class="ml-3 text-gray-500"
                            >Loading analysis...</span
                        >
                    </div>

                    <div v-else-if="analysis">
                        <EightPillarsCard
                            :analysis="analysis"
                            @view-details="
                                $router.push(
                                    `/analysis/analyze/${holding.symbol}`,
                                )
                            "
                        />
                    </div>

                    <div
                        v-else
                        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center"
                    >
                        <p class="text-gray-500 dark:text-gray-400 mb-4">
                            No 8 Pillars analysis available
                        </p>
                        <button @click="loadAnalysis" class="btn-primary">
                            Run Analysis
                        </button>
                    </div>
                </div>

                <!-- Notes Tab -->
                <div v-if="activeTab === 'notes'">
                    <div
                        class="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6"
                    >
                        <h3
                            class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                        >
                            Position Notes
                        </h3>
                        <textarea
                            v-model="notes"
                            rows="6"
                            placeholder="Add notes about your investment thesis, target prices, etc..."
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        ></textarea>
                        <div class="mt-4 flex justify-end">
                            <button
                                @click="saveNotes"
                                :disabled="savingNotes"
                                class="btn-primary"
                            >
                                {{ savingNotes ? "Saving..." : "Save Notes" }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Lot Modal -->
        <AddLotModal
            v-if="showAddLot"
            :holding-id="holding?.id"
            @close="showAddLot = false"
            @created="onLotCreated"
        />

        <!-- Record Dividend Modal -->
        <RecordDividendModal
            v-if="showRecordDividend"
            :holding-id="holding?.id"
            :shares="holding?.shares"
            @close="showRecordDividend = false"
            @created="onDividendRecorded"
        />

        <!-- Delete Confirmation -->
        <div
            v-if="showDeleteConfirm"
            class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            >
                <h3
                    class="text-lg font-medium text-gray-900 dark:text-white mb-4"
                >
                    Delete Holding
                </h3>
                <p class="text-gray-500 dark:text-gray-400 mb-6">
                    Are you sure you want to delete this holding? This will also
                    remove all lots and dividend records. This action cannot be
                    undone.
                </p>
                <div class="flex justify-end space-x-3">
                    <button
                        @click="showDeleteConfirm = false"
                        class="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        @click="deleteHolding"
                        class="btn-primary bg-red-600 hover:bg-red-700"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useInvestmentsStore } from "@/stores/investments";
import { useNotification } from "@/composables/useNotification";
import { format, parseISO } from "date-fns";
import EightPillarsCard from "@/components/investments/EightPillarsCard.vue";
import AddLotModal from "@/components/investments/AddLotModal.vue";
import RecordDividendModal from "@/components/investments/RecordDividendModal.vue";

const route = useRoute();
const router = useRouter();
const investmentsStore = useInvestmentsStore();
const { showDangerConfirmation } = useNotification();

const holding = ref(null);
const lots = ref([]);
const dividends = ref([]);
const profile = ref(null);
const analysis = ref(null);
const notes = ref("");

const loading = ref(false);
const error = ref(null);
const analysisLoading = ref(false);
const savingNotes = ref(false);

const activeTab = ref("lots");
const showAddLot = ref(false);
const showRecordDividend = ref(false);
const showDeleteConfirm = ref(false);

const tabs = computed(() => [
    { id: "lots", name: "Purchase Lots", count: lots.value.length },
    { id: "dividends", name: "Dividends", count: dividends.value.length },
    { id: "analysis", name: "8 Pillars" },
    { id: "notes", name: "Notes" },
]);

const totalDividends = computed(() => {
    return dividends.value.reduce((sum, d) => sum + (d.amount || 0), 0);
});

onMounted(() => {
    loadHolding();
});

watch(
    () => route.params.id,
    () => {
        loadHolding();
    },
);

watch(activeTab, (newTab) => {
    if (newTab === "analysis" && !analysis.value && !analysisLoading.value) {
        loadAnalysis();
    }
});

async function loadHolding() {
    const id = route.params.id;
    if (!id) return;

    loading.value = true;
    error.value = null;

    try {
        // Load holding details
        holding.value = await investmentsStore.getHolding(id);
        notes.value = holding.value.notes || "";

        // Load lots and dividends in parallel
        const [lotsData, dividendsData] = await Promise.all([
            investmentsStore.getLots(id),
            investmentsStore.getDividends(id),
        ]);

        // Calculate lot-level P&L
        lots.value = lotsData.map((lot) => {
            const currentPrice = holding.value.currentPrice || 0;
            const currentValue = lot.shares * currentPrice;
            const gainLoss = currentValue - lot.totalCost;
            const gainLossPercent =
                lot.totalCost > 0 ? (gainLoss / lot.totalCost) * 100 : 0;

            return {
                ...lot,
                currentValue,
                gainLoss,
                gainLossPercent,
            };
        });

        dividends.value = dividendsData;

        // Load company profile
        try {
            profile.value = await investmentsStore.getProfile(
                holding.value.symbol,
            );
        } catch (e) {
            console.error("Failed to load profile:", e);
        }
    } catch (err) {
        error.value = err.message || "Failed to load holding";
    } finally {
        loading.value = false;
    }
}

async function loadAnalysis() {
    if (!holding.value) return;

    analysisLoading.value = true;
    try {
        analysis.value = await investmentsStore.analyzeStock(
            holding.value.symbol,
        );
    } catch (err) {
        console.error("Failed to load analysis:", err);
    } finally {
        analysisLoading.value = false;
    }
}

async function saveNotes() {
    if (!holding.value) return;

    savingNotes.value = true;
    try {
        await investmentsStore.updateHolding(holding.value.id, {
            notes: notes.value,
        });
        holding.value.notes = notes.value;
    } catch (err) {
        console.error("Failed to save notes:", err);
    } finally {
        savingNotes.value = false;
    }
}

function deleteLot(lotId) {
    showDangerConfirmation(
        "Delete Lot",
        "Are you sure you want to delete this lot?",
        async () => {
            try {
                await investmentsStore.deleteLot(lotId);
                await loadHolding();
            } catch (err) {
                console.error("Failed to delete lot:", err);
            }
        },
    );
}

function confirmDelete() {
    showDeleteConfirm.value = true;
}

async function deleteHolding() {
    if (!holding.value) return;

    try {
        await investmentsStore.deleteHolding(holding.value.id);
        router.push("/analysis");
    } catch (err) {
        console.error("Failed to delete holding:", err);
    }
}

async function onLotCreated() {
    showAddLot.value = false;
    await loadHolding();
}

async function onDividendRecorded() {
    showRecordDividend.value = false;
    await loadHolding();
}

function formatCurrency(value) {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
    }).format(value);
}

function formatNumber(value) {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    }).format(value);
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    try {
        return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
        return dateStr;
    }
}
</script>
