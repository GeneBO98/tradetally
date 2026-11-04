<template>
  <div v-if="images.length > 0" class="space-y-4">
    <h3 class="heading-card">
      Trade Images
    </h3>
    
    <!-- Full size images display -->
    <div class="space-y-6">
      <div
        v-for="image in images"
        :key="image.id"
        class="relative group max-w-4xl mx-auto"
      >
        <div class="bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg">
          <div
            v-if="authedImage.hasError(image)"
            class="w-full aspect-video flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-500 text-sm"
          >
            Failed to load
          </div>
          <div
            v-else-if="!authedImage.urlFor(image)"
            class="w-full aspect-video flex items-center justify-center bg-gray-100 dark:bg-gray-700"
          >
            <div class="spinner spinner-md"></div>
          </div>
          <button
            v-else
            type="button"
            :aria-label="`View ${image.file_name}`"
            class="block w-full hover:opacity-95 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            @click="openImage(image)"
          >
            <img :src="authedImage.urlFor(image)" :alt="image.file_name" class="w-full h-auto" />
          </button>
        </div>
        
        <!-- File info bar -->
        <div class="mt-2 flex items-center justify-between">
          <p class="text-sm text-gray-600 dark:text-gray-400" :title="image.file_name">
            {{ image.file_name }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-500">
            {{ formatFileSize(image.file_size) }}
          </p>
        </div>
        
        <!-- Delete button (only for trade owner) -->
        <button
          v-if="canDelete"
          type="button"
          @click.stop="deleteImage(image)"
          class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Image modal -->
    <TradeImageViewer
      v-if="selectedImage"
      :image="selectedImage"
      :src="authedImage.urlFor(selectedImage)"
      @close="closeImage"
    />

    <!-- Delete confirmation modal -->
    <div
      v-if="imageToDelete"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click="cancelDelete"
    >
      <div class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center ">
        <div class="modal-backdrop"></div>
        
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        
        <div role="dialog" aria-modal="true"
          class="modal-panel w-full p-6 max-w-lg"
          @click.stop
        >
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="modal-title">
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
              class="btn-danger w-full justify-center sm:ml-3 sm:w-auto sm:text-sm"
            >
              Delete
            </button>
            <button
              type="button"
              @click="cancelDelete"
              class="btn-secondary mt-3 w-full sm:mt-0 sm:w-auto"
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
import { ref, toRef } from 'vue'
import { useNotification } from '@/composables/useNotification'
import { useAuthedImage } from '@/composables/useAuthedImage'
import api from '@/services/api'
import TradeImageViewer from './TradeImageViewer.vue'

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

const authedImage = useAuthedImage(toRef(props, 'images'))

function openImage(image) {
  selectedImage.value = image
}

function closeImage() {
  selectedImage.value = null
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
