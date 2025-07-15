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
    strategy: ''
  })

  // Store analytics data for consistent P&L calculations
  const analytics = ref(null)

  const totalPnL = computed(() => {
    // Use analytics data if available, otherwise fall back to trade summation
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalPnL !== undefined) {
      return parseFloat(analytics.value.summary.totalPnL)
    }
    
    const total = trades.value.reduce((sum, trade) => {
      const pnl = parseFloat(trade.pnl) || 0
      return sum + pnl
    }, 0)
    console.log('Total P/L calculation (fallback):', {
      tradesCount: trades.value.length,
      totalPnL: total,
      sampleTrades: trades.value.slice(0, 3).map(t => ({ symbol: t.symbol, pnl: t.pnl, type: typeof t.pnl }))
    })
    return total
  })

  const winRate = computed(() => {
    // Use analytics data if available, otherwise fall back to trade calculation
    if (analytics.value && analytics.value.summary && analytics.value.summary.winRate !== undefined) {
      return parseFloat(analytics.value.summary.winRate).toFixed(2)
    }
    
    const winning = trades.value.filter(t => t.pnl > 0).length
    const total = trades.value.length
    return total > 0 ? (winning / total * 100).toFixed(2) : 0
  })

  const totalTrades = computed(() => {
    // Use analytics data if available for total trades count
    if (analytics.value && analytics.value.summary && analytics.value.summary.totalTrades !== undefined) {
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
      const response = await api.get('/trades', { 
        params: { 
          ...filters.value, 
          ...params,
          limit: pagination.value.limit,
          offset: offset
        }
      })
      trades.value = response.data.trades || response.data
      
      // If the response includes pagination metadata, update it
      if (response.data.total !== undefined) {
        pagination.value.total = response.data.total
        pagination.value.totalPages = Math.ceil(response.data.total / pagination.value.limit)
      }
      
      return response.data
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
      
      trades.value = tradesResponse.data.trades || tradesResponse.data
      
      // Store analytics data for consistent P&L calculations
      analytics.value = analyticsResponse.data
      console.log('Analytics data received:', {
        summary: analyticsResponse.data.summary,
        totalPnL: analyticsResponse.data.summary?.totalPnL,
        winRate: analyticsResponse.data.summary?.winRate
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
        strategy: ''
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
      strategy: ''
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
    importTrades,
    setFilters,
    resetFilters,
    setPage,
    nextPage,
    prevPage
  }
})