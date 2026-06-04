<template>
    <div class="tag-management">
        <!-- Tag selector dropdown -->
        <div class="relative" data-dropdown="tags">
            <button
                @click.stop="showTagDropdown = !showTagDropdown"
                class="input w-full text-left flex items-center justify-between"
                type="button"
            >
                <span class="truncate">
                    {{ getSelectedTagText() }}
                </span>
                <svg
                    class="h-4 w-4 text-gray-400 flex-shrink-0 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    ></path>
                </svg>
            </button>

            <div
                v-if="showTagDropdown"
                class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none"
            >
                <!-- "All Tags" option -->
                <div class="p-1">
                    <label
                        class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            :checked="!modelValue || modelValue.length === 0"
                            @change="toggleAllTags"
                            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                        />
                        <span class="ml-3 text-sm text-gray-900 dark:text-white"
                            >All Tags</span
                        >
                    </label>
                </div>

                <!-- Available tags -->
                <div
                    v-if="visibleTags.length > 0"
                    class="border-t border-gray-200 dark:border-gray-600"
                >
                    <div v-for="tag in visibleTags" :key="tag.id" class="p-1">
                        <label
                            class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                :value="tag.name"
                                :checked="
                                    modelValue && modelValue.includes(tag.name)
                                "
                                @change="toggleTag(tag.name)"
                                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                            />
                            <span class="ml-3 flex items-center gap-2">
                                <span
                                    class="w-3 h-3 rounded-full flex-shrink-0"
                                    :style="{ backgroundColor: tag.color }"
                                ></span>
                                <span
                                    class="text-sm text-gray-900 dark:text-white"
                                    >{{ tag.name }}</span
                                >
                            </span>
                        </label>
                    </div>
                </div>

                <!-- No tags message -->
                <div
                    v-else
                    class="border-t border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
                >
                    No tags created yet
                </div>

                <!-- Manage tags button -->
                <div class="border-t border-gray-200 dark:border-gray-600 p-1">
                    <button
                        @click="openTagManager"
                        type="button"
                        class="flex items-center w-full px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
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
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            ></path>
                        </svg>
                        Manage Tags
                    </button>
                </div>
            </div>
        </div>

        <!-- Tag Manager Modal -->
        <div
            v-if="showTagManager"
            class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
            @click.self="showTagManager = false"
        >
            <div
                class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800"
            >
                <div class="flex justify-between items-center mb-4">
                    <h3
                        class="text-lg font-medium text-gray-900 dark:text-white"
                    >
                        Manage Tags
                    </h3>
                    <button
                        @click="showTagManager = false"
                        class="text-gray-400 hover:text-gray-500"
                    >
                        <svg
                            class="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            ></path>
                        </svg>
                    </button>
                </div>

                <!-- Create new tag form -->
                <div class="mb-4">
                    <div class="flex gap-2">
                        <input
                            v-model="newTagName"
                            type="text"
                            placeholder="New tag name"
                            class="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                            maxlength="50"
                            @keydown.enter="createTag"
                        />
                        <input
                            v-model="newTagColor"
                            type="color"
                            class="w-12 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                            title="Tag color"
                        />
                        <button
                            @click="createTag"
                            :disabled="!newTagName.trim() || creatingTag"
                            class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <!-- Existing tags list -->
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Use the arrows to change the order tags appear in dropdowns.
                </p>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    <div
                        v-for="(tag, index) in orderedTags"
                        :key="tag.id"
                        class="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-600"
                    >
                        <div class="flex items-center gap-2 flex-1 min-w-0">
                            <label
                                class="relative inline-flex flex-shrink-0 cursor-pointer"
                                :title="`Change color for ${tag.name}`"
                            >
                                <span
                                    class="block w-5 h-5 rounded-full border border-gray-300 dark:border-gray-500"
                                    :style="{ backgroundColor: tag.color }"
                                ></span>
                                <input
                                    type="color"
                                    :value="tag.color"
                                    @change="updateTagColor(tag, $event.target.value)"
                                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </label>
                            <span
                                class="text-sm truncate"
                                :class="tag.hidden ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'"
                                >{{ tag.name }}</span
                            >
                            <span
                                v-if="typeof tag.count === 'number'"
                                class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0"
                                >{{ tag.count }} {{ tag.count === 1 ? 'trade' : 'trades' }}</span
                            >
                        </div>
                        <div class="flex flex-col flex-shrink-0 ml-1">
                            <button
                                type="button"
                                class="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                                :disabled="index === 0"
                                title="Move up"
                                @click="moveTag(tag.name, 'up')"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                class="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                                :disabled="index === orderedTags.length - 1"
                                title="Move down"
                                @click="moveTag(tag.name, 'down')"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                        <button
                            @click="toggleTagHidden(tag)"
                            class="ml-2 flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            :class="tag.hidden ? 'text-gray-400 dark:text-gray-500' : 'text-primary-600 dark:text-primary-400'"
                            :title="tag.hidden ? 'Show in dropdowns' : 'Hide from dropdowns'"
                        >
                            <svg v-if="!tag.hidden" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                        </button>
                        <button
                            @click="deleteTag(tag.id)"
                            class="text-red-600 hover:text-red-700 text-sm ml-2 flex-shrink-0"
                            title="Delete tag"
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
                    </div>

                    <div
                        v-if="availableTags.length === 0"
                        class="text-center text-gray-500 dark:text-gray-400 py-8"
                    >
                        No tags yet. Create your first tag above!
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "@/services/api";
import { useNotification } from "@/composables/useNotification";
import { useTagOrder } from "@/composables/useTagOrder";

const props = defineProps({
    modelValue: {
        type: Array,
        default: () => [],
    },
});

// User-defined tag order, shared with the trade form and synced across devices.
const {
    orderUsageItems: orderTagItems,
    moveTagInUsage,
    refresh: refreshTagOrder,
} = useTagOrder();

// All tags in the user's chosen order (custom order first, then most-used).
const orderedTags = computed(() => orderTagItems(availableTags.value));

// Tags to show in the selection dropdown: drop hidden ones, but keep any that
// are currently selected so an active filter is never silently lost.
const visibleTags = computed(() =>
    orderedTags.value.filter(
        (tag) => !tag.hidden || (props.modelValue || []).includes(tag.name),
    ),
);

function moveTag(name, direction) {
    moveTagInUsage(availableTags.value, name, direction);
}

const emit = defineEmits(["update:modelValue"]);
const { showDangerConfirmation } = useNotification();

const showTagDropdown = ref(false);
const showTagManager = ref(false);
const availableTags = ref([]);
const newTagName = ref("");
const newTagColor = ref("#3B82F6");
const creatingTag = ref(false);

// Close dropdown when clicking outside
const handleClickOutside = (event) => {
    const dropdown = event.target.closest('[data-dropdown="tags"]');
    if (!dropdown && showTagDropdown.value) {
        showTagDropdown.value = false;
    }
};

onMounted(() => {
    document.addEventListener("click", handleClickOutside);
    refreshTagOrder();
    fetchTags();
});

watch(
    () => showTagManager.value,
    (newVal) => {
        if (!newVal) {
            fetchTags(); // Refresh tags when manager closes
        }
    },
);

async function fetchTags() {
    try {
        const response = await api.get("/tags");
        availableTags.value = response.data.tags || [];
    } catch (error) {
        console.error("[ERROR] Failed to fetch tags:", error);
    }
}

async function createTag() {
    if (!newTagName.value.trim() || creatingTag.value) return;

    creatingTag.value = true;
    try {
        const response = await api.post("/tags", {
            name: newTagName.value.trim(),
            color: newTagColor.value,
        });

        availableTags.value.push(response.data.tag);
        newTagName.value = "";
        newTagColor.value = "#3B82F6";
    } catch (error) {
        console.error("[ERROR] Failed to create tag:", error);
        alert(error.response?.data?.message || "Failed to create tag");
    } finally {
        creatingTag.value = false;
    }
}

async function updateTagColor(tag, newColor) {
    if (!newColor || newColor === tag.color) return;

    const previousColor = tag.color;
    tag.color = newColor;

    try {
        await api.put(`/tags/${tag.id}`, { color: newColor });
    } catch (error) {
        console.error("[ERROR] Failed to update tag color:", error);
        tag.color = previousColor;
        alert(error.response?.data?.message || "Failed to update tag color");
    }
}

async function toggleTagHidden(tag) {
    const next = !tag.hidden;
    tag.hidden = next; // optimistic
    try {
        await api.put(`/tags/${tag.id}`, { hidden: next });
    } catch (error) {
        console.error("[ERROR] Failed to update tag visibility:", error);
        tag.hidden = !next; // revert
        alert(error.response?.data?.message || "Failed to update tag");
    }
}

function deleteTag(tagId) {
    showDangerConfirmation(
        "Delete Tag",
        "Are you sure you want to delete this tag? It will be removed from all trades.",
        async () => {
            try {
                await api.delete(`/tags/${tagId}`);
                availableTags.value = availableTags.value.filter(
                    (t) => t.id !== tagId,
                );
            } catch (error) {
                console.error("[ERROR] Failed to delete tag:", error);
                alert("Failed to delete tag");
            }
        },
    );
}

function toggleTag(tagName) {
    const currentTags = props.modelValue || [];
    const index = currentTags.indexOf(tagName);

    if (index > -1) {
        emit(
            "update:modelValue",
            currentTags.filter((t) => t !== tagName),
        );
    } else {
        emit("update:modelValue", [...currentTags, tagName]);
    }
}

function toggleAllTags(event) {
    if (event.target.checked) {
        emit("update:modelValue", []);
    }
}

function getSelectedTagText() {
    if (!props.modelValue || props.modelValue.length === 0) return "All Tags";
    if (props.modelValue.length === 1) return props.modelValue[0];
    return `${props.modelValue.length} tags selected`;
}

function openTagManager() {
    showTagDropdown.value = false;
    showTagManager.value = true;
}
</script>
