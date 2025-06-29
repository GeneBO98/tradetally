<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Manage user accounts, roles, and permissions
        </p>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6">
        <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
      </div>

      <!-- Users table -->
      <div v-else class="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
        <div class="px-4 py-5 sm:p-6">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Verified
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Joined
                  </th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="flex-shrink-0 h-10 w-10">
                        <img
                          v-if="user.avatar_url"
                          class="h-10 w-10 rounded-full"
                          :src="user.avatar_url"
                          :alt="user.username"
                        />
                        <div
                          v-else
                          class="h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center"
                        >
                          <span class="text-sm font-medium text-white">
                            {{ user.username.charAt(0).toUpperCase() }}
                          </span>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ user.username }}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">
                          {{ user.full_name || 'No name set' }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ user.email }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <select
                      :value="user.role"
                      @change="updateUserRole(user, $event.target.value)"
                      :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1)"
                      class="text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': user.is_active,
                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': !user.is_active
                      }"
                      class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ user.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': user.is_verified,
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400': !user.is_verified
                      }"
                      class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ user.is_verified ? 'Verified' : 'Unverified' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(user.created_at) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      @click="toggleUserStatus(user)"
                      :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1 && user.is_active)"
                      :class="{
                        'text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300': user.is_active,
                        'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300': !user.is_active
                      }"
                      class="disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {{ user.is_active ? 'Deactivate' : 'Activate' }}
                    </button>
                    <button
                      @click="confirmDeleteUser(user)"
                      :disabled="isUpdating || user.id === currentUserId || (user.role === 'admin' && adminCount <= 1)"
                      class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Users</dt>
                  <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ users.length }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Admin Users</dt>
                  <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ adminCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Active Users</dt>
                  <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ activeUserCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3 text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
            <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mt-2">Delete User</h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to permanently delete user <strong>{{ userToDelete?.username }}</strong>?
              This action cannot be undone.
            </p>
          </div>
          <div class="flex gap-4 mt-4">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Cancel
            </button>
            <button
              @click="deleteUser"
              :disabled="isUpdating"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {{ isUpdating ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'
import { useAuthStore } from '@/stores/auth'

const { showSuccess, showError } = useNotification()
const authStore = useAuthStore()

const users = ref([])
const loading = ref(true)
const error = ref(null)
const isUpdating = ref(false)
const showDeleteConfirm = ref(false)
const userToDelete = ref(null)

const currentUserId = computed(() => authStore.user?.id)

const adminCount = computed(() => {
  return users.value.filter(user => user.role === 'admin' && user.is_active).length
})

const activeUserCount = computed(() => {
  return users.value.filter(user => user.is_active).length
})

async function fetchUsers() {
  try {
    loading.value = true
    error.value = null
    
    const response = await api.get('/users/admin/users')
    users.value = response.data.users
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load users'
    showError('Error', error.value)
  } finally {
    loading.value = false
  }
}

async function updateUserRole(user, newRole) {
  if (user.role === newRole) return
  
  try {
    isUpdating.value = true
    
    const response = await api.put(`/users/admin/users/${user.id}/role`, {
      role: newRole
    })
    
    // Update the user in the local array
    const userIndex = users.value.findIndex(u => u.id === user.id)
    if (userIndex !== -1) {
      users.value[userIndex] = response.data.user
    }
    
    showSuccess('Success', response.data.message)
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to update user role')
  } finally {
    isUpdating.value = false
  }
}

async function toggleUserStatus(user) {
  const newStatus = !user.is_active
  
  try {
    isUpdating.value = true
    
    const response = await api.put(`/users/admin/users/${user.id}/status`, {
      isActive: newStatus
    })
    
    // Update the user in the local array
    const userIndex = users.value.findIndex(u => u.id === user.id)
    if (userIndex !== -1) {
      users.value[userIndex] = response.data.user
    }
    
    showSuccess('Success', response.data.message)
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to update user status')
  } finally {
    isUpdating.value = false
  }
}

function confirmDeleteUser(user) {
  userToDelete.value = user
  showDeleteConfirm.value = true
}

async function deleteUser() {
  if (!userToDelete.value) return
  
  try {
    isUpdating.value = true
    
    const response = await api.delete(`/users/admin/users/${userToDelete.value.id}`)
    
    // Remove the user from the local array
    users.value = users.value.filter(u => u.id !== userToDelete.value.id)
    
    showSuccess('Success', response.data.message)
    showDeleteConfirm.value = false
    userToDelete.value = null
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to delete user')
  } finally {
    isUpdating.value = false
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  fetchUsers()
})
</script>