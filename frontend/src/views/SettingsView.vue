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
            <span v-if="authStore.user?.role === 'admin'" class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
              Note: As an admin, you can also configure default settings for all users below.
            </span>
            <span v-else class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
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
                  <option value="lmstudio">LM Studio</option>
                  <option value="perplexity">Perplexity AI</option>
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

            <div v-if="aiForm.provider === 'local' || aiForm.provider === 'ollama' || aiForm.provider === 'lmstudio'">
              <label for="aiUrl" class="label">API URL</label>
              <input
                id="aiUrl"
                v-model="aiForm.url"
                type="url"
                class="input"
                :placeholder="aiForm.provider === 'ollama' ? 'http://localhost:11434' : aiForm.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:8000'"
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

      <!-- Analytics Preferences -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Analytics Preferences</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Customize how your trading analytics are calculated and displayed.
          </p>

          <form @submit.prevent="updateAnalyticsSettings" class="space-y-6">
            <div>
              <label for="statisticsCalculation" class="label">Statistics Calculation Method</label>
              <select
                id="statisticsCalculation"
                v-model="analyticsForm.statisticsCalculation"
                class="input"
              >
                <option value="average">Average (Mean)</option>
                <option value="median">Median</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose whether to use averages or medians for calculations like Average P&L, Average Win, Average Loss, etc. 
                Medians are less affected by outliers and may provide a more representative view of typical performance.
                <span class="block mt-2 text-blue-600 dark:text-blue-400 font-medium">
                  Note: Changes take effect immediately and will update labels throughout the application.
                </span>
              </p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="analyticsLoading"
                class="btn-primary"
              >
                <span v-if="analyticsLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </span>
                <span v-else>Save Analytics Settings</span>
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
                  <option value="lmstudio">LM Studio</option>
                  <option value="perplexity">Perplexity AI</option>
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

            <div v-if="adminAiForm.provider === 'local' || adminAiForm.provider === 'ollama' || adminAiForm.provider === 'lmstudio'">
              <label for="adminAiUrl" class="label">Default API URL</label>
              <input
                id="adminAiUrl"
                v-model="adminAiForm.url"
                type="url"
                class="input"
                :placeholder="adminAiForm.provider === 'ollama' ? 'http://localhost:11434' : adminAiForm.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:8000'"
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

      <!-- API Documentation -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">API Documentation</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Access comprehensive API documentation for integrating with TradeTally programmatically.
          </p>
          
          <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex-1">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Interactive API Explorer</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Browse all available API endpoints, test requests, and view response schemas using our Swagger documentation.
              </p>
            </div>
            <a 
              :href="getApiDocsUrl()" 
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary flex-shrink-0 ml-4"
            >
              <MdiIcon :icon="apiIcon" :size="16" class="mr-2" />
              Open API Docs
            </a>
          </div>
        </div>
      </div>

      <!-- Data Export & Import -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Data Export & Import</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Export all your trading data, settings, and trading profile as a JSON file. You can also import previously exported data.
          </p>

          <div class="space-y-6">
            <!-- Export Section -->
            <div class="flex items-start space-x-4">
              <div class="flex-1">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Export Your Data</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Download a complete backup of your TradeTally data including trades, settings, tags, and equity history.
                </p>
              </div>
              <button
                @click="exportUserData"
                :disabled="exportLoading"
                class="btn-primary flex-shrink-0"
              >
                <span v-if="exportLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Preparing Export...
                </span>
                <span v-else class="flex items-center">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  Export All Data
                </span>
              </button>
            </div>

            <!-- Import Section -->
            <div class="flex items-start space-x-4">
              <div class="flex-1">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Import Data</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Import previously exported TradeTally data. This will merge with your existing data without duplicating trades.
                </p>
              </div>
              <div class="flex-shrink-0">
                <input
                  ref="fileInput"
                  type="file"
                  accept=".json,application/json"
                  @change="handleFileSelect"
                  class="hidden"
                />
                <button
                  @click="$refs.fileInput.click()"
                  class="btn-secondary"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
                  </svg>
                  Choose File
                </button>
              </div>
            </div>
            
            <!-- Selected File and Import Button -->
            <div v-if="selectedFile" class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span class="text-sm text-gray-600 dark:text-gray-400 truncate mr-4">
                Selected: {{ selectedFile.name }}
              </span>
              <button
                @click="importUserData"
                :disabled="importLoading"
                class="btn-primary flex-shrink-0"
              >
                <span v-if="importLoading" class="flex items-center">
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importing...
                </span>
                <span v-else class="flex items-center">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  Import Data
                </span>
              </button>
            </div>
          </div>
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
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiApi } from '@mdi/js'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

// Icons
const apiIcon = mdiApi

// AI Provider Settings
const aiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})

const aiLoading = ref(false)

// Analytics Settings
const analyticsForm = ref({
  statisticsCalculation: 'average'
})

const analyticsLoading = ref(false)

// Admin AI Settings
const adminAiForm = ref({
  provider: 'gemini',
  apiKey: '',
  url: '',
  model: ''
})
const adminAiLoading = ref(false)

// Export/Import Settings
const exportLoading = ref(false)
const importLoading = ref(false)
const selectedFile = ref(null)

// Get API docs URL
function getApiDocsUrl() {
  // Check if we're in development and need to use a different port
  const currentUrl = window.location
  
  // If frontend is on port 5173 (Vite dev), backend is on port 3000
  if (currentUrl.port === '5173' || currentUrl.hostname === 'localhost') {
    return `http://localhost:3000/api-docs`
  }
  
  // Otherwise use the same origin
  return `${currentUrl.origin}/api-docs`
}



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
    case 'lmstudio':
      return 'e.g., local-model (auto-detected)'
    case 'perplexity':
      return 'e.g., sonar'
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
    case 'perplexity':
      return 'pplx-...'
    case 'lmstudio':
      return 'Optional API key'
    case 'local':
      return 'Enter API key'
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
    case 'perplexity':
      return 'Get your API key from Perplexity AI Settings'
    case 'lmstudio':
      return 'API key is optional for LM Studio'
    case 'local':
      return 'Enter your custom API key if required'
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

// Analytics Settings Functions
async function loadAnalyticsSettings() {
  try {
    const response = await api.get('/settings')
    analyticsForm.value = {
      statisticsCalculation: response.data.settings.statisticsCalculation || 'average'
    }
  } catch (error) {
    console.error('Failed to load analytics settings:', error)
    // Default to average if loading fails
    analyticsForm.value.statisticsCalculation = 'average'
  }
}

async function updateAnalyticsSettings() {
  analyticsLoading.value = true
  try {
    await api.put('/settings', {
      statisticsCalculation: analyticsForm.value.statisticsCalculation
    })
    showSuccess('Success', 'Analytics preferences updated successfully')
  } catch (error) {
    console.error('Failed to update analytics settings:', error)
    showError('Error', error.response?.data?.error || 'Failed to update analytics settings')
  } finally {
    analyticsLoading.value = false
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
    case 'lmstudio':
      return 'local-model (auto-detected)'
    case 'perplexity':
      return 'sonar'
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

// Export/Import Functions
async function exportUserData() {
  exportLoading.value = true
  try {
    const response = await api.get('/settings/export', {
      responseType: 'blob'
    })
    
    // Create a download link
    const blob = new Blob([response.data], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    
    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0]
    link.download = `tradetally-export-${today}.json`
    
    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    showSuccess('Export Complete', 'Your data has been exported successfully')
  } catch (error) {
    console.error('Export failed:', error)
    showError('Export Failed', error.response?.data?.error || 'Failed to export user data')
  } finally {
    exportLoading.value = false
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
  }
}

async function importUserData() {
  if (!selectedFile.value) {
    showError('No File Selected', 'Please select a file to import')
    return
  }
  
  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    
    const response = await api.post('/settings/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    const { tradesAdded, tagsAdded, equityAdded } = response.data
    showSuccess(
      'Import Complete', 
      `Successfully imported ${tradesAdded} trades, ${tagsAdded} tags, and ${equityAdded} equity records`
    )
    
    // Clear the selected file
    selectedFile.value = null
    // Reset the file input
    const fileInput = document.querySelector('input[type="file"]')
    if (fileInput) fileInput.value = ''
  } catch (error) {
    console.error('Import failed:', error)
    showError('Import Failed', error.response?.data?.error || 'Failed to import user data')
  } finally {
    importLoading.value = false
  }
}

onMounted(() => {
  loadAISettings()
  loadAnalyticsSettings()
  
  // Load admin AI settings if user is admin
  if (authStore.user?.role === 'admin') {
    fetchAdminAISettings()
  }
})
</script>