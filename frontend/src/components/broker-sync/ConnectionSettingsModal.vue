<template>
    <div class="fixed inset-0 z-50 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
            <!-- Backdrop -->
            <div
                class="fixed inset-0 bg-black/50 transition-opacity"
                @click="emit('close')"
            ></div>

            <!-- Modal -->
            <div
                class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg"
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
                >
                    <h3
                        class="text-lg font-semibold text-gray-900 dark:text-white"
                    >
                        Connection Settings
                    </h3>
                    <button
                        @click="emit('close')"
                        class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    >
                        <svg
                            class="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <!-- Body -->
                <div class="p-6 space-y-6">
                    <!-- Connection Info -->
                    <div
                        class="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                        <div
                            class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                            :class="brokerStyles.bgClass"
                        >
                            <span
                                :class="brokerStyles.textClass"
                                class="font-bold"
                            >
                                {{ brokerStyles.abbrev }}
                            </span>
                        </div>
                        <div>
                            <h4
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                {{ brokerStyles.name }}
                            </h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                Connected {{ formatDate(connection.createdAt) }}
                            </p>
                        </div>
                    </div>

                    <!-- Auto-Sync Toggle -->
                    <div class="flex items-center justify-between">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-900 dark:text-white"
                            >
                                Auto-Sync
                            </label>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                Automatically sync trades on schedule
                            </p>
                        </div>
                        <button
                            type="button"
                            @click="
                                form.autoSyncEnabled = !form.autoSyncEnabled
                            "
                            :class="[
                                form.autoSyncEnabled
                                    ? 'bg-primary-600'
                                    : 'bg-gray-200 dark:bg-gray-600',
                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
                            ]"
                        >
                            <span
                                :class="[
                                    form.autoSyncEnabled
                                        ? 'translate-x-5'
                                        : 'translate-x-0',
                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                ]"
                            />
                        </button>
                    </div>

                    <!-- Sync Frequency -->
                    <div v-if="form.autoSyncEnabled">
                        <label for="syncFrequency" class="label"
                            >Sync Frequency</label
                        >
                        <select
                            id="syncFrequency"
                            v-model="form.syncFrequency"
                            class="input"
                        >
                            <option value="hourly">Every hour</option>
                            <option value="every_4_hours">Every 4 hours</option>
                            <option value="every_6_hours">Every 6 hours</option>
                            <option value="every_12_hours">
                                Every 12 hours
                            </option>
                            <option value="daily">Daily</option>
                            <option value="manual">Manual only</option>
                        </select>
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            More frequent syncing keeps your dashboard up to
                            date with broker data.
                        </p>
                    </div>

                    <!-- Sync Time (only shown for daily frequency) -->
                    <div
                        v-if="
                            form.autoSyncEnabled &&
                            form.syncFrequency === 'daily'
                        "
                    >
                        <label for="syncTime" class="label">Sync Time</label>
                        <input
                            id="syncTime"
                            v-model="form.syncTime"
                            type="time"
                            class="input"
                        />
                        <p
                            class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                        >
                            Time to sync each day (in your local timezone). Only
                            applies to daily frequency.
                        </p>
                    </div>

                    <!-- Status Info -->
                    <div
                        class="pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                        <h4
                            class="text-sm font-medium text-gray-900 dark:text-white mb-3"
                        >
                            Connection Status
                        </h4>
                        <dl class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <dt class="text-gray-500 dark:text-gray-400">
                                    Status
                                </dt>
                                <dd>
                                    <span
                                        class="px-2 py-0.5 rounded-full text-xs"
                                        :class="statusClass"
                                    >
                                        {{ connection.connectionStatus }}
                                    </span>
                                </dd>
                            </div>
                            <div class="flex justify-between">
                                <dt class="text-gray-500 dark:text-gray-400">
                                    Last Sync
                                </dt>
                                <dd class="text-gray-900 dark:text-white">
                                    {{
                                        connection.lastSyncAt
                                            ? formatDate(connection.lastSyncAt)
                                            : "Never"
                                    }}
                                </dd>
                            </div>
                            <div
                                v-if="connection.nextScheduledSync"
                                class="flex justify-between"
                            >
                                <dt class="text-gray-500 dark:text-gray-400">
                                    Next Sync
                                </dt>
                                <dd class="text-gray-900 dark:text-white">
                                    {{
                                        formatDate(connection.nextScheduledSync)
                                    }}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700"
                >
                    <button
                        type="button"
                        @click="emit('close')"
                        class="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        @click="handleSave"
                        :disabled="loading"
                        class="btn-primary"
                    >
                        <span v-if="loading" class="flex items-center">
                            <div
                                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                            ></div>
                            Saving...
                        </span>
                        <span v-else>Save Changes</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
    connection: {
        type: Object,
        required: true,
    },
    loading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["close", "save"]);

const form = ref({
    autoSyncEnabled: props.connection.autoSyncEnabled,
    syncFrequency: props.connection.syncFrequency,
    syncTime: props.connection.syncTime?.substring(0, 5) || "06:00",
});

// Update form when connection changes
watch(
    () => props.connection,
    (newConnection) => {
        form.value = {
            autoSyncEnabled: newConnection.autoSyncEnabled,
            syncFrequency: newConnection.syncFrequency,
            syncTime: newConnection.syncTime?.substring(0, 5) || "06:00",
        };
    },
);

const brokerStyles = computed(() => {
    switch (props.connection.brokerType) {
        case "ibkr":
            return {
                name: "Interactive Brokers",
                abbrev: "IB",
                bgClass: "bg-red-100 dark:bg-red-900/30",
                textClass: "text-red-600 dark:text-red-400",
            };
        case "schwab":
            return {
                name: "Charles Schwab",
                abbrev: "CS",
                bgClass: "bg-blue-100 dark:bg-blue-900/30",
                textClass: "text-blue-600 dark:text-blue-400",
            };
        default:
            return {
                name: props.connection.brokerType,
                abbrev: props.connection.brokerType
                    .substring(0, 2)
                    .toUpperCase(),
                bgClass: "bg-gray-100 dark:bg-gray-900/30",
                textClass: "text-gray-600 dark:text-gray-400",
            };
    }
});

const statusClass = computed(() => {
    switch (props.connection.connectionStatus) {
        case "active":
            return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300";
        case "error":
            return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300";
        case "expired":
            return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300";
        default:
            return "bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300";
    }
});

function formatDate(date) {
    if (!date) return "-";
    return new Date(date).toLocaleString();
}

function handleSave() {
    emit("save", {
        autoSyncEnabled: form.value.autoSyncEnabled,
        syncFrequency: form.value.syncFrequency,
        syncTime: form.value.syncTime + ":00",
    });
}
</script>
