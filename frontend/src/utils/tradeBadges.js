/**
 * One geometry for every badge that hangs off a symbol in the trade list.
 * They sit shoulder to shoulder on a single line, so a row carrying OPT, a
 * session marker and a strategy has to read as one row of labels rather than
 * a pile of pills in three different sizes.
 */
export const TRADE_BADGE_BASE =
  'badge max-w-full overflow-hidden px-1.5 py-0 uppercase tracking-wide ring-1 ring-inset'

/**
 * Colour carries meaning here: categories (instrument kind, strategy) use the
 * theme tint, session is deliberately neutral (it is a footnote about timing,
 * not a category), and news follows sentiment because that is directional.
 */
export const TRADE_BADGE_TONES = Object.freeze({
  option: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800',
  future: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800',
  session: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  strategy: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800',
  newsPositive: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-800',
  newsNegative: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800',
  newsNeutral: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700'
})

export function tradeBadgeClass(tone) {
  return `${TRADE_BADGE_BASE} ${TRADE_BADGE_TONES[tone] || TRADE_BADGE_TONES.session}`
}

export function newsBadgeTone(sentiment) {
  if (sentiment === 'positive') return 'newsPositive'
  if (sentiment === 'negative') return 'newsNegative'
  return 'newsNeutral'
}
