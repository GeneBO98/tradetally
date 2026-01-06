import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useTradesStore = defineStore('trades', () => {
  const trades = ref([])
  const currentTrade = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const pagination = ref({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })
  const filters = ref({
    symbol: '',
    startDate: '',
    endDate: '',
    tags: [],
    strategy: '',
    strategies: [],
    sectors: [],
    holdTime: '',
    minHoldTime: null,
    maxHoldTime: null,
    hasNews: '',
    broker: '',
    brokers: [],
    accounts: [],
    daysOfWeek: [],
    instrumentTypes: []
  })

  // Store analytics data for consistent P&L calculations
  const analytics = ref(null)

  const totalPnL = computed(() => {
    // Use analytics data if available, otherwise fall back to trade summation
    if (analytics.value?.summary?.totalPnL !== undefined) {
      return parseFloat(analytics.value.summary.totalPnL)
    }
    return trades.value.reduce((sum, trade) => sum + (parseFloat(trade.pnl) || 0), 0)
  })

  const winRate = computed(() => {
    // Use analytics data if available, otherwise fall back to trade calculation
    if (analytics.value?.summary?.winRate !== undefined) {
      return parseFloat(analytics.value.summary.winRate).toFixed(2)
    }
    const winning = trades.value.filter(t => t.pnl > 0).length
    const total = trades.value.length
    return total > 0 ? (winning / total * 100).toFixed(2) : 0
  })

  const totalTrades = computed(() => {
    // Use analytics data if available for total trades count
    if (analytics.value?.summary?.totalTrades !== undefined) {
      return analytics.value.summary.totalTrades
    }
    // Fall back to pagination total
    return pagination.value.total
  })

  async function fetchTrades(params = {}) {
    loading.value = true
    error.value = null

    try {
      const offset = (pagination.value.page - 1) * pagination.value.limit
      const skipCount = params.skipCount !== false // Default to true for faster initial load

      // Fetch trades first (with skipCount for faster response)
      // This allows the UI to render immediately while count/analytics load in background
      const tradesResponse = await api.get('/trades', {
        params: {
          ...filters.value,
          ...params,
          limit: pagination.value.limit,
          offset: offset,
          skipCount: skipCount ? 'true' : 'false'
        }
      })

      // Always use the trades data from the trades API
      if (tradesResponse.data.hasOwnProperty('trades')) {
        trades.value = tradesResponse.data.trades
      } else {
        trades.value = tradesResponse.data
      }

      // If count was included in response, use it
      if (tradesResponse.data.total !== undefined && tradesResponse.data.total !== null) {
        pagination.value.total = tradesResponse.data.total
        pagination.value.totalPages = Math.ceil(tradesResponse.data.total / pagination.value.limit)
      }

      // Fetch count and analytics in parallel (non-blocking, happens after trades are shown)
      // These can fail silently without affecting the main UI
      Promise.all([
        // Fetch count if it wasn't included
        skipCount && tradesResponse.data.total === null
          ? api.get('/trades/count', {
              params: {
                ...filters.value,
                ...params,
                limit: pagination.value.limit
              }
            }).then(response => {
              pagination.value.total = response.data.total
              pagination.value.totalPages = response.data.totalPages
            }).catch(err => {
              console.warn('Failed to fetch trade count:', err)
            })
          : Promise.resolve(),
        // Fetch analytics (non-blocking)
        api.get('/trades/analytics', {
          params: {
            ...filters.value,
            ...params
          }
        }).then(response => {
          analytics.value = response.data
        }).catch(err => {
          console.warn('Failed to fetch analytics:', err)
          // Analytics failure shouldn't block the UI
        })
      ]).catch(() => {
        // Ignore errors - these are non-critical background requests
      })

      return tradesResponse.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchRoundTripTrades(params = {}) {
    loading.value = true
    error.value = null

    try {
      const offset = (pagination.value.page - 1) * pagination.value.limit

      // Fetch both trades and analytics in parallel for better performance
      const [tradesResponse, analyticsResponse] = await Promise.all([
        api.get('/trades/round-trip', {
          params: {
            ...filters.value,
            ...params,
            limit: pagination.value.limit,
            offset: offset
          }
        }),
        api.get('/trades/analytics', {
          params: {
            ...filters.value,
            ...params
          }
        })
      ])

      // Store analytics data for consistent P&L calculations
      analytics.value = analyticsResponse.data

      // Always use the trades data from the trades API
      if (tradesResponse.data.hasOwnProperty('trades')) {
        trades.value = tradesResponse.data.trades
      } else {
        trades.value = tradesResponse.data
      }

      // If the response includes pagination metadata, update it
      if (tradesResponse.data.total !== undefined) {
        pagination.value.total = tradesResponse.data.total
        pagination.value.totalPages = Math.ceil(tradesResponse.data.total / pagination.value.limit)
      }

      return tradesResponse.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch round-trip trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchAnalytics(params = {}) {
    try {
      const analyticsResponse = await api.get('/trades/analytics', {
        params: {
          ...filters.value,
          ...params
        }
      })

      // Store analytics data for consistent P&L calculations
      analytics.value = analyticsResponse.data
      return analyticsResponse.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch analytics'
      throw err
    }
  }

  async function fetchTrade(id) {
    loading.value = true
    error.value = null

    try {
      const response = await api.get(`/trades/${id}`)
      currentTrade.value = response.data.trade
      return response.data.trade
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch trade'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createTrade(tradeData) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/trades', tradeData)
      trades.value.unshift(response.data.trade)
      return response.data.trade
    } catch (err) {
      console.error('Trade creation error:', err.response?.data)
      error.value = err.response?.data?.error || 'Failed to create trade'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateTrade(id, updates) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.put(`/trades/${id}`, updates)
      const index = trades.value.findIndex(t => t.id === id)
      if (index !== -1) {
        trades.value[index] = response.data.trade
      }
      if (currentTrade.value?.id === id) {
        currentTrade.value = response.data.trade
      }
      return response.data.trade
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update trade'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteTrade(id) {
    loading.value = true
    error.value = null
    
    try {
      await api.delete(`/trades/${id}`)
      trades.value = trades.value.filter(t => t.id !== id)
      if (currentTrade.value?.id === id) {
        currentTrade.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete trade'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function bulkDeleteTrades(tradeIds) {
    loading.value = true
    error.value = null
    
    try {
      await api.delete('/trades/bulk', { data: { tradeIds } })
      trades.value = trades.value.filter(t => !tradeIds.includes(t.id))
      if (currentTrade.value && tradeIds.includes(currentTrade.value.id)) {
        currentTrade.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function importTrades(file, broker, mappingId = null, accountId = null) {
    loading.value = true
    error.value = null

    try {
      console.log('Creating FormData with file:', file.name, 'broker:', broker, 'mappingId:', mappingId, 'accountId:', accountId)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('broker', broker)
      if (mappingId) {
        formData.append('mappingId', mappingId)
      }
      if (accountId) {
        formData.append('accountId', accountId)
      }

      console.log('FormData contents:')
      for (let [key, value] of formData.entries()) {
        console.log(key, value)
      }

      console.log('Making API request to /trades/import')
      const response = await api.post('/trades/import', formData, {
        timeout: 60000 // 60 second timeout
      })

      console.log('API response:', response.data)
      return response.data
    } catch (err) {
      console.error('Import API error:', err)
      if (err.response) {
        console.error('Error status:', err.response.status)
        console.error('Error data:', err.response.data)
      }
      error.value = err.response?.data?.error || 'Failed to import trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getMonthlyPerformance(year) {
    try {
      console.log('[STORE] Fetching monthly performance for year:', year)
      const response = await api.get('/trades/analytics/monthly', {
        params: { year }
      })
      console.log('[STORE] Monthly performance response:', response.data)
      return response.data
    } catch (err) {
      console.error('[ERROR] Failed to fetch monthly performance:', err)
      error.value = err.response?.data?.error || 'Failed to fetch monthly performance'
      throw err
    }
  }

  function setFilters(newFilters) {
    // If newFilters is empty object, reset all filters
    if (Object.keys(newFilters).length === 0) {
      filters.value = {
        symbol: '',
        startDate: '',
        endDate: '',
        tags: [],
        strategy: '',
        strategies: [],
        sectors: [],
        holdTime: '',
        minHoldTime: null,
        maxHoldTime: null,
        hasNews: '',
        broker: '',
        brokers: [],
        accounts: [],
        daysOfWeek: [],
        instrumentTypes: []
      }
    } else {
      filters.value = { ...filters.value, ...newFilters }
    }
    pagination.value.page = 1 // Reset to first page when filtering
  }

  function resetFilters() {
    filters.value = {
      symbol: '',
      startDate: '',
      endDate: '',
      tags: [],
      strategy: '',
      strategies: [],
      sectors: [],
      holdTime: '',
      minHoldTime: null,
      maxHoldTime: null,
      hasNews: '',
      broker: '',
      brokers: [],
      accounts: [],
      daysOfWeek: [],
      instrumentTypes: []
    }
    pagination.value.page = 1
  }

  function setPage(page) {
    pagination.value.page = page
  }

  function nextPage() {
    if (pagination.value.page < pagination.value.totalPages) {
      pagination.value.page++
    }
  }

  function prevPage() {
    if (pagination.value.page > 1) {
      pagination.value.page--
    }
  }

  return {
    trades,
    currentTrade,
    loading,
    error,
    filters,
    pagination,
    analytics,
    totalPnL,
    winRate,
    totalTrades,
    fetchTrades,
    fetchRoundTripTrades,
    fetchAnalytics,
    fetchTrade,
    createTrade,
    updateTrade,
    deleteTrade,
    bulkDeleteTrades,
    importTrades,
    getMonthlyPerformance,
    setFilters,
    resetFilters,
    setPage,
    nextPage,
    prevPage
  }
})