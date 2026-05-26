import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useInvestmentsStore = defineStore('investments', () => {
  // State
  const currentAnalysis = ref(null)
  const holdings = ref([])
  const portfolioSummary = ref(null)
  const portfolioOverview = ref(null)
  const portfolioPositions = ref([])
  const portfolioPerformance = ref(null)
  const portfolioRebalance = ref(null)
  const portfolioAlertSummary = ref(null)
  const portfolioPreferences = ref(null)
  const searchHistory = ref([])
  const loading = ref(false)
  const error = ref(null)
  const analysisLoading = ref(false)
  const holdingsLoading = ref(false)
  const portfolioLoading = ref(false)

  // DCF Valuation State
  const dcfMetrics = ref(null)
  const dcfResults = ref(null)
  const savedValuations = ref([])
  const dcfLoading = ref(false)

  // Getters
  const totalPortfolioValue = computed(() => portfolioOverview.value?.totalValue ?? portfolioSummary.value?.totalValue ?? 0)
  const totalUnrealizedPnL = computed(() => portfolioOverview.value?.unrealizedPnL ?? portfolioSummary.value?.unrealizedPnL ?? 0)
  const totalDividends = computed(() => portfolioOverview.value?.totalDividends ?? portfolioSummary.value?.totalDividends ?? 0)
  const holdingCount = computed(() => portfolioOverview.value?.positionCount ?? portfolioPositions.value.length ?? holdings.value.length)

  // ========================================
  // 8 PILLARS ANALYSIS
  // ========================================

  async function analyzeStock(symbol, forceRefresh = false) {
    analysisLoading.value = true
    error.value = null

    try {
      const endpoint = forceRefresh
        ? `/investments/analyze/${symbol}/refresh`
        : `/investments/analyze/${symbol}`

      const method = forceRefresh ? 'post' : 'get'
      const response = await api[method](endpoint)

      currentAnalysis.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to analyze stock'
      throw err
    } finally {
      analysisLoading.value = false
    }
  }

  function clearAnalysis() {
    currentAnalysis.value = null
  }

  // ========================================
  // FUNDAMENTAL DATA
  // ========================================

  async function getFinancials(symbol, years = 5) {
    try {
      const response = await api.get(`/investments/financials/${symbol}`, {
        params: { years }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get financials'
      throw err
    }
  }

  async function getMetrics(symbol) {
    try {
      const response = await api.get(`/investments/metrics/${symbol}`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get metrics'
      throw err
    }
  }

  async function getProfile(symbol) {
    try {
      const response = await api.get(`/investments/profile/${symbol}`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get profile'
      throw err
    }
  }

  async function getBalanceSheet(symbol, frequency = 'annual') {
    try {
      const response = await api.get(`/investments/statements/${symbol}/balance-sheet`, {
        params: { frequency }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get balance sheet'
      throw err
    }
  }

  async function getIncomeStatement(symbol, frequency = 'annual') {
    try {
      const response = await api.get(`/investments/statements/${symbol}/income-statement`, {
        params: { frequency }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get income statement'
      throw err
    }
  }

  async function getCashFlow(symbol, frequency = 'annual') {
    try {
      const response = await api.get(`/investments/statements/${symbol}/cash-flow`, {
        params: { frequency }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get cash flow'
      throw err
    }
  }

  async function getFilings(symbol) {
    try {
      const response = await api.get(`/investments/filings/${symbol}`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get SEC filings'
      throw err
    }
  }

  // ========================================
  // HOLDINGS
  // ========================================

  async function fetchHoldings() {
    holdingsLoading.value = true
    error.value = null

    try {
      const response = await api.get('/investments/holdings')
      holdings.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch holdings'
      throw err
    } finally {
      holdingsLoading.value = false
    }
  }

  async function getHolding(holdingId) {
    try {
      const response = await api.get(`/investments/holdings/${holdingId}`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get holding'
      throw err
    }
  }

  async function createHolding(data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/investments/holdings', data)
      holdings.value.push(response.data)
      await fetchPortfolioSummary()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to create holding'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateHolding(holdingId, data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.put(`/investments/holdings/${holdingId}`, data)
      const index = holdings.value.findIndex(h => h.id === holdingId)
      if (index !== -1) {
        holdings.value[index] = response.data
      }
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update holding'
      throw err
    } finally {
      loading.value = false
    }
  }

  // Set or clear the target allocation % for a symbol. Works for any position
  // (manual holding or open-trade-derived) -- the backend stores it by symbol.
  async function updatePortfolioTarget(symbol, targetAllocationPercent) {
    try {
      const response = await api.put('/investments/portfolio/targets', {
        symbol,
        targetAllocationPercent
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update target allocation'
      throw err
    }
  }

  async function deleteHolding(holdingId) {
    loading.value = true
    error.value = null

    try {
      await api.delete(`/investments/holdings/${holdingId}`)
      holdings.value = holdings.value.filter(h => h.id !== holdingId)
      await fetchPortfolioSummary()
      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete holding'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // LOTS
  // ========================================

  async function getLots(holdingId) {
    try {
      const response = await api.get(`/investments/holdings/${holdingId}/lots`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get lots'
      throw err
    }
  }

  async function addLot(holdingId, data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post(`/investments/holdings/${holdingId}/lots`, data)
      await fetchHoldings()
      await fetchPortfolioSummary()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to add lot'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteLot(lotId) {
    loading.value = true
    error.value = null

    try {
      await api.delete(`/investments/lots/${lotId}`)
      await fetchHoldings()
      await fetchPortfolioSummary()
      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete lot'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // DIVIDENDS
  // ========================================

  async function getDividends(holdingId) {
    try {
      const response = await api.get(`/investments/holdings/${holdingId}/dividends`)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to get dividends'
      throw err
    }
  }

  async function recordDividend(holdingId, data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post(`/investments/holdings/${holdingId}/dividends`, data)
      await fetchHoldings()
      await fetchPortfolioSummary()
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to record dividend'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // PORTFOLIO
  // ========================================

  async function fetchPortfolioSummary() {
    try {
      const response = await api.get('/investments/portfolio/summary')
      portfolioSummary.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio summary'
      throw err
    }
  }

  async function fetchPortfolioOverview(params = {}) {
    portfolioLoading.value = true
    error.value = null

    try {
      const response = await api.get('/investments/portfolio/overview', { params })
      portfolioOverview.value = response.data
      portfolioSummary.value = {
        holdingCount: response.data.positionCount,
        totalValue: response.data.totalValue,
        totalCostBasis: response.data.totalCostBasis,
        unrealizedPnL: response.data.unrealizedPnL,
        unrealizedPnLPercent: response.data.unrealizedPnLPercent,
        totalDividends: response.data.totalDividends,
        totalReturn: response.data.totalReturn,
        allocation: response.data.allocation
      }
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio overview'
      throw err
    } finally {
      portfolioLoading.value = false
    }
  }

  async function fetchPortfolioPositions(params = {}) {
    portfolioLoading.value = true
    error.value = null

    try {
      const response = await api.get('/investments/portfolio/positions', { params })
      portfolioPositions.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio positions'
      throw err
    } finally {
      portfolioLoading.value = false
    }
  }

  async function fetchPortfolioPerformance(params = {}) {
    portfolioLoading.value = true
    error.value = null
    portfolioPerformance.value = null

    try {
      const response = await api.get('/investments/portfolio/performance', { params })
      portfolioPerformance.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio performance'
      throw err
    } finally {
      portfolioLoading.value = false
    }
  }

  async function fetchPortfolioRebalance(params = {}) {
    portfolioLoading.value = true
    error.value = null
    portfolioRebalance.value = null

    try {
      const response = await api.get('/investments/portfolio/rebalance', { params })
      portfolioRebalance.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch rebalance plan'
      throw err
    } finally {
      portfolioLoading.value = false
    }
  }

  async function fetchPortfolioAlerts(params = {}) {
    portfolioLoading.value = true
    error.value = null

    try {
      const response = await api.get('/investments/portfolio/alerts', { params })
      portfolioAlertSummary.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio alerts'
      throw err
    } finally {
      portfolioLoading.value = false
    }
  }

  async function fetchPortfolioPreferences() {
    try {
      const response = await api.get('/investments/portfolio/preferences')
      portfolioPreferences.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch portfolio preferences'
      throw err
    }
  }

  async function updatePortfolioPreferences(data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.put('/investments/portfolio/preferences', data)
      portfolioPreferences.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update portfolio preferences'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function refreshPrices() {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/investments/portfolio/refresh')
      await fetchHoldings()
      await fetchPortfolioSummary()
      if (portfolioPositions.value.length > 0 || portfolioOverview.value) {
        await Promise.allSettled([
          fetchPortfolioOverview(),
          fetchPortfolioPositions()
        ])
      }
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to refresh prices'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // SCREENER
  // ========================================

  async function fetchSearchHistory(favoritesOnly = false) {
    try {
      const response = await api.get('/investments/screener/history', {
        params: { favorites: favoritesOnly }
      })
      searchHistory.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch search history'
      throw err
    }
  }

  async function toggleFavorite(symbol) {
    try {
      const response = await api.post('/investments/screener/favorite', { symbol })
      // Update local state
      const item = searchHistory.value.find(h => h.symbol === symbol)
      if (item) {
        item.isFavorite = response.data.isFavorite
      }
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to toggle favorite'
      throw err
    }
  }

  async function compareStocks(symbols) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/investments/compare', { symbols })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to compare stocks'
      throw err
    } finally {
      loading.value = false
    }
  }

  // ========================================
  // DCF VALUATION
  // ========================================

  async function fetchDCFMetrics(symbol) {
    dcfLoading.value = true
    error.value = null

    try {
      const response = await api.get(`/investments/dcf/${symbol}`)
      dcfMetrics.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch DCF metrics'
      throw err
    } finally {
      dcfLoading.value = false
    }
  }

  async function calculateDCF(symbol, inputs) {
    dcfLoading.value = true
    error.value = null

    try {
      const response = await api.post(`/investments/dcf/${symbol}/calculate`, inputs)
      dcfResults.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to calculate DCF'
      throw err
    } finally {
      dcfLoading.value = false
    }
  }

  async function saveValuation(data) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/investments/valuations', data)
      savedValuations.value.unshift(response.data)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to save valuation'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchValuations(symbol = null) {
    try {
      const params = symbol ? { symbol } : {}
      const response = await api.get('/investments/valuations', { params })
      savedValuations.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch valuations'
      throw err
    }
  }

  async function deleteValuation(id) {
    loading.value = true
    error.value = null

    try {
      await api.delete(`/investments/valuations/${id}`)
      savedValuations.value = savedValuations.value.filter(v => v.id !== id)
      return true
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete valuation'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearDCFData() {
    dcfMetrics.value = null
    dcfResults.value = null
  }

  function setDCFResults(results) {
    dcfResults.value = results
  }

  // ========================================
  // UTILITIES
  // ========================================

  function clearError() {
    error.value = null
  }

  function $reset() {
    currentAnalysis.value = null
    holdings.value = []
    portfolioSummary.value = null
    portfolioOverview.value = null
    portfolioPositions.value = []
    portfolioPerformance.value = null
    portfolioRebalance.value = null
    portfolioAlertSummary.value = null
    portfolioPreferences.value = null
    searchHistory.value = []
    loading.value = false
    error.value = null
    analysisLoading.value = false
    holdingsLoading.value = false
    portfolioLoading.value = false
    // DCF reset
    dcfMetrics.value = null
    dcfResults.value = null
    savedValuations.value = []
    dcfLoading.value = false
  }

  return {
    // State
    currentAnalysis,
    holdings,
    portfolioSummary,
    portfolioOverview,
    portfolioPositions,
    portfolioPerformance,
    portfolioRebalance,
    portfolioAlertSummary,
    portfolioPreferences,
    searchHistory,
    loading,
    error,
    analysisLoading,
    holdingsLoading,
    portfolioLoading,

    // Getters
    totalPortfolioValue,
    totalUnrealizedPnL,
    totalDividends,
    holdingCount,

    // Analysis
    analyzeStock,
    clearAnalysis,

    // Fundamental data
    getFinancials,
    getMetrics,
    getProfile,
    getBalanceSheet,
    getIncomeStatement,
    getCashFlow,
    getFilings,

    // Holdings
    fetchHoldings,
    getHolding,
    createHolding,
    updateHolding,
    updatePortfolioTarget,
    deleteHolding,

    // Lots
    getLots,
    addLot,
    deleteLot,

    // Dividends
    getDividends,
    recordDividend,

    // Portfolio
    fetchPortfolioSummary,
    fetchPortfolioOverview,
    fetchPortfolioPositions,
    fetchPortfolioPerformance,
    fetchPortfolioRebalance,
    fetchPortfolioAlerts,
    fetchPortfolioPreferences,
    updatePortfolioPreferences,
    refreshPrices,

    // Screener
    fetchSearchHistory,
    toggleFavorite,
    compareStocks,

    // DCF Valuation
    dcfMetrics,
    dcfResults,
    savedValuations,
    dcfLoading,
    fetchDCFMetrics,
    calculateDCF,
    saveValuation,
    fetchValuations,
    deleteValuation,
    clearDCFData,
    setDCFResults,

    // Utilities
    clearError,
    $reset
  }
})
