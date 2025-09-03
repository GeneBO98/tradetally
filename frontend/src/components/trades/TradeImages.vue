<template>
  <div v-if="images.length > 0" class="space-y-4">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
      Trade Images
    </h3>
    
    <!-- Image grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div
        v-for="image in images"
        :key="image.id"
        class="relative group cursor-pointer"
        @click="openImage(image)"
      >
        <div class="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
          <img
            :src="getImageUrl(image)"
            :alt="image.file_name"
            class="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
            @error="handleImageError"
          />
        </div>
        
        <!-- File name -->
        <p class="mt-2 text-xs text-gray-600 dark:text-gray-400 truncate" :title="image.file_name">
          {{ image.file_name }}
        </p>
        
        <!-- Delete button (only for trade owner) -->
        <button
          v-if="canDelete"
          type="button"
          @click.stop="deleteImage(image)"
          class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Image modal -->
    <div
      v-if="selectedImage"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      @click="closeImage"
    >
      <div class="relative max-w-4xl max-h-full p-4">
        <img
          :src="getImageUrl(selectedImage)"
          :alt="selectedImage.file_name"
          class="max-w-full max-h-full object-contain"
        />
        
        <!-- Close button -->
        <button
          type="button"
          @click="closeImage"
          class="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <!-- Image info -->
        <div class="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded">
          <p class="text-sm font-medium">{{ selectedImage.file_name }}</p>
          <p class="text-xs opacity-75">{{ formatFileSize(selectedImage.file_size) }}</p>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="imageToDelete"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click="cancelDelete"
    >
      <div class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
        
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        
        <div
          class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6"
          @click.stop
        >
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                Delete Image
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete "{{ imageToDelete.file_name }}"? This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              @click="confirmDelete"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Delete
            </button>
            <button
              type="button"
              @click="cancelDelete"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
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
    required: true
  },
  images: {
    type: Array,
    default: () => []
  },
  canDelete: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['deleted'])

const { showSuccess, showError } = useNotification()

const selectedImage = ref(null)
const imageToDelete = ref(null)

function getImageUrl(image) {
  let baseUrl
  
  // Since file_url already includes '/api/', we just need to use it directly
  // without adding api.defaults.baseURL which would create '/api/api/...'
  if (image.file_url.startsWith('/api/')) {
    baseUrl = image.file_url
  } else {
    // If it's a relative path, prepend the API base URL
    baseUrl = `${api.defaults.baseURL}${image.file_url}`
  }
  
  // Add authentication token as query parameter for image access
  // This is needed because img src requests don't include Authorization headers
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  if (token) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`
  }
  
  return baseUrl
}

function openImage(image) {
  selectedImage.value = image
}

function closeImage() {
  selectedImage.value = null
}

function handleImageError(event) {
  console.error('Failed to load image:', event.target.src)
  // Remove the image element to prevent infinite loading loop
  event.target.style.display = 'none'
  // Show a placeholder div instead
  const placeholder = document.createElement('div')
  placeholder.className = 'w-full h-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-500 text-sm'
  placeholder.textContent = 'Failed to load'
  event.target.parentNode.appendChild(placeholder)
}

function deleteImage(image) {
  imageToDelete.value = image
}

function cancelDelete() {
  imageToDelete.value = null
}

async function confirmDelete() {
  if (!imageToDelete.value) return

  try {
    await api.delete(`/trades/${props.tradeId}/images/${imageToDelete.value.id}`)
    showSuccess('Success', 'Image deleted successfully')
    emit('deleted', imageToDelete.value.id)
    imageToDelete.value = null
  } catch (error) {
    console.error('Failed to delete image:', error)
    showError('Error', error.response?.data?.error || 'Failed to delete image')
    imageToDelete.value = null
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>