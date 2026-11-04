<template>
    <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
        <div
            class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center "
        >
            <!-- Background overlay -->
            <div
                class="modal-backdrop"
                @click="$emit('close')"
            ></div>

            <!-- Modal -->
            <div role="dialog" aria-modal="true"
                class="modal-panel w-full p-6 max-w-6xl"
            >
                <!-- Header -->
                <div class="px-4 pt-5 pb-4 sm:p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3
                                class="modal-title"
                            >
                                All CUSIP Mappings
                            </h3>
                            <p
                                class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                            >
                                View and manage all CUSIP to ticker symbol
                                mappings. Includes both mapped and unmapped
                                CUSIPs from your trades.
                            </p>
                        </div>
                        <button
                            @click="$emit('close')"
                            class="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <XMarkIcon class="h-6 w-6" />
                        </button>
                    </div>
                </div>

                <!-- Filters -->
                <div
                    class="px-4 sm:px-6 pb-4 border-b border-gray-200 dark:border-gray-700"
                >
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex-1 min-w-48">
                            <input
                                v-model="searchQuery"
                                @input="debouncedSearch"
                                type="text"
                                placeholder="Search CUSIP, ticker, or company..."
                                aria-label="Search CUSIP mappings"
                                class="input"
                            />
                        </div>
                        <div class="min-w-40">
                            <BaseSelect
                                v-model="statusFilter"
                                @change="loadMappings(1)"
                                placeholder="All Status"
                                :options="[
                                    { value: 'mapped', label: 'Mapped' },
                                    { value: 'unmapped', label: 'Unmapped' }
                                ]"
                            />
                        </div>
                        <div class="min-w-40">
                            <BaseSelect
                                v-model="sourceFilter"
                                @change="loadMappings(1)"
                                placeholder="All Sources"
                                :options="[
                                    { value: 'finnhub', label: 'Finnhub' },
                                    { value: 'ai', label: 'AI' },
                                    { value: 'manual', label: 'Manual' }
                                ]"
                            />
                        </div>
                        <button
                            @click="loadMappings(1)"
                            :disabled="loading"
                            class="btn-secondary"
                        >
                            <ArrowPathIcon
                                class="h-4 w-4 mr-2"
                                :class="{ 'animate-spin': loading }"
                            />
                            Refresh
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="px-4 sm:px-6 pb-4">
                    <!-- Loading State -->
                    <div
                        v-if="initialLoading"
                        class="flex items-center justify-center py-12"
                    >
                        <div
                            class="spinner spinner-md"
                        ></div>
                        <span class="ml-3 text-gray-500 dark:text-gray-400"
                            >Loading mappings...</span
                        >
                    </div>

                    <!-- Empty State -->
                    <div
                        v-else-if="mappings.length === 0"
                        class="text-center py-12"
                    >
                        <DocumentMagnifyingGlassIcon
                            class="h-16 w-16 text-gray-400 mx-auto mb-4"
                        />
                        <h3
                            class="heading-card mb-2"
                        >
                            No mappings found
                        </h3>
                        <p class="text-gray-500 dark:text-gray-400">
                            {{
                                searchQuery
                                    ? "Try adjusting your search criteria."
                                    : "No CUSIP mappings available."
                            }}
                        </p>
                    </div>

                    <!-- Mappings Table -->
                    <div v-else class="mt-4">
                        <div class="overflow-x-auto">
                            <table
                                class="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <thead class="table-head">
                                    <tr>
                                        <th
                                            class="text-left table-th px-4 py-2"
                                        >
                                            CUSIP
                                        </th>
                                        <th
                                            class="text-left table-th px-4 py-2"
                                        >
                                            Ticker
                                        </th>
                                        <th
                                            class="text-left table-th px-4 py-2"
                                        >
                                            Company
                                        </th>
                                        <th
                                            class="text-left table-th px-4 py-2"
                                        >
                                            Source
                                        </th>
                                        <th
                                            class="text-left table-th px-4 py-2"
                                        >
                                            Trades
                                        </th>
                                        <th
                                            class="text-left table-th px-4 py-2"
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
                                        :key="mapping.cusip"
                                        class="hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        <td class="whitespace-nowrap px-4 py-3">
                                            <code
                                                class="text-sm font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                                            >
                                                {{ mapping.cusip }}
                                            </code>
                                        </td>
                                        <td class="whitespace-nowrap px-4 py-3">
                                            <div
                                                v-if="mapping.ticker"
                                                class="flex items-center"
                                            >
                                                <span
                                                    class="text-sm font-semibold text-primary-700 dark:text-primary-400"
                                                >
                                                    {{ mapping.ticker }}
                                                </span>
                                                <span
                                                    v-if="mapping.verified"
                                                    class="ml-2"
                                                >
                                                    <CheckCircleIcon
                                                        class="h-4 w-4 text-green-700 dark:text-green-400"
                                                        title="Verified"
                                                    />
                                                </span>
                                            </div>
                                            <div
                                                v-else
                                                class="flex items-center"
                                            >
                                                <span
                                                    class="text-sm text-red-600 dark:text-red-400 font-medium"
                                                    >Unmapped</span
                                                >
                                                <button
                                                    @click="
                                                        startQuickMapping(
                                                            mapping,
                                                        )
                                                    "
                                                    class="btn-link ml-2"
                                                >
                                                    Map Now
                                                </button>
                                            </div>
                                        </td>
                                        <td class="whitespace-nowrap px-4 py-3">
                                            <div
                                                class="text-sm text-gray-900 dark:text-white"
                                            >
                                                {{
                                                    mapping.company_name ||
                                                    "Unknown"
                                                }}
                                            </div>
                                        </td>
                                        <td class="whitespace-nowrap px-4 py-3">
                                            <span
                                                v-if="mapping.resolution_source"
                                                class="badge"
                                                :class="getSourceBadgeClass( mapping.resolution_source, mapping.is_user_override, )"
                                            >
                                                {{
                                                    getSourceLabel(
                                                        mapping.resolution_source,
                                                        mapping.is_user_override,
                                                    )
                                                }}
                                            </span>
                                            <span
                                                v-else
                                                class="text-sm text-gray-500 dark:text-gray-400"
                                                >-</span
                                            >
                                        </td>
                                        <td class="whitespace-nowrap px-4 py-3">
                                            <div
                                                class="flex items-center text-sm"
                                            >
                                                <span
                                                    class="text-gray-900 dark:text-white"
                                                    >{{
                                                        mapping.trade_count || 0
                                                    }}</span
                                                >
                                                <span
                                                    class="ml-1 text-gray-500 dark:text-gray-400"
                                                    >trade{{
                                                        (mapping.trade_count ||
                                                            0) !== 1
                                                            ? "s"
                                                            : ""
                                                    }}</span
                                                >
                                            </div>
                                        </td>
                                        <td
                                            class="whitespace-nowrap text-right text-sm font-medium px-4 py-3"
                                        >
                                            <div
                                                class="flex items-center space-x-2"
                                            >
                                                <button
                                                    v-if="
                                                        mapping.ticker &&
                                                        !mapping.verified
                                                    "
                                                    @click="
                                                        verifyMapping(
                                                            mapping.cusip,
                                                        )
                                                    "
                                                    class="text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                                                    title="Verify mapping"
                                                >
                                                    <CheckIcon
                                                        class="h-4 w-4"
                                                    />
                                                </button>
                                                <button
                                                    v-if="mapping.ticker"
                                                    @click="
                                                        editMapping(mapping)
                                                    "
                                                    class="btn-link"
                                                    title="Edit mapping"
                                                >
                                                    <PencilIcon
                                                        class="h-4 w-4"
                                                    />
                                                </button>
                                                <button
                                                    v-if="
                                                        mapping.ticker &&
                                                        mapping.is_user_override
                                                    "
                                                    @click="
                                                        deleteMapping(
                                                            mapping.cusip,
                                                        )
                                                    "
                                                    class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                    title="Delete user override"
                                                >
                                                    <TrashIcon
                                                        class="h-4 w-4"
                                                    />
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
                            class="mt-6 flex items-center justify-between"
                        >
                            <div
                                class="text-sm text-gray-700 dark:text-gray-300"
                            >
                                Showing
                                {{
                                    Math.min(
                                        (pagination.page - 1) *
                                            pagination.limit +
                                            1,
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
                                of {{ pagination.total }} items
                            </div>
                            <div class="flex space-x-2">
                                <button
                                    @click="loadPage(pagination.page - 1)"
                                    :disabled="pagination.page <= 1 || loading"
                                    class="btn-secondary"
                                >
                                    Previous
                                </button>
                                <button
                                    @click="loadPage(pagination.page + 1)"
                                    :disabled="
                                        pagination.page >=
                                            pagination.totalPages || loading
                                    "
                                    class="btn-secondary text-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse"
                >
                    <button
                        @click="$emit('close')"
                        class="btn-secondary w-full sm:w-auto"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>

        <!-- Edit Mapping Modal -->
        <CusipMappingModal
            v-if="editingMapping"
            :isOpen="!!editingMapping"
            :mapping="editingMapping"
            @close="editingMapping = null"
            @saved="handleMappingSaved"
        />
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import {
    XMarkIcon,
    DocumentMagnifyingGlassIcon,
    ArrowPathIcon,
    CheckIcon,
    CheckCircleIcon,
    PencilIcon,
    TrashIcon,
} from "@heroicons/vue/24/outline";
import { useAuthStore } from "@/stores/auth";
import { useNotification } from "@/composables/useNotification";
import CusipMappingModal from "./CusipMappingModal.vue";
import BaseSelect from "@/components/common/BaseSelect.vue";
import { debounce } from "@/utils/debounce";

const props = defineProps({
    isOpen: {
        type: Boolean,
        required: true,
    },
});

const emit = defineEmits(["close", "mappingChanged"]);

const authStore = useAuthStore();
const { showDangerConfirmation } = useNotification();

// Component state
const mappings = ref([]);
const pagination = ref(null);
const loading = ref(false);
const searchQuery = ref("");
const statusFilter = ref("");
const sourceFilter = ref("");
const editingMapping = ref(null);

// Methods
const loadMappings = async (page = 1) => {
    try {
        console.log("loadMappings called with page:", page);
        loading.value = true;

        // Build query parameters
        const params = new URLSearchParams({
            page: page.toString(),
            limit: "20",
        });

        if (searchQuery.value) params.append("search", searchQuery.value);
        if (sourceFilter.value) params.append("source", sourceFilter.value);
        if (statusFilter.value === "mapped") params.append("verified", "true");
        else if (statusFilter.value === "unmapped")
            params.append("verified", "false");

        console.log("API request URL:", `/api/cusip-mappings?${params}`);

        // Get all CUSIPs (mapped and unmapped) from the main API
        const response = await fetch(`/api/cusip-mappings?${params}`);

        console.log("API response status:", response.status);

        if (response.ok) {
            const data = await response.json();
            console.log("API response data:", data);

            // Apply status filter on frontend since backend doesn't handle it directly
            let filteredMappings = data.data || [];

            if (statusFilter.value === "mapped") {
                filteredMappings = filteredMappings.filter((m) => m.ticker);
            } else if (statusFilter.value === "unmapped") {
                filteredMappings = filteredMappings.filter((m) => !m.ticker);
            }

            console.log("Setting mappings:", filteredMappings.length, "items");
            mappings.value = filteredMappings;
            pagination.value = data.pagination;
        } else {
            const errorText = await response.text();
            console.error(
                "Failed to load mappings:",
                response.status,
                response.statusText,
                errorText,
            );
        }
    } catch (error) {
        console.error("Error loading mappings:", error);
    } finally {
        loading.value = false
        initialLoading.value = false;
        console.log("loadMappings completed, loading:", loading.value);
    }
};

const loadPage = (page) => {
    if (page >= 1 && pagination.value && page <= pagination.value.totalPages) {
        loadMappings(page);
    }
};

const debouncedSearch = debounce(() => {
    loadMappings(1);
}, 300);

const verifyMapping = async (cusip) => {
    try {
            const response = await fetch(`/api/cusip-mappings/${cusip}/verify`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ verified: true }),
            });

        if (response.ok) {
            await loadMappings(pagination.value?.page || 1);
            emit("mappingChanged");
        }
    } catch (error) {
        console.error("Error verifying mapping:", error);
    }
};

const editMapping = (mapping) => {
    editingMapping.value = mapping;
};

const deleteMapping = (cusip) => {
    showDangerConfirmation(
        "Delete Mapping",
        "Delete this user override? This will revert to the global mapping if one exists.",
        async () => {
            try {
                const response = await fetch(`/api/cusip-mappings/${cusip}`, {
                    method: "DELETE",
                });

                if (response.ok) {
                    await loadMappings(pagination.value?.page || 1);
                    emit("mappingChanged");
                }
            } catch (error) {
                console.error("Error deleting mapping:", error);
            }
        },
    );
};

const startQuickMapping = (mapping) => {
    editingMapping.value = {
        cusip: mapping.cusip,
        ticker: "",
        company_name: "",
        verified: false,
    };
};

const handleMappingSaved = () => {
    editingMapping.value = null;
    loadMappings(pagination.value?.page || 1);
    emit("mappingChanged");
};

const getSourceLabel = (source, isUserOverride) => {
    if (isUserOverride) {
        return source === "manual"
            ? "Manual (User)"
            : `${source ? source.toUpperCase() : "AI"} (User)`;
    }

    switch (source) {
        case "finnhub":
            return "Finnhub";
        case "ai":
            return "AI";
        case "manual":
            return "Manual";
        default:
            return source || "Unknown";
    }
};

const getSourceBadgeClass = (source, isUserOverride) => {
    if (isUserOverride) {
        return "bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200";
    }

    switch (source) {
        case "finnhub":
            return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        case "ai":
            return "bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200";
        case "manual":
            return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
        default:
            return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
};

// Load mappings when modal opens
watch(
    () => props.isOpen,
    async (isOpen) => {
        if (isOpen) {
            console.log("Modal opened, loading mappings...");
            await loadMappings(1);
            console.log("Mappings loaded:", mappings.value.length, "items");
        } else {
            // Reset state when modal closes
            searchQuery.value = "";
            statusFilter.value = "";
            sourceFilter.value = "";
            editingMapping.value = null;
        }
    },
    { immediate: true },
);
</script>
