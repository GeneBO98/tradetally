<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50 transition-opacity" @click="emit('close')"></div>

      <div class="relative w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Connect Trading 212</h3>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6">
          <div class="mb-6 rounded-lg bg-primary-50 p-4 dark:bg-primary-900/20">
            <h4 class="mb-2 text-sm font-medium text-primary-800 dark:text-primary-300">Setup instructions</h4>
            <ol class="list-inside list-decimal space-y-2 text-sm text-primary-700 dark:text-primary-400">
              <li>Open Trading 212 and go to your account settings.</li>
              <li>Create an API key pair for the account you want to sync.</li>
              <li>Enable read access for account data and historical orders.</li>
              <li>Copy the API key and secret below, then select the matching live or demo environment.</li>
            </ol>
            <a
              href="https://docs.trading212.com/api"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-block text-xs font-medium text-primary-600 underline dark:text-primary-400"
            >
              View Trading 212 API documentation
            </a>
          </div>

          <div v-if="props.error" class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <p class="text-sm text-red-700 dark:text-red-300">{{ props.error }}</p>
          </div>

          <form class="space-y-4" @submit.prevent="handleSubmit">
            <div>
              <label for="trading212-environment" class="label">Environment</label>
              <select id="trading212-environment" v-model="form.broker_environment" class="input" required>
                <option v-for="option in availableEnvironments" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                API keys are specific to either your real-money or practice account.
              </p>
            </div>

            <div>
              <label for="trading212-account-label" class="label">Account label</label>
              <input
                id="trading212-account-label"
                v-model="form.account_label"
                type="text"
                class="input"
                placeholder="e.g., Main ISA"
              />
            </div>

            <div>
              <label for="trading212-api-key" class="label">API key</label>
              <input
                id="trading212-api-key"
                v-model="form.api_key"
                type="password"
                class="input"
                autocomplete="off"
                required
              />
            </div>

            <div>
              <label for="trading212-api-secret" class="label">API secret</label>
              <input
                id="trading212-api-secret"
                v-model="form.api_secret"
                type="password"
                class="input"
                autocomplete="off"
                required
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Both values are encrypted before they are stored.
              </p>
            </div>

            <div class="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div>
                <span class="block text-sm font-medium text-gray-900 dark:text-white">Auto-sync</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">Automatically retrieve new order history</span>
              </div>
              <button
                type="button"
                :class="[
                  form.auto_sync_enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600',
                  'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2'
                ]"
                role="switch"
                :aria-checked="form.auto_sync_enabled"
                @click="form.auto_sync_enabled = !form.auto_sync_enabled"
              >
                <span
                  :class="[
                    form.auto_sync_enabled ? 'translate-x-5' : 'translate-x-0',
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition'
                  ]"
                />
              </button>
            </div>

            <div v-if="form.auto_sync_enabled">
              <label for="trading212-sync-time" class="label">Sync time</label>
              <input id="trading212-sync-time" v-model="form.sync_time" type="time" class="input" />
            </div>

            <div>
              <label class="label">Sync trades from</label>
              <div class="mb-2 flex flex-wrap gap-2">
                <button
                  v-for="preset in syncRangePresets"
                  :key="preset.id"
                  type="button"
                  :class="[
                    'rounded-full border px-3 py-1 text-sm transition-colors',
                    activePreset === preset.id
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                  ]"
                  @click="applySyncRangePreset(preset.id)"
                >
                  {{ preset.label }}
                </button>
              </div>
              <input
                v-if="activePreset === 'custom'"
                v-model="form.syncStartDate"
                type="date"
                class="input"
                :max="todayIso"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                A shorter range reduces the number of rate-limited history requests.
              </p>
            </div>

            <p class="rounded-lg border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
              Trading 212 API access currently supports Invest and Stocks ISA accounts. CFD accounts are not available through this integration.
            </p>
          </form>
        </div>

        <div class="flex items-center justify-end space-x-3 border-t border-gray-200 p-6 dark:border-gray-700">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
          <button type="button" class="btn-primary" :disabled="props.loading || !isValid" @click="handleSubmit">
            <span v-if="props.loading" class="flex items-center">
              <span class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></span>
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
import { syncRangePresets, applyPresetToForm, todayIso } from '@/utils/syncRangePresets'

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  existingEnvironments: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'save'])
const environmentOptions = [
  { value: 'live', label: 'Live account' },
  { value: 'demo', label: 'Demo account' }
]
const availableEnvironments = computed(() =>
  environmentOptions.filter(option => !props.existingEnvironments.includes(option.value))
)

const form = ref({
  broker_environment: availableEnvironments.value[0]?.value || 'live',
  account_label: '',
  api_key: '',
  api_secret: '',
  auto_sync_enabled: true,
  sync_frequency: 'daily',
  sync_time: '06:00',
  syncStartDate: null
})
const activePreset = ref('all')

const isValid = computed(() =>
  availableEnvironments.value.length > 0 &&
  form.value.api_key.trim().length > 0 &&
  form.value.api_secret.trim().length > 0
)

function applySyncRangePreset(presetId) {
  activePreset.value = presetId
  applyPresetToForm(form.value, presetId)
}

function handleSubmit() {
  if (!isValid.value) return
  emit('save', {
    broker_environment: form.value.broker_environment,
    account_label: form.value.account_label,
    api_key: form.value.api_key,
    api_secret: form.value.api_secret,
    auto_sync_enabled: form.value.auto_sync_enabled,
    sync_frequency: form.value.sync_frequency,
    sync_time: `${form.value.sync_time}:00`,
    sync_start_date: form.value.syncStartDate
  })
}
</script>
