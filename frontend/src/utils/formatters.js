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
    digits = 1,
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

/**
 * Share / contract counts. The API returns NUMERIC columns as strings with
 * trailing zeros ("4600.00000000"); show "4,600" or "0.5" instead.
 */
export function formatQuantity(value) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/**
 * Plain number for display: fixed decimals with thousands separators and the
 * sign in front ("-1,234.50", "+0.8"). Use instead of `.toFixed()` for any
 * number a user reads; keep `.toFixed()` only for values fed back into code
 * (inputs, payloads, rounding).
 * @param {number|string} value
 * @param {object} [options]
 * @param {number} [options.digits=2]
 * @param {boolean} [options.showSign=false] - '+' for positive values
 * @param {string} [options.nullValue='-']
 */
export function formatDecimal(value, options = {}) {
  const { digits = 2, showSign = false, nullValue = '-' } = options
  if (value === null || value === undefined || value === '') return nullValue
  const n = Number(value)
  if (!Number.isFinite(n)) return nullValue
  const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const rounded = Number(Math.abs(n).toFixed(digits))
  const sign = n < 0 && rounded !== 0 ? '-' : showSign && rounded !== 0 ? '+' : ''
  return `${sign}${text}`
}
