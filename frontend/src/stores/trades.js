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
    holdTime: '',
    minHoldTime: null,
    maxHoldTime: null,
    hasNews: ''
  })

  // Store analytics data for consistent P&L calculations
  const analytics = ref(null)

  const totalPnL = computed(() => {
    console.log('🔄 Computing totalPnL:', {
      hasAnalytics: !!analytics.value,
      hasSummary: !!(analytics.value?.summary),
      analyticsPnL: analytics.value?.summary?.totalPnL,
      fallbackTradesLength: trades.value.length
    })
    
    // Use analytics data if available, otherwise fall back to trade summation
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalPnL !== undefined) {
      const result = parseFloat(analytics.value.summary.totalPnL)
      console.log('📊 Using analytics totalPnL:', result)
      return result
    }
    
    const total = trades.value.reduce((sum, trade) => {
      const pnl = parseFloat(trade.pnl) || 0
      return sum + pnl
    }, 0)
    console.log('📊 Using fallback totalPnL:', total, {
      tradesCount: trades.value.length,
      sampleTrades: trades.value.slice(0, 3).map(t => ({ symbol: t.symbol, pnl: t.pnl }))
    })
    return total
  })

  const winRate = computed(() => {
    console.log('🔄 Computing winRate:', {
      hasAnalytics: !!analytics.value,
      analyticsWinRate: analytics.value?.summary?.winRate,
      tradesCount: trades.value.length
    })
    
    // Use analytics data if available, otherwise fall back to trade calculation
    if (analytics.value && analytics.value.summary && analytics.value.summary.winRate !== undefined) {
      const result = parseFloat(analytics.value.summary.winRate).toFixed(2)
      console.log('📊 Using analytics winRate:', result)
      return result
    }
    
    const winning = trades.value.filter(t => t.pnl > 0).length
    const total = trades.value.length
    const result = total > 0 ? (winning / total * 100).toFixed(2) : 0
    console.log('📊 Using fallback winRate:', result, { winning, total })
    return result
  })

  const totalTrades = computed(() => {
    console.log('🔄 Computing totalTrades:', {
      hasAnalytics: !!analytics.value,
      analyticsTotalTrades: analytics.value?.summary?.totalTrades,
      paginationTotal: pagination.value.total
    })
    
    // Use analytics data if available for total trades count
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalTrades !== undefined) {
      const result = analytics.value.summary.totalTrades
      console.log('📊 Using analytics totalTrades:', result)
      return result
    }
    
    // Fall back to pagination total
    const result = pagination.value.total
    console.log('📊 Using pagination totalTrades:', result)
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
      
      // If analytics shows 0 total trades, force empty trades array regardless of what trades API returned
      if (analyticsResponse.data.summary?.totalTrades === 0) {
        trades.value = []
        console.log('📦 FORCED EMPTY: Analytics shows 0 trades, forcing empty array')
      } else {
        // Normal case - use trades data
        if (tradesResponse.data.hasOwnProperty('trades')) {
          trades.value = tradesResponse.data.trades
          console.log('📦 Set trades from tradesResponse.data.trades:', trades.value.length)
        } else {
          trades.value = tradesResponse.data
          console.log('📦 Set trades from tradesResponse.data (fallback):', trades.value.length)
        }
      }
      console.log('Analytics data received:', {
        summary: analyticsResponse.data.summary,
        totalPnL: analyticsResponse.data.summary?.totalPnL,
        winRate: analyticsResponse.data.summary?.winRate,
        totalTrades: analyticsResponse.data.summary?.totalTrades
      })
      console.log('Full analytics response:', JSON.stringify(analyticsResponse.data, null, 2))
      
      // Final verification of trades array
      console.log('🔍 Final trades array state:', {
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
      
      // If analytics shows 0 total trades, force empty trades array regardless of what trades API returned
      if (analyticsResponse.data.summary?.totalTrades === 0) {
        trades.value = []
        console.log('📦 FORCED EMPTY: Analytics shows 0 trades, forcing empty array')
      } else {
        // Normal case - use trades data
        if (tradesResponse.data.hasOwnProperty('trades')) {
          trades.value = tradesResponse.data.trades
          console.log('📦 Set trades from tradesResponse.data.trades:', trades.value.length)
        } else {
          trades.value = tradesResponse.data
          console.log('📦 Set trades from tradesResponse.data (fallback):', trades.value.length)
        }
      }
      console.log('Analytics data received:', {
        summary: analyticsResponse.data.summary,
        totalPnL: analyticsResponse.data.summary?.totalPnL,
        winRate: analyticsResponse.data.summary?.winRate,
        totalTrades: analyticsResponse.data.summary?.totalTrades
      })
      console.log('Full analytics response:', JSON.stringify(analyticsResponse.data, null, 2))
      
      // Final verification of trades array
      console.log('🔍 Final trades array state:', {
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

  async function importTrades(file, broker) {
    loading.value = true
    error.value = null
    
    try {
      console.log('Creating FormData with file:', file.name, 'broker:', broker)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('broker', broker)
      
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
        hasNews: ''
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
      hasNews: ''
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
    setFilters,
    resetFilters,
    setPage,
    nextPage,
    prevPage
  }
})