<template>
  <div class="template-manager">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Journal Templates</h3>
      <button
        @click="showCreateModal = true"
        class="btn-primary text-sm"
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        New Template
      </button>
    </div>

    <!-- Templates List -->
    <div v-if="loading && !hasTemplates" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p class="text-gray-500 dark:text-gray-400 mt-2">Loading templates...</p>
    </div>

    <div v-else-if="!hasTemplates" class="text-center py-8">
      <DocumentTextIcon class="w-12 h-12 text-gray-400 mx-auto mb-3" />
      <p class="text-gray-500 dark:text-gray-400 mb-4">
        No templates yet. Create your first template to speed up journal entry creation.
      </p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="template in templates"
        :key="template.id"
        class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200"
      >
        <div class="flex flex-col space-y-4">
          <!-- Header -->
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center flex-wrap gap-2">
                <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ template.name }}
                </h4>
                <span
                  v-if="template.is_default"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                >
                  Default
                </span>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                >
                  {{ template.entry_type === 'diary' ? 'Diary' : 'Playbook' }}
                </span>
              </div>

              <p v-if="template.description" class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {{ template.description }}
              </p>

              <div v-if="template.use_count > 0" class="flex items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Used {{ template.use_count }} {{ template.use_count === 1 ? 'time' : 'times' }}</span>
              </div>
            </div>
          </div>

          <!-- Template Preview (if has content) -->
          <div v-if="template.content || template.title || template.market_bias" class="border-t pt-4 space-y-2">
            <p v-if="template.title" class="text-sm text-gray-700 dark:text-gray-300">
              <span class="font-medium">Title:</span> {{ template.title }}
            </p>
            <p v-if="template.market_bias" class="text-sm text-gray-700 dark:text-gray-300">
              <span class="font-medium">Market Bias:</span>
              <span class="capitalize">{{ template.market_bias }}</span>
            </p>
            <div v-if="template.content" class="text-sm text-gray-600 dark:text-gray-400">
              <span class="font-medium text-gray-700 dark:text-gray-300">Content Preview:</span>
              <p class="mt-1 line-clamp-2">{{ template.content }}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between border-t pt-4">
            <div class="flex items-center space-x-2">
              <button
                @click="editTemplate(template)"
                class="inline-flex items-center px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                title="Edit"
              >
                <PencilIcon class="w-4 h-4 mr-1" />
                Edit
              </button>

              <button
                @click="duplicateTemplate(template)"
                class="inline-flex items-center px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                title="Duplicate"
              >
                <DocumentDuplicateIcon class="w-4 h-4 mr-1" />
                Duplicate
              </button>

              <button
                @click="confirmDelete(template)"
                class="inline-flex items-center px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                title="Delete"
              >
                <TrashIcon class="w-4 h-4 mr-1" />
                Delete
              </button>
            </div>

            <button
              @click="$emit('apply-template', template)"
              class="btn-primary"
              title="Apply Template"
            >
              Apply Template
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Template Modal -->
    <div
      v-if="showCreateModal || showEditModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="closeModal"
    >
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        @click.stop
      >
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {{ editingTemplate ? 'Edit Template' : 'Create New Template' }}
          </h3>

                <form @submit.prevent="saveTemplate" class="mt-4 space-y-4">
                  <!-- Template Name -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Template Name *
                    </label>
                    <input
                      v-model="templateForm.name"
                      type="text"
                      required
                      class="input"
                      placeholder="e.g., Morning Market Analysis"
                    />
                  </div>

                  <!-- Description -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <input
                      v-model="templateForm.description"
                      type="text"
                      class="input"
                      placeholder="When to use this template (optional)"
                    />
                  </div>

                  <!-- Entry Type -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Entry Type
                    </label>
                    <select v-model="templateForm.entryType" class="input">
                      <option value="diary">Diary</option>
                      <option value="playbook">Playbook</option>
                    </select>
                  </div>

                  <!-- Set as Default -->
                  <div class="flex items-center">
                    <input
                      v-model="templateForm.isDefault"
                      type="checkbox"
                      id="isDefault"
                      class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label for="isDefault" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Set as default template for new entries
                    </label>
                  </div>

                  <div class="border-t pt-4 mt-4">
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Template Content</h4>

                    <!-- Title -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Default Title
                      </label>
                      <input
                        v-model="templateForm.title"
                        type="text"
                        class="input"
                        placeholder="Pre-fill title (optional)"
                      />
                    </div>

                    <!-- Market Bias -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Market Bias
                      </label>
                      <select v-model="templateForm.marketBias" class="input">
                        <option value="">None</option>
                        <option value="bullish">Bullish</option>
                        <option value="bearish">Bearish</option>
                        <option value="neutral">Neutral</option>
                      </select>
                    </div>

                    <!-- Content -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Content Template
                      </label>
                      <textarea
                        v-model="templateForm.content"
                        rows="4"
                        class="input"
                        placeholder="Pre-fill content with prompts or sections (optional)"
                      ></textarea>
                    </div>

                    <!-- Key Levels -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Key Levels
                      </label>
                      <textarea
                        v-model="templateForm.keyLevels"
                        rows="2"
                        class="input"
                        placeholder="Pre-fill key levels section (optional)"
                      ></textarea>
                    </div>

                    <!-- Tags -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Default Tags (comma-separated)
                      </label>
                      <input
                        v-model="tagsInput"
                        type="text"
                        class="input"
                        placeholder="e.g., market-analysis, pre-market"
                      />
                    </div>

                    <!-- Post-Market Reflection Section -->
                    <div class="border-t pt-4 mt-4">
                      <h5 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Post-Market Reflection</h5>

                      <!-- Followed Plan -->
                      <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Did you follow your plan? (Default)
                        </label>
                        <select v-model="templateForm.followedPlan" class="input">
                          <option :value="null">Not set</option>
                          <option :value="true">Yes</option>
                          <option :value="false">No</option>
                        </select>
                      </div>

                      <!-- Lessons Learned -->
                      <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Lessons Learned Template
                        </label>
                        <textarea
                          v-model="templateForm.lessonsLearned"
                          rows="3"
                          class="input"
                          placeholder="Pre-fill lessons learned section with prompts (optional)"
                        ></textarea>
                      </div>
                    </div>
                  </div>

                  <div class="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      @click="closeModal"
                      class="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn-primary"
                      :disabled="loading || !templateForm.name"
                    >
                      {{ loading ? 'Saving...' : 'Save Template' }}
                    </button>
                  </div>
                </form>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="showDeleteModal = false"
    >
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
        @click.stop
      >
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Delete Template
          </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Are you sure you want to delete "{{ templateToDelete?.name }}"? This action cannot be undone.
                  </p>
                </div>

          <div class="mt-4 flex justify-end space-x-3">
            <button
              type="button"
              @click="showDeleteModal = false"
              class="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="handleDelete"
              class="btn-danger"
              :disabled="loading"
            >
              {{ loading ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDiaryTemplateStore } from '@/stores/diaryTemplate'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon
} from '@heroicons/vue/24/outline'

const emit = defineEmits(['apply-template', 'template-created'])

const templateStore = useDiaryTemplateStore()

// Component state
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const editingTemplate = ref(null)
const templateToDelete = ref(null)
const tagsInput = ref('')

const templateForm = ref({
  name: '',
  description: '',
  entryType: 'diary',
  title: '',
  content: '',
  marketBias: '',
  keyLevels: '',
  tags: [],
  followedPlan: null,
  lessonsLearned: '',
  isDefault: false
})

// Computed
const templates = computed(() => templateStore.templates)
const hasTemplates = computed(() => templateStore.hasTemplates)
const loading = computed(() => templateStore.loading)

// Methods
const loadTemplates = async () => {
  try {
    await templateStore.fetchTemplates()
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

const resetForm = () => {
  templateForm.value = {
    name: '',
    description: '',
    entryType: 'diary',
    title: '',
    content: '',
    marketBias: '',
    keyLevels: '',
    tags: [],
    followedPlan: null,
    lessonsLearned: '',
    isDefault: false
  }
  tagsInput.value = ''
  editingTemplate.value = null
}

const closeModal = () => {
  showCreateModal.value = false
  showEditModal.value = false
  resetForm()
}

const editTemplate = (template) => {
  editingTemplate.value = template
  templateForm.value = {
    name: template.name,
    description: template.description || '',
    entryType: template.entry_type,
    title: template.title || '',
    content: template.content || '',
    marketBias: template.market_bias || '',
    keyLevels: template.key_levels || '',
    tags: template.tags || [],
    followedPlan: template.followed_plan !== undefined ? template.followed_plan : null,
    lessonsLearned: template.lessons_learned || '',
    isDefault: template.is_default
  }
  tagsInput.value = (template.tags || []).join(', ')
  showEditModal.value = true
}

const saveTemplate = async () => {
  try {
    // Parse tags from comma-separated string
    const tags = tagsInput.value
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    const templateData = {
      ...templateForm.value,
      tags
    }

    if (editingTemplate.value) {
      await templateStore.updateTemplate(editingTemplate.value.id, templateData)
    } else {
      const newTemplate = await templateStore.createTemplate(templateData)
      emit('template-created', newTemplate)
    }

    closeModal()
    await loadTemplates()
  } catch (error) {
    console.error('Failed to save template:', error)
  }
}

const confirmDelete = (template) => {
  templateToDelete.value = template
  showDeleteModal.value = true
}

const handleDelete = async () => {
  try {
    await templateStore.deleteTemplate(templateToDelete.value.id)
    showDeleteModal.value = false
    templateToDelete.value = null
  } catch (error) {
    console.error('Failed to delete template:', error)
  }
}

const duplicateTemplate = async (template) => {
  try {
    const newName = prompt('Enter a name for the duplicated template:', `${template.name} (Copy)`)
    if (newName && newName.trim()) {
      await templateStore.duplicateTemplate(template.id, newName.trim())
      await loadTemplates()
    }
  } catch (error) {
    console.error('Failed to duplicate template:', error)
    alert('Failed to duplicate template. Please try again.')
  }
}

// Load templates on mount
onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.btn-danger {
  @apply px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200;
}
</style>
