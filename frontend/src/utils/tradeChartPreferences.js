export const TRADE_CHART_RESOLUTION_PREFERENCE_KEY = 'trade_chart_default_resolution'

export const TRADE_CHART_RESOLUTION_OPTIONS = Object.freeze([
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '60', label: '1 hour' },
  { value: 'D', label: '1 day' },
])

const SUPPORTED_RESOLUTIONS = new Set(
  TRADE_CHART_RESOLUTION_OPTIONS.map(({ value }) => value)
)

export function isTradeChartResolution(value) {
  return SUPPORTED_RESOLUTIONS.has(value)
}

export function normalizeTradeChartResolution(value) {
  const resolution = String(value || '1').trim().toUpperCase()
  return isTradeChartResolution(resolution) ? resolution : '1'
}

export function readTradeChartDefaultResolution() {
  try {
    return normalizeTradeChartResolution(
      localStorage.getItem(TRADE_CHART_RESOLUTION_PREFERENCE_KEY)
    )
  } catch {
    return '1'
  }
}
