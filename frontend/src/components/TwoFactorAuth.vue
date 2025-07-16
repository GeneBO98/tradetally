<template>
  <div class="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <div class="text-center mb-6">
      <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900">
        <svg class="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
        </svg>
      </div>
      <h3 class="mt-2 text-lg font-medium text-gray-900 dark:text-white">Two-Factor Authentication</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Enter the 6-digit code from your authenticator app
      </p>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="mb-4">
        <label for="code" class="sr-only">Verification Code</label>
        <input
          id="code"
          ref="codeInput"
          v-model="code"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="000000"
          class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-lg font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          :disabled="loading"
          autocomplete="one-time-code"
        />
      </div>

      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
        <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
      </div>

      <div class="flex gap-3">
        <button
          type="submit"
          :disabled="loading || code.length !== 6"
          class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          <span v-if="loading">Verifying...</span>
          <span v-else>Verify</span>
        </button>
        
        <button
          type="button"
          @click="$emit('cancel')"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      <div class="mt-4 text-center">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Having trouble? Contact support for assistance.
        </p>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['submit', 'cancel'])

const code = ref('')
const codeInput = ref(null)

const handleSubmit = () => {
  if (code.value.length === 6) {
    emit('submit', code.value)
  }
}

// Auto-focus the input when component mounts
onMounted(() => {
  if (codeInput.value) {
    codeInput.value.focus()
  }
})

// Watch for input changes and auto-format
const handleInput = (event) => {
  // Only allow numeric input
  event.target.value = event.target.value.replace(/[^0-9]/g, '')
  code.value = event.target.value
}
</script>