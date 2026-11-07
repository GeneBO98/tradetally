function numeric(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function getExcursionScale(trade, unit) {
  if (unit === 'dollars') return 1
  const quantity = numeric(trade.quantity)
  const instrument = trade.instrument_type ?? trade.instrumentType
  const multiplier = instrument === 'future' ? numeric(trade.point_value ?? trade.pointValue)
    : instrument === 'option' ? (numeric(trade.contract_size ?? trade.contractSize) || 100) : 1
  if (quantity == null || quantity <= 0 || multiplier == null || multiplier <= 0) return null
  const scale = quantity * multiplier
  if (unit === 'points') return scale
  if (unit !== 'r') return null
  const entry = numeric(trade.entry_price ?? trade.entryPrice)
  const stop = numeric(trade.stop_loss ?? trade.stopLoss)
  if (entry == null || stop == null) return null
  const distance = ['short', 'sell'].includes(trade.side) ? stop - entry
    : ['long', 'buy'].includes(trade.side) ? entry - stop : null
  return distance != null && distance > 0 ? distance * scale : null
}

export function normalizeExcursionDollars(value, trade) {
  const dollars = numeric(value)
  if (dollars == null || (trade.instrument_type ?? trade.instrumentType) !== 'future') return dollars
  const scale = getExcursionScale(trade, 'points')
  const entry = numeric(trade.entry_price ?? trade.entryPrice)
  const exit = numeric(trade.exit_price ?? trade.exitPrice)
  if (scale == null || scale <= 1 || entry == null || exit == null) return dollars
  const captured = Math.max(0, (trade.side === 'short' ? entry - exit : exit - entry) * scale)
  const legacy = [trade.mfe, trade.post_exit_mfe ?? trade.postExitMfe].map(numeric)
    .some(candidate => candidate != null && candidate > 0 && candidate < captured - 0.005 && candidate * scale >= captured - 0.005)
  return legacy ? dollars * scale : dollars
}

export function excursionValue(trade, field, unit) {
  const value = trade[field] ?? trade[{ post_exit_mae: 'postExitMae', post_exit_mfe: 'postExitMfe' }[field]]
  if (numeric(value) == null) return null
  // Server supplies dimensionless values before display-currency conversion.
  const derived = `${field}_${unit === 'points' ? 'points' : 'r'}`
  if (unit !== 'dollars' && Object.hasOwn(trade, derived)) return numeric(trade[derived])
  const dollars = normalizeExcursionDollars(value, trade)
  const scale = getExcursionScale(trade, unit)
  return dollars != null && scale != null ? dollars / scale : null
}

// Match the position shown by the execution editor when main entry fields are
// hidden. Submission computes these same weighted prices before converting.
export function getExcursionFormSource(form) {
  const executions = Array.isArray(form.executions) ? form.executions : []
  if (!executions.length) return form
  const grouped = executions.some(execution => execution.entryPrice !== undefined || execution.entry_price !== undefined || execution.entryTime !== undefined)
  const side = form.side || executions[0].side || (executions[0].action === 'sell' ? 'short' : 'long')
  const entries = grouped ? executions : executions.filter(execution => execution.action === (side === 'short' ? 'sell' : 'buy'))
  const quantity = entries.reduce((sum, execution) => sum + (numeric(execution.quantity) || 0), 0)
  if (quantity <= 0) return form
  const entry_price = entries.reduce((sum, execution) => sum + (numeric(execution.entry_price ?? execution.entryPrice ?? execution.price) || 0) * (numeric(execution.quantity) || 0), 0) / quantity
  const source = { ...form, side, quantity, entry_price }
  if (grouped) {
    const stops = entries.filter(execution => numeric(execution.stop_loss ?? execution.stopLoss) != null)
    const stop_quantity = stops.reduce((sum, execution) => sum + (numeric(execution.quantity) || 0), 0)
    if (stop_quantity > 0) source.stop_loss = stops.reduce((sum, execution) => sum + numeric(execution.stop_loss ?? execution.stopLoss) * (numeric(execution.quantity) || 0), 0) / stop_quantity
  } else {
    const exit_quantity = executions.filter(execution => execution.action === (side === 'short' ? 'buy' : 'sell'))
      .reduce((sum, execution) => sum + (numeric(execution.quantity) || 0), 0)
    // The individual-fill form submits remaining quantity for an open position.
    if (exit_quantity < quantity) source.quantity = quantity - exit_quantity
  }
  return source
}
