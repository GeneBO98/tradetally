const MULTI_SELECT_FILTER_KEYS = Object.freeze([
  'strategies',
  'setups',
  'sectors',
  'tags',
  'brokers',
  'instrumentTypes',
  'optionTypes',
  'qualityGrades'
])

const NUMERIC_MULTI_SELECT_FILTER_KEYS = Object.freeze([
  'daysOfWeek'
])

const DASHBOARD_PRESERVED_FILTER_KEYS = Object.freeze([
  'startDate',
  'endDate',
  'symbolExact'
])

function normalizeArrayValue(value, { numeric = false } = {}) {
  if (Array.isArray(value)) {
    return numeric ? value.map(Number).filter(Number.isFinite) : value.filter(Boolean)
  }

  if (typeof value === 'string') {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
    return numeric ? parts.map(Number).filter(Number.isFinite) : parts
  }

  return []
}

export function normalizeTradeFiltersForSharedState(rawFilters = {}) {
  if (!rawFilters || typeof rawFilters !== 'object') {
    return {}
  }

  const normalized = { ...rawFilters }

  MULTI_SELECT_FILTER_KEYS.forEach((key) => {
    if (key in normalized) {
      normalized[key] = normalizeArrayValue(normalized[key])
    }
  })

  NUMERIC_MULTI_SELECT_FILTER_KEYS.forEach((key) => {
    if (key in normalized) {
      normalized[key] = normalizeArrayValue(normalized[key], { numeric: true })
    }
  })

  if ('symbolExact' in normalized) {
    normalized.symbolExact = normalized.symbolExact === true || normalized.symbolExact === 'true'
  }

  return normalized
}

export function loadTradeFiltersFromStorage(storage = localStorage) {
  try {
    const stored = storage.getItem('tradeFilters')
    if (!stored) {
      return {}
    }

    return normalizeTradeFiltersForSharedState(JSON.parse(stored))
  } catch (error) {
    console.warn('[tradeFilterState] Failed to load trade filters:', error)
    return {}
  }
}

export function clearDashboardTradeFiltersInStorage(storage = localStorage) {
  const currentFilters = loadTradeFiltersFromStorage(storage)
  const preservedFilters = {}

  DASHBOARD_PRESERVED_FILTER_KEYS.forEach((key) => {
    const value = currentFilters[key]
    if (value === null || value === undefined || value === '') {
      return
    }
    preservedFilters[key] = value
  })

  if (Object.keys(preservedFilters).length === 0) {
    storage.removeItem('tradeFilters')
    return {}
  }

  storage.setItem('tradeFilters', JSON.stringify(preservedFilters))
  return preservedFilters
}
