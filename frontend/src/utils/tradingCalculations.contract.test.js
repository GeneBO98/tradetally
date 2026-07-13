import { describe, expect, it } from 'vitest'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'
import { getTradeGrossPnl, getTradeNetPnl } from './tradePnl'

describe('trading calculation display contracts', () => {
  it('keeps frontend net/gross totals aligned with shared analytics fixture', () => {
    const { trades, expected } = contracts.analytics_summary

    const totalNet = trades.reduce((sum, trade) => sum + getTradeNetPnl(trade), 0)
    const totalGross = trades.reduce((sum, trade) => sum + getTradeGrossPnl(trade), 0)
    const totalCosts = trades.reduce((sum, trade) => {
      return sum + Number(trade.commission || 0) + Number(trade.fees || 0)
    }, 0)

    expect(totalNet).toBeCloseTo(expected.total_pnl, 8)
    expect(totalCosts).toBeCloseTo(expected.total_costs, 8)
    expect(totalGross).toBeCloseTo(expected.total_gross_pnl, 8)
  })

  it('keeps per-trade gross P&L equal to net P&L plus stored costs', () => {
    for (const trade of contracts.analytics_summary.trades) {
      const expectedGross = Number(trade.pnl || 0) + Number(trade.commission || 0) + Number(trade.fees || 0)

      expect(getTradeNetPnl(trade)).toBeCloseTo(Number(trade.pnl), 8)
      expect(getTradeGrossPnl(trade)).toBeCloseTo(expectedGross, 8)
    }
  })

  it('displays the expected net and gross P&L for an option that expired worthless', () => {
    const fixture = contracts.pnl_engine_cases.find(({ id }) => id === 'short_option_expired_worthless')
    const trade = {
      ...fixture.expected.aggregate,
      exit_time: fixture.input.executions[0].exitTime
    }

    expect(getTradeNetPnl(trade)).toBeCloseTo(9.48, 8)
    expect(getTradeGrossPnl(trade)).toBeCloseTo(10, 8)
  })
})
