<template>
  <span class="text-xs text-gray-400 dark:text-gray-500">
    v{{ currentVersion }}
    <span
      v-if="updateAvailable"
      class="ml-1 text-primary-500"
      title="Update available"
    >
      (v{{ latestVersion }} available)
    </span>
  </span>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useVersionStore } from '@/stores/version'

const versionStore = useVersionStore()
const { currentVersion, latestVersion, updateAvailable } = storeToRefs(versionStore)
</script>
