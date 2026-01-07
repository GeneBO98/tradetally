import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useInvestmentsStore = defineStore('investments', () => {
  // State
  const currentAnalysis = ref(null)
  const holdings = ref([])
  const portfolioSummary = ref(null)
  const searchHistory = ref([])
  const loading = ref(false)
  const error = ref(null)
  const analysisLoading = ref(false)
  const holdingsLoading = ref(false)

  // DCF Valuation State
  const dcfMetrics = ref(null)
  const dcfResults = ref(null)
  const savedValuations = ref([])
  const dcfLoading = ref(false)

  // Getters
  const totalPortfolioValue = computed(() => portfolioSummary.value?.totalValue || 0)
  const totalUnrealizedPnL = computed(() => portfolioSummary.value?.unrealizedPnL || 0)
  const totalDividends = computed(() => portfolioSummary.value?.totalDividends || 0)
  const holdingCount = computed(() => holdings.value.length)

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

  async function refreshPrices() {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/investments/portfolio/refresh')
      await fetchHoldings()
      await fetchPortfolioSummary()
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
    searchHistory.value = []
    loading.value = false
    error.value = null
    analysisLoading.value = false
    holdingsLoading.value = false
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
    searchHistory,
    loading,
    error,
    analysisLoading,
    holdingsLoading,

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

    // Utilities
    clearError,
    $reset
  }
})
