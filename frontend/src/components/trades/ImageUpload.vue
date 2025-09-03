<template>
  <div class="space-y-4">
    <div>
      <label class="label">Trade Images</label>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Upload images related to this trade (charts, screenshots, etc.). Images will be compressed automatically.
      </p>
      
      <!-- File upload area -->
      <div 
        @drop="handleDrop"
        @dragover.prevent
        @dragenter.prevent
        class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors"
        :class="{ 'border-primary-500': isDragOver }"
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

    <!-- Selected files preview -->
    <div v-if="selectedFiles.length > 0" class="space-y-2">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">Selected Files</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div
          v-for="(file, index) in selectedFiles"
          :key="index"
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
            @click="removeFile(index)"
            class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Upload button -->
    <div v-if="selectedFiles.length > 0 && tradeId" class="flex justify-end">
      <button
        type="button"
        @click="uploadImages"
        :disabled="uploading"
        class="btn-primary"
      >
        <span v-if="uploading">Uploading...</span>
        <span v-else>Upload {{ selectedFiles.length }} Image{{ selectedFiles.length > 1 ? 's' : '' }}</span>
      </button>
    </div>

    <!-- Upload progress -->
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const props = defineProps({
  tradeId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['uploaded'])

const { showSuccess, showError } = useNotification()

const selectedFiles = ref([])
const isDragOver = ref(false)
const uploading = ref(false)
const uploadResults = ref([])

// Supported file types
const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

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

  // Create previews and add to selected files
  validFiles.forEach(file => {
    const reader = new FileReader()
    reader.onload = (e) => {
      selectedFiles.value.push({
        file: file,
        name: file.name,
        size: file.size,
        preview: e.target.result
      })
    }
    reader.readAsDataURL(file)
  })
}

function removeFile(index) {
  selectedFiles.value.splice(index, 1)
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function uploadImages() {
  if (!props.tradeId) {
    showError('Error', 'Trade ID is required for image upload')
    return
  }

  if (selectedFiles.value.length === 0) {
    return
  }

  uploading.value = true
  uploadResults.value = []

  try {
    const formData = new FormData()
    selectedFiles.value.forEach((fileObj) => {
      formData.append('images', fileObj.file)
    })

    const response = await api.post(`/trades/${props.tradeId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    uploadResults.value = response.data.images || []
    
    const successCount = response.data.successfulUploads || 0
    const totalCount = response.data.totalImages || 0

    if (successCount === totalCount) {
      showSuccess('Success', `${successCount} image${successCount > 1 ? 's' : ''} uploaded successfully`)
      selectedFiles.value = [] // Clear selected files
      emit('uploaded') // Notify parent component
    } else {
      showError('Partial Success', `${successCount} of ${totalCount} images uploaded successfully`)
    }

  } catch (error) {
    console.error('Image upload error:', error)
    showError('Upload Failed', error.response?.data?.error || 'Failed to upload images')
  } finally {
    uploading.value = false
  }
}
</script>