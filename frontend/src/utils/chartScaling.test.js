import { describe, expect, it } from 'vitest'
import { findOutliers, inverseSymlog, magnitudeOutlierTest, symlog, symlogTicks } from './chartScaling'

describe('magnitudeOutlierTest', () => {
  it('flags only values orders of magnitude beyond a skewed, near-zero cluster', () => {
    // Shape of real MAE/MFE data: most trades near zero, a long but normal
    // tail, and one bad data point.
    const values = [0, 0, 0, 1, 2, 3, 5, 8, 12, 20, 35, 60, 90, 150, 400, 800, 1500, 166000]
    const isOutlier = magnitudeOutlierTest(values)
    expect(values.filter(isOutlier)).toEqual([166000])
  })

  it('is unit independent', () => {
    const dollars = [10, 20, 30, 40, 55, 70, 90, 120, 200, 50000]
    const r = dollars.map(value => value / 250)
    expect(dollars.filter(magnitudeOutlierTest(dollars))).toEqual([50000])
    expect(r.filter(magnitudeOutlierTest(r))).toEqual([200])
  })

  it('never flags anything without enough data', () => {
    expect([1, 1000000].filter(magnitudeOutlierTest([1, 1000000]))).toEqual([])
  })
})

describe('findOutliers', () => {
  it('returns items extreme on any metric, including negatives', () => {
    const trades = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: i, mfe: 50 + i * 10, pnl: (i % 2 ? 1 : -1) * (20 + i * 5) })),
      { id: 'big-mfe', mfe: 250000, pnl: -500 },
      { id: 'big-loss', mfe: 40, pnl: -900000 }
    ]
    const outliers = findOutliers(trades, [t => t.mfe, t => t.pnl])
    expect([...outliers].map(t => t.id).sort()).toEqual(['big-loss', 'big-mfe'])
  })
})

describe('symlog', () => {
  it('round-trips and keeps sign', () => {
    for (const value of [-12345, -1, 0, 0.05, 2, 99999]) {
      expect(inverseSymlog(symlog(value, 1), 1)).toBeCloseTo(value, 6)
      expect(Math.sign(symlog(value))).toBe(Math.sign(value))
    }
    expect(inverseSymlog(symlog(-3.5, 0.1), 0.1)).toBeCloseTo(-3.5, 6)
  })

  it('places ticks at zero and powers of ten on both sides', () => {
    const ticks = symlogTicks(symlog(-1000), symlog(200000)).map(t => Math.round(inverseSymlog(t.value)))
    expect(ticks).toEqual([-1000, -100, -10, 0, 10, 100, 1000, 10000, 100000])
  })

  it('keeps the threshold ticks on narrow axes', () => {
    const ticks = symlogTicks(symlog(-0.5, 0.1), symlog(2, 0.1), 0.1).map(t => Number(inverseSymlog(t.value, 0.1).toFixed(2)))
    expect(ticks).toEqual([-0.1, 0, 0.1, 1])
  })
})
