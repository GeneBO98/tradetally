// Regular trading hours per listing venue, in the venue's own timezone.
// Without this a trade is classified against New York hours wherever it was
// executed, so a 14:26 London fill reads "Pre-market" because it happened
// before 09:30 in a city it has nothing to do with.
//
// Keyed by the Yahoo-style suffix carried on the symbol; no suffix means a US
// listing, which is the default.
const US = { zone: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60, venue: 'US', tzLabel: 'ET' }

const EXCHANGES = {
  L: { zone: 'Europe/London', open: 8 * 60, close: 16 * 60 + 30, venue: 'LSE', tzLabel: 'London' },
  DE: { zone: 'Europe/Berlin', open: 9 * 60, close: 17 * 60 + 30, venue: 'XETRA', tzLabel: 'Frankfurt' },
  F: { zone: 'Europe/Berlin', open: 8 * 60, close: 22 * 60, venue: 'Frankfurt', tzLabel: 'Frankfurt' },
  PA: { zone: 'Europe/Paris', open: 9 * 60, close: 17 * 60 + 30, venue: 'Euronext Paris', tzLabel: 'Paris' },
  AS: { zone: 'Europe/Amsterdam', open: 9 * 60, close: 17 * 60 + 30, venue: 'Euronext Amsterdam', tzLabel: 'Amsterdam' },
  BR: { zone: 'Europe/Brussels', open: 9 * 60, close: 17 * 60 + 30, venue: 'Euronext Brussels', tzLabel: 'Brussels' },
  LS: { zone: 'Europe/Lisbon', open: 8 * 60, close: 16 * 60 + 30, venue: 'Euronext Lisbon', tzLabel: 'Lisbon' },
  MI: { zone: 'Europe/Rome', open: 9 * 60, close: 17 * 60 + 30, venue: 'Borsa Italiana', tzLabel: 'Milan' },
  MC: { zone: 'Europe/Madrid', open: 9 * 60, close: 17 * 60 + 30, venue: 'BME', tzLabel: 'Madrid' },
  SW: { zone: 'Europe/Zurich', open: 9 * 60, close: 17 * 60 + 30, venue: 'SIX', tzLabel: 'Zurich' },
  VI: { zone: 'Europe/Vienna', open: 9 * 60, close: 17 * 60 + 30, venue: 'Wiener Börse', tzLabel: 'Vienna' },
  ST: { zone: 'Europe/Stockholm', open: 9 * 60, close: 17 * 60 + 30, venue: 'Nasdaq Stockholm', tzLabel: 'Stockholm' },
  CO: { zone: 'Europe/Copenhagen', open: 9 * 60, close: 17 * 60, venue: 'Nasdaq Copenhagen', tzLabel: 'Copenhagen' },
  HE: { zone: 'Europe/Helsinki', open: 10 * 60, close: 18 * 60 + 30, venue: 'Nasdaq Helsinki', tzLabel: 'Helsinki' },
  OL: { zone: 'Europe/Oslo', open: 9 * 60, close: 16 * 60 + 20, venue: 'Oslo Børs', tzLabel: 'Oslo' },
  IR: { zone: 'Europe/Dublin', open: 8 * 60, close: 16 * 60 + 28, venue: 'Euronext Dublin', tzLabel: 'Dublin' },
  TO: { zone: 'America/Toronto', open: 9 * 60 + 30, close: 16 * 60, venue: 'TSX', tzLabel: 'Toronto' },
  V: { zone: 'America/Toronto', open: 9 * 60 + 30, close: 16 * 60, venue: 'TSXV', tzLabel: 'Toronto' },
  HK: { zone: 'Asia/Hong_Kong', open: 9 * 60 + 30, close: 16 * 60, venue: 'HKEX', tzLabel: 'Hong Kong' },
  T: { zone: 'Asia/Tokyo', open: 9 * 60, close: 15 * 60 + 30, venue: 'TSE', tzLabel: 'Tokyo' },
  AX: { zone: 'Australia/Sydney', open: 10 * 60, close: 16 * 60, venue: 'ASX', tzLabel: 'Sydney' },
}

// A TradingView import keeps the exchange on the symbol (LSE:IGLN), stating the
// venue outright instead of implying it with a suffix. US prefixes need no
// entry here — NASDAQ:DEVS and NYSE:KO already land on the default.
const EXCHANGE_PREFIXES = {
  LSE: 'L',
  XETR: 'DE',
  FWB: 'F',
  GETTEX: 'F',
  TRADEGATE: 'F',
  // One prefix covers the continental Euronext books. Paris, Amsterdam and
  // Brussels share a session; Lisbon runs an hour earlier and is read an hour
  // late here, which is still its own morning rather than New York's.
  EURONEXT: 'PA',
  MIL: 'MI',
  BME: 'MC',
  SIX: 'SW',
  VIE: 'VI',
  OMXSTO: 'ST',
  OMXCOP: 'CO',
  OMXHEX: 'HE',
  OSL: 'OL',
  TSX: 'TO',
  HKEX: 'HK',
  TSE: 'T',
  ASX: 'AX',
}

export function exchangeForSymbol(symbol) {
  let normalized = String(symbol || '').trim().toUpperCase()

  const colon = normalized.indexOf(':')
  if (colon !== -1) {
    const prefix = EXCHANGE_PREFIXES[normalized.slice(0, colon)]
    if (prefix) return EXCHANGES[prefix]
    // Unrecognised: drop it and let any suffix on the rest still be read.
    normalized = normalized.slice(colon + 1)
  }

  const lastDot = normalized.lastIndexOf('.')
  if (lastDot === -1) return US

  // A share class (BRK.B) is a US listing, not a venue suffix.
  return EXCHANGES[normalized.slice(lastDot + 1)] || US
}

export const DEFAULT_EXCHANGE = US
