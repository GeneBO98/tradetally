<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/50 transition-opacity" @click="emit('close')"></div>

      <!-- Modal -->
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Connect Interactive Brokers
          </h3>
          <button
            @click="emit('close')"
            class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6">
          <!-- Instructions -->
          <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 class="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Setup Instructions</h4>
            <ol class="text-sm text-blue-700 dark:text-blue-400 space-y-2 list-decimal list-inside">
              <li>Log in to your IBKR account at <a href="https://www.interactivebrokers.com" target="_blank" class="underline">interactivebrokers.com</a></li>
              <li>Go to <strong>Settings > Reporting > Flex Queries</strong></li>
              <li>Create a new Activity Flex Query with Trades/Executions selected</li>
              <li>Note down your <strong>Query ID</strong></li>
              <li>Go to <strong>Settings > Reporting > Flex Token</strong></li>
              <li>Generate a token (set expiration to 1+ year)</li>
            </ol>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label for="flexToken" class="label">Flex Token</label>
              <input
                id="flexToken"
                v-model="form.flexToken"
                type="password"
                class="input"
                placeholder="Enter your Flex Token"
                required
              />
            </div>

            <div>
              <label for="flexQueryId" class="label">Flex Query ID</label>
              <input
                id="flexQueryId"
                v-model="form.flexQueryId"
                type="text"
                class="input"
                placeholder="e.g., 123456"
                required
              />
            </div>

            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <label class="block text-sm font-medium text-gray-900 dark:text-white">
                  Auto-Sync
                </label>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Automatically sync trades daily
                </p>
              </div>
              <button
                type="button"
                @click="form.autoSyncEnabled = !form.autoSyncEnabled"
                :class="[
                  form.autoSyncEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600',
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'
                ]"
              >
                <span
                  :class="[
                    form.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                  ]"
                />
              </button>
            </div>

            <div v-if="form.autoSyncEnabled">
              <label for="syncTime" class="label">Sync Time</label>
              <input
                id="syncTime"
                v-model="form.syncTime"
                type="time"
                class="input"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Time to automatically sync each day (in your local timezone)
              </p>
            </div>
          </form>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            @click="emit('close')"
            class="btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="handleSubmit"
            :disabled="loading || !isValid"
            class="btn-primary"
          >
            <span v-if="loading" class="flex items-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Connecting...
            </span>
            <span v-else>Connect</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'save'])

const form = ref({
  flexToken: '',
  flexQueryId: '',
  autoSyncEnabled: true,
  syncFrequency: 'daily',
  syncTime: '06:00'
})

const isValid = computed(() => {
  return form.value.flexToken.length > 0 && form.value.flexQueryId.length > 0
})

function handleSubmit() {
  if (!isValid.value) return

  emit('save', {
    flexToken: form.value.flexToken,
    flexQueryId: form.value.flexQueryId,
    autoSyncEnabled: form.value.autoSyncEnabled,
    syncFrequency: form.value.syncFrequency,
    syncTime: form.value.syncTime + ':00'
  })
}
</script>
