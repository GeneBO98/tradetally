import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useYearWrappedStore = defineStore('yearWrapped', () => {
  // State
  const wrappedData = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const showBanner = ref(false)
  const bannerYear = ref(null)
  const isModalOpen = ref(false)
  const currentSlide = ref(0)

  // Total number of slides
  const totalSlides = computed(() => {
    if (!wrappedData.value) return 0
    // Base slides: intro, trades, pnl, winRate, topTrade, topSymbol, patterns, streaks, summary = 9
    // Optional: YoY comparison (if has previous year), monthly progression = +2
    let count = 9
    if (wrappedData.value.comparison?.hasPreviousYear) {
      count++
    }
    // Monthly progression always shown if there's data
    if (wrappedData.value.monthlyBreakdown?.some(m => m.trades > 0)) {
      count++
    }
    return count
  })

  // Check if banner should be shown
  async function checkBannerStatus() {
    try {
      const response = await api.get('/year-wrapped/banner-status')
      if (response.data.success) {
        showBanner.value = response.data.data.show
        bannerYear.value = response.data.data.year
      }
    } catch (err) {
      console.warn('[YEAR_WRAPPED] Failed to check banner status:', err.message)
      showBanner.value = false
    }
  }

  // Fetch Year Wrapped data for a specific year
  async function fetchYearWrapped(year, forceRegenerate = false) {
    loading.value = true
    error.value = null

    try {
      const endpoint = forceRegenerate
        ? `/year-wrapped/${year}/regenerate`
        : `/year-wrapped/${year}`
      const method = forceRegenerate ? 'post' : 'get'

      const response = await api[method](endpoint)
      if (response.data.success) {
        wrappedData.value = response.data.data
        console.log('[YEAR_WRAPPED] Loaded data:', response.data.data)
      }
    } catch (err) {
      console.error('[YEAR_WRAPPED] Failed to fetch data:', err)
      error.value = err.response?.data?.error || 'Failed to load Year Wrapped data'
    } finally {
      loading.value = false
    }
  }

  // Force regenerate Year Wrapped data (bypasses cache)
  async function regenerateYearWrapped(year) {
    return fetchYearWrapped(year, true)
  }

  // Dismiss the banner for this session only (resets on logout/login)
  function dismissBannerForSession() {
    showBanner.value = false
  }

  // Mark as viewed
  async function markAsViewed(year) {
    try {
      await api.post(`/year-wrapped/${year}/viewed`)
    } catch (err) {
      console.warn('[YEAR_WRAPPED] Failed to mark as viewed:', err.message)
    }
  }

  // Open the modal
  function openModal() {
    currentSlide.value = 0
    isModalOpen.value = true
  }

  // Close the modal
  function closeModal() {
    isModalOpen.value = false
    // Mark as viewed when closing
    if (wrappedData.value?.year) {
      markAsViewed(wrappedData.value.year)
    }
  }

  // Navigation
  function nextSlide() {
    if (currentSlide.value < totalSlides.value - 1) {
      currentSlide.value++
    }
  }

  function prevSlide() {
    if (currentSlide.value > 0) {
      currentSlide.value--
    }
  }

  function goToSlide(index) {
    if (index >= 0 && index < totalSlides.value) {
      currentSlide.value = index
    }
  }

  // Reset state
  function reset() {
    wrappedData.value = null
    loading.value = false
    error.value = null
    currentSlide.value = 0
    isModalOpen.value = false
  }

  return {
    // State
    wrappedData,
    loading,
    error,
    showBanner,
    bannerYear,
    isModalOpen,
    currentSlide,
    totalSlides,

    // Actions
    checkBannerStatus,
    fetchYearWrapped,
    regenerateYearWrapped,
    dismissBannerForSession,
    markAsViewed,
    openModal,
    closeModal,
    nextSlide,
    prevSlide,
    goToSlide,
    reset
  }
})
