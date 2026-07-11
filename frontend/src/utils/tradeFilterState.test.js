import { describe, expect, it } from 'vitest'
import {
  normalizeTradeFiltersForSharedState,
  loadTradeFiltersFromStorage,
  clearDashboardTradeFiltersInStorage
} from './tradeFilterState'

function createStorage(initial = {}) {
  const state = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null
    },
    setItem(key, value) {
      state.set(key, value)
    },
    removeItem(key) {
      state.delete(key)
    }
  }
}

describe('tradeFilterState', () => {
  it('normalizes persisted multi-select filters back into arrays', () => {
    expect(normalizeTradeFiltersForSharedState({
      strategies: 'swing,scalper',
      daysOfWeek: '1,5',
      market_sessions: 'pre_market,post_market',
      tags: ['earnings', 'gap'],
      symbolExact: 'true'
    })).toEqual({
      strategies: ['swing', 'scalper'],
      daysOfWeek: [1, 5],
      market_sessions: ['pre_market', 'post_market'],
      tags: ['earnings', 'gap'],
      symbolExact: true
    })
  })

  it('loads saved filters from storage in normalized form', () => {
    const storage = createStorage({
      tradeFilters: JSON.stringify({
        strategies: 'mean_reversion,breakout',
        tags: 'A+,thesis'
      })
    })

    expect(loadTradeFiltersFromStorage(storage)).toEqual({
      strategies: ['mean_reversion', 'breakout'],
      tags: ['A+', 'thesis']
    })
  })

  it('clears dashboard-managed filters while preserving saved date filters', () => {
    const storage = createStorage({
      tradeFilters: JSON.stringify({
        startDate: '2026-06-01',
        endDate: '2026-06-09',
        tags: ['swing'],
        strategies: ['breakout']
      })
    })

    expect(clearDashboardTradeFiltersInStorage(storage)).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-09'
    })

    expect(JSON.parse(storage.getItem('tradeFilters'))).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-09'
    })
  })

  // Issue #350: the trades filter panel persists symbolExact: false on every
  // apply. Preserving it across Clear all kept a phantom "1 filter active"
  // badge alive on the dashboard that could never be reset.
  it('drops symbolExact: false on clear so no phantom filter survives', () => {
    const storage = createStorage({
      tradeFilters: JSON.stringify({
        tags: ['swing'],
        symbolExact: false
      })
    })

    expect(clearDashboardTradeFiltersInStorage(storage)).toEqual({})
    expect(storage.getItem('tradeFilters')).toBeNull()
  })

  it('preserves symbolExact: true on clear', () => {
    const storage = createStorage({
      tradeFilters: JSON.stringify({
        tags: ['swing'],
        symbolExact: true
      })
    })

    expect(clearDashboardTradeFiltersInStorage(storage)).toEqual({
      symbolExact: true
    })
  })
})
