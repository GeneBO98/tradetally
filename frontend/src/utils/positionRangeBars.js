// Geometry for the open positions range bars. Every price here is in the
// position's own currency; money amounts are returned in that currency too and
// converted for display by the caller, like every other row amount.

function finite(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clamp_pct(value) {
  return Math.max(0, Math.min(100, value))
}

function position_direction(position) {
  return position.side === 'short' ? -1 : 1
}

function value_multiplier(position) {
  const instrument = position.instrument_type ?? position.instrumentType
  if (instrument === 'future') return finite(position.point_value ?? position.pointValue) ?? 1
  return 1
}

function bar_inputs(position) {
  const instrument = position.instrument_type ?? position.instrumentType
  if (instrument === 'option' || position.requires_manual_price) return null
  const current = finite(position.current_price ?? position.currentPrice)
  const entry = finite(position.avg_price ?? position.avgPrice)
  if (current === null || entry === null || current <= 0 || entry <= 0) return null
  return { current, entry }
}

// Where the current price and the entry sit inside the 52-week range. The
// range is widened to include the current price, since a quote can print a
// new high or low before the daily metric catches up.
export function range_bar(position, range) {
  const inputs = bar_inputs(position)
  const high_raw = finite(range?.week_52_high)
  const low_raw = finite(range?.week_52_low)
  if (!inputs || high_raw === null || low_raw === null || high_raw <= low_raw) return null

  const { current, entry } = inputs
  const low = Math.min(low_raw, current)
  const high = Math.max(high_raw, current)
  const at = (price) => clamp_pct(((price - low) / (high - low)) * 100)
  const below_high_pct = ((high - current) / high) * 100
  const above_low_pct = ((current - low) / low) * 100

  return {
    low,
    high,
    entry_pct: at(entry),
    current_pct: at(current),
    below_high_pct,
    above_low_pct,
    at_high: below_high_pct < 0.5,
    at_low: above_low_pct < 0.5,
    in_profit: (current - entry) * position_direction(position) >= 0
  }
}

// Progress from stop (0%) to target (100%), and what the position would gain
// or lose from the current price if either level is hit. Shorts run the same
// way: the stop sits above, the target below.
export function plan_bar(position) {
  const inputs = bar_inputs(position)
  const stop = finite(position.stop_loss)
  const target = finite(position.take_profit)
  if (!inputs || stop === null || target === null || stop <= 0 || target <= 0) return null

  const direction = position_direction(position)
  const span = (target - stop) * direction
  // A stop on the wrong side of the target is not a plan we can draw.
  if (span <= 0) return null

  const { current, entry } = inputs
  const quantity = finite(position.total_quantity ?? position.totalQuantity) ?? 0
  const multiplier = value_multiplier(position)
  const progress_pct = ((current - stop) * direction / span) * 100

  return {
    stop,
    target,
    entry_pct: clamp_pct(((entry - stop) * direction / span) * 100),
    current_pct: clamp_pct(progress_pct),
    progress_pct,
    target_reached: progress_pct >= 100,
    stop_hit: progress_pct <= 0,
    at_stop_amount: (stop - current) * quantity * multiplier * direction,
    at_target_amount: (target - current) * quantity * multiplier * direction,
    in_profit: (current - entry) * direction >= 0
  }
}
