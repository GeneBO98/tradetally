import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useReplayEngine, interpolateBar } from './useReplayEngine'

function makeCandles(count, startEpoch = 1700000400, stepSeconds = 60) {
  return Array.from({ length: count }, (_, i) => ({
    time: startEpoch + i * stepSeconds,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 1000
  }))
}

describe('interpolateBar', () => {
  it('starts at open, expands high/low monotonically, and matches exact OHLCV at progress=1', () => {
    const bar = { time: 1000, open: 100, high: 106, low: 98, close: 104, volume: 600 }

    const start = interpolateBar(bar, 0)
    expect(start).toEqual({ time: 1000, open: 100, high: 100, low: 100, close: 100, volume: 0 })

    // Bullish path hits low at p=0.25, high at p=0.75, close at p=1
    const quarter = interpolateBar(bar, 0.25)
    expect(quarter.close).toBe(98)
    expect(quarter.low).toBe(98)
    expect(quarter.high).toBe(100)

    const threeQuarters = interpolateBar(bar, 0.75)
    expect(threeQuarters.close).toBe(106)
    expect(threeQuarters.low).toBe(98)
    expect(threeQuarters.high).toBe(106)

    const end = interpolateBar(bar, 1)
    expect(end).toEqual(bar)
  })

  it('routes the forming candle through real fill prices and still ends on the exact candle', () => {
    const bar = { time: 1000, open: 100, high: 106, low: 98, close: 104, volume: 600 }
    const anchors = [{ p: 0.5, price: 103.4 }, { p: 0.25, price: 99.2 }]

    // The price at each fill moment is the fill price, not an estimate
    expect(interpolateBar(bar, 0.5, anchors).close).toBeCloseTo(103.4, 10)
    expect(interpolateBar(bar, 0.25, anchors).close).toBeCloseTo(99.2, 10)

    // The pivot that shared the 0.25 slot moved aside, so the real low and high are both still reached
    let lowSeen = Infinity
    let highSeen = -Infinity
    let previous = interpolateBar(bar, 0, anchors)
    for (let step = 1; step < 1000; step += 1) {
      const live = interpolateBar(bar, step / 1000, anchors)
      expect(live.high).toBeGreaterThanOrEqual(previous.high)
      expect(live.low).toBeLessThanOrEqual(previous.low)
      expect(live.high).toBeLessThanOrEqual(bar.high)
      expect(live.low).toBeGreaterThanOrEqual(bar.low)
      lowSeen = Math.min(lowSeen, live.low)
      highSeen = Math.max(highSeen, live.high)
      previous = live
    }
    expect(lowSeen).toBeCloseTo(98, 1)
    expect(highSeen).toBeCloseTo(106, 1)
    expect(interpolateBar(bar, 1, anchors)).toEqual(bar)

    // A fill price outside the candle's range is clamped to it
    expect(interpolateBar(bar, 0.5, [{ p: 0.5, price: 120 }]).close).toBe(106)
  })
})

describe('useReplayEngine real-time playback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T14:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to 1x real time where 1 real second advances 1 market second on 1-min candles', () => {
    const engine = useReplayEngine()
    const candles = makeCandles(5, 1700000400, 60)
    engine.load({
      candles,
      fills: [{ time: candles[2].time + 20, price: 102, quantity: 10, action: 'buy' }],
      trade: { side: 'long', entry_price: 102, quantity: 10, multiplier: 1 },
      resolution: '1min'
    })

    expect(engine.speed.value).toBe(1)
    // Starts 1 completed bar before entry bar (index 1)
    expect(engine.cursor.value).toBe(1)
    expect(engine.executedFills.value).toHaveLength(0)

    // Press play: immediately begins forming bar 2 (the entry bar) at t+0s
    engine.play()
    expect(engine.cursor.value).toBe(2)
    expect(engine.barProgress.value).toBe(0)
    expect(engine.currentTime.value).toBe(candles[2].time)

    // After 10 real seconds at 1x -> +10 market seconds, still inside bar 2, fill at +20s not executed yet
    vi.advanceTimersByTime(10_000)
    expect(engine.cursor.value).toBe(2)
    expect(engine.currentTime.value).toBe(candles[2].time + 10)
    expect(engine.executedFills.value).toHaveLength(0)

    // After 10 more real seconds (total 20s) -> fill triggers right at +20s!
    vi.advanceTimersByTime(10_000)
    expect(engine.cursor.value).toBe(2)
    expect(engine.currentTime.value).toBe(candles[2].time + 20)
    expect(engine.executedFills.value).toHaveLength(1)

    // After 40 more real seconds (total 60s) -> moves to bar 3
    vi.advanceTimersByTime(40_000)
    expect(engine.cursor.value).toBe(3)
    expect(engine.currentTime.value).toBe(candles[3].time)

    engine.pause()
  })

  it('advances 1 minute candle per real second at 60x speed', () => {
    const engine = useReplayEngine()
    const candles = makeCandles(5, 1700000400, 60)
    engine.load({ candles, fills: [], trade: null, resolution: '1min' })
    engine.setSpeed(60)
    engine.play() // starts forming bar 1 at progress=0

    expect(engine.cursor.value).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(engine.cursor.value).toBe(2)

    vi.advanceTimersByTime(2000)
    expect(engine.cursor.value).toBe(4)
    expect(engine.playing.value).toBe(true)

    // Final 1 second finishes forming the last bar and stops playback
    vi.advanceTimersByTime(1000)
    expect(engine.playing.value).toBe(false)
    expect(engine.atEnd.value).toBe(true)
  })

  it('marks unrealized P&L against the real fill price and lands on realized P&L at the exit', () => {
    const engine = useReplayEngine()
    const candles = [
      { time: 1700000400, open: 99, high: 100, low: 98, close: 100, volume: 1000 },
      { time: 1700000460, open: 100, high: 110, low: 96, close: 108, volume: 1000 },
      { time: 1700000520, open: 108, high: 112, low: 107, close: 111, volume: 1000 }
    ]
    // Buy at second 30 of bar 1 for 104.5, sell at second 30 of bar 2 for 109.25
    engine.load({
      candles,
      fills: [
        { time: candles[1].time + 30, price: 104.5, quantity: 10, action: 'buy' },
        { time: candles[2].time + 30, price: 109.25, quantity: 10, action: 'sell' }
      ],
      trade: { side: 'long', entry_price: 104.5, quantity: 10, multiplier: 1 },
      resolution: '1min'
    })

    engine.play()
    // Replay starts on the completed bar before entry, so 30s reaches the entry second
    vi.advanceTimersByTime(30_000)
    expect(engine.cursor.value).toBe(1)
    expect(engine.liveBar.value.close).toBeCloseTo(104.5, 6)
    expect(engine.stats.value.position).toBe(10)
    expect(engine.stats.value.avg_cost).toBe(104.5)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(0, 6)

    // End of the entry bar: marked at the real close against the real cost
    vi.advanceTimersByTime(30_000)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo((108 - 104.5) * 10, 6)

    // Just before the exit second the open P&L has converged on what the exit realizes
    vi.advanceTimersByTime(29_900)
    expect(engine.stats.value.position).toBe(10)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(47.5, 0)
    vi.advanceTimersByTime(100)
    expect(engine.stats.value.position).toBe(0)
    expect(engine.stats.value.realized_pnl).toBeCloseTo(47.5, 6)
    expect(engine.stats.value.total_pnl).toBeCloseTo(47.5, 6)
    engine.pause()
  })

  it('falls back to chart-to-chart P&L when a fill is on a different price scale than the candles', () => {
    const engine = useReplayEngine()
    const candles = [
      { time: 1700000400, open: 99, high: 100, low: 98, close: 100, volume: 1000 },
      { time: 1700000460, open: 100, high: 110, low: 100, close: 110, volume: 1000 },
      { time: 1700000520, open: 110, high: 112, low: 109, close: 111, volume: 1000 }
    ]
    // An option bought for 2.50 while the chart shows the underlying near 100
    engine.load({
      candles,
      fills: [{ time: candles[1].time + 30, price: 2.5, quantity: 1, action: 'buy' }],
      trade: { side: 'long', entry_price: 2.5, quantity: 1, multiplier: 100 },
      resolution: '1min'
    })

    engine.play()
    vi.advanceTimersByTime(30_000)
    // No false spike toward the fill price, and no P&L from comparing 2.50 to ~105
    expect(engine.liveBar.value.close).toBeGreaterThan(100)
    expect(engine.stats.value.position).toBe(1)
    expect(engine.stats.value.avg_cost).toBe(2.5)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(0, 6)

    vi.advanceTimersByTime(30_000)
    const basis = engine.liveBar.value.close - engine.stats.value.unrealized_pnl / 100
    expect(basis).toBeGreaterThan(100)
    expect(basis).toBeLessThan(110)
    engine.pause()
  })

  it('steps daily degraded mode at 1 bar/sec at 1x instead of waiting 24 hours', () => {
    const engine = useReplayEngine()
    const candles = makeCandles(4, 1700000400, 86400)
    engine.load({ candles, fills: [], trade: null, resolution: 'daily', degraded: true })
    engine.play()

    expect(engine.cursor.value).toBe(0)
    vi.advanceTimersByTime(1000)
    expect(engine.cursor.value).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(engine.cursor.value).toBe(2)
    engine.pause()
  })

  it('keeps unrealized P&L continuous across entry-bar rollover, pause, and seek (no rollover snap)', () => {
    const engine = useReplayEngine()
    // Bar 1 opens at 100, dips to 100, rises to 110, closes at 110; bar 2 opens flat at 110
    const candles = [
      { time: 1700000400, open: 99, high: 100, low: 98, close: 100, volume: 1000 },
      { time: 1700000460, open: 100, high: 110, low: 100, close: 110, volume: 1000 },
      { time: 1700000520, open: 110, high: 112, low: 109, close: 111, volume: 1000 }
    ]
    // Buy 1 share at second 0 of bar 1 (fillProgress = 0 -> interpolated market basis = 100)
    engine.load({
      candles,
      fills: [{ time: candles[1].time, price: 100, quantity: 1, action: 'buy' }],
      trade: { side: 'long', entry_price: 100, quantity: 1, multiplier: 1 },
      resolution: '1min'
    })

    engine.play()
    // Advance 59.9s (almost end of bar 1 -> markPrice near 110, unrealized ~+$10)
    vi.advanceTimersByTime(59_900)
    expect(engine.cursor.value).toBe(1)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(10, 1)

    // Roll over to bar 2 at t+0s (bar 2 opens at 110 -> unrealized MUST stay +$10, NOT snap to $0)
    vi.advanceTimersByTime(100)
    expect(engine.cursor.value).toBe(2)
    expect(engine.liveBar.value.close).toBe(110)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(10, 5)

    // Seeking to completed bar 1 (close 110) also keeps unrealized at +$10
    engine.seek(1)
    expect(engine.stats.value.unrealized_pnl).toBeCloseTo(10, 5)
    engine.pause()
  })

  it('animates from progress 0 when the first fill occurs in bar 0 or on a 1-candle replay', () => {
    const engine = useReplayEngine()
    const candles = makeCandles(3, 1700000400, 60)
    engine.load({
      candles,
      fills: [{ time: candles[0].time + 25, price: 100, quantity: 5, action: 'buy' }],
      trade: { side: 'long', entry_price: 100, quantity: 5, multiplier: 1 },
      resolution: '1min'
    })

    // Fill at +25s must NOT be executed before pressing Play
    expect(engine.cursor.value).toBe(0)
    expect(engine.barProgress.value).toBe(0)
    expect(engine.executedFills.value).toHaveLength(0)

    engine.play()
    vi.advanceTimersByTime(24_000)
    expect(engine.cursor.value).toBe(0)
    expect(engine.executedFills.value).toHaveLength(0)

    vi.advanceTimersByTime(1_000)
    expect(engine.cursor.value).toBe(0)
    expect(engine.executedFills.value).toHaveLength(1)

    // Jump to entry resets cleanly back to progress 0 before the fill
    engine.jumpToEntry()
    expect(engine.cursor.value).toBe(0)
    expect(engine.barProgress.value).toBe(0)
    expect(engine.executedFills.value).toHaveLength(0)

    // Single-candle replay also animates cleanly and can restart
    const single = useReplayEngine()
    single.load({ candles: makeCandles(1, 1700000400, 60), fills: [], trade: null, resolution: '1min' })
    expect(single.cursor.value).toBe(0)
    expect(single.barProgress.value).toBe(0)
    single.play()
    vi.advanceTimersByTime(30_000)
    expect(single.barProgress.value).toBeCloseTo(0.5, 2)
    vi.advanceTimersByTime(30_000)
    expect(single.atEnd.value).toBe(true)
    expect(single.playing.value).toBe(false)
    // Pressing play at end restarts from progress 0
    single.play()
    expect(single.barProgress.value).toBe(0)
    expect(single.playing.value).toBe(true)
    single.pause()
  })

  it('pauses cleanly when the tab becomes hidden via visibilitychange', () => {
    const engine = useReplayEngine()
    engine.load({ candles: makeCandles(5, 1700000400, 60), fills: [], trade: null, resolution: '1min' })
    engine.play()
    expect(engine.playing.value).toBe(true)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(engine.playing.value).toBe(false)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('supports barStepMode for Backtest Sandbox with completed candles and classic speed options', () => {
    const engine = useReplayEngine({ barStepMode: true })
    const candles = makeCandles(5, 1700000400, 60)
    engine.load({ candles, fills: [], trade: null, resolution: '1min' })

    expect(engine.SPEED_OPTIONS).toEqual([1, 2, 5, 10, 30])
    expect(engine.barProgress.value).toBe(1)
    expect(engine.liveBar.value).toEqual(candles[0])

    engine.play()
    vi.advanceTimersByTime(700)
    expect(engine.cursor.value).toBe(1)
    expect(engine.liveBar.value).toEqual(candles[1])
    expect(engine.currentTime.value).toBe(candles[1].time)
    engine.pause()
  })

  it('uses an 86400s bar span for single-candle daily replays so intraday fills past +60s still execute', () => {
    const engine = useReplayEngine()
    const dayStart = 1700006400
    engine.load({
      candles: [{ time: dayStart, open: 100, high: 110, low: 98, close: 108, volume: 50000 }],
      fills: [
        { time: dayStart + 3600 * 10, price: 101, quantity: 10, action: 'buy' },
        { time: dayStart + 3600 * 15, price: 107, quantity: 10, action: 'sell' }
      ],
      trade: { side: 'long', entry_price: 101, quantity: 10, multiplier: 1 },
      resolution: 'daily',
      degraded: true
    })

    // Daily degraded mode completes bar 0 across 86400s so both intraday fills at +10h and +15h execute
    expect(engine.executedFills.value).toHaveLength(2)
    expect(engine.stats.value.realized_pnl).toBeCloseTo(60, 5)
  })
})
