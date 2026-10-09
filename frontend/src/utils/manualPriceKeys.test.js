import { describe, it, expect } from 'vitest'
import { legacyPositionKey, readManualPrice, liveKeysForPosition } from './manualPriceKeys'

describe('legacyPositionKey', () => {
  it('strips the currency suffix', () => {
    expect(legacyPositionKey('MRVL_65_2026-02-20_put|USD')).toBe('MRVL_65_2026-02-20_put')
    expect(legacyPositionKey('EXCO.DE|EUR')).toBe('EXCO.DE')
  })

  it('returns null for a key that carries no suffix', () => {
    expect(legacyPositionKey('MRVL')).toBeNull()
    expect(legacyPositionKey('')).toBeNull()
    expect(legacyPositionKey(undefined)).toBeNull()
  })
})

describe('readManualPrice', () => {
  const key = 'MRVL_65_2026-02-20_put|USD'
  const legacy = 'MRVL_65_2026-02-20_put'

  it('prefers a value stored under the current key', () => {
    expect(readManualPrice({ [key]: 2.5, [legacy]: 9 }, key, 'MRVL')).toBe(2.5)
  })

  it('finds a value saved before keys carried a currency', () => {
    // The upgrade case: without this the price the user typed disappears.
    expect(readManualPrice({ [legacy]: 2.5 }, key, 'MRVL')).toBe(2.5)
  })

  it('still finds the oldest bare-symbol form', () => {
    expect(readManualPrice({ MRVL: 2.5 }, key, 'MRVL')).toBe(2.5)
  })

  it('returns undefined when nothing is stored', () => {
    expect(readManualPrice({}, key, 'MRVL')).toBeUndefined()
    expect(readManualPrice(null, key, 'MRVL')).toBeUndefined()
  })
})

describe('liveKeysForPosition', () => {
  it('keeps the pre-suffix key alive so cleanup cannot delete it', () => {
    const keys = liveKeysForPosition('MRVL_65_2026-02-20_put|USD', 'MRVL')
    expect(keys).toContain('MRVL_65_2026-02-20_put|USD')
    expect(keys).toContain('MRVL_65_2026-02-20_put')
    expect(keys).toContain('MRVL')
  })

  it('omits a legacy entry for a key with no suffix', () => {
    expect(liveKeysForPosition('MRVL', 'MRVL')).toEqual(['MRVL', 'MRVL'])
  })
})
