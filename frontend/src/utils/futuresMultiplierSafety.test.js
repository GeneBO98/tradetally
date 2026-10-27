import { describe, expect, it } from 'vitest'
import { calculateChartPnlMeasurement } from './chartPnlMeasurement'
import { daily_position_pnl } from './dailyPositionPnl'
import { plan_bar } from './positionRangeBars'

describe('futures dollar displays', () => {
  it.each([undefined, null, 0, -1, Infinity])('requires a positive, finite point value (%s)', point_value => {
    expect(calculateChartPnlMeasurement({ instrument_type: 'future', point_value, entry_price: 100, exit_price: 110 })).toBeNull()
    expect(daily_position_pnl({ instrument_type: 'future', point_value, day_change: 10, total_quantity: 1 })).toBeNull()
    expect(plan_bar({ instrument_type: 'future', point_value, side: 'long', avgPrice: 100, currentPrice: 110,
      totalQuantity: 1, stop_loss: 90, take_profit: 120 })).toBeNull()
  })

  it('preserves fractional Micro Bitcoin economics', () => {
    expect(calculateChartPnlMeasurement({ instrument_type: 'future', point_value: 0.1, quantity: 5,
      entry_price: 83865, exit_price: 84645 }).dollar_pnl).toBeCloseTo(390)
    expect(daily_position_pnl({ instrument_type: 'future', point_value: 0.1, day_change: 780, total_quantity: 5 })).toBeCloseTo(390)
  })
})
