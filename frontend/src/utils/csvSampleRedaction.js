// Redaction for CSV sample values that leave the browser for AI column
// matching. Account numbers and other long identifiers are masked; values the
// matcher needs (symbols, prices, quantities, dates) are left readable.
//
// Mirrors the same rules in backend/src/services/csvMappingSuggestionService.js,
// which applies them again before anything reaches the AI provider.
//
// Known limit: an all-numeric account number of 8 digits or fewer, in a column
// whose header does not say what it is, looks the same as a quantity and is
// not masked.

const SENSITIVE_HEADER = /acc(oun)?t|\bacc\b|\ba\/c\b|\biban\b|\bssn\b|social.?sec|tax.?id|\btin\b|routing|card.?(no|num|#)|customer.?(id|no|num|#)|client.?(id|no|num|#)|user.?id|login|konto|compte|cuenta|\bconta\b|rekening/i
// Real date and time shapes only, so an identifier such as 123-45-6789 is not
// mistaken for a date and a date elsewhere in a cell does not exempt the rest.
const DATE_OR_TIME = /\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?|\b\d{4}[/.]\d{1,2}[/.]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\b/g
const TOKEN = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g

function isCalendarLike(text) {
  const parts = text.split(/[^0-9]+/).filter(Boolean).map(Number)
  if (text.includes(':') && !/[/.-]\d/.test(text.split(':')[0])) return true
  if (parts[0] > 31) return parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31
  return parts[0] >= 1 && parts[1] >= 1 && parts[0] <= 31 && parts[1] <= 31 && (parts[0] <= 12 || parts[1] <= 12)
}

function maskIdentifiers(text) {
  return text.replace(TOKEN, (token) => {
    const digits = (token.match(/\d/g) || []).length
    const numeric = /^\d+$/.test(token)
    // Plain numbers stay unless they are too long to be a price or quantity;
    // mixed identifiers (U1234567, 123-456789-001) are masked from 6 digits.
    if (numeric ? digits >= 9 : digits >= 6) return token.replace(/\d/g, '#')
    return token
  })
}

// Mask identifiers anywhere in free text, leaving real dates and times alone.
export function redactText(value) {
  const text = String(value ?? '')
  let result = ''
  let last = 0
  for (const match of text.matchAll(DATE_OR_TIME)) {
    if (!isCalendarLike(match[0])) continue
    result += maskIdentifiers(text.slice(last, match.index)) + match[0]
    last = match.index + match[0].length
  }
  return result + maskIdentifiers(text.slice(last))
}

export const REDACTED = '[redacted]'

export function isSensitiveHeader(header) {
  return SENSITIVE_HEADER.test(String(header || ''))
}

export function redactSample(header, value) {
  const text = String(value ?? '')
  if (!text.trim()) return text
  if (isSensitiveHeader(header)) return REDACTED
  return redactText(text)
}
