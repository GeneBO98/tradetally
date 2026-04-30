import { describe, expect, it } from 'vitest'
import { formatLocalDate, formatTradeDate, parseTradeDate } from './date'

describe('date utilities', () => {
  it('formats dates as local YYYY-MM-DD values', () => {
    expect(formatLocalDate(new Date(2026, 3, 9, 23, 30))).toBe('2026-04-09')
    expect(formatLocalDate('invalid')).toBe('')
    expect(formatLocalDate(null)).toBe('')
  })

  it('parses date-only and midnight UTC trade dates as local calendar dates', () => {
    const dateOnly = parseTradeDate('2026-04-09')
    const midnightUtc = parseTradeDate('2026-04-09T00:00:00.000Z')

    expect(formatLocalDate(dateOnly)).toBe('2026-04-09')
    expect(formatLocalDate(midnightUtc)).toBe('2026-04-09')
  })

  it('formats trade dates and reports invalid values', () => {
    expect(formatTradeDate('2026-04-09', 'yyyy-MM-dd')).toBe('2026-04-09')
    expect(formatTradeDate('not-a-date')).toBe('Invalid Date')
    expect(formatTradeDate(null)).toBe('')
  })
})
