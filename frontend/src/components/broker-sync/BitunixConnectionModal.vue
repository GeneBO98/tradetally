<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50 transition-opacity" @click="emit('close')"></div>

      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg">
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            Connect Bitunix
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

        <div class="p-6">
          <div class="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
            <h4 class="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">Setup Instructions</h4>
            <ol class="text-sm text-emerald-700 dark:text-emerald-400 space-y-2 list-decimal list-inside">
              <li>Log in to your <a href="https://www.bitunix.com" target="_blank" rel="noopener noreferrer" class="underline font-medium">Bitunix account</a></li>
              <li>Create a futures API key with read permissions</li>
              <li>Copy the API key and API secret into the fields below</li>
              <li>Choose the margin coin used for your Bitunix futures account</li>
            </ol>
            <p class="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
              TradeTally syncs Bitunix futures positions and closed position history.
            </p>
          </div>

          <div v-if="props.error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div class="flex">
              <svg class="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
              <p class="ml-3 text-sm text-red-700 dark:text-red-300">{{ props.error }}</p>
            </div>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label for="api_key" class="label">API Key</label>
              <input
                id="api_key"
                v-model="form.api_key"
                type="password"
                class="input"
                placeholder="Enter your Bitunix API key"
                required
              />
            </div>

            <div>
              <label for="api_secret" class="label">API Secret</label>
              <input
                id="api_secret"
                v-model="form.api_secret"
                type="password"
                class="input"
                placeholder="Enter your Bitunix API secret"
                required
              />
            </div>

            <div>
              <label for="margin_coin" class="label">Margin Coin</label>
              <select id="margin_coin" v-model="form.margin_coin" class="input">
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </div>

            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <label class="block text-sm font-medium text-gray-900 dark:text-white">
                  Auto-Sync
                </label>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Automatically sync Bitunix trades daily
                </p>
              </div>
              <button
                type="button"
                @click="form.auto_sync_enabled = !form.auto_sync_enabled"
                :class="[
                  form.auto_sync_enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600',
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2'
                ]"
              >
                <span
                  :class="[
                    form.auto_sync_enabled ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                  ]"
                />
              </button>
            </div>

            <div v-if="form.auto_sync_enabled">
              <label for="sync_time" class="label">Sync Time</label>
              <input
                id="sync_time"
                v-model="form.sync_time"
                type="time"
                class="input"
              />
            </div>
          </form>
        </div>

        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" @click="emit('close')" class="btn-secondary">
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
import { computed, ref } from 'vue'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'save'])

const form = ref({
  api_key: '',
  api_secret: '',
  margin_coin: 'USDT',
  auto_sync_enabled: true,
  sync_frequency: 'daily',
  sync_time: '06:00'
})

const isValid = computed(() => {
  return form.value.api_key.length > 0 && form.value.api_secret.length > 0
})

function handleSubmit() {
  if (!isValid.value) return

  emit('save', {
    api_key: form.value.api_key,
    api_secret: form.value.api_secret,
    margin_coin: form.value.margin_coin,
    auto_sync_enabled: form.value.auto_sync_enabled,
    sync_frequency: form.value.sync_frequency,
    sync_time: `${form.value.sync_time}:00`
  })
}
</script>
