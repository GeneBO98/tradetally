// Shared general-purpose display formatters.
// Currency formatting lives in composables/useCurrencyFormatter.js (needs the
// user's display_currency setting); timezone-safe date helpers live in
// utils/date.js. This module holds formatters with no user-setting dependency.

/**
 * Format a numeric value as a percentage string.
 *
 * @param {number|string|null|undefined} value - The value to format
 * @param {object} [options]
 * @param {number} [options.digits=2] - Number of fraction digits
 * @param {boolean} [options.showSign=false] - Prefix '+' for zero/positive values
 * @param {boolean} [options.abs=false] - Format the absolute value (drops the negative sign)
 * @param {number} [options.multiplier=1] - Scale factor applied before formatting
 *   (use 100 when the input is a decimal ratio like 0.15)
 * @param {string} [options.nullValue='-'] - Returned for null/undefined/non-numeric input
 * @returns {string}
 */
export function formatPercent(value, options = {}) {
  const {
    digits = 2,
    showSign = false,
    abs = false,
    multiplier = 1,
    nullValue = '-'
  } = options

  if (value === null || value === undefined) return nullValue
  const num = parseFloat(value)
  if (!Number.isFinite(num)) return nullValue

  const scaled = (abs ? Math.abs(num) : num) * multiplier
  const sign = showSign && scaled >= 0 ? '+' : ''
  return `${sign}${scaled.toFixed(digits)}%`
}
