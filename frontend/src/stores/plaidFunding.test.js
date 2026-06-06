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
  const { usePlaidFundingStore } = await import('./plaidFunding')
  return usePlaidFundingStore()
}

describe('plaidFunding store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
  })

  it('treats Plaid-unavailable connection fetches as empty optional data', async () => {
    api.get.mockRejectedValue({
      response: {
        status: 503,
        data: { message: 'Plaid integration is not configured on this server' }
      }
    })

    const store = await loadStore()

    await expect(store.fetchConnections()).resolves.toEqual([])
    expect(store.connections).toEqual([])
    expect(store.error).toBe(null)
  })

  it('treats Plaid-unavailable review fetches as an empty queue', async () => {
    api.get.mockRejectedValue({
      response: {
        status: 503,
        data: { message: 'Plaid funding tables are not available' }
      }
    })

    const store = await loadStore()

    await expect(store.fetchReviewQueue('account-1')).resolves.toEqual({
      pending: [],
      history: [],
      synced: []
    })
    expect(store.reviewQueue).toEqual([])
    expect(store.reviewHistory).toEqual([])
    expect(store.syncedActivity).toEqual([])
    expect(store.reviewSummary).toBe(null)
    expect(store.error).toBe(null)
  })
})
