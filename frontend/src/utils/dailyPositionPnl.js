// Daily mark-to-market movement of current holdings since the previous close.
export function daily_position_pnl(position) {
  if (position.requires_manual_price) return null
  const change = position.day_change ?? position.dayChange
  const quantity = position.total_quantity ?? position.totalQuantity
  const instrument = position.instrument_type ?? position.instrumentType
  const multiplier = instrument === 'future'
    ? (position.point_value ?? position.pointValue ?? 1)
    : instrument === 'option' ? (position.contract_size ?? position.contractSize ?? 100) : 1
  if ([change, quantity, multiplier].some(value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)))) return null
  return Number(change) * Number(quantity) * Number(multiplier) * (position.side === 'short' ? -1 : 1)
}
