<template>
    <!-- Data Export & Import -->
    <div class="card">
        <div class="card-body">
            <h3
                class="text-lg font-medium text-gray-900 dark:text-white mb-6"
            >
                Data Export & Import
            </h3>
            <p
                class="text-sm text-gray-600 dark:text-gray-400 mb-6"
            >
                Export all your trading data, settings, and trading
                profile as a JSON file. You can also import
                previously exported data.
            </p>

            <div class="space-y-6">
                <!-- Export Section -->
                <div class="flex items-start space-x-4">
                    <div class="flex-1">
                        <h4
                            class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                        >
                            Export Your Data
                        </h4>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                        >
                            Download a complete backup of your
                            TradeTally data including trades, diary
                            entries, playbook entries, settings,
                            tags, and equity history.
                        </p>
                    </div>
                    <button
                        @click="$emit('export')"
                        :disabled="exportLoading"
                        class="btn-primary flex-shrink-0"
                    >
                        <span
                            v-if="exportLoading"
                            class="flex items-center"
                        >
                            <div
                                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                            ></div>
                            Preparing Export...
                        </span>
                        <span v-else class="flex items-center">
                            <svg
                                class="w-4 h-4 mr-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                ></path>
                            </svg>
                            Export All Data
                        </span>
                    </button>
                </div>

                <!-- CSV Export Section -->
                <div
                    class="flex items-start space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700"
                >
                    <div class="flex-1">
                        <h4
                            class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                        >
                            Export Trades to CSV
                        </h4>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                        >
                            Export all your trades to a CSV file
                            with generic headers compatible with
                            Excel, Google Sheets, and other trading
                            journals. Exports all trades with full
                            details.
                        </p>
                    </div>
                    <button
                        @click="$emit('export-csv')"
                        :disabled="csvExportLoading"
                        class="btn-secondary flex-shrink-0"
                    >
                        <span
                            v-if="csvExportLoading"
                            class="flex items-center"
                        >
                            <div
                                class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"
                            ></div>
                            Exporting...
                        </span>
                        <span v-else class="flex items-center">
                            <svg
                                class="w-4 h-4 mr-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                ></path>
                            </svg>
                            Export Trades CSV
                        </span>
                    </button>
                </div>

                <!-- Import Section -->
                <div
                    class="flex items-start space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700"
                >
                    <div class="flex-1">
                        <h4
                            class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                        >
                            Import Data
                        </h4>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-400 mb-4"
                        >
                            Import previously exported TradeTally
                            data. This will merge with your existing
                            data without duplicating trades.
                        </p>
                    </div>
                    <div class="flex-shrink-0">
                        <input
                            ref="fileInput"
                            type="file"
                            accept=".json,application/json"
                            @change="$emit('file-select', $event)"
                            class="hidden"
                        />
                        <button
                            @click="fileInput?.click()"
                            class="btn-secondary"
                        >
                            <svg
                                class="w-4 h-4 mr-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                                ></path>
                            </svg>
                            Choose File
                        </button>
                    </div>
                </div>

                <!-- Selected File and Import Button -->
                <div
                    v-if="selectedFile"
                    class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                    <span
                        class="text-sm text-gray-600 dark:text-gray-400 truncate mr-4"
                    >
                        Selected: {{ selectedFile.name }}
                    </span>
                    <button
                        @click="$emit('import')"
                        :disabled="importLoading"
                        class="btn-primary flex-shrink-0"
                    >
                        <span
                            v-if="importLoading"
                            class="flex items-center"
                        >
                            <div
                                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                            ></div>
                            Importing...
                        </span>
                        <span v-else class="flex items-center">
                            <svg
                                class="w-4 h-4 mr-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                ></path>
                            </svg>
                            Import Data
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    exportLoading: { type: Boolean, default: false },
    csvExportLoading: { type: Boolean, default: false },
    importLoading: { type: Boolean, default: false },
    selectedFile: { default: null },
});

defineEmits(["export", "export-csv", "file-select", "import"]);

const fileInput = ref(null);
</script>
