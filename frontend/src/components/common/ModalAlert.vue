<template>
    <Teleport to="body">
        <!-- Modal Overlay -->
        <div
            v-if="modalAlert"
            class="modal-overlay overflow-y-auto"
        >
            <div
                class="flex min-h-full items-center justify-center p-4"
                @click="handleOverlayClick"
            >
            <div role="dialog" aria-modal="true"
                class="modal-panel w-full max-w-md p-6"
            >
                <div class="mt-3">
                    <!-- Icon -->
                    <div
                        class="mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4"
                        :class="iconBgClass"
                    >
                        <ExclamationTriangleIcon
                            v-if="modalAlert.type === 'warning'"
                            class="h-6 w-6"
                            :class="iconClass"
                        />
                        <XCircleIcon
                            v-else-if="modalAlert.type === 'error'"
                            class="h-6 w-6"
                            :class="iconClass"
                        />
                        <QuestionMarkCircleIcon
                            v-else-if="modalAlert.type === 'confirm'"
                            class="h-6 w-6"
                            :class="iconClass"
                        />
                        <CheckCircleIcon
                            v-else-if="modalAlert.type === 'success'"
                            class="h-6 w-6"
                            :class="iconClass"
                        />
                    </div>

                    <!-- Content -->
                    <div class="text-center">
                        <h3
                            class="modal-title mb-2"
                        >
                            {{ modalAlert.title }}
                        </h3>
                        <p
                            class="text-sm text-gray-600 dark:text-gray-300 mb-6"
                        >
                            {{ modalAlert.message }}
                        </p>
                        <label
                            v-if="modalAlert.checkboxLabel"
                            class="flex items-start gap-2 text-left text-sm text-gray-600 dark:text-gray-300 mb-6"
                        >
                            <input
                                v-model="modalAlert.checkboxChecked"
                                type="checkbox"
                                :disabled="modalAlert.isSubmitting"
                                class="checkbox mt-0.5"
                            />
                            <span>{{ modalAlert.checkboxLabel }}</span>
                        </label>
                    </div>

                    <!-- Buttons -->
                    <div class="flex flex-col sm:flex-row gap-3 justify-center">
                        <!-- Cancel/Secondary Button -->
                        <button
                            v-if="modalAlert.cancelText"
                            @click="handleCancel"
                            :disabled="modalAlert.isSubmitting"
                            class="btn-secondary w-full sm:w-auto"
                        >
                            {{ modalAlert.cancelText }}
                        </button>

                        <!-- Documentation Link Button -->
                        <a
                            v-if="modalAlert.linkUrl"
                            :href="modalAlert.linkUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn-secondary w-full justify-center sm:w-auto"
                        >
                            {{ modalAlert.linkText || "View Documentation" }}
                        </a>

                        <!-- Primary/Confirm Button -->
                        <button
                            @click="handleConfirm"
                            :disabled="modalAlert.isSubmitting"
                            class="btn w-full justify-center text-white sm:w-auto"
                            :class="confirmButtonClass"
                        >
                            {{ modalAlert.isSubmitting ? modalAlert.pendingText : modalAlert.confirmText }}
                        </button>
                    </div>
                </div>
            </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from "vue";
import { useNotification } from "@/composables/useNotification";
import {
    ExclamationTriangleIcon,
    XCircleIcon,
    QuestionMarkCircleIcon,
    CheckCircleIcon,
} from "@heroicons/vue/24/outline";

const { modalAlert, clearModalAlert } = useNotification();

const iconBgClass = computed(() => {
    switch (modalAlert.value?.type) {
        case "error":
            return "bg-red-100 dark:bg-red-900/20";
        case "warning":
            return "bg-yellow-100 dark:bg-yellow-900/20";
        case "confirm":
            return "bg-primary-100 dark:bg-primary-900/20";
        case "success":
            return "bg-green-100 dark:bg-green-900/20";
        default:
            return "bg-gray-100 dark:bg-gray-900/20";
    }
});

const iconClass = computed(() => {
    switch (modalAlert.value?.type) {
        case "error":
            return "text-red-600 dark:text-red-400";
        case "warning":
            return "text-yellow-600 dark:text-yellow-400";
        case "confirm":
            return "text-primary-700 dark:text-primary-400";
        case "success":
            return "text-green-700 dark:text-green-400";
        default:
            return "text-gray-600 dark:text-gray-400";
    }
});

const confirmButtonClass = computed(() => {
    switch (modalAlert.value?.type) {
        case "error":
            return "bg-red-600 hover:bg-red-700 focus:ring-red-500";
        case "warning":
            return "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500";
        case "confirm":
            return "bg-primary-700 hover:bg-primary-800 focus:ring-primary-500";
        case "success":
            return "bg-green-600 hover:bg-green-700 focus:ring-green-500";
        default:
            return "bg-gray-600 hover:bg-gray-700 focus:ring-gray-500";
    }
});

function handleConfirm() {
    if (modalAlert.value?.onConfirm) {
        modalAlert.value.onConfirm();
    } else {
        clearModalAlert();
    }
}

function handleCancel() {
    if (modalAlert.value?.isSubmitting) return;
    if (modalAlert.value?.onCancel) {
        modalAlert.value.onCancel();
    } else {
        clearModalAlert();
    }
}

function handleOverlayClick(event) {
    // Only close if clicking the overlay itself, not the modal content
    if (event.target === event.currentTarget && !modalAlert.value?.isSubmitting) {
        handleCancel();
    }
}

function handleEscape(event) {
    if (event.key === "Escape" && modalAlert.value) {
        handleCancel();
    }
}

watch(modalAlert, (newVal) => {
    if (newVal) {
        window.addEventListener("keydown", handleEscape);
    } else {
        window.removeEventListener("keydown", handleEscape);
    }
});

onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleEscape);
});
</script>
