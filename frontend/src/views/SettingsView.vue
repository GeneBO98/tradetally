<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your account settings and preferences.
      </p>
    </div>

    <div class="space-y-8">
      <!-- Profile Settings -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Profile Information</h3>
          <form @submit.prevent="updateProfile" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="fullName" class="label">Full Name</label>
                <input
                  id="fullName"
                  v-model="profileForm.fullName"
                  type="text"
                  class="input"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label for="username" class="label">Username</label>
                <input
                  id="username"
                  v-model="profileForm.username"
                  type="text"
                  disabled
                  class="input bg-gray-50 dark:bg-gray-700"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Username cannot be changed.
                </p>
              </div>
              
              <div>
                <label for="email" class="label">Email</label>
                <input
                  id="email"
                  v-model="profileForm.email"
                  type="email"
                  disabled
                  class="input bg-gray-50 dark:bg-gray-700"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Email cannot be changed.
                </p>
              </div>
              
              <div>
                <label for="timezone" class="label">Timezone</label>
                <select id="timezone" v-model="profileForm.timezone" class="input">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="profileLoading"
                class="btn-primary"
              >
                <span v-if="profileLoading">Updating...</span>
                <span v-else>Update Profile</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Preferences -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Preferences</h3>
          <form @submit.prevent="updateSettings" class="space-y-6">
            <div class="space-y-4">
              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input
                    id="emailNotifications"
                    v-model="settingsForm.emailNotifications"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3 text-sm">
                  <label for="emailNotifications" class="font-medium text-gray-700 dark:text-gray-300">
                    Email Notifications
                  </label>
                  <p class="text-gray-500 dark:text-gray-400">
                    Receive email notifications for trade imports and reminders.
                  </p>
                </div>
              </div>

              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input
                    id="publicProfile"
                    v-model="settingsForm.publicProfile"
                    type="checkbox"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3 text-sm">
                  <label for="publicProfile" class="font-medium text-gray-700 dark:text-gray-300">
                    Public Profile
                  </label>
                  <p class="text-gray-500 dark:text-gray-400">
                    Allow others to see your trades that you've marked as public. Individual trades must still be marked as public to appear.
                  </p>
                </div>
              </div>

              <div>
                <label for="theme" class="label">Theme</label>
                <select id="theme" v-model="settingsForm.theme" class="input w-auto">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div>
                <label for="defaultTags" class="label">Default Tags</label>
                <input
                  id="defaultTags"
                  v-model="defaultTagsInput"
                  type="text"
                  class="input"
                  placeholder="momentum, scalping, earnings"
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Comma-separated tags that will be pre-filled when creating new trades.
                </p>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="settingsLoading"
                class="btn-primary"
              >
                <span v-if="settingsLoading">Updating...</span>
                <span v-else>Update Settings</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Tags Management -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Manage Tags</h3>
            <button @click="showAddTag = true" class="btn-primary">
              Add Tag
            </button>
          </div>

          <div v-if="tags.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400">
            No tags created yet
          </div>

          <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="tag in tags"
              :key="tag.id"
              class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="flex items-center space-x-3">
                <div
                  class="w-4 h-4 rounded-full"
                  :style="{ backgroundColor: tag.color }"
                ></div>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ tag.name }}</span>
              </div>
              <button
                @click="deleteTag(tag.id)"
                class="text-red-600 hover:text-red-500"
              >
                <XMarkIcon class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Add Tag Modal -->
          <div v-if="showAddTag" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
              <div class="mt-3">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Add New Tag</h3>
                <form @submit.prevent="addTag" class="space-y-4">
                  <div>
                    <label for="tagName" class="label">Tag Name</label>
                    <input
                      id="tagName"
                      v-model="newTag.name"
                      type="text"
                      required
                      class="input"
                      placeholder="Enter tag name"
                    />
                  </div>
                  <div>
                    <label for="tagColor" class="label">Color</label>
                    <input
                      id="tagColor"
                      v-model="newTag.color"
                      type="color"
                      class="input h-10"
                    />
                  </div>
                  <div class="flex justify-end space-x-3">
                    <button
                      type="button"
                      @click="showAddTag = false"
                      class="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" class="btn-primary">
                      Add Tag
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Change Password -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Change Password</h3>
          <form @submit.prevent="changePassword" class="space-y-6">
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label for="currentPassword" class="label">Current Password</label>
                <input
                  id="currentPassword"
                  v-model="passwordForm.currentPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
              <div></div>
              <div>
                <label for="newPassword" class="label">New Password</label>
                <input
                  id="newPassword"
                  v-model="passwordForm.newPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
              <div>
                <label for="confirmPassword" class="label">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  required
                  class="input"
                />
              </div>
            </div>

            <div v-if="passwordError" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p class="text-sm text-red-800 dark:text-red-400">{{ passwordError }}</p>
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="passwordLoading"
                class="btn-primary"
              >
                <span v-if="passwordLoading">Changing...</span>
                <span v-else">Change Password</span>
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
import { XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

const profileLoading = ref(false)
const settingsLoading = ref(false)
const passwordLoading = ref(false)
const passwordError = ref(null)
const showAddTag = ref(false)

const profileForm = ref({
  fullName: '',
  username: '',
  email: '',
  timezone: 'UTC'
})

const settingsForm = ref({
  emailNotifications: true,
  publicProfile: false,
  theme: 'light'
})

const defaultTagsInput = ref('')

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const tags = ref([])

const newTag = ref({
  name: '',
  color: '#3B82F6'
})

async function updateProfile() {
  profileLoading.value = true
  
  try {
    await api.put('/users/profile', {
      fullName: profileForm.value.fullName,
      timezone: profileForm.value.timezone
    })
    
    showSuccess('Success', 'Profile updated successfully')
    await authStore.fetchUser()
  } catch (error) {
    showError('Error', 'Failed to update profile')
  } finally {
    profileLoading.value = false
  }
}

async function updateSettings() {
  settingsLoading.value = true
  
  try {
    const payload = {
      ...settingsForm.value,
      defaultTags: defaultTagsInput.value 
        ? defaultTagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean)
        : []
    }
    
    await api.put('/settings', payload)
    showSuccess('Success', 'Settings updated successfully')
  } catch (error) {
    showError('Error', 'Failed to update settings')
  } finally {
    settingsLoading.value = false
  }
}

async function changePassword() {
  passwordError.value = null
  
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = 'New passwords do not match'
    return
  }
  
  if (passwordForm.value.newPassword.length < 6) {
    passwordError.value = 'New password must be at least 6 characters long'
    return
  }
  
  passwordLoading.value = true
  
  try {
    await api.put('/users/password', {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword
    })
    
    showSuccess('Success', 'Password changed successfully')
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  } catch (error) {
    passwordError.value = error.response?.data?.error || 'Failed to change password'
  } finally {
    passwordLoading.value = false
  }
}

async function fetchTags() {
  try {
    const response = await api.get('/settings/tags')
    tags.value = response.data.tags
  } catch (error) {
    console.error('Failed to fetch tags:', error)
  }
}

async function addTag() {
  try {
    await api.post('/settings/tags', newTag.value)
    showSuccess('Success', 'Tag added successfully')
    newTag.value = { name: '', color: '#3B82F6' }
    showAddTag.value = false
    fetchTags()
  } catch (error) {
    showError('Error', 'Failed to add tag')
  }
}

async function deleteTag(tagId) {
  if (!confirm('Are you sure you want to delete this tag?')) return
  
  try {
    await api.delete(`/settings/tags/${tagId}`)
    showSuccess('Success', 'Tag deleted successfully')
    fetchTags()
  } catch (error) {
    showError('Error', 'Failed to delete tag')
  }
}

async function loadData() {
  try {
    const [userResponse, settingsResponse] = await Promise.all([
      api.get('/users/profile'),
      api.get('/settings')
    ])
    
    const user = userResponse.data.user
    const settings = settingsResponse.data.settings
    
    profileForm.value = {
      fullName: user.full_name || '',
      username: user.username,
      email: user.email,
      timezone: user.timezone || 'UTC'
    }
    
    settingsForm.value = {
      emailNotifications: settings.email_notifications ?? true,
      publicProfile: settings.public_profile ?? false,
      theme: settings.theme || 'light'
    }
    
    defaultTagsInput.value = settings.default_tags ? settings.default_tags.join(', ') : ''
    
    fetchTags()
  } catch (error) {
    showError('Error', 'Failed to load settings')
  }
}

onMounted(() => {
  loadData()
})
</script>