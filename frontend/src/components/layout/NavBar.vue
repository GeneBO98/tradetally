<template>
  <!-- Public top nav. Only rendered for logged-out visitors; the authenticated app uses Sidebar.vue. -->
  <div class="sticky top-0 z-50 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-gray-700" style="width: 100%; min-width: 100vw;">
    <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <router-link to="/" class="flex items-center px-2 py-2 text-xl font-bold text-primary-600">
            <img src="/favicon.svg" alt="TradeTally Logo" class="h-8 w-auto mr-2" />
            TradeTally
          </router-link>

          <div class="hidden sm:ml-12 sm:flex sm:space-x-2">
            <router-link
              v-for="item in publicNavigation"
              :key="item.name"
              :to="item.to"
              class="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold transition-all duration-200"
              :class="[
                $route.name === item.route
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'
              ]"
            >
              {{ item.name }}
            </router-link>
          </div>
        </div>

        <div class="flex items-center space-x-6 ml-8">
          <!-- Desktop Navigation -->
          <div class="hidden sm:flex sm:items-center sm:space-x-6">
            <div class="flex items-center space-x-3">
              <router-link to="/login" class="btn-secondary text-sm">
                Login
              </router-link>
              <router-link to="/register" class="btn-primary text-sm">
                Sign Up
              </router-link>
            </div>

            <button
              @click="toggleDarkMode"
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <SunIcon v-if="isDark" class="h-5 w-5" />
              <MoonIcon v-else class="h-5 w-5" />
            </button>
          </div>

          <!-- Mobile menu button -->
          <div class="sm:hidden flex items-center space-x-2">
            <button
              @click="toggleDarkMode"
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <SunIcon v-if="isDark" class="h-5 w-5" />
              <MoonIcon v-else class="h-5 w-5" />
            </button>
            <button
              @click="toggleMobileMenu"
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'"
              :aria-expanded="isMobileMenuOpen"
            >
              <Bars3Icon v-if="!isMobileMenuOpen" class="h-6 w-6" />
              <XMarkIcon v-else class="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile menu -->
      <div v-if="isMobileMenuOpen" class="sm:hidden border-t border-gray-200 dark:border-gray-700">
        <div class="pt-2 pb-3 space-y-1">
          <router-link
            v-for="item in publicNavigation"
            :key="item.name"
            :to="item.to"
            @click="isMobileMenuOpen = false"
            class="block mx-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200"
            :class="[
              $route.name === item.route
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
            ]"
          >
            {{ item.name }}
          </router-link>
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <router-link
              to="/login"
              @click="isMobileMenuOpen = false"
              class="block mx-3 px-4 py-3 rounded-lg text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-all duration-200"
            >
              Login
            </router-link>
            <router-link
              to="/register"
              @click="isMobileMenuOpen = false"
              class="block mx-3 px-4 py-3 rounded-lg text-base font-semibold bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/40 shadow-sm transition-all duration-200"
            >
              Sign Up
            </router-link>
          </div>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon } from '@heroicons/vue/24/outline'

const uiPreferencesStore = useUiPreferencesStore()
const isDark = ref(false)
const isMobileMenuOpen = ref(false)

const publicNavigation = [
  { name: 'Public Trades', to: '/public', route: 'public-trades' },
  { name: 'Market Risk', to: '/market-risk', route: 'market-risk' }
]

function toggleDarkMode() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('darkMode', isDark.value)
  uiPreferencesStore.notifyChanged('darkMode', isDark.value)
}

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

onMounted(() => {
  isDark.value = localStorage.getItem('darkMode') === 'true'
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  }
})
</script>
