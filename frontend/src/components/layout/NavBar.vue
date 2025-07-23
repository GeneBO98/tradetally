<template>
  <nav class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <router-link to="/" class="flex items-center px-2 py-2 text-xl font-bold text-primary-600">
            <img src="https://zipline.id10tips.com/u/tradetally-favicon.svg" alt="" class="h-8 w-auto mr-2" />
            TradeTally
          </router-link>
          
          <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
            <template v-if="authStore.isAuthenticated">
              <template v-for="item in navigation" :key="item.name">
                <!-- Dropdown navigation item -->
                <NavDropdown 
                  v-if="item.type === 'dropdown'"
                  :title="item.name"
                  :items="item.items"
                />
                <!-- Regular navigation item -->
                <router-link
                  v-else
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
              </template>
            </template>
            <template v-else>
              <router-link
                v-for="item in publicNavigation"
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
            </template>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <!-- Desktop Navigation -->
          <div class="hidden sm:flex sm:items-center sm:space-x-4">
            <button
              @click="toggleDarkMode"
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            >
              <SunIcon v-if="isDark" class="h-5 w-5" />
              <MoonIcon v-else class="h-5 w-5" />
            </button>

            <div v-if="authStore.isAuthenticated" class="flex items-center space-x-3">
              <a v-if="config.showDonationButton"
                href="https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Support TradeTally development"
              >
                ☕
              </a>
              <router-link 
                to="/profile" 
                class="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white underline"
              >
                {{ authStore.user?.username }}
              </router-link>
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
          <template v-if="authStore.isAuthenticated">
            <template v-for="item in navigation" :key="item.name">
              <!-- Dropdown items - expanded in mobile -->
              <template v-if="item.type === 'dropdown'">
                <div class="px-3 py-2">
                  <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {{ item.name }}
                  </div>
                </div>
                <router-link
                  v-for="subItem in item.items"
                  :key="subItem.name"
                  :to="subItem.to"
                  @click="isMobileMenuOpen = false"
                  class="block pl-6 pr-3 py-2 text-base font-medium"
                  :class="[
                    $route.name === subItem.route
                      ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
                  ]"
                >
                  <div class="flex items-center">
                    {{ subItem.name }}
                    <span 
                      v-if="subItem.badge"
                      class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      :class="{
                        'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400': subItem.badge.type === 'pro'
                      }"
                    >
                      {{ subItem.badge.text }}
                    </span>
                  </div>
                </router-link>
              </template>
              <!-- Regular navigation item -->
              <router-link
                v-else
                :to="item.to"
                @click="isMobileMenuOpen = false"
                class="block px-3 py-2 text-base font-medium"
                :class="[
                  $route.name === item.route
                    ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
                ]"
              >
                {{ item.name }}
              </router-link>
            </template>
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4 pb-3">
              <div class="px-3 mb-3">
                <div class="text-base font-medium text-gray-800 dark:text-gray-200">
                  {{ authStore.user?.username }}
                </div>
              </div>
              <button
                @click="authStore.logout(); isMobileMenuOpen = false"
                class="block w-full text-left px-3 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
              >
                Logout
              </button>
            </div>
          </template>
          <template v-else>
            <router-link
              v-for="item in publicNavigation"
              :key="item.name"
              :to="item.to"
              @click="isMobileMenuOpen = false"
              class="block px-3 py-2 text-base font-medium"
              :class="[
                $route.name === item.route
                  ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-gray-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
              ]"
            >
              {{ item.name }}
            </router-link>
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
              <router-link
                to="/login"
                @click="isMobileMenuOpen = false"
                class="block px-3 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
              >
                Login
              </router-link>
              <router-link
                to="/register"
                @click="isMobileMenuOpen = false"
                class="block px-3 py-2 text-base font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-gray-700"
              >
                Sign Up
              </router-link>
            </div>
          </template>
          
          <!-- Donation link (subtle placement at bottom) -->
          <div v-if="config.showDonationButton" class="border-t border-gray-200 dark:border-gray-700 pt-4 pb-3 px-3 mt-4">
            <a
              href="https://www.paypal.com/donate/?business=EHMBRET4CNELL&no_recurring=0&currency_code=USD"
              target="_blank"
              rel="noopener noreferrer"
              @click="isMobileMenuOpen = false"
              class="flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <span class="mr-2">☕</span>
              <span>Support development</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon } from '@heroicons/vue/24/outline'
import config from '@/config'
import NavDropdown from '@/components/common/NavDropdown.vue'

const authStore = useAuthStore()
const { showSEOPages } = useRegistrationMode()
const isDark = ref(false)
const isMobileMenuOpen = ref(false)

const baseNavigation = [
  { 
    name: 'Dashboard', 
    type: 'dropdown',
    items: [
      { 
        name: 'Trading Dashboard', 
        to: '/dashboard', 
        route: 'dashboard',
        description: 'Overview of your trading performance and statistics'
      },
      { 
        name: 'Leaderboard', 
        to: '/leaderboard', 
        route: 'leaderboard',
        description: 'Track achievements, challenges, and compete with peers'
      }
    ]
  },
  { name: 'Trades', to: '/trades', route: 'trades' },
  { 
    name: 'Analytics', 
    type: 'dropdown',
    items: [
      { 
        name: 'Performance Analytics', 
        to: '/analytics', 
        route: 'analytics',
        description: 'Trading performance metrics and statistics'
      },
      { 
        name: 'Behavioral Analytics', 
        to: '/analytics/behavioral', 
        route: 'behavioral-analytics',
        description: 'Detect revenge trading and emotional patterns',
        badge: { type: 'pro', text: 'Pro' }
      }
    ]
  },
  { 
    name: 'Watchlists', 
    type: 'dropdown',
    items: [
      { 
        name: 'Stock Watchlists', 
        to: '/watchlists', 
        route: 'watchlists',
        description: 'Track your favorite stocks and monitor prices',
        badge: { type: 'pro', text: 'Pro' }
      },
      { 
        name: 'Price Alerts', 
        to: '/price-alerts', 
        route: 'price-alerts',
        description: 'Set email and browser notifications for price targets',
        badge: { type: 'pro', text: 'Pro' }
      }
    ]
  },
  { name: 'Calendar', to: '/calendar', route: 'calendar' },
  { name: 'Import', to: '/import', route: 'import' },
  { name: 'Settings', to: '/settings', route: 'settings' }
]

const publicNavigation = computed(() => {
  const nav = [
    { name: 'Public Trades', to: '/public', route: 'public-trades' }
  ]
  
  // Add SEO pages only when in open mode
  if (showSEOPages.value) {
    nav.push(
      { name: 'Features', to: '/features', route: 'features' },
      { name: 'FAQ', to: '/faq', route: 'faq' },
      { name: 'vs TraderVue', to: '/compare/tradervue', route: 'compare-tradervue' }
    )
  }
  
  return nav
})

const navigation = computed(() => {
  const nav = [...baseNavigation]
  
  // Add admin navigation for admin users
  if (authStore.user?.role === 'admin') {
    nav.push({ name: 'Admin', to: '/admin/users', route: 'admin-users' })
  }
  
  return nav
})

function toggleDarkMode() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('darkMode', isDark.value)
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