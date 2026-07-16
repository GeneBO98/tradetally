import { describe, expect, it } from 'vitest'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'
import {
  calculateChartPnlMeasurement,
  formatSignedChartCurrency,
  formatSignedChartPercent,
} from './chartPnlMeasurement'

describe('chart P&L measurement contracts', () => {
  it.each(contracts.chart_pnl_measurement_cases)('$id', ({ input, expected }) => {
    const measurement = calculateChartPnlMeasurement(input)

    expect(measurement.price_change).toBeCloseTo(expected.price_change, 8)
    expect(measurement.position_basis).toBeCloseTo(expected.position_basis, 8)
    expect(measurement.pnl_percent).toBeCloseTo(expected.pnl_percent, 8)
    expect(measurement.dollar_pnl).toBeCloseTo(expected.dollar_pnl, 8)
  })

  it('formats signed currency and percentages for the chart label', () => {
    expect(formatSignedChartCurrency(125, 'USD')).toBe('+$125.00')
    expect(formatSignedChartCurrency(-40, 'USD')).toBe('-$40.00')
    expect(formatSignedChartPercent(5)).toBe('+5.00%')
    expect(formatSignedChartPercent(-5)).toBe('-5.00%')
  })
})
