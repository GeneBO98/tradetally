<template>
    <div class="content-wrapper py-8">
        <!-- Breadcrumbs -->
        <nav class="flex mb-6" aria-label="Breadcrumb">
            <ol class="inline-flex items-center space-x-1 md:space-x-3">
                <li class="inline-flex items-center">
                    <router-link
                        to="/import"
                        class="inline-flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                        <ArrowUpTrayIcon class="w-4 h-4 mr-2" />
                        Import
                    </router-link>
                </li>
                <li>
                    <div class="flex items-center">
                        <ChevronRightIcon class="w-5 h-5 text-gray-400" />
                        <span
                            class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400 md:ml-2"
                        >
                            CUSIP Mappings
                        </span>
                    </div>
                </li>
            </ol>
        </nav>

        <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
            <!-- Header -->
            <div
                class="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
            >
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="heading-page">CUSIP Mappings</h1>
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Manage how CUSIPs are mapped to ticker symbols. User
                            overrides take priority over global mappings.
                        </p>
                    </div>
                    <div class="flex items-center space-x-3">
                        <button
                            @click="showCreateModal = true"
                            class="btn-primary text-sm"
                        >
                            <PlusIcon class="h-4 w-4 mr-2" />
                            Add Mapping
                        </button>
                        <button
                            @click="refreshData"
                            :disabled="loading"
                            class="btn-secondary text-sm"
                        >
                            <ArrowPathIcon
                                class="h-4 w-4 mr-2"
                                :class="{ 'animate-spin': loading }"
                            />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            <!-- Filters and Search -->
            <div
                class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700"
            >
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Search
                        </label>
                        <input
                            v-model="searchQuery"
                            @input="debouncedSearch"
                            type="text"
                            placeholder="Search CUSIP, ticker, or company..."
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white text-sm"
                        />
                    </div>
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Source
                        </label>
                        <select
                            v-model="sourceFilter"
                            @change="fetchMappings"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white text-sm"
                        >
                            <option value="">All Sources</option>
                            <option value="finnhub">Finnhub (Global)</option>
                            <option value="ai">AI Resolution</option>
                            <option value="manual">Manual Entry</option>
                        </select>
                    </div>
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Status
                        </label>
                        <select
                            v-model="verifiedFilter"
                            @change="fetchMappings"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white text-sm"
                        >
                            <option value="">All Status</option>
                            <option value="true">Verified</option>
                            <option value="false">Unverified</option>
                        </select>
                    </div>
                    <div class="flex items-end">
                        <button
                            @click="fetchMappingsForReview"
                            class="btn-yellow text-sm w-full"
                        >
                            <ExclamationTriangleIcon class="h-4 w-4 mr-2" />
                            Review Needed
                        </button>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div
                v-if="unmappedCusips.length > 0"
                class="px-6 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <ExclamationTriangleIcon
                            class="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2"
                        />
                        <span
                            class="text-sm font-medium text-yellow-800 dark:text-yellow-200"
                        >
                            {{ unmappedCusips.length }} unmapped CUSIPs found in
                            your trades
                        </span>
                    </div>
                    <button
                        @click="showUnmappedModal = true"
                        class="text-sm text-yellow-700 dark:text-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200 font-medium"
                    >
                        View Unmapped →
                    </button>
                </div>
            </div>

            <!-- Loading State -->
            <div
                v-if="loading && mappings.length === 0"
                class="p-8 text-center"
            >
                <div
                    class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"
                ></div>
                <p class="text-gray-500 dark:text-gray-400 mt-4">
                    Loading CUSIP mappings...
                </p>
            </div>

            <!-- Empty State -->
            <div v-else-if="mappings.length === 0" class="p-12 text-center">
                <DocumentMagnifyingGlassIcon
                    class="h-16 w-16 text-gray-400 mx-auto mb-4"
                />
                <h3
                    class="text-lg font-medium text-gray-900 dark:text-white mb-2"
                >
                    No CUSIP mappings found
                </h3>
                <p class="text-gray-500 dark:text-gray-400 mb-6">
                    {{
                        searchQuery
                            ? "Try adjusting your search criteria."
                            : "Start by adding a CUSIP mapping or check for unmapped CUSIPs in your trades."
                    }}
                </p>
                <button
                    v-if="!searchQuery"
                    @click="fetchUnmappedCusips"
                    class="btn-primary"
                >
                    Check for Unmapped CUSIPs
                </button>
            </div>

            <!-- Mappings Table -->
            <div v-else class="overflow-x-auto">
                <table
                    class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                >
                    <thead class="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                                CUSIP / Ticker
                            </th>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                                Company
                            </th>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                                Source / Status
                            </th>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                                Usage
                            </th>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody
                        class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                    >
                        <tr
                            v-for="mapping in mappings"
                            :key="mapping.id"
                            class="hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div>
                                    <div class="flex items-center">
                                        <code
                                            class="text-sm font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                                        >
                                            {{ mapping.cusip }}
                                        </code>
                                        <ArrowRightIcon
                                            class="h-4 w-4 text-gray-400 mx-2"
                                        />
                                        <span
                                            class="text-sm font-semibold text-primary-600 dark:text-primary-400"
                                        >
                                            {{ mapping.ticker }}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div
                                    class="text-sm text-gray-900 dark:text-white"
                                >
                                    {{
                                        mapping.company_name ||
                                        "Unknown Company"
                                    }}
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="space-y-1">
                                    <span
                                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                        :class="
                                            getSourceBadgeClass(
                                                mapping.resolution_source,
                                                mapping.is_user_override,
                                            )
                                        "
                                    >
                                        {{
                                            getSourceLabel(
                                                mapping.resolution_source,
                                                mapping.is_user_override,
                                            )
                                        }}
                                    </span>
                                    <div class="flex items-center space-x-2">
                                        <span
                                            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                            :class="
                                                mapping.verified
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                            "
                                        >
                                            {{
                                                mapping.verified
                                                    ? "Verified"
                                                    : "Unverified"
                                            }}
                                        </span>
                                        <span
                                            v-if="
                                                mapping.confidence_score < 100
                                            "
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            {{ mapping.confidence_score }}%
                                            confidence
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="space-y-1">
                                    <div
                                        v-if="mapping.used_in_trades"
                                        class="flex items-center text-sm text-green-600 dark:text-green-400"
                                    >
                                        <CheckCircleIcon class="h-4 w-4 mr-1" />
                                        {{ mapping.trade_count }} trade{{
                                            mapping.trade_count !== 1 ? "s" : ""
                                        }}
                                    </div>
                                    <div
                                        v-else
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Not used in trades
                                    </div>
                                </div>
                            </td>
                            <td
                                class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                            >
                                <div class="flex items-center space-x-2">
                                    <button
                                        v-if="!mapping.verified"
                                        @click="
                                            verifyMapping(mapping.cusip, true)
                                        "
                                        class="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                        title="Verify this mapping"
                                    >
                                        <CheckIcon class="h-4 w-4" />
                                    </button>
                                    <button
                                        @click="editMapping(mapping)"
                                        class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                        title="Edit mapping"
                                    >
                                        <PencilIcon class="h-4 w-4" />
                                    </button>
                                    <button
                                        v-if="mapping.is_user_override"
                                        @click="deleteMapping(mapping.cusip)"
                                        class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                        title="Delete user override (revert to global)"
                                    >
                                        <TrashIcon class="h-4 w-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div
                v-if="pagination && pagination.totalPages > 1"
                class="px-6 py-4 border-t border-gray-200 dark:border-gray-700"
            >
                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700 dark:text-gray-300">
                        Showing
                        {{
                            Math.min(
                                (pagination.page - 1) * pagination.limit + 1,
                                pagination.total,
                            )
                        }}
                        to
                        {{
                            Math.min(
                                pagination.page * pagination.limit,
                                pagination.total,
                            )
                        }}
                        of {{ pagination.total }} mappings
                    </div>
                    <div class="flex space-x-2">
                        <button
                            @click="loadPage(pagination.page - 1)"
                            :disabled="pagination.page <= 1 || loading"
                            class="btn-secondary text-sm"
                        >
                            Previous
                        </button>
                        <button
                            @click="loadPage(pagination.page + 1)"
                            :disabled="
                                pagination.page >= pagination.totalPages ||
                                loading
                            "
                            class="btn-secondary text-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create/Edit Mapping Modal -->
        <CusipMappingModal
            v-if="showCreateModal || editingMapping"
            :isOpen="showCreateModal || !!editingMapping"
            :mapping="editingMapping"
            @close="closeCreateModal"
            @saved="handleMappingSaved"
        />

        <!-- Unmapped CUSIPs Modal -->
        <UnmappedCusipsModal
            v-if="showUnmappedModal"
            :isOpen="showUnmappedModal"
            :unmappedCusips="unmappedCusips"
            @close="showUnmappedModal = false"
            @mappingCreated="handleMappingSaved"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useNotification } from "@/composables/useNotification";
import {
    PlusIcon,
    ArrowPathIcon,
    ArrowRightIcon,
    CheckIcon,
    CheckCircleIcon,
    PencilIcon,
    TrashIcon,
    ExclamationTriangleIcon,
    DocumentMagnifyingGlassIcon,
    ArrowUpTrayIcon,
    ChevronRightIcon,
} from "@heroicons/vue/24/outline";
import { useAuthStore } from "@/stores/auth";
import CusipMappingModal from "@/components/cusip/CusipMappingModal.vue";
import UnmappedCusipsModal from "@/components/cusip/UnmappedCusipsModal.vue";
import { debounce } from "lodash-es";

const router = useRouter();
const authStore = useAuthStore();
const { showDangerConfirmation } = useNotification();

// Component state
const mappings = ref([]);
const unmappedCusips = ref([]);
const pagination = ref(null);
const loading = ref(false);
const searchQuery = ref("");
const sourceFilter = ref("");
const verifiedFilter = ref("");
const showCreateModal = ref(false);
const showUnmappedModal = ref(false);
const editingMapping = ref(null);

// Computed
const isAuthenticated = computed(() => authStore.isAuthenticated);

// Methods
const fetchMappings = async (page = 1) => {
    if (!isAuthenticated.value) return;

    try {
        loading.value = true;
        const params = new URLSearchParams({
            page: page.toString(),
            limit: "20",
        });

        if (searchQuery.value) params.append("search", searchQuery.value);
        if (sourceFilter.value) params.append("source", sourceFilter.value);
        if (verifiedFilter.value)
            params.append("verified", verifiedFilter.value);

        const response = await fetch(`/api/cusip-mappings?${params}`, {
            headers: {
                Authorization: `Bearer ${authStore.token}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            mappings.value = data.data || [];
            pagination.value = data.pagination;
        } else {
            console.error(
                "Failed to fetch CUSIP mappings:",
                response.statusText,
            );
        }
    } catch (error) {
        console.error("Error fetching CUSIP mappings:", error);
    } finally {
        loading.value = false;
    }
};

const fetchMappingsForReview = async () => {
    if (!isAuthenticated.value) return;

    try {
        loading.value = true;
        const response = await fetch("/api/cusip-mappings/review", {
            headers: {
                Authorization: `Bearer ${authStore.token}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            mappings.value = data.data || [];
            pagination.value = null; // Review mode doesn't use pagination

            // Reset filters
            searchQuery.value = "";
            sourceFilter.value = "";
            verifiedFilter.value = "false";
        }
    } catch (error) {
        console.error("Error fetching mappings for review:", error);
    } finally {
        loading.value = false;
    }
};

const fetchUnmappedCusips = async () => {
    if (!isAuthenticated.value) return;

    try {
        const response = await fetch("/api/cusip-mappings/unmapped", {
            headers: {
                Authorization: `Bearer ${authStore.token}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            unmappedCusips.value = data.data || [];
        }
    } catch (error) {
        console.error("Error fetching unmapped CUSIPs:", error);
    }
};

const verifyMapping = async (cusip, verified) => {
    try {
        const response = await fetch(`/api/cusip-mappings/${cusip}/verify`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authStore.token}`,
            },
            body: JSON.stringify({ verified }),
        });

        if (response.ok) {
            await fetchMappings(pagination.value?.page || 1);
        }
    } catch (error) {
        console.error("Error verifying mapping:", error);
    }
};

const deleteMapping = (cusip) => {
    showDangerConfirmation(
        "Delete Mapping",
        "Delete this user override? This will revert to the global mapping if one exists.",
        async () => {
            try {
                const response = await fetch(`/api/cusip-mappings/${cusip}`, {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${authStore.token}`,
                    },
                });

                if (response.ok) {
                    await fetchMappings(pagination.value?.page || 1);
                }
            } catch (error) {
                console.error("Error deleting mapping:", error);
            }
        },
    );
};

const editMapping = (mapping) => {
    editingMapping.value = mapping;
};

const closeCreateModal = () => {
    showCreateModal.value = false;
    editingMapping.value = null;
};

const handleMappingSaved = () => {
    closeCreateModal();
    fetchMappings(pagination.value?.page || 1);
    fetchUnmappedCusips(); // Refresh unmapped list
};

const loadPage = (page) => {
    if (page >= 1 && page <= pagination.value.totalPages) {
        fetchMappings(page);
    }
};

const refreshData = () => {
    Promise.all([
        fetchMappings(pagination.value?.page || 1),
        fetchUnmappedCusips(),
    ]);
};

const debouncedSearch = debounce(() => {
    fetchMappings(1);
}, 300);

const getSourceLabel = (source, isUserOverride) => {
    if (isUserOverride) {
        return source === "manual" ? "Manual (User)" : "AI (User)";
    }

    switch (source) {
        case "finnhub":
            return "Finnhub (Global)";
        case "ai":
            return "AI Resolution";
        case "manual":
            return "Manual Entry";
        default:
            return source;
    }
};

const getSourceBadgeClass = (source, isUserOverride) => {
    if (isUserOverride) {
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    }

    switch (source) {
        case "finnhub":
            return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        case "ai":
            return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
        case "manual":
            return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
        default:
            return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
};

// Lifecycle
onMounted(() => {
    if (isAuthenticated.value) {
        refreshData();
    }
});
</script>
