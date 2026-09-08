// Manual option prices are stored per position. Position keys carry the
// currency the position's stored values are in, so a key written before that
// suffix existed no longer matches — and cleanup would delete it as unknown.
// These helpers keep the older forms readable until they have been migrated.

// The key without its currency suffix, or null when it carries none.
export function legacyPositionKey(key) {
  if (typeof key !== 'string' || key === '') return null
  const separator = key.lastIndexOf('|')
  return separator === -1 ? null : key.slice(0, separator)
}

// Read a stored price, preferring the current key, then the pre-suffix key,
// then the oldest bare-symbol form.
export function readManualPrice(store, key, symbol) {
  if (!store) return undefined
  if (store[key] !== undefined) return store[key]

  const legacy = legacyPositionKey(key)
  if (legacy !== null && store[legacy] !== undefined) return store[legacy]
  return store[symbol]
}

// Every key that must survive a cleanup sweep for one position.
export function liveKeysForPosition(key, symbol) {
  const keys = [key, symbol].filter(k => typeof k === 'string' && k !== '')
  const legacy = legacyPositionKey(key)
  if (legacy !== null) keys.push(legacy)
  return keys
}
