import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { FEATURE_TOURS, findFeatureTour, isTourLive, localDateKey } from '@/constants/featureTours'

const ACTIVE_KEY = 'tt-feature-tour-active'
const DEMO_ACCOUNT_EMAIL = 'demo@example.com'

function readActive() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tourId === 'string' && Number.isInteger(parsed.stepIndex) && findFeatureTour(parsed.tourId)) {
      return parsed
    }
  } catch (_) {
    // storage unavailable or corrupt: start fresh
  }
  return null
}

function writeActive(value) {
  try {
    if (value) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch (_) {
    // storage unavailable: the tour still works for this page view
  }
}

/**
 * True while the onboarding tour (steps 3-5, after "Start the tour") is in
 * progress. New-feature tours wait for it. The self-hosted app has no Pro
 * tour screens, so the Pro onboarding step is deliberately ignored here.
 */
export function isOnboardingTourInProgress(onboardingStep) {
  const free = Number(onboardingStep) || 0
  return free >= 3 && free <= 5
}

export const useFeatureTourStore = defineStore('featureTour', () => {
  const authStore = useAuthStore()

  // Statuses written this session. They hide a tour immediately and keep it
  // hidden even if the save request fails.
  const localStatus = ref({})
  const active = ref(readActive())

  const isDemoAccount = computed(() =>
    String(authStore.user?.email || '').toLowerCase() === DEMO_ACCOUNT_EMAIL
  )

  // null/undefined from /auth/me means "unknown" (not loaded, or the lookup
  // failed). Unknown never shows a prompt, so a dismissed tour cannot flash.
  const serverStatus = computed(() => {
    const tours = authStore.user?.feature_tours
    return tours && typeof tours === 'object' ? tours : null
  })

  function statusOf(tourId) {
    return localStatus.value[tourId] || serverStatus.value?.[tourId]?.status || null
  }

  const pendingTour = computed(() => {
    if (!authStore.user || !serverStatus.value || isDemoAccount.value) return null
    if (active.value) return null
    if (isOnboardingTourInProgress(authStore.onboardingStep)) return null
    const today = localDateKey()
    const queue = FEATURE_TOURS
      .filter(tour => isTourLive(tour, today) && !statusOf(tour.id))
      .sort((a, b) => String(a.releasedAt).localeCompare(String(b.releasedAt)))
    return queue[0] || null
  })

  const activeTour = computed(() => (active.value ? findFeatureTour(active.value.tourId) : null))

  function start(tourId, stepIndex = 0) {
    if (!findFeatureTour(tourId)) return
    active.value = { tourId, stepIndex }
    writeActive(active.value)
  }

  function goToStep(stepIndex) {
    if (!active.value) return
    active.value = { ...active.value, stepIndex: Math.max(0, stepIndex) }
    writeActive(active.value)
  }

  async function finish(tourId, status, lastStep = null) {
    localStatus.value = { ...localStatus.value, [tourId]: status }
    if (active.value?.tourId === tourId) {
      active.value = null
      writeActive(null)
    }
    if (authStore.user) {
      const updated = { ...(authStore.user.feature_tours || {}), [tourId]: { status, updated_at: new Date().toISOString() } }
      authStore.user = { ...authStore.user, feature_tours: updated }
    }
    try {
      await api.post(`/users/feature-tours/${encodeURIComponent(tourId)}`, { status, lastStep })
    } catch (error) {
      // Stays hidden for this session via localStatus; it may show again on a
      // later visit, which beats losing the user's choice silently.
      console.error('Failed to save feature tour status:', error)
    }
  }

  /** Clear the user's record for a tour and start it (the ?tour= link). */
  async function replay(tourId) {
    if (!findFeatureTour(tourId)) return false
    const { [tourId]: _removed, ...rest } = localStatus.value
    localStatus.value = rest
    if (authStore.user?.feature_tours) {
      const { [tourId]: _server, ...others } = authStore.user.feature_tours
      authStore.user = { ...authStore.user, feature_tours: others }
    }
    try {
      await api.delete(`/users/feature-tours/${encodeURIComponent(tourId)}`)
    } catch (error) {
      console.error('Failed to reset feature tour:', error)
    }
    start(tourId)
    return true
  }

  return {
    active,
    activeTour,
    pendingTour,
    isDemoAccount,
    statusOf,
    start,
    goToStep,
    finish,
    replay
  }
})
