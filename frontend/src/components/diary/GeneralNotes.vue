<template>
    <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
    >
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                Pinned Notes
            </h2>
            <button @click="showAddModal = true" class="btn-primary">
                <PlusIcon class="w-4 h-4 mr-2" />
                Add Note
            </button>
        </div>

        <!-- Notes List -->
        <div v-if="notes.length > 0" class="space-y-4">
            <div
                v-for="note in notes"
                :key="note.id"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <h3
                            v-if="note.title"
                            class="font-medium text-gray-900 dark:text-white mb-2"
                        >
                            {{ note.title }}
                        </h3>
                        <p
                            class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
                        >
                            {{ note.content }}
                        </p>
                        <p
                            class="text-xs text-gray-500 dark:text-gray-400 mt-2"
                        >
                            Updated {{ formatDate(note.updated_at) }}
                        </p>
                    </div>
                    <div class="flex items-center space-x-2 ml-4">
                        <button
                            @click="editNote(note)"
                            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            title="Edit"
                        >
                            <PencilIcon class="w-4 h-4" />
                        </button>
                        <button
                            @click="deleteNote(note.id)"
                            class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            title="Delete"
                        >
                            <TrashIcon class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-8">
            <p class="text-gray-500 dark:text-gray-400">
                No pinned notes yet. Add your first note to keep important
                information handy.
            </p>
        </div>

        <!-- Add/Edit Modal -->
        <div
            v-if="showAddModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6"
            >
                <h3
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-4"
                >
                    {{ editingNote ? "Edit Note" : "Add Note" }}
                </h3>

                <div class="space-y-4">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                            Title (Optional)
                        </label>
                        <input
                            v-model="noteForm.title"
                            type="text"
                            class="input"
                            placeholder="Note title..."
                        />
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                            Content *
                        </label>
                        <textarea
                            v-model="noteForm.content"
                            rows="6"
                            required
                            class="input resize-none"
                            placeholder="Write your note..."
                        ></textarea>
                    </div>
                </div>

                <div class="flex justify-end space-x-3 mt-6">
                    <button @click="closeModal" class="btn-secondary">
                        Cancel
                    </button>
                    <button
                        @click="saveNote"
                        :disabled="!noteForm.content.trim()"
                        class="btn-primary"
                    >
                        {{ editingNote ? "Update" : "Add" }} Note
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { PlusIcon, PencilIcon, TrashIcon } from "@heroicons/vue/24/outline";
import api from "@/services/api";
import { useUserTimezone } from "@/composables/useUserTimezone";
import { useNotification } from "@/composables/useNotification";

const { formatDateTime: formatDateTimeTz } = useUserTimezone();
const { showDangerConfirmation } = useNotification();

const notes = ref([]);
const showAddModal = ref(false);
const editingNote = ref(null);
const noteForm = ref({
    title: "",
    content: "",
});

const formatDate = (dateString) => {
    try {
        return formatDateTimeTz(dateString);
    } catch {
        return dateString;
    }
};

const fetchNotes = async () => {
    try {
        const response = await api.get("/diary/general-notes");
        notes.value = response.data.notes || [];
    } catch (error) {
        console.error("Error fetching general notes:", error);
    }
};

const editNote = (note) => {
    editingNote.value = note;
    noteForm.value = {
        title: note.title || "",
        content: note.content,
    };
    showAddModal.value = true;
};

const saveNote = async () => {
    try {
        if (!noteForm.value.content.trim()) return;

        if (editingNote.value) {
            await api.put(`/diary/general-notes/${editingNote.value.id}`, {
                title: noteForm.value.title.trim() || null,
                content: noteForm.value.content.trim(),
            });
        } else {
            await api.post("/diary/general-notes", {
                title: noteForm.value.title.trim() || null,
                content: noteForm.value.content.trim(),
            });
        }

        await fetchNotes();
        closeModal();
    } catch (error) {
        console.error("Error saving note:", error);
        alert("Failed to save note");
    }
};

const deleteNote = (noteId) => {
    showDangerConfirmation(
        "Delete Note",
        "Are you sure you want to delete this note? This action cannot be undone.",
        async () => {
            try {
                await api.delete(`/diary/general-notes/${noteId}`);
                await fetchNotes();
            } catch (error) {
                console.error("Error deleting note:", error);
                alert("Failed to delete note");
            }
        },
    );
};

const closeModal = () => {
    showAddModal.value = false;
    editingNote.value = null;
    noteForm.value = {
        title: "",
        content: "",
    };
};

onMounted(() => {
    fetchNotes();
});
</script>
