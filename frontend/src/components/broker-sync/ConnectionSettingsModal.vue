<template>
    <div class="fixed inset-0 z-50 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
            <!-- Backdrop -->
            <div
                class="modal-backdrop"
                @click="emit('close')"
            ></div>

            <!-- Modal -->
            <div role="dialog" aria-modal="true"
                class="modal-panel w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col"
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
                >
                    <h3
                        class="modal-title"
                    >
                        Connection Settings
                    </h3>
                    <button
                        @click="emit('close')"
                        class="btn-ghost btn-sm"
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
                <div class="p-6 space-y-6 overflow-y-auto">
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
                                class="heading-card"
                            >
                                {{ brokerStyles.name }}
                            </h4>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                Connected {{ formatDate(connection.createdAt) }}
                            </p>
                        </div>
                    </div>

                    <!-- Account Label -->
                    <div>
                        <label for="settingsAccountLabel" class="label">Account Label</label>
                        <input
                            id="settingsAccountLabel"
                            v-model="form.accountLabel"
                            type="text"
                            class="input"
                            placeholder="e.g., Main Account, Paper Trading"
                        />
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Optional name to identify this connection
                        </p>
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
                            :class="[ form.autoSyncEnabled ? 'switch-on' : '', 'switch', ]"
                        >
                            <span
                                :class="[ form.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0', 'switch-knob', ]"
                            />
                        </button>
                    </div>

                    <!-- Sync Frequency -->
                    <div v-if="form.autoSyncEnabled">
                        <label for="syncFrequency" class="label"
                            >Sync Frequency</label
                        >
                        <BaseSelect
                            v-model="form.syncFrequency"
                            :options="[
                                { value: 'hourly', label: 'Every hour' },
                                { value: 'every_4_hours', label: 'Every 4 hours' },
                                { value: 'every_6_hours', label: 'Every 6 hours' },
                                { value: 'every_12_hours', label: 'Every 12 hours' },
                                { value: 'daily', label: 'Daily' },
                                { value: 'manual', label: 'Manual only' },
                            ]"
                        />
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

                    <!-- Sync Range -->
                    <div>
                        <label class="label">Sync Trades From</label>
                        <div class="flex flex-wrap gap-2 mb-2">
                            <button
                                v-for="preset in syncRangePresets"
                                :key="preset.id"
                                type="button"
                                @click="applySyncRangePreset(preset.id)"
                                :class="[ 'px-3 py-1 text-sm rounded-full border transition-colors', activePreset === preset.id ? 'bg-primary-700 border-primary-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600', ]"
                            >
                                {{ preset.label }}
                            </button>
                        </div>
                        <input
                            v-if="activePreset === 'custom'"
                            v-model="form.syncStartDate"
                            type="date"
                            class="input"
                            :max="todayIso"
                        />
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <template v-if="connection.brokerType === 'ibkr'">
                                Only sync trades on or after this date. "All Time" imports up to the latest 10 years in paced 365-day windows.
                            </template>
                            <template v-else>
                                Only sync trades on or after this date. "All Time" pulls the full history available from the broker.
                            </template>
                        </p>
                    </div>

                    <!-- Schwab Account Scope -->
                    <div
                        v-if="connection.brokerType === 'schwab'"
                        class="pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <h4 class="heading-sub">
                                    Accounts included in sync
                                </h4>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Excluded accounts are skipped before Schwab trade history is downloaded.
                                </p>
                            </div>
                            <button
                                type="button"
                                class="btn-link"
                                :disabled="accountsLoading"
                                @click="emit('refresh-accounts')"
                            >
                                Refresh
                            </button>
                        </div>

                        <div v-if="accountsLoading && schwabAccounts.length === 0" class="mt-4 space-y-2">
                            <div
                                v-for="index in 2"
                                :key="index"
                                class="h-12 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse"
                            ></div>
                        </div>

                        <div
                            v-else-if="accountsError && schwabAccounts.length === 0"
                            class="callout-danger mt-4"
                        >
                            <p class="text-sm text-red-700 dark:text-red-300">{{ accountsError }}</p>
                        </div>

                        <div v-else-if="schwabAccounts.length > 0" class="mt-4 space-y-2">
                            <label
                                v-for="account in schwabAccounts"
                                :key="account.account_identifier"
                                class="card flex items-center justify-between gap-4 p-3 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700"
                            >
                                <div class="flex items-center gap-3 min-w-0">
                                    <input
                                        type="checkbox"
                                        class="checkbox"
                                        :checked="!isAccountExcluded(account.account_identifier)"
                                        @change="setAccountIncluded(account.account_identifier, $event.target.checked)"
                                    />
                                    <span class="font-medium text-sm text-gray-900 dark:text-white">
                                        Schwab {{ account.account_identifier }}
                                    </span>
                                </div>
                                <span
                                    class="text-xs font-medium"
                                    :class="isAccountExcluded(account.account_identifier) ? 'text-gray-500 dark:text-gray-400' : 'text-primary-700 dark:text-primary-400'"
                                >
                                    {{ isAccountExcluded(account.account_identifier) ? 'Excluded' : 'Included' }}
                                </span>
                            </label>
                        </div>

                        <p v-else class="mt-4 text-sm text-gray-500 dark:text-gray-400">
                            No Schwab accounts found. Refresh the connection or reconnect Schwab.
                        </p>

                        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            Changing this setting does not delete trades already imported from an account.
                        </p>
                    </div>

                    <!-- Status Info -->
                    <div
                        class="pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                        <h4
                            class="heading-sub mb-3"
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
                                        class="badge"
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
                                class="spinner spinner-xs spinner-light mr-2"
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
import BaseSelect from "@/components/common/BaseSelect.vue";
import { useUserTimezone } from "@/composables/useUserTimezone";
import { syncRangePresets, applyPresetToForm, resolveActivePreset, todayIso } from "@/utils/syncRangePresets";

const props = defineProps({
    connection: {
        type: Object,
        required: true,
    },
    loading: {
        type: Boolean,
        default: false,
    },
    schwabAccounts: {
        type: Array,
        default: () => [],
    },
    accountsLoading: {
        type: Boolean,
        default: false,
    },
    accountsError: {
        type: String,
        default: "",
    },
});

const emit = defineEmits(["close", "save", "refresh-accounts"]);
const { formatDateTime: formatDateTimeTz } = useUserTimezone();

function initialSyncStartDate(value) {
    if (!value) return null;
    return String(value).slice(0, 10);
}

const form = ref({
    accountLabel: props.connection.accountLabel || "",
    autoSyncEnabled: props.connection.autoSyncEnabled,
    syncFrequency: props.connection.syncFrequency,
    syncTime: props.connection.syncTime?.substring(0, 5) || "06:00",
    syncStartDate: initialSyncStartDate(props.connection.syncStartDate),
    excluded_account_identifiers: [...(props.connection.excluded_account_identifiers || [])],
});

const activePreset = ref(resolveActivePreset(form.value.syncStartDate));

function applySyncRangePreset(presetId) {
    activePreset.value = presetId;
    applyPresetToForm(form.value, presetId);
}

// Update form when connection changes
watch(
    () => props.connection,
    (newConnection) => {
        form.value = {
            accountLabel: newConnection.accountLabel || "",
            autoSyncEnabled: newConnection.autoSyncEnabled,
            syncFrequency: newConnection.syncFrequency,
            syncTime: newConnection.syncTime?.substring(0, 5) || "06:00",
            syncStartDate: initialSyncStartDate(newConnection.syncStartDate),
            excluded_account_identifiers: [...(newConnection.excluded_account_identifiers || [])],
        };
        activePreset.value = resolveActivePreset(form.value.syncStartDate);
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
                bgClass: "bg-primary-100 dark:bg-primary-900/30",
                textClass: "text-primary-700 dark:text-primary-400",
            };
        case "tradovate":
            return {
                name: props.connection.brokerEnvironment === "demo"
                    ? "Tradovate Demo"
                    : "Tradovate",
                abbrev: "TV",
                bgClass: "bg-primary-100 dark:bg-primary-900/30",
                textClass: "text-primary-700 dark:text-primary-400",
            };
        case "oanda":
            return {
                name: props.connection.brokerEnvironment === "practice" ? "OANDA Practice" : "OANDA Live",
                abbrev: "OA", bgClass: "bg-primary-100 dark:bg-primary-900/30",
                textClass: "text-primary-700 dark:text-primary-400",
            };
        case "trading212":
            return {
                name: props.connection.brokerEnvironment === "demo"
                    ? "Trading 212 Demo"
                    : "Trading 212 Live",
                abbrev: "T2",
                bgClass: "bg-primary-100 dark:bg-primary-900/30",
                textClass: "text-primary-700 dark:text-primary-400",
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
    return formatDateTimeTz(date, { includeSeconds: true });
}

function isAccountExcluded(accountIdentifier) {
    return form.value.excluded_account_identifiers.includes(accountIdentifier);
}

function setAccountIncluded(accountIdentifier, included) {
    const exclusions = new Set(form.value.excluded_account_identifiers);
    if (included) {
        exclusions.delete(accountIdentifier);
    } else {
        exclusions.add(accountIdentifier);
    }
    form.value.excluded_account_identifiers = [...exclusions];
}

function handleSave() {
    const updates = {
        accountLabel: form.value.accountLabel,
        autoSyncEnabled: form.value.autoSyncEnabled,
        syncFrequency: form.value.syncFrequency,
        syncTime: form.value.syncTime + ":00",
        syncStartDate: form.value.syncStartDate,
    };
    if (props.connection.brokerType === "schwab") {
        updates.excluded_account_identifiers = form.value.excluded_account_identifiers;
    }
    emit("save", updates);
}
</script>
