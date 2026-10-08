import { describe, expect, it } from 'vitest'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'
import { plan_bar, range_bar } from './positionRangeBars'

describe('plan_bar', () => {
  it.each(contracts.position_plan_bar_cases)('$id', ({ position, expected }) => {
    const actual = plan_bar(position)
    if (expected === null) {
      expect(actual).toBeNull()
      return
    }
    expect(actual.current_pct).toBeCloseTo(expected.current_pct, 8)
    expect(actual.at_stop_amount).toBeCloseTo(expected.at_stop_amount, 8)
    expect(actual.at_target_amount).toBeCloseTo(expected.at_target_amount, 8)
  })

  it('flags a reached target and clamps the marker', () => {
    const bar = plan_bar({ side: 'long', avgPrice: 10, currentPrice: 16, totalQuantity: 1, stop_loss: 9, take_profit: 15 })
    expect(bar.target_reached).toBe(true)
    expect(bar.current_pct).toBe(100)
  })
})

describe('range_bar', () => {
  const position = { side: 'long', avgPrice: 88.76, currentPrice: 139.75 }

  it('places entry and current price inside the 52-week range', () => {
    const bar = range_bar(position, { week_52_high: 160.2, week_52_low: 82.1 })
    expect(bar.current_pct).toBeCloseTo(((139.75 - 82.1) / (160.2 - 82.1)) * 100, 8)
    expect(bar.entry_pct).toBeCloseTo(((88.76 - 82.1) / (160.2 - 82.1)) * 100, 8)
    expect(bar.below_high_pct).toBeCloseTo(((160.2 - 139.75) / 160.2) * 100, 8)
    expect(bar.in_profit).toBe(true)
  })

  it('widens the range when the price prints a new low', () => {
    const bar = range_bar({ side: 'long', avgPrice: 1.08, currentPrice: 0.9 }, { week_52_high: 3.42, week_52_low: 0.94 })
    expect(bar.low).toBe(0.9)
    expect(bar.current_pct).toBe(0)
    expect(bar.at_low).toBe(true)
    expect(bar.in_profit).toBe(false)
  })

  it('treats a short as profitable below entry', () => {
    const bar = range_bar({ side: 'short', avgPrice: 412, currentPrice: 389.5 }, { week_52_high: 488.5, week_52_low: 182 })
    expect(bar.in_profit).toBe(true)
  })

  it('returns null without a usable range or quote', () => {
    expect(range_bar(position, null)).toBeNull()
    expect(range_bar(position, { week_52_high: 50, week_52_low: 60 })).toBeNull()
    expect(range_bar({ ...position, currentPrice: null }, { week_52_high: 160, week_52_low: 80 })).toBeNull()
  })
})
