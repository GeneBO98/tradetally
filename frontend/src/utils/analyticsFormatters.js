// Shared formatters for analytics performance tables (tag/strategy/hour) and
// the top-symbols list. Kept in one place so the extracted analytics child
// components don't each carry their own copy.

// R-multiple values in the tables: one decimal (DESIGN.md number policy).
export function formatNumber(num) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(num || 0)
}

// Win rate helpers for tag / strategy / hour rows. Mirrors the overview pattern:
// "incl. BE" uses wins / total; "excl. BE" uses wins / (wins + losses) so a
// scratch (breakeven) trade no longer dilutes the rate.
export function winRateInclBE(row) {
  const total = Number(row?.total_trades) || 0
  if (total === 0) return '0.0'
  const wins = Number(row?.winning_trades) || 0
  return ((wins / total) * 100).toFixed(1)
}

export function winRateExclBE(row) {
  const wins = Number(row?.winning_trades) || 0
  const losses = Number(row?.losing_trades) || 0
  const decisive = wins + losses
  if (decisive === 0) return '0.0'
  return ((wins / decisive) * 100).toFixed(1)
}

// Integer-rounded variant for the compact Top Performing Symbols list where
// a 1-decimal "100.0%" overflows the w-12 column.
export function winRateExclBERounded(row) {
  const wins = Number(row?.winning_trades) || 0
  const losses = Number(row?.losing_trades) || 0
  const decisive = wins + losses
  if (decisive === 0) return '0'
  return ((wins / decisive) * 100).toFixed(0)
}
