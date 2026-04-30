import { describe, expect, it } from 'vitest'
import { getTradeGrossPnl, getTradeNetPnl, isTradeOpen } from './tradePnl'

describe('tradePnl', () => {
  it('treats trades without exit price and exit time as open', () => {
    expect(isTradeOpen({ entry_price: 100 })).toBe(true)
    expect(getTradeGrossPnl({ pnl: 50, commission: 2, fees: 1 })).toBe(0)
    expect(getTradeNetPnl({ pnl: 50 })).toBe(0)
  })

  it('calculates gross and net P&L for closed trades', () => {
    const trade = {
      exit_price: '105.50',
      pnl: '100.25',
      commission: '4.50',
      fees: '1.25'
    }

    expect(isTradeOpen(trade)).toBe(false)
    expect(getTradeNetPnl(trade)).toBe(100.25)
    expect(getTradeGrossPnl(trade)).toBe(106)
  })

  it('handles empty or invalid numeric fields as zero', () => {
    const trade = {
      exit_time: '2026-04-29T15:30:00Z',
      pnl: 'not-a-number',
      commission: '',
      fees: null
    }

    expect(getTradeNetPnl(trade)).toBe(0)
    expect(getTradeGrossPnl(trade)).toBe(0)
  })
})
