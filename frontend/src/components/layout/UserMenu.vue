<template>
  <div class="relative" ref="menuRef">
    <!-- Trigger: avatar + chevron -->
    <button
      @click="toggleMenu"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      class="user-trigger group relative flex items-center gap-1.5 rounded-full p-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
      :class="isOpen ? 'ring-2 ring-primary-500/50 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : ''"
      :aria-label="`User menu for ${displayName}`"
      :aria-expanded="isOpen"
      aria-haspopup="true"
    >
      <span class="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary-400 to-primary-600 shadow-sm ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-105 dark:ring-white/10">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="displayName"
          class="h-full w-full object-cover"
        />
        <span v-else class="text-[11px] font-bold tracking-wider text-white drop-shadow-sm">
          {{ initials }}
        </span>
      </span>
      <ChevronDownIcon
        class="h-3 w-3 text-gray-400 transition-all duration-200 dark:text-gray-500"
        :class="{ 'rotate-180 text-primary-500 dark:text-primary-400': isOpen }"
      />
    </button>

    <!-- Dropdown panel -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 scale-95 -translate-y-2"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-2"
    >
      <div
        v-if="isOpen"
        @mouseenter="handleDropdownEnter"
        @mouseleave="handleDropdownLeave"
        class="user-menu-panel absolute right-0 top-full z-50 mt-3 w-72 origin-top-right overflow-hidden rounded-xl bg-white/95 shadow-2xl ring-1 ring-gray-200/80 backdrop-blur-xl dark:bg-gray-900/95 dark:ring-gray-700/60"
      >
        <!-- HEADER: identity block -->
        <div class="px-5 pt-4 pb-4">
          <div class="flex items-start gap-3.5">
            <!-- Large avatar -->
            <div class="shrink-0">
              <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 shadow-md ring-1 ring-white/40 dark:ring-white/10">
                <img
                  v-if="avatarUrl"
                  :src="avatarUrl"
                  :alt="displayName"
                  class="h-full w-full object-cover"
                />
                <span v-else class="text-sm font-bold tracking-wider text-white drop-shadow-sm">
                  {{ initials }}
                </span>
              </div>
            </div>

            <!-- Identity info -->
            <div class="min-w-0 flex-1 pt-0.5">
              <div class="flex items-center gap-1.5">
                <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {{ displayName }}
                </p>
                <span
                  v-if="roleBadge"
                  class="shrink-0 rounded-[3px] bg-primary-500/15 px-1.5 py-0 text-[9px] font-bold uppercase leading-[14px] tracking-wider text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
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

        <!-- Primary items -->
        <div class="py-1.5">
          <router-link
            v-for="(item, i) in items"
            :key="item.name"
            :to="item.to"
            @click="closeMenu"
            class="menu-item group/item relative flex h-10 items-center gap-3 px-5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60 dark:hover:text-white"
            :class="{ 'bg-gray-50/70 text-gray-900 dark:bg-gray-800/40 dark:text-white': isItemActive(item) }"
            :style="{ animationDelay: `${i * 35}ms` }"
          >
            <span
              class="absolute left-0 top-1.5 bottom-1.5 w-[2px] origin-center rounded-r-sm bg-primary-500 transition-transform duration-200 ease-out group-hover/item:scale-y-100"
              :class="isItemActive(item) ? 'scale-y-100' : 'scale-y-0'"
            ></span>
            <component
              :is="item.icon"
              class="h-4 w-4 shrink-0 text-gray-400 transition-colors duration-150 group-hover/item:text-primary-500 dark:text-gray-500 dark:group-hover/item:text-primary-400"
              :class="{ 'text-primary-500 dark:text-primary-400': isItemActive(item) }"
            />
            <span class="flex-1">{{ item.name }}</span>
            <ChevronRightIcon
              class="h-3.5 w-3.5 -translate-x-1 text-gray-300 opacity-0 transition-all duration-200 group-hover/item:translate-x-0 group-hover/item:opacity-100 dark:text-gray-600"
            />
          </router-link>
        </div>

        <!-- Logout: destructive, set apart -->
        <div class="border-t border-gray-200/80 py-1.5 dark:border-gray-700/60">
          <button
            @click="handleLogout"
            class="menu-item group/item relative flex h-10 w-full items-center gap-3 px-5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-red-50 hover:text-red-700 dark:text-gray-300 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            :style="{ animationDelay: `${items.length * 35}ms` }"
          >
            <span class="absolute left-0 top-1.5 bottom-1.5 w-[2px] origin-center scale-y-0 rounded-r-sm bg-red-500 transition-transform duration-200 ease-out group-hover/item:scale-y-100"></span>
            <ArrowRightOnRectangleIcon
              class="h-4 w-4 shrink-0 text-gray-400 transition-colors duration-150 group-hover/item:text-red-500 dark:text-gray-500 dark:group-hover/item:text-red-400"
            />
            <span class="flex-1 text-left">Log out</span>
            <ChevronRightIcon
              class="h-3.5 w-3.5 -translate-x-1 text-gray-300 opacity-0 transition-all duration-200 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-hover/item:text-red-400 dark:text-gray-600"
            />
          </button>
        </div>

      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  UserCircleIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BellAlertIcon
} from '@heroicons/vue/24/outline'

const authStore = useAuthStore()
const route = useRoute()
const menuRef = ref(null)
const isOpen = ref(false)
const isHovering = ref(false)
const hoverTimeout = ref(null)
const isMobile = ref(false)

const isAdmin = computed(() =>
  authStore.user?.role === 'admin' || authStore.user?.role === 'owner'
)

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

const items = computed(() => {
  const list = [
    { name: 'My Profile', to: '/profile', route: 'profile', icon: UserCircleIcon },
    { name: 'Price Alerts', to: '/price-alerts', route: 'price-alerts', icon: BellAlertIcon },
    { name: 'Settings', to: '/settings', route: 'settings', icon: Cog6ToothIcon }
  ]
  if (isAdmin.value) {
    list.push({
      name: 'Admin',
      to: '/admin/users',
      route: 'admin-users',
      icon: ShieldCheckIcon,
      adminMatch: true
    })
  }
  return list
})

const isItemActive = (item) => {
  if (item.adminMatch) return route.name?.startsWith('admin') || false
  return route.name === item.route
}

const handleMouseEnter = () => {
  if (isMobile.value) return
  clearTimeout(hoverTimeout.value)
  isHovering.value = true
  isOpen.value = true
}

const handleMouseLeave = () => {
  if (isMobile.value) return
  isHovering.value = false
  hoverTimeout.value = setTimeout(() => {
    if (!isHovering.value) isOpen.value = false
  }, 150)
}

const handleDropdownEnter = () => {
  if (isMobile.value) return
  clearTimeout(hoverTimeout.value)
  isHovering.value = true
}

const handleDropdownLeave = () => {
  if (isMobile.value) return
  isHovering.value = false
  hoverTimeout.value = setTimeout(() => {
    if (!isHovering.value) isOpen.value = false
  }, 150)
}

const toggleMenu = () => {
  if (isMobile.value) {
    isOpen.value = !isOpen.value
  }
}

const closeMenu = () => {
  isOpen.value = false
  isHovering.value = false
}

const handleLogout = () => {
  closeMenu()
  authStore.logout()
}

const handleClickOutside = (event) => {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    closeMenu()
  }
}

const checkMobile = () => {
  isMobile.value = window.innerWidth < 1024 || ('ontouchstart' in window)
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', checkMobile)
  checkMobile()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', checkMobile)
  clearTimeout(hoverTimeout.value)
})
</script>

<style scoped>
/* Staggered entry for menu items */
.menu-item {
  animation: itemSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

@keyframes itemSlideIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

</style>
