<template>
  <div class="relative" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      @click="toggleDropdown"
      class="flex items-center space-x-2 px-3 py-2 text-sm rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      :title="selectedAccountLabel"
    >
      <!-- Account Icon -->
      <BuildingOfficeIcon class="h-5 w-5" />

      <!-- Label (hide on small screens) -->
      <span class="hidden lg:inline truncate max-w-[140px]">
        {{ selectedAccountLabel }}
      </span>

      <!-- Active Filter Indicator -->
      <span
        v-if="isFiltered"
        class="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0"
        title="Account filter active"
      ></span>

      <!-- Chevron -->
      <ChevronDownIcon class="h-4 w-4 flex-shrink-0" />
    </button>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 dark:ring-gray-700 z-50"
      >
        <div class="py-1" role="menu">
          <!-- Header -->
          <div class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
            Filter by Account
          </div>

          <!-- All Accounts Option -->
          <button
            @click="handleClearAccount"
            class="w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            :class="!isFiltered ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-700 dark:text-gray-300'"
            role="menuitem"
          >
            <span>All Accounts</span>
            <CheckIcon v-if="!isFiltered" class="h-4 w-4" />
          </button>

          <!-- Unsorted Option (trades without account) -->
          <button
            @click="handleSelectUnsorted"
            class="w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            :class="selectedAccount === UNSORTED_ACCOUNT ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-700 dark:text-gray-300'"
            role="menuitem"
          >
            <span>Unsorted</span>
            <CheckIcon v-if="selectedAccount === UNSORTED_ACCOUNT" class="h-4 w-4" />
          </button>

          <!-- Divider -->
          <div class="border-t border-gray-100 dark:border-gray-700 my-1"></div>

          <!-- Loading state -->
          <div v-if="loading" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
            Loading accounts...
          </div>

          <!-- No accounts state -->
          <div v-else-if="accounts.length === 0" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
            No accounts found
          </div>

          <!-- Account List -->
          <template v-else>
            <button
              v-for="account in accounts"
              :key="account"
              @click="handleSelectAccount(account)"
              class="w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              :class="selectedAccount === account ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-700 dark:text-gray-300'"
              role="menuitem"
            >
              <span class="truncate">{{ account }}</span>
              <CheckIcon v-if="selectedAccount === account" class="h-4 w-4 flex-shrink-0" />
            </button>
          </template>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { BuildingOfficeIcon, ChevronDownIcon, CheckIcon } from '@heroicons/vue/24/outline'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const {
  selectedAccount,
  selectedAccountLabel,
  accounts,
  loading,
  isFiltered,
  fetchAccounts,
  setAccount,
  clearAccount,
  UNSORTED_ACCOUNT
} = useGlobalAccountFilter()

const isOpen = ref(false)
const dropdownRef = ref(null)

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value && accounts.value.length === 0) {
    fetchAccounts()
  }
}

function handleSelectAccount(account) {
  setAccount(account)
  isOpen.value = false
}

function handleClearAccount() {
  clearAccount()
  isOpen.value = false
}

function handleSelectUnsorted() {
  setAccount(UNSORTED_ACCOUNT)
  isOpen.value = false
}

function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // Fetch accounts on mount if not already loaded
  if (accounts.value.length === 0) {
    fetchAccounts()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
