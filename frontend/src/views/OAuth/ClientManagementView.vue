<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="heading-page">OAuth2 Applications</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage OAuth2 clients that can authenticate users via TradeTally
          </p>
        </div>
        <button @click="showCreateModal = true" class="btn-primary">
          <PlusIcon class="w-4 h-4 mr-2" />
          New Application
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Clients List -->
    <div v-else-if="clients.length > 0" class="space-y-4">
      <div
        v-for="client in clients"
        :key="client.id"
        class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h3 class="heading-card">
                {{ client.name }}
              </h3>
              <span
                v-if="client.is_trusted"
                class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400"
              >
                Trusted
              </span>
            </div>

            <p v-if="client.description" class="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {{ client.description }}
            </p>

            <div class="space-y-2">
              <div class="flex items-start">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 w-24">Client ID:</span>
                <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">
                  {{ client.client_id }}
                </code>
                <button
                  @click="copyToClipboard(client.client_id)"
                  class="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Copy"
                >
                  <ClipboardIcon class="w-4 h-4" />
                </button>
              </div>

              <div class="flex items-start">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 w-24">Redirect URIs:</span>
                <div class="flex-1">
                  <div
                    v-for="(uri, index) in client.redirect_uris"
                    :key="index"
                    class="text-xs text-gray-700 dark:text-gray-300"
                  >
                    {{ uri }}
                  </div>
                </div>
              </div>

              <div class="flex items-start">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 w-24">Scopes:</span>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="scope in client.allowed_scopes"
                    :key="scope"
                    class="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400"
                  >
                    {{ scope }}
                  </span>
                </div>
              </div>

              <div class="flex items-start">
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 w-24">Created:</span>
                <span class="text-xs text-gray-600 dark:text-gray-400">
                  {{ formatDate(client.created_at) }}
                </span>
              </div>
            </div>
          </div>

          <div class="ml-4">
            <button
              @click="confirmDelete(client)"
              class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              title="Delete"
            >
              <TrashIcon class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <KeyIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No OAuth Applications</h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">
        Create your first OAuth2 application to enable external integrations.
      </p>
      <button @click="showCreateModal = true" class="btn-primary">
        <PlusIcon class="w-4 h-4 mr-2" />
        Create Application
      </button>
    </div>

    <!-- Create Client Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Create OAuth2 Application
        </h3>

        <form @submit.prevent="createClient" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Application Name *
            </label>
            <input
              v-model="newClient.name"
              type="text"
              required
              class="input"
              placeholder="My Application"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              v-model="newClient.description"
              rows="3"
              class="input"
              placeholder="Brief description of your application"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Redirect URIs * (one per line)
            </label>
            <textarea
              v-model="redirectUrisText"
              rows="4"
              required
              class="input font-mono text-sm"
              placeholder="https://example.com/oauth/callback&#10;https://discourse.example.com/auth/oauth2_basic/callback"
            ></textarea>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              These are the URLs your application will redirect users to after authorization
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Allowed Scopes
            </label>
            <div class="space-y-2">
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedScopes" value="openid" class="form-checkbox" />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">openid - Basic identity</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedScopes" value="profile" class="form-checkbox" />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">profile - Profile information</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedScopes" value="email" class="form-checkbox" />
                <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">email - Email address</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Website URL
            </label>
            <input
              v-model="newClient.websiteUrl"
              type="url"
              class="input"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Logo URL
            </label>
            <input
              v-model="newClient.logoUrl"
              type="url"
              class="input"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div v-if="isAdmin" class="flex items-center">
            <input
              type="checkbox"
              v-model="newClient.isTrusted"
              id="trusted"
              class="form-checkbox"
            />
            <label for="trusted" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Trusted application (skip consent screen)
            </label>
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" @click="closeCreateModal" class="btn-secondary">
              Cancel
            </button>
            <button type="submit" :disabled="creating" class="btn-primary">
              {{ creating ? 'Creating...' : 'Create Application' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Client Created Modal (shows credentials) -->
    <div v-if="createdClient" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div class="flex items-center space-x-3 mb-4">
          <CheckCircleIcon class="w-8 h-8 text-green-500" />
          <h3 class="heading-card">
            Application Created Successfully
          </h3>
        </div>

        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <p class="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
            Save these credentials now! The client secret will not be shown again.
          </p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Client ID
            </label>
            <div class="flex items-center space-x-2">
              <code class="flex-1 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded font-mono text-sm break-all">
                {{ createdClient.client_id }}
              </code>
              <button
                @click="copyToClipboard(createdClient.client_id)"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ClipboardIcon class="w-5 h-5" />
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Client Secret
            </label>
            <div class="flex items-center space-x-2">
              <code class="flex-1 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded font-mono text-sm break-all">
                {{ createdClient.client_secret }}
              </code>
              <button
                @click="copyToClipboard(createdClient.client_secret)"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ClipboardIcon class="w-5 h-5" />
              </button>
            </div>
          </div>

          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p class="text-sm text-blue-800 dark:text-blue-300">
              <strong>For Discourse OAuth2 Basic plugin:</strong><br />
              Use these endpoints:<br />
              - Authorization: <code>{{ baseUrl }}/oauth/authorize</code><br />
              - Token: <code>{{ baseUrl }}/oauth/token</code><br />
              - UserInfo: <code>{{ baseUrl }}/oauth/userinfo</code>
            </p>
          </div>
        </div>

        <div class="flex justify-end pt-6">
          <button @click="closeCreatedModal" class="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="clientToDelete" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Delete OAuth Application
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete "{{ clientToDelete.name }}"? This will revoke all access tokens and cannot be undone.
        </p>
        <div class="flex justify-end space-x-3">
          <button @click="clientToDelete = null" class="btn-secondary">
            Cancel
          </button>
          <button @click="deleteClient" :disabled="deleting" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { format, parseISO } from 'date-fns'
import {
  PlusIcon,
  TrashIcon,
  ClipboardIcon,
  KeyIcon,
  CheckCircleIcon
} from '@heroicons/vue/24/outline'

const authStore = useAuthStore()

const loading = ref(false)
const creating = ref(false)
const deleting = ref(false)
const clients = ref([])
const showCreateModal = ref(false)
const createdClient = ref(null)
const clientToDelete = ref(null)

const newClient = ref({
  name: '',
  description: '',
  redirectUris: [],
  allowedScopes: ['openid', 'profile', 'email'],
  websiteUrl: '',
  logoUrl: '',
  isTrusted: false
})

const redirectUrisText = ref('')
const selectedScopes = ref(['openid', 'profile', 'email'])

const isAdmin = computed(() => authStore.user?.role === 'admin')
const baseUrl = computed(() => window.location.origin)

const formatDate = (dateString) => {
  try {
    return format(parseISO(dateString), 'MMM d, yyyy h:mm a')
  } catch {
    return dateString
  }
}

const loadClients = async () => {
  try {
    loading.value = true
    const response = await api.get('/oauth/api/clients')
    clients.value = response.data.clients || []
  } catch (error) {
    console.error('Error loading OAuth clients:', error)
  } finally {
    loading.value = false
  }
}

const createClient = async () => {
  try {
    creating.value = true

    // Parse redirect URIs
    const redirectUris = redirectUrisText.value
      .split('\n')
      .map(uri => uri.trim())
      .filter(uri => uri.length > 0)

    if (redirectUris.length === 0) {
      alert('Please provide at least one redirect URI')
      return
    }

    const response = await api.post('/oauth/api/clients', {
      name: newClient.value.name,
      description: newClient.value.description,
      redirectUris,
      allowedScopes: selectedScopes.value,
      websiteUrl: newClient.value.websiteUrl || null,
      logoUrl: newClient.value.logoUrl || null,
      isTrusted: newClient.value.isTrusted
    })

    createdClient.value = response.data.client
    showCreateModal.value = false
    await loadClients()
  } catch (error) {
    console.error('Error creating OAuth client:', error)
    alert(error.response?.data?.error || 'Failed to create OAuth client')
  } finally {
    creating.value = false
  }
}

const confirmDelete = (client) => {
  clientToDelete.value = client
}

const deleteClient = async () => {
  try {
    deleting.value = true
    await api.delete(`/oauth/api/clients/${clientToDelete.value.client_id}`)
    clientToDelete.value = null
    await loadClients()
  } catch (error) {
    console.error('Error deleting OAuth client:', error)
    alert(error.response?.data?.error || 'Failed to delete OAuth client')
  } finally {
    deleting.value = false
  }
}

const closeCreateModal = () => {
  showCreateModal.value = false
  newClient.value = {
    name: '',
    description: '',
    redirectUris: [],
    allowedScopes: ['openid', 'profile', 'email'],
    websiteUrl: '',
    logoUrl: '',
    isTrusted: false
  }
  redirectUrisText.value = ''
  selectedScopes.value = ['openid', 'profile', 'email']
}

const closeCreatedModal = () => {
  createdClient.value = null
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    // Could add a toast notification here
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}

onMounted(() => {
  loadClients()
})
</script>
