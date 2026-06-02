import { reactive, unref, watchEffect } from 'vue'
import api from '@/services/api'

const metadataBySymbol = reactive({})
const pendingSymbols = new Set()
const inFlightSymbols = new Set()
let flushTimer = null

// localStorage-backed persistence for symbol metadata (mostly logo URLs +
// company names). Survives page reloads so logos render instantly on the
// next visit instead of waiting for /symbols/metadata to return. Entries
// without a logo are not cached so we keep retrying them next session.
const STORAGE_KEY = 'tt_symbol_metadata_v1'
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
let persistTimer = null

function hydrateFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const now = Date.now()
    for (const [symbol, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue
      if (entry.cachedAt && (now - entry.cachedAt) > STORAGE_TTL_MS) continue
      // Hydrate only the data fields; drop the cachedAt timestamp from the
      // reactive object so consumers don't see internal bookkeeping.
      const { cachedAt: _unused, ...data } = entry
      metadataBySymbol[symbol] = data
    }
  } catch (err) {
    // Malformed cache — wipe and move on.
    try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
  }
}

function schedulePersist() {
  if (persistTimer || typeof window === 'undefined') return
  // Debounce so a burst of symbol fetches doesn't write to localStorage
  // multiple times in a single tick.
  persistTimer = window.setTimeout(persistToStorage, 250)
}

function persistToStorage() {
  persistTimer = null
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const payload = {}
    const now = Date.now()
    for (const [symbol, data] of Object.entries(metadataBySymbol)) {
      // Skip empty/null-only entries so we keep retrying them next session.
      if (!data) continue
      if (!data.logo && !data.companyName) continue
      payload[symbol] = { ...data, cachedAt: now }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    // Quota exceeded or private mode — non-fatal.
    console.warn('[SYMBOL_METADATA] persist failed:', err?.message)
  }
}

// Hydrate at module load so the first render of any StockLogo can read
// cached data synchronously instead of waiting for the API.
hydrateFromStorage()

function normalizeSymbol(symbol) {
  return typeof symbol === 'string' ? symbol.trim().toUpperCase() : ''
}

function toSymbolList(source) {
  if (Array.isArray(source)) {
    return source.map(normalizeSymbol).filter(Boolean)
  }

  const symbol = normalizeSymbol(source)
  return symbol ? [symbol] : []
}

function setFallbackMetadata(symbol) {
  if (!symbol || metadataBySymbol[symbol]) {
    return
  }

  metadataBySymbol[symbol] = {
    symbol,
    companyName: null,
    exchange: null,
    logo: null
  }
}

async function flushPendingSymbols() {
  flushTimer = null

  const symbols = [...pendingSymbols]
  pendingSymbols.clear()

  if (symbols.length === 0) {
    return
  }

  symbols.forEach(symbol => inFlightSymbols.add(symbol))

  try {
    const { data } = await api.get('/symbols/metadata', {
      params: { symbols: symbols.join(',') }
    })

    const metadata = data?.metadata || {}

    symbols.forEach(symbol => {
      metadataBySymbol[symbol] = metadata[symbol] || {
        symbol,
        companyName: null,
        exchange: null,
        logo: null
      }
    })
    // Persist the freshly-fetched entries (only those with real data are
    // actually written; null entries are skipped inside persistToStorage).
    schedulePersist()
  } catch (error) {
    console.warn('[SYMBOL_METADATA] Failed to fetch metadata:', error.message)
    symbols.forEach(setFallbackMetadata)
  } finally {
    symbols.forEach(symbol => inFlightSymbols.delete(symbol))

    if (pendingSymbols.size > 0 && !flushTimer) {
      flushTimer = window.setTimeout(flushPendingSymbols, 10)
    }
  }
}

function scheduleFlush() {
  if (flushTimer) {
    return
  }

  flushTimer = window.setTimeout(flushPendingSymbols, 10)
}

function ensureSymbolMetadata(source) {
  toSymbolList(source).forEach(symbol => {
    // Already in memory (from a previous fetch or the localStorage hydrate)
    // or currently being fetched — nothing to do.
    if (metadataBySymbol[symbol] || inFlightSymbols.has(symbol)) {
      return
    }

    pendingSymbols.add(symbol)
  })

  if (pendingSymbols.size > 0) {
    scheduleFlush()
  }
}

export function useSymbolMetadata(source = null) {
  if (source !== null) {
    watchEffect(() => {
      ensureSymbolMetadata(unref(source))
    })
  }

  return {
    metadataBySymbol,
    ensureSymbolMetadata,
    normalizeSymbol
  }
}
