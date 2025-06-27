<template>
  <nav class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex">
          <router-link to="/" class="flex items-center px-2 py-2 text-xl font-bold text-primary-600">
            TraderVue
          </router-link>
          
          <div v-if="authStore.isAuthenticated" class="hidden sm:ml-6 sm:flex sm:space-x-8">
            <router-link
              v-for="item in navigation"
              :key="item.name"
              :to="item.to"
              class="inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              :class="[
                $route.name === item.route
                  ? 'border-primary-500 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white'
              ]"
            >
              {{ item.name }}
            </router-link>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <button
            @click="toggleDarkMode"
            class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <SunIcon v-if="isDark" class="h-5 w-5" />
            <MoonIcon v-else class="h-5 w-5" />
          </button>

          <div v-if="authStore.isAuthenticated" class="flex items-center space-x-3">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ authStore.user?.username }}
            </span>
            <button
              @click="authStore.logout"
              class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Logout
            </button>
          </div>
          
          <div v-else class="flex items-center space-x-3">
            <router-link to="/login" class="btn-secondary text-sm">
              Login
            </router-link>
            <router-link to="/register" class="btn-primary text-sm">
              Sign Up
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { SunIcon, MoonIcon } from '@heroicons/vue/24/outline'

const authStore = useAuthStore()
const isDark = ref(false)

const navigation = [
  { name: 'Dashboard', to: '/dashboard', route: 'dashboard' },
  { name: 'Trades', to: '/trades', route: 'trades' },
  { name: 'Analytics', to: '/analytics', route: 'analytics' },
  { name: 'Import', to: '/import', route: 'import' },
  { name: 'Settings', to: '/settings', route: 'settings' }
]

function toggleDarkMode() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('darkMode', isDark.value)
}

onMounted(() => {
  isDark.value = localStorage.getItem('darkMode') === 'true'
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  }
})
</script>