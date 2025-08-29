<template>
  <div class="relative" ref="dropdownRef">
    <!-- Trigger -->
    <div
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @click="handleClick"
      class="inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium cursor-pointer"
      :class="[
        isActive || isOpen
          ? 'border-primary-500 text-gray-900 dark:text-white'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-300 dark:hover:text-white'
      ]"
    >
      {{ title }}
      <svg 
        class="ml-1 h-4 w-4 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        @mouseenter="handleDropdownEnter"
        @mouseleave="handleDropdownLeave"
        class="absolute left-0 top-full mt-1 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
      >
        <div class="py-1">
          <router-link
            v-for="item in items"
            :key="item.name"
            :to="item.to"
            @click="closeDropdown"
            class="group flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            :class="{
              'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white': $route.name === item.route
            }"
          >
            <div class="flex-1">
              <div class="flex items-center">
                <span class="font-medium">{{ item.name }}</span>
                <span 
                  v-if="item.badge"
                  class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  :class="getBadgeClasses(item.badge.type)"
                >
                  {{ item.badge.text }}
                </span>
              </div>
              <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ item.description }}
              </p>
            </div>
            <svg 
              v-if="item.external" 
              class="ml-2 h-4 w-4 text-gray-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </router-link>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  items: {
    type: Array,
    required: true
  }
})

const route = useRoute()
const dropdownRef = ref(null)
const isOpen = ref(false)
const isHovering = ref(false)
const hoverTimeout = ref(null)

// Check if any dropdown item is currently active
const isActive = computed(() => {
  return props.items.some(item => route.name === item.route)
})

// Check if we're on mobile (no hover support)
const isMobile = ref(false)

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
    if (!isHovering.value) {
      isOpen.value = false
    }
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
    if (!isHovering.value) {
      isOpen.value = false
    }
  }, 150)
}

const handleClick = () => {
  if (isMobile.value) {
    isOpen.value = !isOpen.value
  }
}

const closeDropdown = () => {
  isOpen.value = false
  isHovering.value = false
}

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    closeDropdown()
  }
}

const getBadgeClasses = (type) => {
  const classes = {
    pro: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
    new: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    beta: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
  }
  return classes[type] || classes.pro
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