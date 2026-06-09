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
      tags: ['earnings', 'gap'],
      symbolExact: 'true'
    })).toEqual({
      strategies: ['swing', 'scalper'],
      daysOfWeek: [1, 5],
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
})
