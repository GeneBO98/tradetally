import { describe, expect, it } from 'vitest'
import { getTradeMarketSession } from './tradeMarketSession'

describe('getTradeMarketSession', () => {
  it.each([
    ['2025-01-02T13:00:00.000Z', 'pre_market', 'Pre-market'],
    ['2025-01-02T14:30:00.000Z', 'regular', 'Market'],
    ['2025-01-02T20:59:00.000Z', 'regular', 'Market'],
    ['2025-01-02T21:00:00.000Z', 'post_market', 'Post-market'],
  ])('classifies %s in New York market time', (timestamp, key, label) => {
    expect(getTradeMarketSession(timestamp)).toMatchObject({ key, label })
  })

  it('does not label invalid or weekend timestamps', () => {
    expect(getTradeMarketSession('not-a-date')).toBeNull()
    expect(getTradeMarketSession('2025-01-04T15:00:00.000Z')).toBeNull()
  })

  describe('non-US listings are judged by their own venue', () => {
    it('calls a mid-afternoon London fill regular hours', () => {
      // 13:26Z is 14:26 in London — mid-session — but 09:26 in New York.
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z', 'IGLN.L'))
        .toMatchObject({ key: 'regular', label: 'Market' })
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z'))
        .toMatchObject({ key: 'pre_market' })
    })

    it('calls a German morning fill regular hours', () => {
      // 09:05Z is 11:05 in Frankfurt, but 05:05 in New York.
      expect(getTradeMarketSession('2026-08-14T09:05:00.000Z', 'BMW.DE'))
        .toMatchObject({ key: 'regular', label: 'Market' })
    })

    it('calls a Paris morning fill regular hours', () => {
      // Monday; 09:30Z is 11:30 in Paris.
      expect(getTradeMarketSession('2026-05-04T09:30:00.000Z', 'TTE.PA'))
        .toMatchObject({ key: 'regular', label: 'Market' })
    })

    it('still finds genuine pre- and post-market on a European venue', () => {
      // 06:30Z = 07:30 London, before the 08:00 open.
      expect(getTradeMarketSession('2026-08-12T06:30:00.000Z', 'IGLN.L'))
        .toMatchObject({ key: 'pre_market' })
      // 16:00Z = 17:00 London, after the 16:30 close.
      expect(getTradeMarketSession('2026-08-12T16:00:00.000Z', 'IGLN.L'))
        .toMatchObject({ key: 'post_market' })
    })

    it('names the venue in the tooltip so the hours are explicable', () => {
      expect(getTradeMarketSession('2026-08-14T09:05:00.000Z', 'BMW.DE').title).toContain('XETRA')
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z', 'IGLN.L').title).toContain('LSE')
    })

    it('treats a share class as the US listing it is, not a venue suffix', () => {
      expect(getTradeMarketSession('2025-01-02T14:30:00.000Z', 'BRK.B'))
        .toMatchObject({ key: 'regular' })
      expect(getTradeMarketSession('2025-01-02T13:00:00.000Z', 'BRK.B'))
        .toMatchObject({ key: 'pre_market' })
    })

    it('falls back to US hours for an unknown suffix', () => {
      expect(getTradeMarketSession('2025-01-02T14:30:00.000Z', 'FOO.ZZ'))
        .toMatchObject({ key: 'regular' })
    })
  })

  describe('exchange-qualified symbols from a TradingView import', () => {
    it('reads the venue from the prefix', () => {
      // 13:26Z is 14:26 in London, mid-session, but 09:26 in New York.
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z', 'LSE:IGLN'))
        .toMatchObject({ key: 'regular', label: 'Market' })
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z', 'LSE:IGLN').title)
        .toContain('LSE')
    })

    it('agrees with the suffix form of the same listing', () => {
      const stamp = '2026-08-12T13:26:00.000Z'
      expect(getTradeMarketSession(stamp, 'LSE:IGLN'))
        .toEqual(getTradeMarketSession(stamp, 'IGLN.L'))
    })

    it('keeps US hours for a US prefix', () => {
      expect(getTradeMarketSession('2025-01-02T14:30:00.000Z', 'NASDAQ:DEVS'))
        .toMatchObject({ key: 'regular' })
      expect(getTradeMarketSession('2025-01-02T13:00:00.000Z', 'NASDAQ:DEVS'))
        .toMatchObject({ key: 'pre_market' })
    })

    it('covers the other prefixed venues', () => {
      // 09:05Z is 11:05 in Frankfurt and Paris, 05:05 in New York.
      expect(getTradeMarketSession('2026-08-14T09:05:00.000Z', 'XETR:BMW'))
        .toMatchObject({ key: 'regular' })
      expect(getTradeMarketSession('2026-08-14T09:05:00.000Z', 'EURONEXT:TTE'))
        .toMatchObject({ key: 'regular' })
    })

    it('still reads a suffix when the prefix is unknown', () => {
      expect(getTradeMarketSession('2026-08-12T13:26:00.000Z', 'AQUIS:IGLN.L'))
        .toMatchObject({ key: 'regular' })
    })
  })
})
