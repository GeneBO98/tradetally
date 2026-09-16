import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import requestManager from '@/utils/requestManager'
import { STORAGE_KEY as GLOBAL_ACCOUNT_KEY } from '@/composables/useGlobalAccountFilter'

function normalizeStoredAccount(value) {
  if (value == null) return ''
  const normalized = String(value).trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') {
    return ''
  }
  return normalized
}

function normalizeAccountsFilter(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeStoredAccount(item))
      .filter(Boolean)
      .join(',')
  }

  return normalizeStoredAccount(value)
}

export const useTradesStore = defineStore('trades', () => {
  const trades = ref([])
  const currentTrade = ref(null)
  const loading = ref(false)
  const initialLoading = ref(true)
  const analyticsLoading = ref(false)
  const error = ref(null)
  const pagination = ref({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })
  const filters = ref({
    symbol: '',
    symbolExact: false,
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
    importId: '',
    accounts: [],
    includeArchived: false,
    daysOfWeek: [],
    market_sessions: [],
    instrumentTypes: []
  })

  // Store analytics data for consistent P&L calculations
  const analytics = ref(null)
  // Currency the server returned monetary values in (user's display
  // currency; 'USD' when the user hasn't changed it or no rate is known)
  const tradesCurrency = ref('USD')
  // Incremented for every list request so a slower analytics response from a
  // superseded filter cannot replace the current summary.
  let fetchGeneration = 0

  function getSummaryMetric(key) {
    if (!analytics.value?.summary) return undefined
    return analytics.value.summary[key]
  }

  const hasCompleteTradeSetLoaded = computed(() => {
    const total = Number(pagination.value.total || 0)
    if (total === 0) {
      return trades.value.length > 0
    }

    return trades.value.length >= total
  })

  const totalCosts = computed(() => {
    const summaryTotalCosts = getSummaryMetric('totalCosts')
    if (summaryTotalCosts !== undefined) {
      return parseFloat(summaryTotalCosts) || 0
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return 0
    }

    return trades.value.reduce((sum, trade) => {
      const commission = parseFloat(trade.commission) || 0
      const fees = parseFloat(trade.fees) || 0
      return sum + commission + fees
    }, 0)
  })

  const totalPnL = computed(() => {
    const summaryTotalPnL = getSummaryMetric('totalPnL')
    if (summaryTotalPnL !== undefined) {
      return parseFloat(summaryTotalPnL) || 0
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return 0
    }

    return trades.value.reduce((sum, trade) => sum + (parseFloat(trade.pnl) || 0), 0)
  })

  const totalNetPnL = computed(() => {
    const summaryTotalNetPnL = getSummaryMetric('totalNetPnL')
    if (summaryTotalNetPnL !== undefined) {
      return parseFloat(summaryTotalNetPnL) || 0
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return 0
    }

    return totalPnL.value
  })

  const totalGrossPnL = computed(() => {
    const summaryTotalGrossPnL = getSummaryMetric('totalGrossPnL')
    if (summaryTotalGrossPnL !== undefined) {
      return parseFloat(summaryTotalGrossPnL) || 0
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return 0
    }

    return totalNetPnL.value + totalCosts.value
  })

  // Gross P&L (price only) for a trade — classify breakeven the same way the
  // backend does: a trade scratched at entry is breakeven, not a fee-driven loss.
  function grossPnl(t) {
    return (parseFloat(t.pnl) || 0) + (parseFloat(t.commission) || 0) + (parseFloat(t.fees) || 0)
  }

  const winRate = computed(() => {
    const summaryWinRate = getSummaryMetric('winRate')
    if (summaryWinRate !== undefined) {
      return parseFloat(summaryWinRate).toFixed(2)
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return '0.00'
    }

    const winning = trades.value.filter(t => grossPnl(t) !== 0 && t.pnl > 0).length
    const total = trades.value.length
    return total > 0 ? (winning / total * 100).toFixed(2) : 0
  })

  // Win rate excluding breakeven trades (denominator = wins + losses only).
  const winRateExcludingBreakeven = computed(() => {
    const summaryMetric = getSummaryMetric('winRateExcludingBreakeven')
    if (summaryMetric !== undefined) {
      return parseFloat(summaryMetric).toFixed(2)
    }

    if (!hasCompleteTradeSetLoaded.value) {
      return '0.00'
    }

    const winning = trades.value.filter(t => grossPnl(t) !== 0 && t.pnl > 0).length
    const losing = trades.value.filter(t => grossPnl(t) !== 0 && t.pnl < 0).length
    const decisive = winning + losing
    return decisive > 0 ? (winning / decisive * 100).toFixed(2) : '0.00'
  })

  const totalTrades = computed(() => {
    if (analytics.value?.summary?.totalTrades !== undefined && !(trades.value.length > 0 && Number(analytics.value.summary.totalTrades || 0) === 0)) {
      return analytics.value.summary.totalTrades
    }

    if (pagination.value.total > 0) {
      return pagination.value.total
    }

    return trades.value.length
  })

  function buildRequestParams(params = {}, options = {}) {
    const merged = {
      ...filters.value,
      ...params
    }

    // The shared filter state stores multi-select filters as arrays (set by
    // the dashboard sync, issue #350). The backend expects comma-separated
    // strings — axios would otherwise serialize arrays as repeated tags[]=
    // params, which the API coerces to '' and either drops the filter or
    // matches nothing. Empty arrays are dropped entirely.
    for (const [key, value] of Object.entries(merged)) {
      if (key === 'accounts') continue // normalizeAccountsFilter handles arrays itself
      if (Array.isArray(value)) {
        if (value.length === 0) {
          delete merged[key]
        } else {
          merged[key] = value.join(',')
        }
      }
    }

    const normalizedAccounts = normalizeAccountsFilter(merged.accounts)
    if (normalizedAccounts) {
      merged.accounts = normalizedAccounts
    } else {
      delete merged.accounts
    }

    if (options.includePagination) {
      merged.limit = pagination.value.limit
      merged.offset = (pagination.value.page - 1) * pagination.value.limit
    }

    if (options.includeSkipCount) {
      merged.skipCount = options.skipCount ? 'true' : 'false'
    }

    return merged
  }

  async function fetchTrades(params = {}) {
    loading.value = true
    const requestGeneration = ++fetchGeneration
    analyticsLoading.value = true
    error.value = null

    try {
      const skipCount = params.skipCount !== false // Default to true for faster initial load
      const requestParams = buildRequestParams(params, {
        includePagination: true,
        includeSkipCount: true,
        skipCount
      })

      // Analytics is independent of the current page. Start it at the same
      // time as the row request, but do not make the user wait for all of the
      // aggregate SQL before the first page can paint.
      const analyticsPromise = requestManager.request('fetchTradesAnalytics', (cancelToken) =>
        api.get('/trades/analytics', {
          params: buildRequestParams(params),
          cancelToken
        })
      ).catch(err => {
        console.warn('Failed to fetch analytics:', err)
        return null
      })

      // Fetch trades with request cancellation support
      const tradesResponsePromise = requestManager.request('fetchTrades', (cancelToken) =>
        api.get('/trades', {
          params: requestParams,
          cancelToken
        })
      )

      const tradesResponse = await tradesResponsePromise

      // If request was cancelled, return early
      if (!tradesResponse) {
        loading.value = false
        return
      }

      // Always use the trades data from the trades API
      if (tradesResponse && tradesResponse.data) {
        if (tradesResponse.data.hasOwnProperty('trades')) {
          trades.value = tradesResponse.data.trades
        } else {
          trades.value = tradesResponse.data
        }
        if (tradesResponse.data.display_currency) {
          tradesCurrency.value = tradesResponse.data.display_currency
        }
      }

      // If count was included in response, use it
      if (tradesResponse.data.total !== undefined && tradesResponse.data.total !== null) {
        pagination.value.total = tradesResponse.data.total
        pagination.value.totalPages = Math.ceil(tradesResponse.data.total / pagination.value.limit)
      }

      // Rows are useful immediately. Finish the aggregate request in the
      // background and only publish it if this request is still current.
      loading.value = false
      initialLoading.value = false
      analyticsPromise.then((analyticsResponse) => {
        if (requestGeneration !== fetchGeneration) return
        analytics.value = analyticsResponse?.data || null
        if (analyticsResponse?.data?.display_currency) {
          tradesCurrency.value = analyticsResponse.data.display_currency
        }
      }).finally(() => {
        if (requestGeneration === fetchGeneration) {
          analyticsLoading.value = false
        }
      })

      // Fetch count if it wasn't included
      if (skipCount && tradesResponse.data.total === null) {
        requestManager.request('fetchTradesCount', (cancelToken) => api.get('/trades/count', {
          params: buildRequestParams(params),
          cancelToken
        })).then(response => {
          if (requestGeneration !== fetchGeneration || !response) return
          pagination.value.total = response.data.total
          pagination.value.totalPages = response.data.totalPages
        }).catch(err => {
          if (requestGeneration !== fetchGeneration) return
          console.warn('Failed to fetch trade count:', err)
        })
      }

      return tradesResponse.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch trades'
      throw err
    } finally {
      // The row request controls the list spinner. Analytics has its own
      // indicator and may continue after this function returns.
      loading.value = false
      initialLoading.value = false
    }
  }

  async function fetchRoundTripTrades(params = {}) {
    loading.value = true
    error.value = null

    try {
      const requestParams = buildRequestParams(params, {
        includePagination: true
      })

      // Fetch both trades and analytics in parallel for better performance
      const [tradesResponse, analyticsResponse] = await Promise.all([
        api.get('/trades/round-trip', {
          params: requestParams
        }),
        api.get('/trades/analytics', {
          params: buildRequestParams(params)
        })
      ])

      // Store analytics data for consistent P&L calculations
      analytics.value = analyticsResponse.data
      if (analyticsResponse?.data?.display_currency) {
        tradesCurrency.value = analyticsResponse.data.display_currency
      }

      // Always use the trades data from the trades API
      if (tradesResponse && tradesResponse.data) {
        if (tradesResponse.data.hasOwnProperty('trades')) {
          trades.value = tradesResponse.data.trades
        } else {
          trades.value = tradesResponse.data
        }
        if (tradesResponse.data.display_currency) {
          tradesCurrency.value = tradesResponse.data.display_currency
        }
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
        params: buildRequestParams(params)
      })

      // Store analytics data for consistent P&L calculations
      analytics.value = analyticsResponse.data
      if (analyticsResponse.data?.display_currency) {
        tradesCurrency.value = analyticsResponse.data.display_currency
      }
      return analyticsResponse.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch analytics'
      throw err
    }
  }

  async function fetchTrade(id, { raw = false } = {}) {
    loading.value = true
    error.value = null

    try {
      // raw=true returns unconverted USD values for the edit-form prefill so
      // a display-converted number can never be saved back as USD.
      const response = await api.get(`/trades/${id}`, {
        params: raw ? { raw_currency: 1 } : undefined
      })
      currentTrade.value = response.data.trade
      if (!raw && response.data.display_currency) {
        tradesCurrency.value = response.data.display_currency
      }
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

  // Refresh everything a bulk metadata edit can affect: the trade list
  // (with a synchronous count so page clamping is reliable), analytics,
  // and the currently open trade detail. Throws only on refresh failure —
  // callers use this to offer a refresh retry WITHOUT re-submitting the edit.
  async function refreshAfterBulkUpdate(tradeIds = []) {
    await fetchTrades({ skipCount: false, suppressAnalytics: true })
    // Trades moved out of the active filter can leave the current page
    // empty; load the last valid page in that case.
    if (trades.value.length === 0
      && pagination.value.total > 0
      && pagination.value.page > pagination.value.totalPages) {
      pagination.value.page = pagination.value.totalPages
      await fetchTrades({ skipCount: false })
    }
    // Ensure the mutation path finishes with a fresh aggregate. A list refresh
    // may have started an earlier request, but this explicit read also keeps
    // the existing mutation contract for callers that await this method.
    await fetchAnalytics()
    if (currentTrade.value && tradeIds.includes(currentTrade.value.id)) {
      await fetchTrade(currentTrade.value.id)
    }
  }

  async function bulkUpdateMetadata(tradeIds, updates) {
    loading.value = true
    error.value = null
    try {
      const response = await api.patch('/trades/bulk', {
        trade_ids: tradeIds,
        updates
      })
      // The mutation succeeded; a failed refresh must not be reported as a
      // failed edit, so it is captured separately for the caller to surface
      // with a refresh-only retry.
      const result = { ...response.data, refresh_failed: false }
      try {
        await refreshAfterBulkUpdate(tradeIds)
      } catch (refreshError) {
        console.error('[BULK EDIT] Refresh after successful update failed:', refreshError)
        result.refresh_failed = true
      }
      return result
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update selected trades'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function importTrades(file, broker, mappingId = null, accountId = null, strategy = null, importOptions = {}) {
    loading.value = true
    error.value = null

    try {
      console.log('Creating FormData with file:', file.name, 'broker:', broker, 'mappingId:', mappingId, 'accountId:', accountId, 'strategy:', strategy)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('broker', broker)
      if (mappingId) {
        formData.append('mappingId', mappingId)
      }
      if (accountId) {
        formData.append('accountId', accountId)
      }
      if (strategy && String(strategy).trim()) {
        formData.append('strategy', String(strategy).trim())
      }
      formData.append('strategy_mode', importOptions.strategy_mode || 'auto')
      formData.append('include_notes', importOptions.include_notes ? 'true' : 'false')
      if (importOptions.account_mode) {
        formData.append('account_mode', importOptions.account_mode)
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

  async function getMonthlyPerformance(year, options = {}) {
    try {
      console.log('[STORE] Fetching monthly performance for year:', year, 'options:', options)
      const params = { year }
      // Support account filtering
      if (options.accounts) {
        params.accounts = options.accounts
      }
      // Tag / strategy filters — backend accepts comma-separated lists.
      if (Array.isArray(options.tags) && options.tags.length > 0) {
        params.tags = options.tags.join(',')
      }
      if (Array.isArray(options.strategies) && options.strategies.length > 0) {
        params.strategies = options.strategies.join(',')
      }
      const response = await api.get('/trades/analytics/monthly', { params })
      console.log('[STORE] Monthly performance response:', response.data)
      return response.data
    } catch (err) {
      console.error('[ERROR] Failed to fetch monthly performance:', err)
      error.value = err.response?.data?.error || 'Failed to fetch monthly performance'
      throw err
    }
  }

  function setFilters(newFilters) {
    // Check for global account filter from localStorage
    // This ensures the global account filter is ALWAYS respected, even on reset
    const globalAccount = normalizeStoredAccount(localStorage.getItem(GLOBAL_ACCOUNT_KEY))

    // If newFilters is empty object, reset all filters
    if (Object.keys(newFilters).length === 0) {
      filters.value = {
        symbol: '',
        symbolExact: false,
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
        importId: '',
        accounts: globalAccount || '', // Preserve global account filter (string format)
        includeArchived: false,
        daysOfWeek: [],
        instrumentTypes: []
      }
    } else {
      // Replace filters entirely with newFilters to ensure cleared fields are actually cleared
      // Start from default empty state, then apply newFilters on top
      const replacedFilters = {
        symbol: '',
        symbolExact: false,
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
        importId: '',
        accounts: '',
        includeArchived: false,
        daysOfWeek: [],
        instrumentTypes: [],
        ...newFilters
      }

      // If global account is set and accounts filter is empty/not specified, apply global account
      if (globalAccount && !newFilters.accounts) {
        replacedFilters.accounts = globalAccount
      }

      filters.value = replacedFilters
    }
    pagination.value.page = 1 // Reset to first page when filtering
  }

  function resetFilters() {
    // Check for global account filter from localStorage
    const globalAccount = normalizeStoredAccount(localStorage.getItem(GLOBAL_ACCOUNT_KEY))

    filters.value = {
      symbol: '',
      symbolExact: false,
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
      importId: '',
      accounts: globalAccount || '', // Preserve global account filter (string format)
      includeArchived: false,
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
    initialLoading,
    analyticsLoading,
    error,
    filters,
    pagination,
    analytics,
    tradesCurrency,
    totalPnL,
    totalNetPnL,
    totalGrossPnL,
    totalCosts,
    winRate,
    winRateExcludingBreakeven,
    totalTrades,
    fetchTrades,
    fetchRoundTripTrades,
    fetchAnalytics,
    fetchTrade,
    createTrade,
    updateTrade,
    deleteTrade,
    bulkDeleteTrades,
    bulkUpdateMetadata,
    refreshAfterBulkUpdate,
    importTrades,
    getMonthlyPerformance,
    setFilters,
    resetFilters,
    setPage,
    nextPage,
    prevPage
  }
})
