const MARKET_TIMEZONE = 'America/New_York'
const REGULAR_OPEN_MINUTES = 9 * 60 + 30
const REGULAR_CLOSE_MINUTES = 16 * 60

const marketPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const marketTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function parseTimestamp(value) {
  if (!value) return null
  const stringValue = String(value).trim()
  const naiveIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/
  const normalized = naiveIso.test(stringValue) ? `${stringValue.replace(' ', 'T')}Z` : stringValue
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getTradeMarketSession(value) {
  const date = parseTimestamp(value)
  if (!date) return null

  const parts = Object.fromEntries(
    marketPartsFormatter.formatToParts(date).map((part) => [part.type, part.value])
  )

  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return null

  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  const timeLabel = `${marketTimeFormatter.format(date)} ET`

  if (minutes < REGULAR_OPEN_MINUTES) {
    return {
      key: 'pre_market',
      label: 'Pre-market',
      title: `Entered at ${timeLabel}, before regular market hours`,
    }
  }

  if (minutes < REGULAR_CLOSE_MINUTES) {
    return {
      key: 'regular',
      label: 'Market',
      title: `Entered at ${timeLabel}, during regular market hours`,
    }
  }

  return {
    key: 'post_market',
    label: 'Post-market',
    title: `Entered at ${timeLabel}, after regular market hours`,
  }
}
