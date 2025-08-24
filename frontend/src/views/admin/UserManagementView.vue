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
        <!-- Search bar -->
        <div class="px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div class="flex-shrink-0 w-full sm:w-96">
              <div class="relative rounded-md shadow-sm">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  v-model="searchQuery"
                  @input="handleSearch"
                  type="text"
                  placeholder="Search users..."
                  class="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 pr-12 sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md"
                />
                <div v-if="searchQuery" class="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    @click="clearSearch"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
              {{ totalUsers }} user{{ totalUsers !== 1 ? 's' : '' }} found
            </div>
          </div>
        </div>
        
        <div class="px-4 py-5 sm:p-6">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/6">
                    User
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/6">
                    Email
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">
                    Role
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">
                    Status
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">
                    Verified
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-20">
                    Approved
                  </th>
                  <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">
                    Joined
                  </th>
                  <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" style="width: 200px;">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td class="px-3 py-3 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="flex-shrink-0 h-8 w-8">
                        <img
                          v-if="user.avatar_url"
                          class="h-8 w-8 rounded-full"
                          :src="user.avatar_url"
                          :alt="user.username"
                        />
                        <div
                          v-else
                          class="h-8 w-8 rounded-full bg-primary-500 flex items-center justify-center"
                        >
                          <span class="text-xs font-medium text-white">
                            {{ user.username.charAt(0).toUpperCase() }}
                          </span>
                        </div>
                      </div>
                      <div class="ml-2">
                        <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {{ user.username }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {{ user.full_name || 'No name set' }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div class="truncate">{{ user.email }}</div>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap">
                    <select
                      :value="user.role"
                      @change="updateUserRole(user, $event.target.value)"
                      :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1)"
                      class="text-xs border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap">
                    <span
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': user.is_active,
                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': !user.is_active
                      }"
                      class="inline-flex px-1 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ user.is_active ? '✓' : '✗' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap">
                    <span
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': user.is_verified,
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400': !user.is_verified
                      }"
                      class="inline-flex px-1 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ user.is_verified ? '✓' : '✗' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap">
                    <span
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': user.admin_approved,
                        'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400': !user.admin_approved
                      }"
                      class="inline-flex px-1 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ user.admin_approved ? '✓' : '✗' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(user.created_at) }}
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap text-right text-sm font-medium" style="width: 200px;">
                    <div class="flex justify-end space-x-1">
                      <!-- Blue: Verify -->
                      <button
                        v-if="!user.is_verified"
                        @click="verifyUser(user)"
                        :disabled="isUpdating"
                        class="px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-800/30 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Verify
                      </button>
                      
                      <!-- Green: Approve or Activate -->
                      <button
                        v-if="!user.admin_approved"
                        @click="approveUser(user)"
                        :disabled="isUpdating"
                        class="px-2 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-800/30 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve
                      </button>
                      <button
                        v-else-if="!user.is_active"
                        @click="toggleUserStatus(user)"
                        :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1 && user.is_active)"
                        class="px-2 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-800/30 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Activate
                      </button>
                      
                      <!-- Orange: Deactivate -->
                      <button
                        v-if="user.is_active && user.admin_approved"
                        @click="toggleUserStatus(user)"
                        :disabled="isUpdating || (user.role === 'admin' && adminCount <= 1 && user.is_active)"
                        class="px-2 py-1 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-800/30 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Deactivate
                      </button>
                      
                      <!-- Red: Delete -->
                      <button
                        @click="confirmDeleteUser(user)"
                        :disabled="isUpdating || user.id === currentUserId || (user.role === 'admin' && adminCount <= 1)"
                        class="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-800/30 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Pagination Controls -->
          <div class="px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center text-sm text-gray-700 dark:text-gray-300">
              Showing {{ startIndex }} to {{ endIndex }} of {{ totalUsers }} users
            </div>
            
            <div class="flex items-center space-x-1">
              <!-- Previous button -->
              <button
                @click="prevPage"
                :disabled="currentPage === 1"
                class="relative inline-flex items-center px-2 py-2 text-sm font-medium rounded-l-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              
              <!-- Page numbers -->
              <button
                v-for="page in getVisiblePages"
                :key="page.value"
                @click="page.type === 'page' ? goToPage(page.value) : null"
                :disabled="page.type === 'ellipsis'"
                :class="{
                  'bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20 dark:border-primary-500 dark:text-primary-400': page.value === currentPage && page.type === 'page',
                  'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-600': page.value !== currentPage && page.type === 'page',
                  'bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 cursor-default': page.type === 'ellipsis'
                }"
                class="relative inline-flex items-center px-4 py-2 text-sm font-medium border"
              >
                {{ page.display }}
              </button>
              
              <!-- Next button -->
              <button
                @click="nextPage"
                :disabled="currentPage === totalPages"
                class="relative inline-flex items-center px-2 py-2 text-sm font-medium rounded-r-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
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
                  <dd class="text-lg font-medium text-gray-900 dark:text-white">{{ totalUsers }}</dd>
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

        <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Pending Approval</dt>
                  <dd class="text-lg font-medium text-orange-600 dark:text-orange-400">{{ pendingApprovalCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Unverified</dt>
                  <dd class="text-lg font-medium text-yellow-600 dark:text-yellow-400">{{ unverifiedCount }}</dd>
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
          <div class="flex justify-center gap-4 mt-4">
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

// Pagination state
const currentPage = ref(1)
const totalPages = ref(1)
const totalUsers = ref(0)
const usersPerPage = ref(25)
const hasMore = ref(false)

// Search state
const searchQuery = ref('')
const searchTimeout = ref(null)

const currentUserId = computed(() => authStore.user?.id)

const adminCount = computed(() => {
  return users.value.filter(user => user.role === 'admin' && user.is_active).length
})

const activeUserCount = computed(() => {
  return users.value.filter(user => user.is_active).length
})

const pendingApprovalCount = computed(() => {
  return users.value.filter(user => !user.admin_approved).length
})

const unverifiedCount = computed(() => {
  return users.value.filter(user => !user.is_verified).length
})

const startIndex = computed(() => (currentPage.value - 1) * usersPerPage.value + 1)
const endIndex = computed(() => Math.min(startIndex.value + users.value.length - 1, totalUsers.value))

const getVisiblePages = computed(() => {
  const pages = []
  const delta = 2
  const range = []
  
  // Calculate range of pages to show
  for (let i = Math.max(2, currentPage.value - delta); i <= Math.min(totalPages.value - 1, currentPage.value + delta); i++) {
    range.push(i)
  }
  
  if (currentPage.value - delta > 2) {
    range.unshift('...')
  }
  if (currentPage.value + delta < totalPages.value - 1) {
    range.push('...')
  }
  
  range.unshift(1)
  if (totalPages.value !== 1) {
    range.push(totalPages.value)
  }
  
  // Convert to page objects
  let pageNum = 1
  for (const item of range) {
    if (item === '...') {
      pages.push({ type: 'ellipsis', display: '...', value: `ellipsis-${pageNum++}` })
    } else {
      pages.push({ type: 'page', display: item, value: item })
    }
  }
  
  return pages
})

async function fetchUsers(page = 1) {
  try {
    loading.value = true
    error.value = null
    
    const params = new URLSearchParams({
      page: page.toString(),
      limit: usersPerPage.value.toString()
    })
    
    if (searchQuery.value.trim()) {
      params.append('search', searchQuery.value.trim())
    }
    
    const response = await api.get(`/users/admin/users?${params}`)
    users.value = response.data.users
    totalUsers.value = response.data.total
    totalPages.value = response.data.totalPages
    currentPage.value = response.data.page
    hasMore.value = response.data.hasMore
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load users'
    showError('Error', error.value)
  } finally {
    loading.value = false
  }
}

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) {
    fetchUsers(page)
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    goToPage(currentPage.value + 1)
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    goToPage(currentPage.value - 1)
  }
}

function handleSearch() {
  // Clear existing timeout
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }
  
  // Debounce search to avoid too many API calls
  searchTimeout.value = setTimeout(() => {
    currentPage.value = 1 // Reset to first page on search
    fetchUsers(1)
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  currentPage.value = 1
  fetchUsers(1)
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
    
    // Refresh the current page to reflect the deletion
    await fetchUsers(currentPage.value)
    
    showSuccess('Success', response.data.message)
    showDeleteConfirm.value = false
    userToDelete.value = null
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to delete user')
  } finally {
    isUpdating.value = false
  }
}

async function verifyUser(user) {
  try {
    isUpdating.value = true
    
    const response = await api.post(`/users/admin/users/${user.id}/verify`)
    
    // Update the user in the local array
    const userIndex = users.value.findIndex(u => u.id === user.id)
    if (userIndex !== -1) {
      users.value[userIndex] = response.data.user
    }
    
    showSuccess('Success', response.data.message)
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to verify user')
  } finally {
    isUpdating.value = false
  }
}

async function approveUser(user) {
  try {
    isUpdating.value = true
    
    const response = await api.post(`/users/admin/users/${user.id}/approve`)
    
    // Update the user in the local array
    const userIndex = users.value.findIndex(u => u.id === user.id)
    if (userIndex !== -1) {
      users.value[userIndex] = response.data.user
    }
    
    showSuccess('Success', response.data.message)
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to approve user')
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