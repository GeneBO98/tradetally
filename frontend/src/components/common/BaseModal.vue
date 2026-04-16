<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div
                v-if="modelValue"
                ref="overlayRef"
                class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
                :class="overlayClass"
                role="dialog"
                aria-modal="true"
                :aria-labelledby="titleId"
                @click.self="handleBackdropClick"
                @keydown.tab="handleTab"
            >
                <div
                    ref="modalRef"
                    class="relative mx-4 sm:mx-auto my-8 sm:my-20 p-5 border shadow-lg rounded-md bg-white dark:bg-gray-800 dark:border-gray-700"
                    :class="[sizeClass, panelClass]"
                    tabindex="-1"
                >
                    <div v-if="$slots.header || title" class="flex items-start justify-between mb-4">
                        <div class="flex-1 min-w-0">
                            <slot name="header">
                                <h3
                                    :id="titleId"
                                    class="text-lg font-medium text-gray-900 dark:text-gray-100"
                                >
                                    {{ title }}
                                </h3>
                            </slot>
                        </div>
                        <button
                            v-if="showClose"
                            type="button"
                            class="ml-4 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            aria-label="Close"
                            @click="close"
                        >
                            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <slot />

                    <div v-if="$slots.footer" class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: "" },
    size: {
        type: String,
        default: "md",
        validator: (v) => ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"].includes(v),
    },
    closeOnEscape: { type: Boolean, default: true },
    closeOnBackdrop: { type: Boolean, default: true },
    showClose: { type: Boolean, default: true },
    overlayClass: { type: String, default: "" },
    panelClass: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "close"]);

const overlayRef = ref(null);
const modalRef = ref(null);
const previouslyFocused = ref(null);

const titleId = computed(() => `base-modal-title-${Math.random().toString(36).slice(2, 9)}`);

const sizeClass = computed(() => {
    const map = {
        sm: "w-full max-w-sm",
        md: "w-full max-w-md",
        lg: "w-full max-w-lg",
        xl: "w-full max-w-xl",
        "2xl": "w-full max-w-2xl",
        "3xl": "w-full max-w-3xl",
        "4xl": "w-full max-w-4xl",
        "5xl": "w-full max-w-5xl",
    };
    return map[props.size] || map.md;
});

function close() {
    emit("update:modelValue", false);
    emit("close");
}

function handleBackdropClick() {
    if (props.closeOnBackdrop) close();
}

function handleEscape(event) {
    if (event.key === "Escape" && props.modelValue && props.closeOnEscape) {
        event.stopPropagation();
        close();
    }
}

function getFocusableElements() {
    if (!modalRef.value) return [];
    return Array.from(
        modalRef.value.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => el.offsetParent !== null);
}

function handleTab(event) {
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

watch(
    () => props.modelValue,
    async (open) => {
        if (open) {
            previouslyFocused.value = document.activeElement;
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
            await nextTick();
            const focusable = getFocusableElements();
            const target = focusable[0] || modalRef.value;
            target?.focus?.();
        } else {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
            previouslyFocused.value?.focus?.();
        }
    },
    { immediate: true }
);

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleEscape);
    document.body.style.overflow = "";
});
</script>
