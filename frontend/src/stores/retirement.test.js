import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}))

vi.mock('@/services/api', () => ({ default: api }))

import { useRetirementStore } from '@/stores/retirement'

const responseData = {
  plan: null,
  draft_plan: {
    current_age: 40,
    target_retirement_age: 65
  },
  portfolio: {
    scope: 'all_accounts',
    tracked_portfolio_value: 250000,
    position_count: 5,
    available_accounts: [{
      account_identifier: 'ira-1',
      account_name: 'Retirement IRA',
      sources: ['manual_holdings']
    }]
  },
  historical_scenarios: [],
  historical_inflation: {
    source: 'historical_us_cpi_u',
    series_id: 'CUUR0000SA0',
    unavailable: false,
    message: null
  },
  projection: {
    scenarios: [{ key: 'custom', source: 'custom' }]
  },
  has_saved_plan: false
}

describe('retirement store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the saved plan and portfolio scope', async () => {
    api.get.mockResolvedValue({ data: responseData })
    const store = useRetirementStore()

    await store.load({ accounts: 'ira-1' })

    expect(api.get).toHaveBeenCalledWith('/investments/retirement', {
      params: { accounts: 'ira-1' }
    })
    expect(store.portfolio.tracked_portfolio_value).toBe(250000)
    expect(store.portfolio.available_accounts[0].account_name).toBe('Retirement IRA')
    expect(store.historicalInflation.series_id).toBe('CUUR0000SA0')
    expect(store.customScenario.key).toBe('custom')
  })

  it('calculates account-scoped previews without marking the plan saved', async () => {
    api.post.mockResolvedValue({
      data: {
        ...responseData,
        portfolio: { ...responseData.portfolio, scope: 'filtered' }
      }
    })
    const store = useRetirementStore()
    const payload = { current_age: 40 }

    await store.calculate(payload, { accounts: 'ira-1' })

    expect(api.post).toHaveBeenCalledWith(
      '/investments/retirement/calculate',
      payload,
      { params: { accounts: 'ira-1' } }
    )
    expect(store.hasSavedPlan).toBe(false)
    expect(store.plan).toBe(null)
  })

  it('saves the canonical plan and resets it independently of portfolio data', async () => {
    api.put.mockResolvedValue({
      data: {
        ...responseData,
        plan: responseData.draft_plan,
        has_saved_plan: true
      }
    })
    api.delete.mockResolvedValue({ data: { deleted: true } })
    const store = useRetirementStore()

    await store.save(responseData.draft_plan)
    expect(store.hasSavedPlan).toBe(true)

    await store.reset()
    expect(api.delete).toHaveBeenCalledWith('/investments/retirement')
    expect(store.hasSavedPlan).toBe(false)
    expect(store.portfolio.tracked_portfolio_value).toBe(250000)
  })

  it('exposes server validation errors', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Retirement age must be later' } }
    })
    const store = useRetirementStore()

    await expect(store.calculate({})).rejects.toBeTruthy()
    expect(store.error).toBe('Retirement age must be later')
    expect(store.calculating).toBe(false)
  })
})
