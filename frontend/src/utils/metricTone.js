/**
 * One colour law for performance metrics, shared by every stat tile.
 * Green/red mean direction only: above or below the break-even line.
 */
export const GAIN = 'text-green-700 dark:text-green-400'
export const LOSS = 'text-red-600 dark:text-red-400'
// Zero / no-direction values are muted so they never read as a result.
export const FLAT = 'text-gray-500 dark:text-gray-400'

export function pnlClass(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return FLAT
  return n > 0 ? GAIN : LOSS
}

/** Win rate: 50% is break-even. */
export function winRateClass(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return FLAT
  return n >= 50 ? GAIN : LOSS
}

/** Profit factor: 1.0 is break-even; Infinity (no losses) is a gain. */
export function profitFactorClass(value) {
  if (value === Infinity) return GAIN
  const n = Number(value)
  if (!Number.isFinite(n)) return FLAT
  return n >= 1 ? GAIN : LOSS
}
