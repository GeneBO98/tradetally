import { describe, it, expect } from 'vitest'
import {
  positionFxRate,
  toAccountCurrency,
  positionsMissingRate,
  needsCurrencyNote,
  sumInAccountCurrency
} from './positionTotals'

const eur = (over = {}) => ({ currency: 'EUR', fx_rate: 1.5, totalCost: 100, ...over })
const usd = (over = {}) => ({ currency: 'USD', fx_rate: 1, totalCost: 100, ...over })

describe('positionFxRate', () => {
  it('rejects a null rate rather than reading it as zero', () => {
    expect(positionFxRate({ fx_rate: null })).toBeNull()
    expect(positionFxRate({ fx_rate: undefined })).toBeNull()
    expect(positionFxRate({ fx_rate: '' })).toBeNull()
  })

  it('rejects a rate that is not finite and positive', () => {
    expect(positionFxRate({ fx_rate: 0 })).toBeNull()
    expect(positionFxRate({ fx_rate: -1 })).toBeNull()
    expect(positionFxRate({ fx_rate: 'abc' })).toBeNull()
  })

  it('accepts the camelCase spelling for compatibility', () => {
    expect(positionFxRate({ fxRate: 1.5 })).toBe(1.5)
  })
})

describe('toAccountCurrency', () => {
  it('converts a foreign value at the supplied rate', () => {
    expect(toAccountCurrency(100, eur(), 'USD')).toBe(150)
  })

  it('passes an account-currency value through untouched', () => {
    expect(toAccountCurrency(100, usd(), 'USD')).toBe(100)
  })

  it('returns null for a foreign position with no rate', () => {
    expect(toAccountCurrency(100, eur({ fx_rate: null }), 'USD')).toBeNull()
  })

  it('returns null rather than zero for an unavailable value', () => {
    expect(toAccountCurrency(null, usd(), 'USD')).toBeNull()
    expect(toAccountCurrency(undefined, usd(), 'USD')).toBeNull()
  })

  it('returns null when the position states no currency', () => {
    expect(toAccountCurrency(100, { currency: null, fx_rate: 1.5 }, 'USD')).toBeNull()
  })
})

describe('positionsMissingRate', () => {
  it('flags a foreign position with no usable rate', () => {
    expect(positionsMissingRate([eur({ fx_rate: null })], 'USD')).toHaveLength(1)
    expect(positionsMissingRate([eur({ fx_rate: 0 })], 'USD')).toHaveLength(1)
  })

  it('flags a position with no stated currency', () => {
    expect(positionsMissingRate([{ currency: null }], 'USD')).toHaveLength(1)
  })

  it('does not flag a convertible or domestic position', () => {
    expect(positionsMissingRate([eur(), usd()], 'USD')).toHaveLength(0)
  })
})

describe('needsCurrencyNote', () => {
  it('is true for an all-foreign book, not just a mixed one', () => {
    // The case a "more than one currency" test misses.
    expect(needsCurrencyNote([eur(), eur()], 'USD')).toBe(true)
  })

  it('is true for a mixed book', () => {
    expect(needsCurrencyNote([eur(), usd()], 'USD')).toBe(true)
  })

  it('is false when everything is already in the account currency', () => {
    expect(needsCurrencyNote([usd(), usd()], 'USD')).toBe(false)
  })
})

describe('ambiguous positions and the partial note stay consistent', () => {
  const ambiguous = { currency: null, fx_rate: null, totalCost: 100 }

  it('shows the note when the only position has no stated currency', () => {
    // totalsArePartial would otherwise be true with nothing on screen saying so.
    expect(positionsMissingRate([ambiguous], 'USD')).toHaveLength(1)
    expect(needsCurrencyNote([ambiguous], 'USD')).toBe(true)
  })

  it('agrees with positionsMissingRate for an all-domestic book', () => {
    expect(positionsMissingRate([usd(), usd()], 'USD')).toHaveLength(0)
    expect(needsCurrencyNote([usd(), usd()], 'USD')).toBe(false)
  })
})

describe('sumInAccountCurrency', () => {
  const cost = (position) => position.totalCost

  it('converts before adding', () => {
    expect(sumInAccountCurrency([eur(), usd()], cost, 'USD')).toBe(250)
  })

  it('excludes a position with no rate instead of adding it at face value', () => {
    expect(sumInAccountCurrency([eur({ fx_rate: null }), usd()], cost, 'USD')).toBe(100)
  })

  it('returns null when nothing could be converted', () => {
    expect(sumInAccountCurrency([eur({ fx_rate: null })], cost, 'USD')).toBeNull()
  })

  it('skips an unavailable value rather than counting it as zero', () => {
    const positions = [usd({ currentValue: null }), usd({ currentValue: 100 })]
    expect(sumInAccountCurrency(positions, p => p.currentValue, 'USD')).toBe(100)
  })

  it('returns null when every value is unavailable', () => {
    const positions = [usd({ unrealizedPnL: null }), usd({ unrealizedPnL: undefined })]
    expect(sumInAccountCurrency(positions, p => p.unrealizedPnL, 'USD')).toBeNull()
  })
})
