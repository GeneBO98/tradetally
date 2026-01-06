import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useScannerStore = defineStore('scanner', () => {
  // State
  const scanResults = ref([])
  const scanInfo = ref(null)
  const scanStatus = ref(null)
  const selectedPillars = ref([])
  const loading = ref(false)
  const error = ref(null)
  const pagination = ref({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })
  const sortBy = ref('pillars_passed')
  const sortOrder = ref('DESC')

  // Pillar names for display
  const pillarNames = {
    1: '5-Year P/E Ratio',
    2: '5-Year ROIC',
    3: 'Shares Outstanding',
    4: 'Cash Flow Growth',
    5: 'Net Income Growth',
    6: 'Revenue Growth',
    7: 'LT Debt / FCF',
    8: 'Price/FCF'
  }

  // Short pillar names for chips
  const pillarShortNames = {
    1: 'P/E Ratio',
    2: 'ROIC',
    3: 'Shares',
    4: 'Cash Flow',
    5: 'Net Income',
    6: 'Revenue',
    7: 'Debt/FCF',
    8: 'Price/FCF'
  }

  // Getters
  const hasResults = computed(() => scanResults.value.length > 0)
  const hasScanData = computed(() => scanInfo.value !== null)
  const isScanRunning = computed(() => scanStatus.value?.status === 'running')
  const lastScanDate = computed(() => scanInfo.value?.completedAt || null)

  /**
   * Fetch scan results with current filters
   */
  async function fetchResults(page = 1) {
    loading.value = true
    error.value = null

    try {
      const params = {
        page,
        limit: pagination.value.limit,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value
      }

      // Add pillar filters if any selected
      if (selectedPillars.value.length > 0) {
        params.pillars = selectedPillars.value.join(',')
      }

      const response = await api.get('/scanner/results', { params })

      scanResults.value = response.data.results || []
      scanInfo.value = response.data.scanInfo
      pagination.value = {
        page: response.data.page,
        limit: response.data.limit,
        total: response.data.total,
        totalPages: response.data.totalPages
      }

      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch scan results'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch current scan status
   */
  async function fetchStatus() {
    try {
      const response = await api.get('/scanner/status')
      scanStatus.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch scan status'
      throw err
    }
  }

  /**
   * Toggle a pillar filter on/off
   */
  function togglePillar(pillarNum) {
    const index = selectedPillars.value.indexOf(pillarNum)
    if (index === -1) {
      selectedPillars.value.push(pillarNum)
    } else {
      selectedPillars.value.splice(index, 1)
    }
    // Reset to page 1 when filters change
    pagination.value.page = 1
  }

  /**
   * Clear all pillar filters
   */
  function clearFilters() {
    selectedPillars.value = []
    pagination.value.page = 1
  }

  /**
   * Set sort options
   */
  function setSort(column, order = 'DESC') {
    sortBy.value = column
    sortOrder.value = order
  }

  /**
   * Go to a specific page
   */
  async function goToPage(page) {
    if (page >= 1 && page <= pagination.value.totalPages) {
      await fetchResults(page)
    }
  }

  /**
   * Trigger manual scan (admin only)
   */
  async function triggerScan() {
    try {
      const response = await api.post('/scanner/trigger')
      // Refresh status after triggering
      await fetchStatus()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to trigger scan'
      throw err
    }
  }

  /**
   * Reset store state
   */
  function reset() {
    scanResults.value = []
    scanInfo.value = null
    scanStatus.value = null
    selectedPillars.value = []
    loading.value = false
    error.value = null
    pagination.value = {
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 0
    }
  }

  return {
    // State
    scanResults,
    scanInfo,
    scanStatus,
    selectedPillars,
    loading,
    error,
    pagination,
    sortBy,
    sortOrder,
    pillarNames,
    pillarShortNames,

    // Getters
    hasResults,
    hasScanData,
    isScanRunning,
    lastScanDate,

    // Actions
    fetchResults,
    fetchStatus,
    togglePillar,
    clearFilters,
    setSort,
    goToPage,
    triggerScan,
    reset
  }
})
