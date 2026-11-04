import { describe, it, expect } from 'vitest'

describe('formatDecimal', () => {
  it('adds separators, fixes decimals and puts the sign first', async () => {
    const { formatDecimal } = await import('./formatters')
    expect(formatDecimal(2382.9417)).toBe('2,382.94')
    expect(formatDecimal(-460)).toBe('-460.00')
    expect(formatDecimal(0.84, { digits: 1, showSign: true })).toBe('+0.8')
    expect(formatDecimal(-0.004)).toBe('0.00')
    expect(formatDecimal(null)).toBe('-')
    expect(formatDecimal('12.5', { digits: 0 })).toBe('13')
  })
})
