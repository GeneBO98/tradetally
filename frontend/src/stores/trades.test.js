// Issue #350: the dashboard syncs shared filters into this store as arrays.
// Requests must serialize them as comma-separated strings — axios would send
// repeated tags[]= params that the backend coerces to '' (filter silently
// dropped) or [''] (matches nothing).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn()
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
})
