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
})
