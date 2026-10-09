import { describe, expect, it } from 'vitest'
import { parseNullableNumber } from './numbers'

describe('parseNullableNumber', () => {
  it('preserves zero as a valid numeric value', () => {
    expect(parseNullableNumber(0)).toBe(0)
    expect(parseNullableNumber('0.00')).toBe(0)
  })

  it('returns null for missing or invalid values', () => {
    expect(parseNullableNumber(null)).toBeNull()
    expect(parseNullableNumber(undefined)).toBeNull()
    expect(parseNullableNumber('')).toBeNull()
    expect(parseNullableNumber('not-a-number')).toBeNull()
  })
})
