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
    daysOfWeek: [],
    instrumentTypes: []
  })

  // Store analytics data for consistent P&L calculations
  const analytics = ref(null)

  const totalPnL = computed(() => {
    console.log('[COMPUTE] totalPnL:', {
      hasAnalytics: !!analytics.value,
      hasSummary: !!(analytics.value?.summary),
      analyticsPnL: analytics.value?.summary?.totalPnL,
      fallbackTradesLength: trades.value.length
    })
    
    // Use analytics data if available, otherwise fall back to trade summation
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalPnL !== undefined) {
      const result = parseFloat(analytics.value.summary.totalPnL)
      console.log('[USING] analytics totalPnL:', result)
      return result
    }
    
    const total = trades.value.reduce((sum, trade) => {
      const pnl = parseFloat(trade.pnl) || 0
      return sum + pnl
    }, 0)
    console.log('[FALLBACK] totalPnL:', total, {
      tradesCount: trades.value.length,
      sampleTrades: trades.value.slice(0, 3).map(t => ({ symbol: t.symbol, pnl: t.pnl }))
    })
    return total
  })

  const winRate = computed(() => {
    console.log('[COMPUTE] winRate:', {
      hasAnalytics: !!analytics.value,
      analyticsWinRate: analytics.value?.summary?.winRate,
      tradesCount: trades.value.length
    })
    
    // Use analytics data if available, otherwise fall back to trade calculation
    if (analytics.value && analytics.value.summary && analytics.value.summary.winRate !== undefined) {
      const result = parseFloat(analytics.value.summary.winRate).toFixed(2)
      console.log('[USING] analytics winRate:', result)
      return result
    }
    
    const winning = trades.value.filter(t => t.pnl > 0).length
    const total = trades.value.length
    const result = total > 0 ? (winning / total * 100).toFixed(2) : 0
    console.log('[FALLBACK] winRate:', result, { winning, total })
    return result
  })

  const totalTrades = computed(() => {
    console.log('[COMPUTE] totalTrades:', {
      hasAnalytics: !!analytics.value,
      analyticsTotalTrades: analytics.value?.summary?.totalTrades,
      paginationTotal: pagination.value.total
    })
    
    // Use analytics data if available for total trades count
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalTrades !== undefined) {
      const result = analytics.value.summary.totalTrades
      console.log('[USING] analytics totalTrades:', result)
      return result
    }
    
    // Fall back to pagination total
    const result = pagination.value.total
    console.log('[USING] pagination totalTrades:', result)
    return result
  })

  async function fetchTrades(params = {}) {
    loading.value = true
    error.value = null
    
    try {
      const offset = (pagination.value.page - 1) * pagination.value.limit
      
      // Fetch both trades and analytics data for consistent P&L
      const [tradesResponse, analyticsResponse] = await Promise.all([
        api.get('/trades', { 
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
      
      // Store analytics data for consistent P&L calculations FIRST
      analytics.value = analyticsResponse.data
      
      // Always use the trades data from the trades API, not analytics
      if (tradesResponse.data.hasOwnProperty('trades')) {
        trades.value = tradesResponse.data.trades
        console.log('[TRADES] Set from tradesResponse.data.trades:', trades.value.length)
      } else {
        trades.value = tradesResponse.data
        console.log('[TRADES] Set from tradesResponse.data (fallback):', trades.value.length)
      }
      
      // Log if there's a mismatch between trades and analytics for debugging
      if (analyticsResponse.data.summary?.totalTrades === 0 && trades.value.length > 0) {
        console.log('[WARNING] MISMATCH: Analytics shows 0 trades but trades API returned', trades.value.length, 'trades')
      }
      console.log('Analytics data received:', {
        summary: analyticsResponse.data.summary,
        totalPnL: analyticsResponse.data.summary?.totalPnL,
        winRate: analyticsResponse.data.summary?.winRate,
        totalTrades: analyticsResponse.data.summary?.totalTrades
      })
      console.log('Full analytics response:', JSON.stringify(analyticsResponse.data, null, 2))
      
      // Final verification of trades array
      console.log('[FINAL] trades array state:', {
        tradesLength: trades.value?.length || 0,
        isArray: Array.isArray(trades.value),
        isEmpty: trades.value?.length === 0,
        shouldShowEmpty: trades.value?.length === 0 && analyticsResponse.data.summary?.totalTrades === 0,
        firstTradeSymbol: trades.value?.[0]?.symbol || 'none'
      })
      
      // If the response includes pagination metadata, update it
      console.log('[PAGINATION] Trades response:', tradesResponse.data)
      if (tradesResponse.data.total !== undefined) {
        pagination.value.total = tradesResponse.data.total
        pagination.value.totalPages = Math.ceil(tradesResponse.data.total / pagination.value.limit)
        console.log('[PAGINATION] Set:', pagination.value)
      } else {
        console.log('[PAGINATION] No total in response!')
      }
      
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
      
      // Fetch both round-trip trades and analytics data for consistent P&L
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
      
      // Store analytics data for consistent P&L calculations FIRST
      analytics.value = analyticsResponse.data
      
      // Always use the trades data from the trades API, not analytics
      if (tradesResponse.data.hasOwnProperty('trades')) {
        trades.value = tradesResponse.data.trades
        console.log('[TRADES] Set from tradesResponse.data.trades:', trades.value.length)
      } else {
        trades.value = tradesResponse.data
        console.log('[TRADES] Set from tradesResponse.data (fallback):', trades.value.length)
      }
      
      // Log if there's a mismatch between trades and analytics for debugging
      if (analyticsResponse.data.summary?.totalTrades === 0 && trades.value.length > 0) {
        console.log('[WARNING] MISMATCH: Analytics shows 0 trades but trades API returned', trades.value.length, 'trades')
      }
      console.log('Analytics data received:', {
        summary: analyticsResponse.data.summary,
        totalPnL: analyticsResponse.data.summary?.totalPnL,
        winRate: analyticsResponse.data.summary?.winRate,
        totalTrades: analyticsResponse.data.summary?.totalTrades
      })
      console.log('Full analytics response:', JSON.stringify(analyticsResponse.data, null, 2))
      
      // Final verification of trades array
      console.log('[FINAL] trades array state:', {
        tradesLength: trades.value?.length || 0,
        isArray: Array.isArray(trades.value),
        isEmpty: trades.value?.length === 0,
        shouldShowEmpty: trades.value?.length === 0 && analyticsResponse.data.summary?.totalTrades === 0,
        firstTradeSymbol: trades.value?.[0]?.symbol || 'none'
      })
      
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

  async function importTrades(file, broker, mappingId = null) {
    loading.value = true
    error.value = null

    try {
      console.log('Creating FormData with file:', file.name, 'broker:', broker, 'mappingId:', mappingId)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('broker', broker)
      if (mappingId) {
        formData.append('mappingId', mappingId)
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