/**
 * One geometry for every badge that hangs off a symbol in the trade list.
 * They sit shoulder to shoulder on a single line, so a row carrying OPT, a
 * session marker and a strategy has to read as one row of labels rather than
 * a pile of pills in three different sizes.
 */
export const TRADE_BADGE_BASE =
  'max-w-full overflow-hidden uppercase tracking-wide'

/**
 * Colour carries meaning here: categories (instrument kind, strategy) use the
 * theme tint, session is deliberately neutral (it is a footnote about timing,
 * not a category), and news follows sentiment because that is directional.
 */
export const TRADE_BADGE_TONES = Object.freeze({
  option: 'badge-primary',
  future: 'badge-primary',
  session: 'badge-neutral',
  strategy: 'badge-primary',
  newsPositive: 'badge-success',
  newsNegative: 'badge-danger',
  newsMixed: 'badge-warning',
  newsNeutral: 'badge-neutral'
})

export function tradeBadgeClass(tone) {
  return `${TRADE_BADGE_BASE} ${TRADE_BADGE_TONES[tone] || TRADE_BADGE_TONES.session}`
}

export function newsBadgeTone(sentiment) {
  if (sentiment === 'positive') return 'newsPositive'
  if (sentiment === 'negative') return 'newsNegative'
  if (sentiment === 'mixed') return 'newsMixed'
  return 'newsNeutral'
}
