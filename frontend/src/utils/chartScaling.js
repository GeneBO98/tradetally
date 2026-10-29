// Helpers for charts of heavy-tailed trade metrics (MAE, MFE, P&L), where a
// single extreme trade can flatten every other point against an axis.

function quantile(sorted, p) {
  const index = (sorted.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

/**
 * Upper-tail outlier test that works in any unit (currency, points, R).
 * Magnitudes are scaled by their median and compared in log space, where
 * Tukey's far-out fence (Q3 + 3 * IQR) holds up for skewed data. A plain
 * IQR fence on raw values flags a large share of normal trades because most
 * MAE/MFE values cluster near zero; this one only flags values that are
 * orders of magnitude beyond the typical trade.
 * @param {number[]} values
 * @param {number} k fence multiplier
 * @returns {(value: number) => boolean} predicate, or null-safe always-false
 */
export function magnitudeOutlierTest(values, k = 3) {
  const finite = values.filter(value => Number.isFinite(value))
  const nonZero = finite.map(Math.abs).filter(value => value > 0).sort((a, b) => a - b)
  if (nonZero.length < 4) return () => false

  const median = quantile(nonZero, 0.5)
  const scaled = value => Math.log10(1 + Math.abs(value) / median)
  const mags = finite.map(scaled).sort((a, b) => a - b)
  const q1 = quantile(mags, 0.25)
  const q3 = quantile(mags, 0.75)
  const fence = q3 + k * (q3 - q1)

  return value => Number.isFinite(value) && scaled(value) > fence
}

/**
 * Items whose value on any of the given metrics is an extreme outlier.
 * @param {object[]} items
 * @param {Array<(item: object) => number|null>} accessors one per metric
 * @returns {Set<object>}
 */
export function findOutliers(items, accessors, k = 3) {
  const outliers = new Set()
  for (const accessor of accessors) {
    const values = items.map(accessor)
    const isOutlier = magnitudeOutlierTest(values.filter(value => value != null), k)
    items.forEach((item, index) => {
      if (values[index] != null && isOutlier(values[index])) outliers.add(item)
    })
  }
  return outliers
}

/**
 * Symmetric log transform (signed, continuous through zero) so a log axis
 * can show losses and gains together. `linearThreshold` sets the unit below
 * which the scale is roughly linear.
 */
export function symlog(value, linearThreshold = 1) {
  return Math.sign(value) * Math.log10(1 + Math.abs(value) / linearThreshold)
}

export function inverseSymlog(transformed, linearThreshold = 1) {
  return Math.sign(transformed) * linearThreshold * (Math.pow(10, Math.abs(transformed)) - 1)
}

/**
 * Tick positions (in transformed units) at 0 and powers of ten of the
 * threshold, covering [min, max] of the transformed axis.
 */
export function symlogTicks(min, max, linearThreshold = 1) {
  const ticks = []
  // symlog(10^k * threshold) is log10(1 + 10^k), just above k
  const decades = Math.ceil(Math.max(Math.abs(min), Math.abs(max)))
  // On wide axes the +-1 threshold ticks crowd the zero label; start at 10x.
  const firstDecade = decades >= 3 ? 1 : 0
  for (let k = firstDecade; k <= decades; k++) {
    const transformed = symlog(Math.pow(10, k) * linearThreshold, linearThreshold)
    if (transformed <= max) ticks.push(transformed)
    if (-transformed >= min) ticks.push(-transformed)
  }
  if (min <= 0 && max >= 0) ticks.push(0)
  return ticks.sort((a, b) => a - b).map(value => ({ value }))
}
