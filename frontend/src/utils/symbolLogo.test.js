import { describe, expect, test } from 'vitest'
import { fallbackLogoUrls } from './symbolLogo'

describe('fallbackLogoUrls', () => {
  test('prefers Parqet, then falls back to FMP', () => {
    const [first, second] = fallbackLogoUrls('EXCO')
    expect(first).toContain('parqet.com')
    expect(second).toContain('financialmodelingprep.com')
  })

  test('keeps the exchange suffix that non-US listings need', () => {
    for (const symbol of ['EXCO.DE', 'EXETF.L', 'EXETF.DE']) {
      const urls = fallbackLogoUrls(symbol)
      expect(urls).toHaveLength(2)
      expect(urls.every((url) => url.includes(symbol))).toBe(true)
    }
  })

  test('upper-cases a lowercase symbol', () => {
    expect(fallbackLogoUrls('exco.de')[0]).toContain('EXCO.DE')
  })

  test('handles class shares', () => {
    expect(fallbackLogoUrls('BRK-B')[0]).toContain('BRK-B')
  })

  test('declines option contract symbols rather than spending a request', () => {
    expect(fallbackLogoUrls('TSLA 2026-06-18 350P')).toEqual([])
    expect(fallbackLogoUrls('SPY   260618P00350000')).toEqual([])
  })

  test('declines empty or malformed input', () => {
    expect(fallbackLogoUrls('')).toEqual([])
    expect(fallbackLogoUrls(null)).toEqual([])
    expect(fallbackLogoUrls(undefined)).toEqual([])
  })
})
