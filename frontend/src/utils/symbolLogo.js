// Keyless logo CDNs for the non-US listings the provider has no logo for.
// Parqet first: it serves SVG and the real marks where FMP has only a wordmark.
const LOGO_CDNS = [
  (symbol) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}`,
  (symbol) => `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(symbol)}.png`,
]

// Plain listed tickers only; option symbols and CUSIPs would just earn a 404.
const LISTED_SYMBOL = /^[A-Z0-9]{1,8}(?:[.-][A-Z0-9]{1,4})?$/

export function fallbackLogoUrls(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase()
  if (!normalized || !LISTED_SYMBOL.test(normalized)) return []
  return LOGO_CDNS.map((build) => build(normalized))
}
