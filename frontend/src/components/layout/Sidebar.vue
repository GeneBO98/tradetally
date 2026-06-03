<template>
  <!-- Mobile backdrop -->
  <transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="drawerOpen"
      @click="closeDrawer"
      class="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
    ></div>
  </transition>

  <!-- Sidebar -->
  <aside
    ref="sidebarRef"
    class="sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200/80 bg-white shadow-xl transform transition-all duration-300 ease-out lg:translate-x-0 lg:shadow-none dark:border-gray-800/60 dark:bg-gray-900"
    :class="[
      collapsed ? 'lg:w-16' : 'lg:w-64',
      drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    ]"
  >
    <!-- Brand header -->
    <div
      class="flex items-center gap-3 border-b border-gray-200/80 py-3.5 dark:border-gray-800/60"
      :class="isCollapsed ? 'justify-center px-2' : 'px-4'"
    >
      <router-link
        to="/dashboard"
        @click="closeDrawer"
        class="flex min-w-0 flex-1 items-center gap-2.5"
        :class="{ 'flex-none justify-center': isCollapsed }"
      >
        <img src="/favicon.svg" alt="TradeTally" class="h-8 w-auto shrink-0" />
        <div v-if="!isCollapsed" class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold text-gray-900 dark:text-white">TradeTally</div>
          <div class="truncate text-xs text-gray-500 dark:text-gray-500">
            Trading Journal
          </div>
        </div>
      </router-link>
      <button
        @click="closeDrawer"
        class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden dark:hover:bg-gray-800 dark:hover:text-gray-300"
        aria-label="Close menu"
      >
        <XMarkIcon class="h-5 w-5" />
      </button>
    </div>

    <!-- Global account selector (hidden when collapsed) -->
    <div v-if="!isCollapsed" class="border-b border-gray-200/60 px-3 py-2.5 dark:border-gray-800/60">
      <GlobalAccountSelector />
    </div>

    <!-- Primary nav (scrollable) -->
    <nav class="flex-1 space-y-0.5 overflow-y-auto py-3" :class="isCollapsed ? 'px-1.5' : 'px-2'">
      <template v-for="item in navItems" :key="item.name">
        <!-- Simple link -->
        <router-link
          v-if="item.to"
          :to="item.to"
          @click="closeDrawer"
          class="nav-item group/nav relative"
          :class="[
            isCollapsed ? 'justify-center px-0' : '',
            $route.name === item.route ? 'nav-item--active' : ''
          ]"
          :title="isCollapsed ? item.name : ''"
        >
          <span
            class="absolute left-0 top-1.5 bottom-1.5 w-[2px] origin-center rounded-r-sm bg-primary-500 transition-transform duration-200 ease-out"
            :class="$route.name === item.route ? 'scale-y-100' : 'scale-y-0 group-hover/nav:scale-y-100'"
          ></span>
          <component
            :is="item.icon"
            class="h-5 w-5 shrink-0 transition-colors"
            :class="$route.name === item.route ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 group-hover/nav:text-gray-600 dark:text-gray-500 dark:group-hover/nav:text-gray-300'"
          />
          <span v-if="!isCollapsed" class="flex-1">{{ item.name }}</span>
        </router-link>

        <!-- Expandable group -->
        <div v-else>
          <button
            @click="handleGroupClick(item)"
            class="nav-item group/nav relative w-full"
            :class="[
              isCollapsed ? 'justify-center px-0' : '',
              isGroupActive(item) ? 'nav-item--group-active' : ''
            ]"
            :title="isCollapsed ? item.name : ''"
          >
            <span
              class="absolute left-0 top-1.5 bottom-1.5 w-[2px] origin-center rounded-r-sm bg-primary-500 transition-transform duration-200 ease-out"
              :class="isGroupActive(item) ? 'scale-y-100' : 'scale-y-0 group-hover/nav:scale-y-100'"
            ></span>
            <component
              :is="item.icon"
              class="h-5 w-5 shrink-0 transition-colors"
              :class="isGroupActive(item) ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 group-hover/nav:text-gray-600 dark:text-gray-500 dark:group-hover/nav:text-gray-300'"
            />
            <span v-if="!isCollapsed" class="flex-1 text-left">{{ item.name }}</span>
            <ChevronRightIcon
              v-if="!isCollapsed"
              class="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500"
              :class="{ 'rotate-90': isGroupExpanded(item.name) }"
            />
          </button>
          <transition
            enter-active-class="transition-all duration-200 ease-out overflow-hidden"
            enter-from-class="max-h-0 opacity-0"
            enter-to-class="max-h-96 opacity-100"
            leave-active-class="transition-all duration-150 ease-in overflow-hidden"
            leave-from-class="max-h-96 opacity-100"
            leave-to-class="max-h-0 opacity-0"
          >
            <div v-if="!isCollapsed && isGroupExpanded(item.name)" class="overflow-hidden">
              <div class="mb-1.5 ml-[22px] mt-0.5 border-l border-gray-200 pl-2 dark:border-gray-800">
                <template v-for="(sub, subIdx) in item.items" :key="sub.name">
                  <a
                    v-if="sub.external"
                    :href="sub.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="closeDrawer"
                    class="nav-sub-item group/sub"
                    :style="{ animationDelay: `${subIdx * 25}ms` }"
                  >
                    <span class="flex-1 truncate">{{ sub.name }}</span>
                    <ArrowTopRightOnSquareIcon class="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500" />
                  </a>
                  <router-link
                    v-else
                    :to="sub.to"
                    @click="closeDrawer"
                    class="nav-sub-item group/sub"
                    :class="$route.name === sub.route ? 'nav-sub-item--active' : ''"
                    :style="{ animationDelay: `${subIdx * 25}ms` }"
                  >
                    <span class="flex-1 truncate">{{ sub.name }}</span>
                    <span
                      v-if="sub.badge === 'pro'"
                      class="shrink-0 rounded-[3px] bg-primary-500/15 px-1.5 py-0 text-[9px] font-bold uppercase leading-[14px] tracking-[0.1em] text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
                    >
                      Pro
                    </span>
                  </router-link>
                </template>
              </div>
            </div>
          </transition>
        </div>
      </template>
    </nav>

    <!-- Upgrade card (hidden when collapsed) -->
    <div v-if="!isCollapsed && showUpgradeCard" class="px-3 pb-3">
      <router-link
        to="/pricing"
        @click="closeDrawer"
        class="upgrade-card group relative block overflow-hidden rounded-xl bg-gradient-to-br from-primary-50 to-orange-100 p-3 ring-1 ring-primary-200/80 transition-all hover:ring-primary-300 dark:from-primary-950/40 dark:to-primary-900/20 dark:ring-primary-900/40 dark:hover:ring-primary-800/60"
      >
        <div class="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-primary-500/10 blur-xl"></div>
        <div class="relative">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                Free Plan
              </div>
              <div class="mt-1 text-xs font-semibold text-gray-900 dark:text-white">
                Unlock Pro features
              </div>
              <div class="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                AI analytics, R-multiple, more
              </div>
            </div>
            <div class="shrink-0 rounded-md bg-white/60 p-1 ring-1 ring-primary-200 dark:bg-gray-900/40 dark:ring-primary-900/40">
              <ArrowUpRightIcon class="h-3.5 w-3.5 text-primary-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-primary-400" />
            </div>
          </div>
          <div class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors group-hover:bg-primary-700">
            Upgrade
          </div>
        </div>
      </router-link>
    </div>

    <!-- User block -->
    <div class="relative border-t border-gray-200/80 dark:border-gray-800/60" ref="userBlockRef">
      <button
        @click.stop="toggleUserMenu"
        class="group flex w-full items-center text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
        :class="[
          isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-3',
          userMenuOpen ? 'bg-gray-50 dark:bg-gray-800/50' : ''
        ]"
        :aria-expanded="userMenuOpen"
        aria-haspopup="true"
        :title="isCollapsed ? displayName : ''"
      >
        <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 shadow-sm ring-1 ring-white/40 transition-transform group-hover:scale-[1.03] dark:ring-white/10">
          <img v-if="avatarUrl" :src="avatarUrl" :alt="displayName" class="h-full w-full object-cover" />
          <span v-else class="text-xs font-bold tracking-wider text-white drop-shadow-sm">
            {{ initials }}
          </span>
        </span>
        <template v-if="!isCollapsed">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ displayName }}</p>
              <span
                v-if="roleBadge"
                class="shrink-0 rounded-[3px] bg-primary-500/15 px-1 py-0 text-[8px] font-bold uppercase leading-[13px] tracking-[0.1em] text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
              >
                {{ roleBadge }}
              </span>
            </div>
            <p v-if="authStore.user?.email" class="truncate text-[11px] text-gray-500 dark:text-gray-400">
              {{ authStore.user.email }}
            </p>
          </div>
          <ChevronUpDownIcon class="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600 dark:group-hover:text-gray-300" />
        </template>
      </button>

      <!-- User popover (opens upward) -->
      <transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 scale-95 translate-y-2"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100 scale-100 translate-y-0"
        leave-to-class="opacity-0 scale-95 translate-y-2"
      >
        <div
          v-if="userMenuOpen"
          class="user-popover absolute bottom-full left-2 right-2 z-50 mb-2 origin-bottom-left overflow-hidden rounded-xl bg-white/95 shadow-2xl ring-1 ring-gray-200/80 backdrop-blur-xl lg:left-3 lg:right-auto lg:w-72 dark:bg-gray-900/95 dark:ring-gray-700/60"
        >
          <!-- Header -->
          <div class="px-5 pt-4 pb-4">
            <div class="flex items-start gap-3.5">
              <div class="shrink-0">
                <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 shadow-md ring-1 ring-white/40 dark:ring-white/10">
                  <img v-if="avatarUrl" :src="avatarUrl" :alt="displayName" class="h-full w-full object-cover" />
                  <span v-else class="text-sm font-bold tracking-wider text-white drop-shadow-sm">
                    {{ initials }}
                  </span>
                </div>
              </div>
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center gap-1.5">
                  <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ displayName }}</p>
                  <span
                    v-if="roleBadge"
                    class="shrink-0 rounded-[3px] bg-primary-500/15 px-1.5 py-0 text-[9px] font-bold uppercase leading-[14px] tracking-[0.1em] text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
                  >
                    {{ roleBadge }}
                  </span>
                </div>
                <p v-if="authStore.user?.email" class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {{ authStore.user.email }}
                </p>
                <p v-if="authStore.user?.username" class="mt-1.5 truncate text-[11px] text-gray-400 dark:text-gray-500">
                  @{{ authStore.user.username }}
                </p>
              </div>
            </div>
          </div>

          <div class="h-px bg-gray-200/80 dark:bg-gray-700/60"></div>

          <div class="py-1.5">
            <router-link
              to="/profile"
              @click="closeUserMenu"
              class="popover-item group/item"
              :class="{ 'popover-item--active': $route.name === 'profile' }"
              :style="{ animationDelay: '0ms' }"
            >
              <span
                class="popover-accent"
                :class="$route.name === 'profile' ? 'scale-y-100' : 'scale-y-0 group-hover/item:scale-y-100'"
              ></span>
              <UserCircleIcon
                class="h-4 w-4 shrink-0 transition-colors"
                :class="$route.name === 'profile' ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 group-hover/item:text-primary-500 dark:text-gray-500 dark:group-hover/item:text-primary-400'"
              />
              <span class="flex-1">My Profile</span>
              <ChevronRightIcon class="popover-chevron" />
            </router-link>

            <router-link
              to="/price-alerts"
              @click="closeUserMenu"
              class="popover-item group/item"
              :class="{ 'popover-item--active': $route.name === 'price-alerts' }"
              :style="{ animationDelay: '35ms' }"
            >
              <span
                class="popover-accent"
                :class="$route.name === 'price-alerts' ? 'scale-y-100' : 'scale-y-0 group-hover/item:scale-y-100'"
              ></span>
              <BellAlertIcon
                class="h-4 w-4 shrink-0 transition-colors"
                :class="$route.name === 'price-alerts' ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 group-hover/item:text-primary-500 dark:text-gray-500 dark:group-hover/item:text-primary-400'"
              />
              <span class="flex-1">Price Alerts</span>
              <ChevronRightIcon class="popover-chevron" />
            </router-link>

            <router-link
              to="/settings"
              @click="closeUserMenu"
              class="popover-item group/item"
              :class="{ 'popover-item--active': $route.name === 'settings' }"
              :style="{ animationDelay: '70ms' }"
            >
              <span
                class="popover-accent"
                :class="$route.name === 'settings' ? 'scale-y-100' : 'scale-y-0 group-hover/item:scale-y-100'"
              ></span>
              <Cog6ToothIcon
                class="h-4 w-4 shrink-0 transition-colors"
                :class="$route.name === 'settings' ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 group-hover/item:text-primary-500 dark:text-gray-500 dark:group-hover/item:text-primary-400'"
              />
              <span class="flex-1">Settings</span>
              <ChevronRightIcon class="popover-chevron" />
            </router-link>

            <router-link
              v-if="isAdmin"
              to="/admin/users"
              @click="closeUserMenu"
              class="popover-item group/item"
              :class="{ 'popover-item--active': isAdminRouteActive }"
              :style="{ animationDelay: '70ms' }"
            >
              <span
                class="popover-accent"
                :class="isAdminRouteActive ? 'scale-y-100' : 'scale-y-0 group-hover/item:scale-y-100'"
              ></span>
              <ShieldCheckIcon
                class="h-4 w-4 shrink-0 transition-colors"
                :class="isAdminRouteActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 group-hover/item:text-primary-500 dark:text-gray-500 dark:group-hover/item:text-primary-400'"
              />
              <span class="flex-1">Admin</span>
              <ChevronRightIcon class="popover-chevron" />
            </router-link>
          </div>

          <div class="border-t border-gray-200/80 py-1.5 dark:border-gray-700/60">
            <button
              @click="handleLogout"
              class="popover-item popover-item--danger group/item w-full"
              :style="{ animationDelay: '105ms' }"
            >
              <span class="popover-accent popover-accent--danger scale-y-0 group-hover/item:scale-y-100"></span>
              <ArrowRightOnRectangleIcon class="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover/item:text-red-500 dark:text-gray-500 dark:group-hover/item:text-red-400" />
              <span class="flex-1 text-left">Log out</span>
              <ChevronRightIcon class="popover-chevron group-hover/item:text-red-400" />
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- API Docs link -->
    <a
      :href="apiDocsUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="nav-item group/nav border-t border-gray-200/80 dark:border-gray-800/60"
      :class="isCollapsed ? 'justify-center px-0' : ''"
      :title="isCollapsed ? 'API Docs' : ''"
    >
      <CodeBracketSquareIcon
        class="h-5 w-5 shrink-0 text-gray-400 transition-colors group-hover/nav:text-gray-600 dark:text-gray-500 dark:group-hover/nav:text-gray-300"
      />
      <template v-if="!isCollapsed">
        <span class="flex-1">API Docs</span>
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
      </template>
    </a>

    <!-- Footer icon row -->
    <div
      class="border-t border-gray-200/80 dark:border-gray-800/60"
      :class="isCollapsed ? 'flex flex-col items-center gap-1 py-1.5' : 'flex items-center justify-between px-2 py-1.5'"
    >
      <NotificationBell placement="top-left" />
      <button
        @click="toggleDarkMode"
        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="isDark ? 'Light mode' : 'Dark mode'"
      >
        <SunIcon v-if="isDark" class="h-5 w-5" />
        <MoonIcon v-else class="h-5 w-5" />
      </button>
      <button
        @click="toggleCollapsed"
        class="hidden rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:inline-flex dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        :aria-label="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <ChevronDoubleRightIcon v-if="isCollapsed" class="h-5 w-5" />
        <ChevronDoubleLeftIcon v-else class="h-5 w-5" />
      </button>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useSidebar } from '@/composables/useSidebar'
import {
  HomeIcon,
  ChartBarSquareIcon,
  PresentationChartLineIcon,
  BeakerIcon,
  CalendarIcon,
  ArrowUpTrayIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpRightIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  CodeBracketSquareIcon,
  BellAlertIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/vue/24/outline'

import GlobalAccountSelector from '@/components/layout/GlobalAccountSelector.vue'
import NotificationBell from '@/components/common/NotificationBell.vue'

const route = useRoute()
const authStore = useAuthStore()
const uiPreferencesStore = useUiPreferencesStore()
const { isBillingEnabled } = useRegistrationMode()
const { drawerOpen, collapsed, closeDrawer, toggleCollapsed, expandSidebar } = useSidebar()

const sidebarRef = ref(null)
const userBlockRef = ref(null)
const userMenuOpen = ref(false)
const expandedGroups = ref({})
const isDark = ref(false)
const isLgScreen = ref(false)

// Only treat as collapsed on desktop — mobile drawer is always full width
const isCollapsed = computed(() => collapsed.value && isLgScreen.value)

const isAdmin = computed(() =>
  authStore.user?.role === 'admin' || authStore.user?.role === 'owner'
)

const isAdminRouteActive = computed(() => {
  const name = route.name
  return typeof name === 'string' && name.startsWith('admin')
})

const apiDocsUrl = computed(() => {
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl && apiUrl.startsWith('http')) {
    return apiUrl.replace(/\/api\/?$/, '') + '/api-docs'
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api-docs`
  }
  return '/api-docs'
})

const navItems = computed(() => {
  const items = [
    {
      name: 'Dashboard',
      icon: HomeIcon,
      items: [
        { name: 'Trading Dashboard', to: '/dashboard', route: 'dashboard' },
        { name: 'Trading Journal', to: '/diary', route: 'diary' },
        { name: 'Account & Cashflow', to: '/cashflow', route: 'cashflow' },
        { name: 'Leaderboard', to: '/leaderboard', route: 'leaderboard' },
        { name: 'Public Trades', to: '/public', route: 'public-trades' },
        { name: 'Community Forum', href: 'https://tradetally.io/forum', external: true }
      ]
    },
    { name: 'Trades', icon: ChartBarSquareIcon, to: '/trades', route: 'trades' },
    {
      name: 'Metrics',
      icon: PresentationChartLineIcon,
      items: [
        { name: 'Performance', to: '/metrics', route: 'metrics' },
        { name: 'Monthly', to: '/metrics/monthly', route: 'monthly-performance' },
        { name: 'Partial Exits', to: '/metrics/partial-exits', route: 'partial-exit-analytics', badge: 'pro' },
        { name: 'Behavioral', to: '/metrics/behavioral', route: 'behavioral-analytics', badge: 'pro' },
        { name: 'Health', to: '/metrics/health', route: 'health-analytics', badge: 'pro' }
      ]
    },
    {
      name: 'Analysis',
      icon: BeakerIcon,
      items: [
        { name: 'Investments', to: '/analysis', route: 'analysis', badge: 'pro' },
        { name: 'Watchlists', to: '/markets', route: 'markets', badge: 'pro' },
        { name: 'Trade Management', to: '/analysis/trade-management', route: 'trade-management', badge: 'pro' },
        { name: 'Playbooks', to: '/analysis/playbooks', route: 'playbooks', badge: 'pro' }
      ]
    },
    { name: 'Calendar', icon: CalendarIcon, to: '/calendar', route: 'calendar' },
    { name: 'Import', icon: ArrowUpTrayIcon, to: '/import', route: 'import' }
  ]

  return items
})

const showUpgradeCard = computed(() => {
  if (!isBillingEnabled.value) return false
  const tier = authStore.user?.tier
  return tier && tier !== 'pro'
})

const displayName = computed(() => {
  const u = authStore.user
  if (!u) return 'User'
  return (
    u.full_name?.trim() ||
    u.username?.trim() ||
    u.email?.split('@')[0] ||
    'User'
  )
})

const initials = computed(() => {
  const u = authStore.user
  if (!u) return '?'
  const full = u.full_name?.trim()
  if (full) {
    const parts = full.split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  const uname = u.username?.trim()
  if (uname) return uname.slice(0, 2).toUpperCase()
  const email = u.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
})

const avatarUrl = computed(() => authStore.user?.avatar_url || null)

const roleBadge = computed(() => {
  const role = authStore.user?.role
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return null
})

const isGroupActive = (item) => {
  if (!item.items) return false
  return item.items.some((sub) => route.name === sub.route)
}

const isGroupExpanded = (name) => expandedGroups.value[name] === true

const toggleGroup = (name) => {
  expandedGroups.value[name] = !expandedGroups.value[name]
}

const handleGroupClick = (item) => {
  // In collapsed mode, expand the sidebar AND auto-expand this group
  if (isCollapsed.value) {
    expandSidebar()
    expandedGroups.value[item.name] = true
    return
  }
  toggleGroup(item.name)
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
}

const closeUserMenu = () => {
  userMenuOpen.value = false
}

const handleLogout = () => {
  closeUserMenu()
  closeDrawer()
  authStore.logout()
}

const handleClickOutside = (event) => {
  if (userMenuOpen.value && userBlockRef.value && !userBlockRef.value.contains(event.target)) {
    closeUserMenu()
  }
}

const toggleDarkMode = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('darkMode', isDark.value)
  uiPreferencesStore.notifyChanged('darkMode', isDark.value)
}

const updateLgScreen = () => {
  isLgScreen.value = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

// Auto-expand the group containing the current active route
watch(
  () => route.name,
  (newRoute) => {
    if (!newRoute) return
    navItems.value.forEach((item) => {
      if (item.items?.some((sub) => sub.route === newRoute)) {
        expandedGroups.value[item.name] = true
      }
    })
    closeDrawer()
    closeUserMenu()
  },
  { immediate: true }
)

onMounted(() => {
  isDark.value = localStorage.getItem('darkMode') === 'true'
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  }
  updateLgScreen()
  window.addEventListener('resize', updateLgScreen)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLgScreen)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* Nav item base */
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(75 85 99);
  transition: background-color 150ms, color 150ms;
}

:global(.dark) .nav-item,
.dark .nav-item {
  color: rgb(209 213 219);
}

.nav-item:hover {
  background-color: rgb(249 250 251);
  color: rgb(17 24 39);
}

:global(.dark) .nav-item:hover,
.dark .nav-item:hover {
  background-color: rgba(31 41 55 / 0.5);
  color: rgb(255 255 255);
}

.nav-item--active {
  background-color: rgba(240 129 42 / 0.08);
  color: rgb(194 65 12);
}

:global(.dark) .nav-item--active,
.dark .nav-item--active {
  background-color: rgba(240 129 42 / 0.12);
  color: rgb(253 186 116);
}

.nav-item--group-active {
  color: rgb(17 24 39);
}

:global(.dark) .nav-item--group-active,
.dark .nav-item--group-active {
  color: rgb(255 255 255);
}

/* Nav sub-item */
.nav-sub-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  color: rgb(107 114 128);
  transition: background-color 150ms, color 150ms;
  animation: subItemSlideIn 240ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

:global(.dark) .nav-sub-item,
.dark .nav-sub-item {
  color: rgb(156 163 175);
}

.nav-sub-item:hover {
  background-color: rgb(249 250 251);
  color: rgb(17 24 39);
}

:global(.dark) .nav-sub-item:hover,
.dark .nav-sub-item:hover {
  background-color: rgba(31 41 55 / 0.4);
  color: rgb(229 231 235);
}

.nav-sub-item--active {
  background-color: rgba(240 129 42 / 0.08);
  color: rgb(194 65 12);
  font-weight: 600;
}

:global(.dark) .nav-sub-item--active,
.dark .nav-sub-item--active {
  background-color: rgba(240 129 42 / 0.12);
  color: rgb(253 186 116);
}

/* Popover items */
.popover-item {
  position: relative;
  display: flex;
  height: 2.5rem;
  align-items: center;
  gap: 0.75rem;
  padding-left: 1.25rem;
  padding-right: 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(55 65 81);
  transition: background-color 150ms, color 150ms;
  animation: itemSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

:global(.dark) .popover-item,
.dark .popover-item {
  color: rgb(209 213 219);
}

.popover-item:hover {
  background-color: rgb(249 250 251);
  color: rgb(17 24 39);
}

:global(.dark) .popover-item:hover,
.dark .popover-item:hover {
  background-color: rgba(31 41 55 / 0.6);
  color: rgb(255 255 255);
}

.popover-item--active {
  background-color: rgba(249 250 251 / 0.7);
  color: rgb(17 24 39);
}

:global(.dark) .popover-item--active,
.dark .popover-item--active {
  background-color: rgba(31 41 55 / 0.4);
  color: rgb(255 255 255);
}

.popover-item--danger:hover {
  background-color: rgb(254 242 242);
  color: rgb(185 28 28);
}

:global(.dark) .popover-item--danger:hover,
.dark .popover-item--danger:hover {
  background-color: rgba(69 10 10 / 0.3);
  color: rgb(252 165 165);
}

.popover-accent {
  position: absolute;
  left: 0;
  top: 0.375rem;
  bottom: 0.375rem;
  width: 2px;
  border-top-right-radius: 0.125rem;
  border-bottom-right-radius: 0.125rem;
  background-color: rgb(240 129 42);
  transform-origin: center;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-accent--danger {
  background-color: rgb(239 68 68);
}

.popover-chevron {
  height: 0.875rem;
  width: 0.875rem;
  color: rgb(209 213 219);
  opacity: 0;
  transform: translateX(-0.25rem);
  transition: all 200ms;
}

:global(.dark) .popover-chevron,
.dark .popover-chevron {
  color: rgb(75 85 99);
}

.group\/item:hover .popover-chevron {
  opacity: 1;
  transform: translateX(0);
}

@keyframes itemSlideIn {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes subItemSlideIn {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
