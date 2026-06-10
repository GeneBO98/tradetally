import { format as formatDateFns } from 'date-fns'

/**
 * Format a Date object as YYYY-MM-DD in local timezone.
 * This avoids the timezone shift issue when using toISOString().split('T')[0]
 * which converts to UTC and can show tomorrow's date after 6PM CST.
 */
export function formatLocalDate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get today's date as YYYY-MM-DD in local timezone.
 */
export function getLocalToday() {
  return formatLocalDate(new Date())
}

/**
 * Extract the calendar date from date-only values and midnight timestamps.
 * Trade date fields can arrive as YYYY-MM-DD, ISO midnight, or PostgreSQL-style
 * YYYY-MM-DD 00:00:00 values. Treat those as calendar dates, not instants.
 */
export function getTradeDateOnlyParts(date) {
  if (!date) return null

  const dateStr = date.toString()
  const dateOnlyMatch = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:(?:T| )00:00:00(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  )

  if (!dateOnlyMatch) return null

  return {
    year: Number(dateOnlyMatch[1]),
    month: Number(dateOnlyMatch[2]),
    day: Number(dateOnlyMatch[3])
  }
}

/**
 * Parse a trade-related date or datetime string into a Date object,
 * handling date-only and "midnight UTC" values without causing
 * off-by-one issues in the user's local timezone.
 */
export function parseTradeDate(date) {
  if (!date) return null

  const dateOnlyParts = getTradeDateOnlyParts(date)
  if (dateOnlyParts) {
    const { year, month, day } = dateOnlyParts
    // Construct in local timezone to avoid UTC shifting
    return new Date(year, month - 1, day)
  }

  const dateStr = date.toString()
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d
}

/**
 * Format a trade-related date using a safe parser that avoids
 * off-by-one issues for date-only values.
 */
export function formatTradeDate(date, pattern = 'MMM dd, yyyy') {
  if (!date) return ''
  const d = parseTradeDate(date)
  if (!d) return 'Invalid Date'
  return formatDateFns(d, pattern)
}

