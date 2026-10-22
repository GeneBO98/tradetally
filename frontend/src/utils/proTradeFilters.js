// Trade filters that live in the "Advanced Filters" panel of TradeFilters.vue.
// They are a Pro feature: the panel is locked for free users and the backend
// ignores these params for free users, so the client should not send them.
export const PRO_TRADE_FILTER_KEYS = new Set([
  'sector',
  'sectors',
  'hasNews',
  'minPrice',
  'maxPrice',
  'minQuantity',
  'maxQuantity',
  'minPnl',
  'maxPnl',
  'holdTime',
  'minHoldTime',
  'maxHoldTime',
  'daysOfWeek',
  'market_sessions',
  'optionTypes',
  'qualityGrades'
])

export function isProTradeFilterKey(key) {
  return PRO_TRADE_FILTER_KEYS.has(key)
}

// Returns a shallow copy of `filters` without the Pro-only keys.
export function stripProTradeFilters(filters) {
  const result = {}
  for (const [key, value] of Object.entries(filters || {})) {
    if (!PRO_TRADE_FILTER_KEYS.has(key)) result[key] = value
  }
  return result
}
