function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function calculateChartPnlMeasurement({
  entry_price,
  exit_price,
  quantity = 1,
  side = 'long',
  instrument_type = 'stock',
  contract_size = 100,
  point_value = 1,
} = {}) {
  const normalized_entry_price = finiteNumber(entry_price)
  const normalized_exit_price = finiteNumber(exit_price)

  if (normalized_entry_price === null || normalized_exit_price === null) return null

  const direction = String(side).toLowerCase() === 'short' ? -1 : 1
  const price_change = (normalized_exit_price - normalized_entry_price) * direction
  const normalized_quantity = Math.abs(finiteNumber(quantity, 1))
  const normalized_instrument_type = String(instrument_type || 'stock').toLowerCase()

  let multiplier = 1
  if (normalized_instrument_type === 'option') {
    multiplier = Math.abs(finiteNumber(contract_size, 100)) || 100
  } else if (normalized_instrument_type === 'future') {
    multiplier = Math.abs(finiteNumber(point_value, 1)) || 1
  }

  const position_basis = Math.abs(
    normalized_entry_price * normalized_quantity * multiplier
  )
  const dollar_pnl = price_change * normalized_quantity * multiplier

  return {
    price_change,
    position_basis,
    pnl_percent: position_basis === 0
      ? null
      : (dollar_pnl / position_basis) * 100,
    dollar_pnl,
  }
}

export function formatSignedChartCurrency(value, currency_code = 'USD') {
  const number = finiteNumber(value)
  if (number === null) return null

  let formatted
  try {
    formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency_code || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(number))
  } catch {
    formatted = `$${Math.abs(number).toFixed(2)}`
  }

  if (number > 0) return `+${formatted}`
  if (number < 0) return `-${formatted}`
  return formatted
}

export function formatSignedChartPercent(value) {
  const number = finiteNumber(value)
  if (number === null) return null
  if (number > 0) return `+${number.toFixed(2)}%`
  return `${number.toFixed(2)}%`
}
