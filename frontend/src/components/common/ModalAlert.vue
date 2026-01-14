<template>
  <!-- Modal Overlay -->
  <div
    v-if="modalAlert"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    @click="handleOverlayClick"
  >
    <div class="relative top-20 mx-auto p-5 border max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800">
      <div class="mt-3">
        <!-- Icon -->
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4" :class="iconBgClass">
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
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {{ modalAlert.title }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-6">
            {{ modalAlert.message }}
          </p>
        </div>

        <!-- Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <!-- Cancel/Secondary Button -->
          <button
            v-if="modalAlert.cancelText"
            @click="handleCancel" 
            class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            {{ modalAlert.cancelText }}
          </button>

          <!-- Primary/Confirm Button -->
          <button
            @click="handleConfirm"
            class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2"
            :class="confirmButtonClass"
          >
            {{ modalAlert.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNotification } from '@/composables/useNotification'
import { ExclamationTriangleIcon, XCircleIcon, QuestionMarkCircleIcon, CheckCircleIcon } from '@heroicons/vue/24/outline'

const { modalAlert, clearModalAlert } = useNotification()

const iconBgClass = computed(() => {
  switch (modalAlert.value?.type) {
    case 'error':
      return 'bg-red-100 dark:bg-red-900/20'
    case 'warning':
      return 'bg-yellow-100 dark:bg-yellow-900/20'
    case 'confirm':
      return 'bg-primary-100 dark:bg-primary-900/20'
    case 'success':
      return 'bg-green-100 dark:bg-green-900/20'
    default:
      return 'bg-gray-100 dark:bg-gray-900/20'
  }
})

const iconClass = computed(() => {
  switch (modalAlert.value?.type) {
    case 'error':
      return 'text-red-600 dark:text-red-400'
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'confirm':
      return 'text-primary-600 dark:text-primary-400'
    case 'success':
      return 'text-green-600 dark:text-green-400'
    default:
      return 'text-gray-600 dark:text-gray-400'
  }
})

const confirmButtonClass = computed(() => {
  switch (modalAlert.value?.type) {
    case 'error':
      return 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    case 'warning':
      return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
    case 'confirm':
      return 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
    case 'success':
      return 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
    default:
      return 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500'
  }
})

function handleConfirm() {
  if (modalAlert.value?.onConfirm) {
    modalAlert.value.onConfirm()
  } else {
    clearModalAlert()
  }
}

function handleCancel() {
  if (modalAlert.value?.onCancel) {
    modalAlert.value.onCancel()
  } else {
    clearModalAlert()
  }
}

function handleOverlayClick(event) {
  // Only close if clicking the overlay itself, not the modal content
  if (event.target === event.currentTarget) {
    handleCancel()
  }
}
</script>