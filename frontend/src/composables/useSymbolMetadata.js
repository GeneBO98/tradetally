import { reactive, unref, watchEffect } from 'vue'
import api from '@/services/api'

const metadataBySymbol = reactive({})
const pendingSymbols = new Set()
const inFlightSymbols = new Set()
let flushTimer = null

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
