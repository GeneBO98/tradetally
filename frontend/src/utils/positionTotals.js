// Aggregating open positions is only meaningful once every value is in one
// currency. These helpers decide what may be converted and what must be left
// out, so a total is never assembled from mixed units or from a value that was
// never available.
//
// Every check here is explicit about null. Number(null) is 0, so coercing first
// would read a missing rate as a real one and a missing quote as a worthless
// position.

export function positionStatedCurrency(position) {
  const currency = position?.currency
  return currency ? String(currency).toUpperCase() : null
}

// The API sends null when it could not obtain a usable rate. A rate must be a
// finite positive number to be worth anything: zero or negative would silently
// erase or invert the position.
export function positionFxRate(position) {
  const raw = position?.fx_rate ?? position?.fxRate
  if (raw === null || raw === undefined || raw === '') return null
  const rate = Number(raw)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

export function toAccountCurrency(value, position, accountCurrency) {
  // An unavailable value is not zero: a position with no quote has no current
  // value, and reporting one of zero would understate the total.
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null

  const currency = positionStatedCurrency(position)
  // No stated currency means there is nothing to convert from.
  if (!currency) return null
  if (currency === accountCurrency) return amount

  const rate = positionFxRate(position)
  return rate === null ? null : amount * rate
}

// Positions that cannot contribute to a total: no stated currency, or a foreign
// currency with no usable rate.
export function positionsMissingRate(positions, accountCurrency) {
  return (positions || []).filter((position) => {
    const currency = positionStatedCurrency(position)
    if (!currency) return true
    return currency !== accountCurrency && positionFxRate(position) === null
  })
}

export function statedCurrencies(positions) {
  return new Set(
    (positions || []).map(positionStatedCurrency).filter(Boolean)
  )
}

// A total needs a conversion note whenever any position is in a currency other
// than the account's. An all-EUR book on a USD account qualifies just as much
// as a mixed one, and is precisely what a "more than one currency" test misses.
export function needsCurrencyNote(positions, accountCurrency) {
  // A position with no stated currency is excluded from totals and makes them
  // partial, so the note has to appear for it too — otherwise a book holding
  // only such a position is marked partial with nothing on screen saying so.
  if ((positions || []).some(position => !positionStatedCurrency(position))) return true

  const currencies = statedCurrencies(positions)
  if (currencies.size > 1) return true
  return [...currencies].some(currency => currency !== accountCurrency)
}

// Sum `pick(position)` across positions, in the account's currency. Returns null
// when nothing could be converted, so the caller can say so rather than print a
// zero that looks like a real total.
export function sumInAccountCurrency(positions, pick, accountCurrency) {
  let total = 0
  let hasAny = false

  for (const position of positions || []) {
    const converted = toAccountCurrency(pick(position), position, accountCurrency)
    if (converted === null) continue
    total += converted
    hasAny = true
  }

  return hasAny ? total : null
}
