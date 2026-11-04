// Shared display formatting for R-multiples: '+1.3R' / '-0.5R' (one decimal), '-' when absent.
export function formatR(value) {
  if (value === null || value === undefined) return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${num.toFixed(1)}R`
}
