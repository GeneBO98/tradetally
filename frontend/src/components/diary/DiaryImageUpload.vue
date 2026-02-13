<template>
  <div class="space-y-4">
    <div>
      <label class="label">Attachments</label>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Upload images related to this journal entry (charts, screenshots, etc.). Images will be compressed automatically.
      </p>

      <!-- File upload area - always show, even for new entries -->
      <div
        @drop="handleDrop"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @dragenter.prevent
        class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors"
        :class="{ 'border-primary-500 bg-primary-50 dark:bg-primary-900/10': isDragOver }"
      >
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          @change="handleFileSelect"
          class="hidden"
        />

        <div class="space-y-2">
          <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div>
            <button
              type="button"
              @click="$refs.fileInput.click()"
              class="text-primary-600 hover:text-primary-500 font-medium"
            >
              Choose files
            </button>
            <span class="text-gray-500 dark:text-gray-400"> or drag and drop</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            JPEG, PNG, WebP up to 50MB each
          </p>
        </div>
      </div>
    </div>

    <!-- Pending files info for new entries -->
    <div v-if="!diaryEntryId && pendingFiles.length > 0" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
      {{ pendingFiles.length }} image{{ pendingFiles.length > 1 ? 's' : '' }} will be uploaded when you save the entry.
    </div>

    <!-- Selected/Pending files preview -->
    <div v-if="pendingFiles.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">
        {{ diaryEntryId ? 'Selected Files' : 'Pending Images' }}
      </h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div
          v-for="(file, index) in pendingFiles"
          :key="'pending-' + index"
          class="relative group"
        >
          <div class="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            <img
              v-if="file.preview"
              :src="file.preview"
              :alt="file.name"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>

          <!-- File info -->
          <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
            <p class="truncate" :title="file.name">{{ file.name }}</p>
            <p>{{ formatFileSize(file.size) }}</p>
          </div>

          <!-- Remove button -->
          <button
            type="button"
            @click="removePendingFile(index)"
            class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Existing images -->
    <div v-if="existingImages.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">Uploaded Images</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div
          v-for="image in existingImages"
          :key="image.id"
          class="relative group"
        >
          <div class="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            <img
              :src="getImageUrl(image)"
              :alt="image.file_name"
              class="w-full h-full object-cover cursor-pointer"
              @click="openImagePreview(image)"
              @error="handleImageError($event, image)"
            />
          </div>

          <!-- File info -->
          <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
            <p class="truncate" :title="image.file_name">{{ image.file_name }}</p>
            <p>{{ formatFileSize(image.file_size) }}</p>
          </div>

          <!-- Delete button -->
          <button
            type="button"
            @click="deleteImage(image)"
            :disabled="deleting === image.id"
            class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          >
            <svg v-if="deleting !== image.id" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            <svg v-else class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Upload results -->
    <div v-if="uploadResults.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">Upload Results</h4>
      <div class="space-y-1">
        <div
          v-for="result in uploadResults"
          :key="result.id || result.filename"
          class="flex items-center justify-between text-sm p-2 rounded"
          :class="result.error ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400'"
        >
          <span class="truncate">{{ result.file_name || result.filename }}</span>
          <div class="flex items-center space-x-2 ml-2">
            <span v-if="!result.error && result.compressionRatio" class="text-xs">
              {{ result.compressionRatio.toFixed(1) }}% compressed
            </span>
            <span v-if="result.error" class="text-xs">{{ result.error }}</span>
            <svg v-if="!result.error" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      @click="previewImage = null"
    >
      <div class="relative max-w-4xl max-h-[90vh] p-4">
        <button
          @click="previewImage = null"
          class="absolute top-2 right-2 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 z-10"
        >
          <svg class="w-6 h-6 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <img
          :src="getImageUrl(previewImage)"
          :alt="previewImage.file_name"
          class="max-w-full max-h-[85vh] object-contain rounded-lg"
          @click.stop
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const props = defineProps({
  diaryEntryId: {
    type: [String, Number],
    default: null
  },
  existingImages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['uploaded', 'deleted', 'pending-changed'])

const { showSuccess, showError } = useNotification()

const pendingFiles = ref([])
const isDragOver = ref(false)
const uploading = ref(false)
const deleting = ref(null)
const uploadResults = ref([])
const previewImage = ref(null)

// Supported file types
const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function getImageUrl(image) {
  // Use the API URL with authentication token
  const token = localStorage.getItem('token')
  // file_url already includes /api prefix, so use origin only (not VITE_API_URL which includes /api)
  const origin = window.location.origin
  const url = `${origin}${image.file_url}?token=${token}`
  return url
}

function handleImageError(event, image) {
  console.error('Failed to load image:', image.file_url)
  // Set a placeholder or hide the broken image
  event.target.style.display = 'none'
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  addFiles(files)
  // Clear the input so the same file can be selected again
  event.target.value = ''
}

function handleDrop(event) {
  event.preventDefault()
  isDragOver.value = false

  const files = Array.from(event.dataTransfer.files)
  addFiles(files)
}

function addFiles(files) {
  const validFiles = files.filter(file => {
    // Check file type
    if (!supportedTypes.includes(file.type)) {
      showError('Invalid File', `${file.name} is not a supported image format`)
      return false
    }

    // Check file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      showError('File Too Large', `${file.name} is larger than 50MB`)
      return false
    }

    return true
  })

  // Create previews and add to pending files
  validFiles.forEach(file => {
    const reader = new FileReader()
    reader.onload = (e) => {
      pendingFiles.value.push({
        file: file,
        name: file.name,
        size: file.size,
        preview: e.target.result
      })
      // Notify parent of pending files change
      emit('pending-changed', pendingFiles.value)
    }
    reader.readAsDataURL(file)
  })
}

function removePendingFile(index) {
  pendingFiles.value.splice(index, 1)
  emit('pending-changed', pendingFiles.value)
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function openImagePreview(image) {
  previewImage.value = image
}

// Expose method for parent to call after saving entry
async function uploadPendingImages(entryId) {
  if (pendingFiles.value.length === 0) {
    return { success: true, images: [] }
  }

  uploading.value = true
  uploadResults.value = []

  try {
    const formData = new FormData()
    pendingFiles.value.forEach((fileObj) => {
      formData.append('images', fileObj.file)
    })

    const response = await api.post(`/diary/${entryId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    uploadResults.value = response.data.images || []

    const successCount = response.data.successfulUploads || 0
    const totalCount = response.data.totalImages || 0

    if (successCount === totalCount) {
      showSuccess('Success', `${successCount} image${successCount > 1 ? 's' : ''} uploaded successfully`)
      pendingFiles.value = [] // Clear pending files
      emit('pending-changed', pendingFiles.value)
      emit('uploaded', response.data.images)
      return { success: true, images: response.data.images }
    } else {
      showError('Partial Success', `${successCount} of ${totalCount} images uploaded successfully`)
      return { success: false, images: response.data.images }
    }

  } catch (error) {
    console.error('Image upload error:', error)
    showError('Upload Failed', error.response?.data?.error || 'Failed to upload images')
    return { success: false, error: error.message }
  } finally {
    uploading.value = false
  }
}

async function uploadImages() {
  if (!props.diaryEntryId) {
    showError('Error', 'Diary entry ID is required for image upload')
    return
  }

  await uploadPendingImages(props.diaryEntryId)
}

async function deleteImage(image) {
  if (!props.diaryEntryId || !image.id) {
    return
  }

  deleting.value = image.id

  try {
    await api.delete(`/diary/${props.diaryEntryId}/images/${image.id}`)
    showSuccess('Success', 'Image deleted successfully')
    emit('deleted', image.id)
  } catch (error) {
    console.error('Image delete error:', error)
    showError('Delete Failed', error.response?.data?.error || 'Failed to delete image')
  } finally {
    deleting.value = null
  }
}

// Expose methods for parent component
defineExpose({
  uploadPendingImages,
  hasPendingFiles: () => pendingFiles.value.length > 0,
  getPendingFiles: () => pendingFiles.value
})
</script>

<style scoped>
.label {
  @apply block text-sm font-medium text-gray-700 dark:text-gray-300;
}

.btn-primary {
  @apply bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
