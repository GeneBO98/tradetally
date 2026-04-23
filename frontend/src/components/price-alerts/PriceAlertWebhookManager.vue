<template>
    <section
        id="markets-webhook-destinations"
        class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow"
    >
        <button
            type="button"
            @click="expanded = !expanded"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset rounded-lg"
            :aria-expanded="expanded"
            aria-controls="webhook-destinations-panel"
        >
            <div class="flex items-center gap-3 min-w-0">
                <MdiIcon
                    :icon="mdiWebhook"
                    :size="18"
                    classes="text-gray-500 dark:text-gray-400 flex-shrink-0"
                />
                <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Webhook Destinations
                </span>
                <span
                    v-if="!loading && webhooks.length > 0"
                    class="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/30 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300"
                >
                    {{ activeCount }}/{{ webhooks.length }} active
                </span>
                <span
                    v-else-if="!loading"
                    class="text-xs text-gray-500 dark:text-gray-400"
                >
                    None configured
                </span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <span
                    v-if="!loading && hasFailures"
                    class="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                    :title="`${failureTotal} recent failure${failureTotal === 1 ? '' : 's'}`"
                >
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Issues
                </span>
                <MdiIcon
                    :icon="expanded ? mdiChevronUp : mdiChevronDown"
                    :size="20"
                    classes="text-gray-400"
                />
            </div>
        </button>

        <div
            v-show="expanded"
            id="webhook-destinations-panel"
            class="border-t border-gray-200 dark:border-gray-700 px-4 py-4"
        >
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Send every triggered price alert to Slack, Discord, or a custom webhook endpoint. All destinations receive the <code class="text-gray-600 dark:text-gray-300">price_alert.triggered</code> event.
            </p>

            <div v-if="loading" class="flex justify-center py-6">
                <div
                    class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"
                ></div>
            </div>

            <div
                v-else-if="loadError"
                class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3"
            >
                <p class="text-sm text-red-700 dark:text-red-300">
                    {{ loadError }}
                </p>
                <button @click="loadWebhooks" class="mt-2 btn-secondary text-sm">
                    Retry
                </button>
            </div>

            <div v-else>
                <div v-if="webhooks.length === 0" class="text-center py-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        No webhook destinations configured yet.
                    </p>
                    <button @click="openCreateModal" class="btn-primary text-sm">
                        Add Webhook
                    </button>
                </div>

                <div v-else>
                    <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                        <li
                            v-for="webhook in webhooks"
                            :key="webhook.id"
                            class="py-2 flex items-center gap-3"
                        >
                            <span
                                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium flex-shrink-0"
                                :class="providerBadgeClass(webhook.providerType)"
                            >
                                {{ providerLabel(webhook.providerType) }}
                            </span>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                    <span
                                        class="w-2 h-2 rounded-full flex-shrink-0"
                                        :class="statusDotClass(webhook)"
                                        :title="statusLabel(webhook)"
                                    ></span>
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {{ webhook.description || providerLabel(webhook.providerType) }}
                                    </p>
                                </div>
                                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {{ webhookDetailLine(webhook) }}
                                </p>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <button
                                    @click="testWebhook(webhook)"
                                    :disabled="testingWebhookId === webhook.id"
                                    class="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                    :title="testingWebhookId === webhook.id ? 'Testing...' : 'Send test delivery'"
                                >
                                    <MdiIcon :icon="mdiSend" :size="16" />
                                </button>
                                <button
                                    @click="editWebhook(webhook)"
                                    class="p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    title="Edit"
                                >
                                    <MdiIcon :icon="mdiPencilOutline" :size="16" />
                                </button>
                                <button
                                    @click="deleteWebhook(webhook)"
                                    class="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    title="Delete"
                                >
                                    <MdiIcon :icon="mdiTrashCanOutline" :size="16" />
                                </button>
                            </div>
                        </li>
                    </ul>
                    <div class="mt-3 flex justify-end">
                        <button @click="openCreateModal" class="btn-secondary text-sm">
                            Add Webhook
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="showModal"
            class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
            role="dialog"
            aria-modal="true"
            @click.self="closeModal"
        >
            <div
                class="relative top-20 mx-4 sm:mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white dark:bg-gray-800 dark:border-gray-700"
            >
                <div class="mt-3">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                        {{ editingWebhook ? "Edit Webhook Destination" : "Add Webhook Destination" }}
                    </h3>

                    <form @submit.prevent="saveWebhook" class="space-y-4">
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Destination Type
                                </label>
                                <select v-model="form.providerType" class="input" required>
                                    <option value="slack">Slack</option>
                                    <option value="discord">Discord</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Description
                                </label>
                                <input
                                    v-model="form.description"
                                    type="text"
                                    maxlength="500"
                                    class="input"
                                    placeholder="Team alerts, personal Discord, etc."
                                />
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Webhook URL
                            </label>
                            <input
                                v-model="form.url"
                                type="url"
                                required
                                class="input"
                                :placeholder="urlPlaceholder"
                            />
                        </div>

                        <div v-if="form.providerType === 'custom'" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Custom Headers
                                    </h4>
                                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Optional headers for your custom endpoint. TradeTally still signs the request body.
                                    </p>
                                </div>
                                <button type="button" @click="addHeaderRow" class="btn-secondary text-sm">
                                    Add Header
                                </button>
                            </div>

                            <div v-if="headerRows.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
                                No custom headers.
                            </div>

                            <div v-else class="space-y-3">
                                <div
                                    v-for="(header, index) in headerRows"
                                    :key="`header-${index}`"
                                    class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                                >
                                    <input
                                        v-model="header.key"
                                        type="text"
                                        class="input"
                                        placeholder="Header name"
                                    />
                                    <input
                                        v-model="header.value"
                                        type="text"
                                        class="input"
                                        placeholder="Header value"
                                    />
                                    <button
                                        type="button"
                                        @click="removeHeaderRow(index)"
                                        class="btn-secondary"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-if="editingWebhook" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                            <div>
                                <span class="font-medium text-gray-700 dark:text-gray-300">Last success:</span>
                                {{ editingWebhook.lastSuccessAt ? formatDate(editingWebhook.lastSuccessAt) : "Never" }}
                            </div>
                            <div>
                                <span class="font-medium text-gray-700 dark:text-gray-300">Last failure:</span>
                                {{ editingWebhook.lastFailureAt ? formatDate(editingWebhook.lastFailureAt) : "None" }}
                            </div>
                            <div>
                                <span class="font-medium text-gray-700 dark:text-gray-300">Failure count:</span>
                                {{ editingWebhook.failureCount || 0 }}
                            </div>
                        </div>

                        <label class="flex items-center">
                            <input
                                v-model="form.isActive"
                                type="checkbox"
                                class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                Destination is active
                            </span>
                        </label>

                        <div class="flex justify-end space-x-3">
                            <button type="button" @click="closeModal" class="btn-secondary">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                :disabled="saving"
                                class="btn-primary disabled:opacity-50"
                            >
                                {{ saving ? "Saving..." : editingWebhook ? "Update" : "Create" }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import api from "@/services/api";
import { useNotification } from "@/composables/useNotification";
import MdiIcon from "@/components/MdiIcon.vue";
import {
    mdiChevronDown,
    mdiChevronUp,
    mdiPencilOutline,
    mdiSend,
    mdiTrashCanOutline,
    mdiWebhook,
} from "@mdi/js";

const { showConfirmation, showCriticalError, showSuccess } = useNotification();

const webhooks = ref([]);
const loading = ref(true);
const loadError = ref("");
const showModal = ref(false);
const saving = ref(false);
const testingWebhookId = ref(null);
const editingWebhook = ref(null);
const headerRows = ref([]);
const expanded = ref(false);

const form = ref({
    providerType: "slack",
    description: "",
    url: "",
    isActive: true,
});

const activeCount = computed(
    () => webhooks.value.filter((webhook) => webhook.isActive !== false).length,
);

const failureTotal = computed(() =>
    webhooks.value.reduce(
        (total, webhook) => total + (webhook.failureCount || 0),
        0,
    ),
);

const hasFailures = computed(() => failureTotal.value > 0);

const urlPlaceholder = computed(() => {
    if (form.value.providerType === "slack") {
        return "https://hooks.slack.com/services/...";
    }

    if (form.value.providerType === "discord") {
        return "https://discord.com/api/webhooks/...";
    }

    return "https://example.com/webhooks/price-alerts";
});

function providerLabel(providerType) {
    switch (providerType) {
        case "slack":
            return "Slack";
        case "discord":
            return "Discord";
        default:
            return "Custom";
    }
}

function providerBadgeClass(providerType) {
    switch (providerType) {
        case "slack":
            return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
        case "discord":
            return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
        default:
            return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    }
}

function statusDotClass(webhook) {
    if (webhook.isActive === false) {
        return "bg-gray-400 dark:bg-gray-500";
    }
    if (webhook.failureCount && webhook.failureCount > 0) {
        return "bg-red-500";
    }
    return "bg-green-500";
}

function statusLabel(webhook) {
    if (webhook.isActive === false) return "Disabled";
    if (webhook.failureCount && webhook.failureCount > 0) {
        return `${webhook.failureCount} recent failure${webhook.failureCount === 1 ? "" : "s"}`;
    }
    return "Active";
}

function webhookDetailLine(webhook) {
    if (webhook.isActive === false) {
        return "Disabled";
    }
    if (webhook.lastSuccessAt) {
        return `Last delivered ${formatDate(webhook.lastSuccessAt)}`;
    }
    if (webhook.lastFailureAt) {
        return `Last failed ${formatDate(webhook.lastFailureAt)}`;
    }
    return "No deliveries yet";
}

function formatDate(value) {
    if (!value) return "Never";

    return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function headersToRows(customHeaders = {}) {
    return Object.entries(customHeaders).map(([key, value]) => ({ key, value }));
}

function rowsToHeaders(rows) {
    return rows.reduce((accumulator, row) => {
        const key = row.key?.trim();
        const value = row.value?.trim();

        if (key && value) {
            accumulator[key] = value;
        }

        return accumulator;
    }, {});
}

function resetForm() {
    editingWebhook.value = null;
    form.value = {
        providerType: "slack",
        description: "",
        url: "",
        isActive: true,
    };
    headerRows.value = [];
}

function openCreateModal() {
    resetForm();
    showModal.value = true;
}

function editWebhook(webhook) {
    editingWebhook.value = webhook;
    form.value = {
        providerType: webhook.providerType || "custom",
        description: webhook.description || "",
        url: webhook.url,
        isActive: webhook.isActive !== false,
    };
    headerRows.value = headersToRows(webhook.customHeaders || {});
    showModal.value = true;
}

function closeModal() {
    showModal.value = false;
    resetForm();
}

function addHeaderRow() {
    headerRows.value.push({ key: "", value: "" });
}

function removeHeaderRow(index) {
    headerRows.value.splice(index, 1);
}

async function loadWebhooks() {
    try {
        loading.value = true;
        loadError.value = "";
        const response = await api.get("/price-alerts/webhooks");
        webhooks.value = response.data.data || [];
        if (webhooks.value.length === 0 || hasFailures.value) {
            expanded.value = true;
        }
    } catch (error) {
        console.error("Error loading webhook destinations:", error);
        loadError.value =
            error.response?.data?.error || "Failed to load webhook destinations";
        expanded.value = true;
    } finally {
        loading.value = false;
    }
}

async function saveWebhook() {
    try {
        saving.value = true;
        const payload = {
            providerType: form.value.providerType,
            description: form.value.description?.trim() || null,
            url: form.value.url?.trim(),
            isActive: form.value.isActive,
            customHeaders: rowsToHeaders(headerRows.value),
        };

        if (editingWebhook.value) {
            await api.put(
                `/price-alerts/webhooks/${editingWebhook.value.id}`,
                payload,
            );
            showSuccess("Success", "Webhook destination updated");
        } else {
            await api.post("/price-alerts/webhooks", payload);
            showSuccess("Success", "Webhook destination created");
        }

        closeModal();
        await loadWebhooks();
    } catch (error) {
        console.error("Error saving webhook destination:", error);
        const message =
            error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to save webhook destination";
        showCriticalError("Error", message);
    } finally {
        saving.value = false;
    }
}

async function testWebhook(webhook) {
    try {
        testingWebhookId.value = webhook.id;
        await api.post(`/price-alerts/webhooks/${webhook.id}/test`);
        showSuccess("Success", `Test sent to ${providerLabel(webhook.providerType)}`);
        await loadWebhooks();
    } catch (error) {
        console.error("Error testing webhook destination:", error);
        const message =
            error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to send test delivery";
        showCriticalError("Error", message);
    } finally {
        testingWebhookId.value = null;
    }
}

function deleteWebhook(webhook) {
    showConfirmation(
        "Delete Webhook Destination",
        `Delete the ${providerLabel(webhook.providerType)} destination${webhook.description ? ` "${webhook.description}"` : ""}?`,
        async () => {
            try {
                await api.delete(`/price-alerts/webhooks/${webhook.id}`);
                showSuccess("Success", "Webhook destination deleted");
                await loadWebhooks();
            } catch (error) {
                console.error("Error deleting webhook destination:", error);
                const message =
                    error.response?.data?.error ||
                    error.response?.data?.message ||
                    "Failed to delete webhook destination";
                showCriticalError("Error", message);
            }
        },
    );
}

function handleEscape(event) {
    if (event.key === "Escape" && showModal.value) {
        closeModal();
    }
}

function handleHashChange() {
    if (window.location.hash === "#markets-webhook-destinations") {
        expanded.value = true;
    }
}

onMounted(() => {
    loadWebhooks();
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
});

onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleEscape);
    window.removeEventListener("hashchange", handleHashChange);
});
</script>
