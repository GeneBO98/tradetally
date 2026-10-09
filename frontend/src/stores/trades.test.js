// Issue #350: the dashboard syncs shared filters into this store as arrays.
// Requests must serialize them as comma-separated strings — axios would send
// repeated tags[]= params that the backend coerces to '' (filter silently
// dropped) or [''] (matches nothing).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

async function loadStore() {
  vi.resetModules()
  const { useTradesStore } = await import('./trades')
  return useTradesStore()
}

describe('trades store request params', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    localStorage.clear()
  })

  it('serializes array filters as comma-separated strings', async () => {
    const store = await loadStore()
    store.setFilters({
      tags: ['earnings', 'gap'],
      strategies: ['breakout'],
      daysOfWeek: [1, 5]
    })

    api.get.mockResolvedValue({ data: {} })
    await store.fetchAnalytics()

    const [, config] = api.get.mock.calls[0]
    expect(config.params.tags).toBe('earnings,gap')
    expect(config.params.strategies).toBe('breakout')
    expect(config.params.daysOfWeek).toBe('1,5')
    for (const value of Object.values(config.params)) {
      expect(Array.isArray(value)).toBe(false)
    }
  })

  it('drops empty array filters from request params', async () => {
    const store = await loadStore()
    store.setFilters({ tags: [], strategies: ['breakout'] })

    api.get.mockResolvedValue({ data: {} })
    await store.fetchAnalytics()

    const [, config] = api.get.mock.calls[0]
    expect('tags' in config.params).toBe(false)
    expect(config.params.strategies).toBe('breakout')
  })

  it('sends the account mode on import so None can mean no account', async () => {
    const store = await loadStore()
    api.post.mockResolvedValue({ data: { importId: 'imp-1' } })
    const file = new File(['a,b'], 'trades.csv', { type: 'text/csv' })

    await store.importTrades(file, 'sierrachart', null, null, null, { account_mode: 'none' })

    const [url, formData] = api.post.mock.calls[0]
    expect(url).toBe('/trades/import')
    expect(formData.get('account_mode')).toBe('none')
  })

  it('bulk updates metadata and refreshes trades and analytics', async () => {
    const store = await loadStore()
    api.patch.mockResolvedValue({ data: { updated_trade_count: 2 } })
    api.get.mockResolvedValue({ data: { trades: [], summary: {} } })

    const result = await store.bulkUpdateMetadata(['trade-1', 'trade-2'], { setup: null, strategy: 'Breakout' })

    expect(api.patch).toHaveBeenCalledWith('/trades/bulk', {
      trade_ids: ['trade-1', 'trade-2'],
      updates: { setup: null, strategy: 'Breakout' }
    })
    expect(api.get.mock.calls.filter(([url]) => url === '/trades')).toHaveLength(1)
    expect(api.get.mock.calls.filter(([url]) => url === '/trades/analytics')).toHaveLength(2)
    // A synchronous count is requested so page clamping is reliable
    const tradesCall = api.get.mock.calls.find(([url]) => url === '/trades')
    expect(tradesCall[1].params.skipCount).toBe('false')
    expect(result).toEqual({ updated_trade_count: 2, refresh_failed: false })
  })

  it('bulk updates metadata using the current filters on refresh', async () => {
    const store = await loadStore()
    store.setFilters({ accounts: 'ACC-1', strategy: 'Momentum', tags: ['gap'] })
    api.patch.mockResolvedValue({ data: { updated_trade_count: 1 } })
    api.get.mockResolvedValue({ data: { trades: [], total: 0, summary: {} } })

    await store.bulkUpdateMetadata(['trade-1'], { account_identifier: null })

    const tradesCall = api.get.mock.calls.find(([url]) => url === '/trades')
    expect(tradesCall[1].params.accounts).toBe('ACC-1')
    expect(tradesCall[1].params.strategy).toBe('Momentum')
    expect(tradesCall[1].params.tags).toBe('gap')
    // Filters survive the bulk edit untouched
    expect(store.filters.accounts).toBe('ACC-1')
    expect(store.filters.strategy).toBe('Momentum')
  })

  it('refreshes an open currentTrade when it was part of the bulk edit', async () => {
    const store = await loadStore()
    store.currentTrade = { id: 'trade-1' }
    api.patch.mockResolvedValue({ data: { updated_trade_count: 1 } })
    api.get.mockImplementation(url => Promise.resolve({
      data: url === '/trades/trade-1' ? { trade: { id: 'trade-1', setup: null } } : { data: [] }
    }))

    await store.bulkUpdateMetadata(['trade-1'], { setup: null })

    expect(api.get.mock.calls.some(([url]) => url === '/trades/trade-1')).toBe(true)
    expect(store.currentTrade.setup).toBeNull()
  })

  it('distinguishes a failed refresh from a failed mutation', async () => {
    const store = await loadStore()
    api.patch.mockResolvedValue({ data: { updated_trade_count: 2 } })
    api.get.mockImplementation(url => {
      if (url === '/trades') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: { summary: {} } })
    })

    const result = await store.bulkUpdateMetadata(['trade-1', 'trade-2'], { strategy: 'Momentum' })

    // Resolves rather than rejects — the edit itself succeeded
    expect(result).toEqual({ updated_trade_count: 2, refresh_failed: true })
  })

  it('offers a refresh retry that never re-submits the edit', async () => {
    const store = await loadStore()
    api.patch.mockResolvedValue({ data: { updated_trade_count: 2 } })
    let tradeListFetches = 0
    api.get.mockImplementation(url => {
      if (url === '/trades') {
        tradeListFetches += 1
        if (tradeListFetches === 1) return Promise.reject(new Error('network down'))
        return Promise.resolve({ data: { trades: [], total: 0 } })
      }
      return Promise.resolve({ data: { summary: {} } })
    })

    const result = await store.bulkUpdateMetadata(['trade-1', 'trade-2'], { strategy: 'Momentum' })
    expect(result.refresh_failed).toBe(true)

    await store.refreshAfterBulkUpdate(['trade-1', 'trade-2'])

    // The edit is not submitted again
    expect(api.patch).toHaveBeenCalledTimes(1)
    expect(api.get.mock.calls.filter(([url]) => url === '/trades')).toHaveLength(2)
  })

  it('loads the last valid page when the current page becomes invalid', async () => {
    const store = await loadStore()
    store.setPage(2)
    api.patch.mockResolvedValue({ data: { updated_trade_count: 2 } })
    // Every fetch reports only 30 matching trades (single page)
    api.get.mockResolvedValue({ data: { trades: [], total: 30, summary: {} } })

    await store.bulkUpdateMetadata(['trade-1', 'trade-2'], { account_identifier: 'ACC-1' })

    expect(store.pagination.page).toBe(1)
    const tradesCalls = api.get.mock.calls.filter(([url]) => url === '/trades')
    expect(tradesCalls).toHaveLength(2)
    expect(tradesCalls[0][1].params.offset).toBe(50)
    expect(tradesCalls[1][1].params.offset).toBe(0)
  })

  it('reports a failed mutation as an error', async () => {
    const store = await loadStore()
    api.patch.mockRejectedValue({ response: { data: { error: 'One or more selected trades were not found' } } })

    await expect(store.bulkUpdateMetadata(['trade-1'], { setup: 'Gap' }))
      .rejects.toMatchObject({ response: { data: { error: 'One or more selected trades were not found' } } })

    expect(store.error).toBe('One or more selected trades were not found')
    // No refreshes after a failed mutation
    expect(api.get).not.toHaveBeenCalled()
  })
})
