<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">App Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Configure your application preferences and AI provider settings.
      </p>
    </div>

    <div class="space-y-8">
      <!-- AI Provider Settings -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">AI Provider Settings</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Configure which AI provider to use for analytics recommendations and CUSIP lookups.
            <span v-if="authStore.user?.role === 'admin'" class="block mt-2 text-blue-600 dark:text-blue-400">
              Note: As an admin, you can also configure default settings for all users below.
            </span>
            <span v-else class="block mt-2 text-blue-600 dark:text-blue-400">
              Note: If you leave these settings empty, admin-configured defaults will be used.
            </span>
          </p>

          <form @submit.prevent="updateAISettings" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="aiProvider" class="label">AI Provider</label>
                <select
                  id="aiProvider"
                  v-model="aiForm.provider"
                  class="input"
                  @change="onProviderChange"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="local">Local/Custom</option>
                </select>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Choose your preferred AI provider for analytics and CUSIP resolution.
                </p>
              </div>

              <div>
                <label for="aiModel" class="label">Model (Optional)</label>
                <input
                  id="aiModel"
                  v-model="aiForm.model"
                  type="text"
                  class="input"
                  :placeholder="getModelPlaceholder()"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Specific model to use. Leave blank for default.
                </p>
              </div>
            </div>

            <div v-if="aiForm.provider === 'local' || aiForm.provider === 'ollama'">
              <label for="aiUrl" class="label">API URL</label>
              <input
                id="aiUrl"
                v-model="aiForm.url"
                type="url"
                class="input"
                :placeholder="aiForm.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:8000'"
                required
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ aiForm.provider === 'ollama' ? 'Ollama server URL' : 'Custom AI API endpoint URL' }}
              </p>
            </div>

            <div v-if="aiForm.provider !== 'local'">
              <label for="aiApiKey" class="label">API Key</label>
              <input
                id="aiApiKey"
                v-model="aiForm.apiKey"
                type="password"
                class="input"
                :placeholder="getApiKeyPlaceholder()"
                :required="aiForm.provider !== 'ollama'"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ getApiKeyHelp() }}
              </p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="aiLoading"
                class="btn-primary"
              >
                <span v-if="aiLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </span>
                <span v-else>Save AI Settings</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Admin AI Provider Settings -->
      <div v-if="authStore.user?.role === 'admin'" class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Admin AI Provider Settings</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Configure default AI provider settings for all users. Users can override these settings for their own accounts.
          </p>

          <form @submit.prevent="updateAdminAISettings" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="adminAiProvider" class="label">Default AI Provider</label>
                <select
                  id="adminAiProvider"
                  v-model="adminAiForm.provider"
                  class="input"
                  @change="onAdminProviderChange"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="local">Local/Custom</option>
                </select>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Default AI provider for all users (unless they override it).
                </p>
              </div>

              <div>
                <label for="adminAiModel" class="label">Default Model (Optional)</label>
                <input
                  id="adminAiModel"
                  v-model="adminAiForm.model"
                  type="text"
                  class="input"
                  :placeholder="getAdminModelPlaceholder()"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Default model to use. Leave blank for provider default.
                </p>
              </div>
            </div>

            <div v-if="adminAiForm.provider === 'local' || adminAiForm.provider === 'ollama'">
              <label for="adminAiUrl" class="label">Default API URL</label>
              <input
                id="adminAiUrl"
                v-model="adminAiForm.url"
                type="url"
                class="input"
                :placeholder="adminAiForm.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:8000'"
                required
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Default {{ adminAiForm.provider === 'ollama' ? 'Ollama server URL' : 'custom AI API endpoint URL' }} for all users.
              </p>
            </div>

            <div v-if="adminAiForm.provider !== 'local'">
              <label for="adminAiApiKey" class="label">Default API Key</label>
              <input
                id="adminAiApiKey"
                v-model="adminAiForm.apiKey"
                type="password"
                class="input"
                :placeholder="getAdminApiKeyPlaceholder()"
                :required="adminAiForm.provider !== 'ollama'"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ getAdminApiKeyHelp() }}
              </p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="adminAiLoading"
                class="btn-primary"
              >
                <span v-if="adminAiLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </span>
                <span v-else>Save Admin AI Settings</span>
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import api from '@/services/api'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()


// AI Provider Settings
const aiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})

const aiLoading = ref(false)

// Admin AI Settings
const adminAiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})
const adminAiLoading = ref(false)



// AI Provider Functions
function getModelPlaceholder() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'e.g., gemini-1.5-pro'
    case 'claude':
      return 'e.g., claude-3-5-sonnet'
    case 'openai':
      return 'e.g., gpt-4o'
    case 'ollama':
      return 'e.g., llama3.1'
    case 'local':
      return 'e.g., custom-model'
    default:
      return 'Model name'
  }
}

function getApiKeyPlaceholder() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'AIza...'
    case 'claude':
      return 'sk-ant-...'
    case 'openai':
      return 'sk-...'
    case 'ollama':
      return 'Optional API key'
    default:
      return 'Enter API key'
  }
}

function getApiKeyHelp() {
  switch (aiForm.value.provider) {
    case 'gemini':
      return 'Get your API key from Google AI Studio'
    case 'claude':
      return 'Get your API key from Anthropic Console'
    case 'openai':
      return 'Get your API key from OpenAI Dashboard'
    case 'ollama':
      return 'API key is optional for Ollama'
    default:
      return 'Enter your API key'
  }
}

function onProviderChange() {
  // Clear URL and API key when provider changes
  aiForm.value.url = ''
  aiForm.value.apiKey = ''
  aiForm.value.model = ''
}

async function loadAISettings() {
  try {
    const response = await api.get('/settings/ai-provider')
    aiForm.value = {
      provider: response.data.aiProvider || 'gemini',
      apiKey: response.data.aiApiKey || '',
      url: response.data.aiApiUrl || '',
      model: response.data.aiModel || ''
    }
  } catch (error) {
    console.error('Failed to load AI settings:', error)
    showError('Error', 'Failed to load AI settings')
  }
}

async function updateAISettings() {
  aiLoading.value = true
  try {
    await api.put('/settings/ai-provider', {
      aiProvider: aiForm.value.provider,
      aiApiKey: aiForm.value.apiKey,
      aiApiUrl: aiForm.value.url,
      aiModel: aiForm.value.model
    })
    showSuccess('Success', 'AI provider settings updated successfully')
  } catch (error) {
    console.error('Failed to update AI settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update AI settings')
  } finally {
    aiLoading.value = false
  }
}

// Admin AI Settings Functions
async function fetchAdminAISettings() {
  try {
    const response = await api.get('/settings/admin/ai')
    adminAiForm.value = {
      provider: response.data.aiProvider,
      apiKey: response.data.aiApiKey,
      url: response.data.aiApiUrl,
      model: response.data.aiModel
    }
  } catch (error) {
    console.error('Failed to fetch admin AI settings:', error)
    showError('Error', 'Failed to load admin AI settings')
  }
}

async function updateAdminAISettings() {
  adminAiLoading.value = true
  try {
    await api.put('/settings/admin/ai', {
      aiProvider: adminAiForm.value.provider,
      aiApiKey: adminAiForm.value.apiKey,
      aiApiUrl: adminAiForm.value.url,
      aiModel: adminAiForm.value.model
    })
    showSuccess('Success', 'Admin AI provider settings updated successfully')
  } catch (error) {
    console.error('Failed to update admin AI settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update admin AI settings')
  } finally {
    adminAiLoading.value = false
  }
}

function onAdminProviderChange() {
  // Clear API key and URL when provider changes
  adminAiForm.value.apiKey = ''
  adminAiForm.value.url = ''
  adminAiForm.value.model = ''
}

function getAdminModelPlaceholder() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'gemini-1.5-flash'
    case 'claude':
      return 'claude-3-5-sonnet-20241022'
    case 'openai':
      return 'gpt-4o'
    case 'ollama':
      return 'llama3.1'
    case 'local':
      return 'custom-model'
    default:
      return 'Leave blank for default'
  }
}

function getAdminApiKeyPlaceholder() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'Enter Google Gemini API key'
    case 'claude':
      return 'Enter Anthropic Claude API key'
    case 'openai':
      return 'Enter OpenAI API key'
    case 'ollama':
      return 'Optional: Enter Ollama API key'
    default:
      return 'Enter API key'
  }
}

function getAdminApiKeyHelp() {
  switch (adminAiForm.value.provider) {
    case 'gemini':
      return 'Get your free API key at: https://aistudio.google.com/app/apikey'
    case 'claude':
      return 'Get your API key at: https://console.anthropic.com/'
    case 'openai':
      return 'Get your API key at: https://platform.openai.com/api-keys'
    case 'ollama':
      return 'API key is optional for Ollama. Leave blank if not needed.'
    default:
      return 'API key for your chosen provider'
  }
}


onMounted(() => {
  loadAISettings()
  
  // Load admin AI settings if user is admin
  if (authStore.user?.role === 'admin') {
    fetchAdminAISettings()
  }
})
</script>