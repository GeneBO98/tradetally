import { format as formatDateFns } from 'date-fns'

/**
 * Parse a trade-related date or datetime string into a Date object,
 * handling date-only and "midnight UTC" values without causing
 * off-by-one issues in the user's local timezone.
 */
export function parseTradeDate(date) {
  if (!date) return null

  const dateStr = date.toString()

  // Match date-only (YYYY-MM-DD) or midnight timestamps
  // like YYYY-MM-DDT00:00:00(.sss)?(Z|±HH:MM)
  const dateOnlyMatch = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  )

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number)
    // Construct in local timezone to avoid UTC shifting
    return new Date(year, month - 1, day)
  }

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


