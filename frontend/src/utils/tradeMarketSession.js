import { exchangeForSymbol } from './exchangeSessions'

function parseTimestamp(value) {
  if (!value) return null
  const stringValue = String(value).trim()
  const naiveIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/
  const normalized = naiveIso.test(stringValue) ? `${stringValue.replace(' ', 'T')}Z` : stringValue
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

const partsFormatterCache = new Map()
const timeFormatterCache = new Map()

function partsFormatter(zone) {
  if (!partsFormatterCache.has(zone)) {
    partsFormatterCache.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }))
  }
  return partsFormatterCache.get(zone)
}

function timeFormatter(zone) {
  if (!timeFormatterCache.has(zone)) {
    timeFormatterCache.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }))
  }
  return timeFormatterCache.get(zone)
}

/**
 * Classify a fill against the trading hours of the venue it was executed on.
 * The venue comes from the symbol's suffix; without one it is a US listing.
 * Judging a Frankfurt or London fill by New York hours mislabels the whole
 * European morning as pre-market.
 */
export function getTradeMarketSession(value, symbol = null) {
  const date = parseTimestamp(value)
  if (!date) return null

  const exchange = exchangeForSymbol(symbol)

  const parts = Object.fromEntries(
    partsFormatter(exchange.zone).formatToParts(date).map((part) => [part.type, part.value])
  )

  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return null

  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  const timeLabel = `${timeFormatter(exchange.zone).format(date)} ${exchange.tzLabel}`
  // Keep the original wording for a US listing; name the venue only when it is
  // the thing that explains the hours.
  const hours = exchange.venue === 'US' ? 'regular market hours' : `${exchange.venue} regular hours`

  if (minutes < exchange.open) {
    return {
      key: 'pre_market',
      label: 'Pre-market',
      short: 'Pre',
      title: `Entered at ${timeLabel}, before ${hours}`,
    }
  }

  if (minutes < exchange.close) {
    return {
      key: 'regular',
      label: 'Market',
      short: 'RTH',
      title: `Entered at ${timeLabel}, during ${hours}`,
    }
  }

  return {
    key: 'post_market',
    label: 'Post-market',
    short: 'Post',
    title: `Entered at ${timeLabel}, after ${hours}`,
  }
}

const BADGED_INSTRUMENTS = new Set(['stock', 'option'])

/**
 * The session worth badging on a trade row. Futures and anything else that is
 * not bound to equity hours get nothing, and neither does a regular-hours
 * fill: that is the case for almost every row, so a badge saying so costs a
 * line of screen and tells the reader nothing. Only the exceptions - filled
 * before the open or after the close - earn a marker.
 */
export function getTradeSessionBadge(trade) {
  const instrumentType = String(
    trade?.instrument_type ?? trade?.instrumentType ?? 'stock'
  ).toLowerCase()
  if (!BADGED_INSTRUMENTS.has(instrumentType)) return null

  const session = getTradeMarketSession(
    trade?.entry_time ?? trade?.entryTime,
    trade?.symbol
  )
  return session && session.key !== 'regular' ? session : null
}
