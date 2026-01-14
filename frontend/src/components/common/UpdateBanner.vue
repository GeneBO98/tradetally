<template>
  <transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="transform -translate-y-full opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform -translate-y-full opacity-0"
  >
    <div
      v-if="showBanner"
      class="bg-primary-600 text-white"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center space-x-2">
            <ArrowPathIcon class="h-5 w-5" />
            <span class="text-sm font-medium">
              A new version of TradeTally is available (v{{ latestVersion }})
            </span>
          </div>
          <div class="flex items-center space-x-3">
            <a
              :href="releaseUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-medium underline hover:no-underline"
            >
              View Release Notes
            </a>
            <button
              @click="dismissUpdate"
              class="text-sm text-white/80 hover:text-white"
              aria-label="Dismiss update notification"
            >
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useVersionStore } from '@/stores/version'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const versionStore = useVersionStore()
const { updateAvailable, latestVersion, releaseUrl, dismissed } = storeToRefs(versionStore)

const showBanner = computed(() => updateAvailable.value && !dismissed.value)

const dismissUpdate = () => {
  versionStore.dismissUpdate()
}
</script>
