<template>
  <nav class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 w-full">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <router-link :to="authStore.isAuthenticated ? '/dashboard' : '/'" class="flex items-center px-2 py-2 text-xl font-bold text-primary-600">
            <img src="/favicon.svg" alt="TradeTally Logo" class="h-8 w-auto mr-2" />
            TradeTally
          </router-link>

          <div class="hidden sm:ml-12 sm:flex sm:space-x-2">
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
                  class="inline-flex items-center px-3 py-2 rounded-md text-sm font-semibold transition-all duration-200"
                  :class="[
                    $route.name === item.route
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'
                  ]"
                >
                  {{ item.name }}
                  <span
                    v-if="item.badge"
                    class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                    :class="{
                      'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400': item.badge.type === 'pro'
                    }"
                  >
                    {{ item.badge.text }}
                  </span>
                </router-link>
              </template>
            </template>
            <template v-else>
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
            </template>
          </div>
        </div>

        <div class="flex items-center space-x-6 ml-8">
          <!-- Desktop Navigation -->
          <div class="hidden sm:flex sm:items-center sm:space-x-6">
            <div v-if="authStore.isAuthenticated" class="flex items-center space-x-4">
              <router-link
                to="/profile"
                class="p-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                :title="authStore.user?.username"
                :aria-label="`Profile: ${authStore.user?.username}`"
              >
                <UserIcon class="h-5 w-5" />
              </router-link>
              <NotificationBell />
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
          <template v-if="authStore.isAuthenticated">
            <template v-for="item in navigation" :key="item.name">
              <!-- Dropdown items - collapsible in mobile -->
              <template v-if="item.type === 'dropdown'">
                <button
                  @click="toggleSection(item.name)"
                  class="w-full text-left mx-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 flex items-center justify-between text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
                >
                  {{ item.name }}
                  <ChevronDownIcon v-if="!expandedSections[item.name]" class="h-5 w-5" />
                  <ChevronUpIcon v-else class="h-5 w-5" />
                </button>
                <transition
                  enter-active-class="transition ease-out duration-200"
                  enter-from-class="opacity-0 -translate-y-1"
                  enter-to-class="opacity-100 translate-y-0"
                  leave-active-class="transition ease-in duration-150"
                  leave-from-class="opacity-100 translate-y-0"
                  leave-to-class="opacity-0 -translate-y-1"
                >
                  <div v-if="expandedSections[item.name]" class="pb-2">
                    <router-link
                      v-for="subItem in item.items"
                      :key="subItem.name"
                      :to="subItem.to"
                      @click="isMobileMenuOpen = false"
                      class="block ml-6 mr-3 pl-3 pr-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                      :class="[
                        $route.name === subItem.route
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
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
                  </div>
                </transition>
              </template>
              <!-- Regular navigation item -->
              <router-link
                v-else
                :to="item.to"
                @click="isMobileMenuOpen = false"
                class="block mx-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200"
                :class="[
                  $route.name === item.route
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
                ]"
              >
                <div class="flex items-center">
                  {{ item.name }}
                  <span
                    v-if="item.badge"
                    class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                    :class="{
                      'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400': item.badge.type === 'pro'
                    }"
                  >
                    {{ item.badge.text }}
                  </span>
                </div>
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
                class="block w-full text-left mx-3 px-4 py-3 rounded-lg text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-all duration-200"
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
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon, ChevronDownIcon, ChevronUpIcon, UserIcon } from '@heroicons/vue/24/outline'
import config from '@/config'
import NavDropdown from '@/components/common/NavDropdown.vue'
import NotificationBell from '@/components/common/NotificationBell.vue'

const authStore = useAuthStore()
const { showSEOPages } = useRegistrationMode()
const isDark = ref(false)
const isMobileMenuOpen = ref(false)
const expandedSections = ref({})

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
        name: 'Trading Journal', 
        to: '/diary', 
        route: 'diary',
        description: 'Daily market notes, trade setups, and reflections'
      },
      { 
        name: 'Leaderboard', 
        to: '/leaderboard', 
        route: 'leaderboard',
        description: 'Track achievements, challenges, and compete with peers'
      },
      { 
        name: 'Public Trades', 
        to: '/public', 
        route: 'public-trades',
        description: 'Browse public trades shared by the community'
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
        name: 'Monthly Performance',
        to: '/analytics/monthly',
        route: 'monthly-performance',
        description: 'Month-by-month performance breakdown and comparison'
      },
      {
        name: 'Behavioral Analytics',
        to: '/analytics/behavioral',
        route: 'behavioral-analytics',
        description: 'Detect revenge trading and emotional patterns',
        badge: { type: 'pro', text: 'Pro' }
      },
      {
        name: 'Health Analytics',
        to: '/analytics/health',
        route: 'health-analytics',
        description: 'Correlate health metrics with trading performance',
        badge: { type: 'pro', text: 'Pro' }
      }
    ]
  },
  {
    name: 'Markets',
    to: '/markets',
    route: 'markets',
    badge: { type: 'pro', text: 'Pro' }
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
    nav.push({
      name: 'Admin',
      type: 'dropdown',
      items: [
        {
          name: 'User Management',
          to: '/admin/users',
          route: 'admin-users',
          description: 'Manage users and permissions'
        },
        {
          name: 'Platform Analytics',
          to: '/admin/analytics',
          route: 'admin-analytics',
          description: 'View platform usage analytics'
        },
        {
          name: 'OAuth Applications',
          to: '/admin/oauth',
          route: 'oauth-clients',
          description: 'Manage OAuth2 clients and integrations'
        },
        {
          name: 'Backup Management',
          to: '/admin/backups',
          route: 'admin-backups',
          description: 'Full site backups and restore'
        }
      ]
    })
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

function toggleSection(sectionName) {
  expandedSections.value[sectionName] = !expandedSections.value[sectionName]
}

onMounted(() => {
  isDark.value = localStorage.getItem('darkMode') === 'true'
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  }
})
</script>