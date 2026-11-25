import { describe, it, expect } from 'vitest'
import {
  classifyTrades,
  summarizeSimulation,
  ruleImpact,
  buildEquitySeries,
  formatMinuteOfDay
} from './whatIfRules'

const T = (h, m) => Date.UTC(2026, 2, 2, h, m)

function trade(overrides) {
  return { d: '2026-03-02', p: 0, f: [], e: null, x: null, m: null, tg: [], pb: null, ...overrides }
}

describe('whatIfRules', () => {
  it('keeps every trade with an empty config', () => {
    const trades = [trade({ p: 10 }), trade({ p: -5 })]
    const result = summarizeSimulation(trades, {})
    expect(result.removedCount).toBe(0)
    expect(result.simulated.totalPnl).toBe(5)
  })

  it('max trades per day keeps the first N trades by entry time, not by list order', () => {
    // List is in exit order; trade B entered first.
    const trades = [
      trade({ p: 100, e: T(15, 0), x: T(15, 5) }), // A entered 2nd
      trade({ p: -50, e: T(14, 0), x: T(16, 0) }), // B entered 1st, exited last
      trade({ p: 30, e: T(15, 30), x: T(15, 40) }) // C entered 3rd
    ]
    const { removed } = classifyTrades(trades, { maxTradesPerDay: 2 })
    expect(removed).toEqual([null, null, 'max_trades'])
  })

  it('max trades per day resets each day', () => {
    const trades = [
      trade({ d: '2026-03-02', p: 1, e: T(14, 0) }),
      trade({ d: '2026-03-02', p: 1, e: T(14, 5) }),
      trade({ d: '2026-03-03', p: 1, e: T(14, 0) + 86400000 })
    ]
    const { removed } = classifyTrades(trades, { maxTradesPerDay: 1 })
    expect(removed).toEqual([null, 'max_trades', null])
  })

  it('daily loss limit only counts trades that closed before the next entry', () => {
    const trades = [
      // Loss of -300 that closes at 15:00
      trade({ p: -300, e: T(14, 0), x: T(15, 0) }),
      // Entered at 14:30 while the loss was still open: allowed
      trade({ p: 40, e: T(14, 30), x: T(14, 45) }),
      // Entered at 15:10 after the loss closed: realized -260 > -250 limit, skipped
      trade({ p: -80, e: T(15, 10), x: T(15, 20) })
    ]
    const { removed } = classifyTrades(trades, { dailyLossLimit: 250 })
    expect(removed).toEqual([null, null, 'daily_loss_limit'])
  })

  it('daily loss limit does not trigger while realized loss is above the limit', () => {
    const trades = [
      trade({ p: -100, e: T(14, 0), x: T(14, 10) }),
      trade({ p: -100, e: T(14, 20), x: T(14, 30) }),
      trade({ p: 500, e: T(14, 40), x: T(14, 50) })
    ]
    const { removed } = classifyTrades(trades, { dailyLossLimit: 250 })
    expect(removed).toEqual([null, null, null])
  })

  it('trades skipped by the loss limit do not count toward later realized P&L', () => {
    const trades = [
      trade({ p: -200, e: T(14, 0), x: T(14, 10) }),
      trade({ p: -900, e: T(14, 20), x: T(14, 30) }), // skipped: realized -200 >= limit
      trade({ p: 50, e: T(14, 40), x: T(14, 50) }) // still at -200 realized, so also skipped
    ]
    const { removed } = classifyTrades(trades, { dailyLossLimit: 200 })
    expect(removed).toEqual([null, 'daily_loss_limit', 'daily_loss_limit'])
  })

  it('treats every earlier trade as realized when entry times are missing', () => {
    const trades = [
      trade({ p: -300 }),
      trade({ p: 50 })
    ]
    const { removed } = classifyTrades(trades, { dailyLossLimit: 250 })
    expect(removed).toEqual([null, 'daily_loss_limit'])
  })

  it('applies single-trade filters before the daily rules', () => {
    const trades = [
      trade({ p: -500, e: T(14, 0), x: T(14, 10), tg: ['fomo'] }),
      trade({ p: 80, e: T(14, 20), x: T(14, 30) })
    ]
    // Without the tag filter the loss limit would skip trade 2; with it, the
    // tagged loss never happens so trade 2 stays.
    expect(classifyTrades(trades, { dailyLossLimit: 250 }).removed).toEqual([null, 'daily_loss_limit'])
    expect(classifyTrades(trades, { dailyLossLimit: 250, tags: ['fomo'] }).removed).toEqual(['tag', null])
  })

  it('entry cutoff removes trades entered at or after the cutoff and keeps trades without a time', () => {
    const trades = [
      trade({ p: 1, m: 10 * 60 + 59 }),
      trade({ p: 1, m: 11 * 60 }),
      trade({ p: 1, m: null })
    ]
    expect(classifyTrades(trades, { entryCutoffMinute: 660 }).removed).toEqual([null, 'entry_cutoff', null])
  })

  it('removes broken-playbook trades only when enabled', () => {
    const trades = [trade({ pb: 'broken' }), trade({ pb: 'followed' }), trade({ pb: null })]
    expect(classifyTrades(trades, {}).removed).toEqual([null, null, null])
    expect(classifyTrades(trades, { skipBrokenPlaybook: true }).removed).toEqual(['broken_playbook', null, null])
  })

  it('removes hindsight patterns by flag', () => {
    const trades = [trade({ f: ['revenge'] }), trade({ f: ['worst_hour'] })]
    expect(classifyTrades(trades, { patternKeys: ['revenge'] }).removed).toEqual(['pattern', null])
  })

  it('reports negative impact honestly when a rule removes winners', () => {
    const trades = [
      trade({ p: 300, e: T(14, 0) }),
      trade({ p: 200, e: T(14, 5) })
    ]
    expect(ruleImpact(trades, { maxTradesPerDay: 1 })).toEqual({ delta: -200, removedCount: 1 })
  })

  it('summarizes win rate and removal reasons', () => {
    const trades = [
      trade({ p: 100, e: T(14, 0), tg: ['a+'] }),
      trade({ p: -50, e: T(14, 5) }),
      trade({ p: 20, e: T(14, 10) })
    ]
    const result = summarizeSimulation(trades, { maxTradesPerDay: 2 })
    expect(result.simulated).toEqual({ tradeCount: 2, totalPnl: 50, winRate: 50 })
    expect(result.removedByReason).toEqual({ max_trades: 1 })
  })

  it('builds cumulative series that skip removed trades', () => {
    const trades = [trade({ p: 10 }), trade({ p: -5 }), trade({ p: 20 })]
    const series = buildEquitySeries(trades, [null, 'tag', null])
    expect(series.actualSeries).toEqual([10, 5, 25])
    expect(series.simSeries).toEqual([10, 10, 30])
  })

  it('formats minutes of the day', () => {
    expect(formatMinuteOfDay(660)).toBe('11:00 AM')
    expect(formatMinuteOfDay(0)).toBe('12:00 AM')
    expect(formatMinuteOfDay(13 * 60 + 30)).toBe('1:30 PM')
  })
})
