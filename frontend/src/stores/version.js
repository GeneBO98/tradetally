import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useVersionStore = defineStore('version', () => {
  // State
  const currentVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0')
  const latestVersion = ref(null)
  const releaseUrl = ref(null)
  const releaseName = ref(null)
  const publishedAt = ref(null)
  const lastChecked = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const dismissed = ref(false)

  // Computed
  const updateAvailable = computed(() => {
    if (!latestVersion.value) return false
    return compareVersions(currentVersion.value, latestVersion.value) < 0
  })

  // Version comparison helper
  function compareVersions(current, latest) {
    const parseVersion = (v) => v.split('.').map(Number)
    const c = parseVersion(current)
    const l = parseVersion(latest)

    for (let i = 0; i < 3; i++) {
      if ((l[i] || 0) > (c[i] || 0)) return -1 // Update available
      if ((l[i] || 0) < (c[i] || 0)) return 1  // Current is newer
    }
    return 0
  }

  // Actions
  async function checkForUpdates(force = false) {
    // Skip if recently checked (within 1 hour) unless forced
    if (!force && lastChecked.value) {
      const hourAgo = Date.now() - (60 * 60 * 1000)
      if (lastChecked.value > hourAgo) {
        return { updateAvailable: updateAvailable.value }
      }
    }

    loading.value = true
    error.value = null

    try {
      const response = await api.get('/v1/server/updates')

      latestVersion.value = response.data.latest_version
      releaseUrl.value = response.data.release_url
      releaseName.value = response.data.release_name
      publishedAt.value = response.data.published_at
      lastChecked.value = Date.now()

      // Store in localStorage for persistence
      localStorage.setItem('version_last_checked', lastChecked.value.toString())

      if (response.data.error) {
        error.value = response.data.error
      }

      // Check if we should show the notification again
      const dismissedVersion = localStorage.getItem('version_dismissed')
      if (dismissedVersion !== latestVersion.value) {
        dismissed.value = false
      }

      return { updateAvailable: updateAvailable.value }
    } catch (err) {
      error.value = 'Failed to check for updates'
      console.error('[VERSION] Error checking for updates:', err)
      return { updateAvailable: false, error: err }
    } finally {
      loading.value = false
    }
  }

  function dismissUpdate() {
    dismissed.value = true
    // Store dismissed version to not show again for this version
    if (latestVersion.value) {
      localStorage.setItem('version_dismissed', latestVersion.value)
    }
  }

  function initialize() {
    // Load persisted state
    const storedLastChecked = localStorage.getItem('version_last_checked')
    if (storedLastChecked) {
      lastChecked.value = parseInt(storedLastChecked, 10)
    }

    const dismissedVersion = localStorage.getItem('version_dismissed')
    if (dismissedVersion && dismissedVersion === latestVersion.value) {
      dismissed.value = true
    }
  }

  function formatLastChecked() {
    if (!lastChecked.value) return null

    const date = new Date(lastChecked.value)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

    return date.toLocaleDateString()
  }

  return {
    // State
    currentVersion,
    latestVersion,
    releaseUrl,
    releaseName,
    publishedAt,
    lastChecked,
    loading,
    error,
    dismissed,
    // Computed
    updateAvailable,
    // Actions
    checkForUpdates,
    dismissUpdate,
    initialize,
    formatLastChecked
  }
})
