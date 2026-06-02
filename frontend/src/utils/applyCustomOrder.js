/**
 * Apply a user-defined name order on top of a frequency-sorted list.
 * Names in customOrder appear first (in that order); remaining items keep
 * their original sequence (typically most-used first from the API).
 *
 * @param {Array<{ name: string, count?: number }>|string[]} items
 * @param {string[]} customOrder
 * @returns {typeof items}
 */
export function applyCustomOrder(items, customOrder) {
  if (!Array.isArray(items) || items.length === 0) return items
  if (!Array.isArray(customOrder) || customOrder.length === 0) return items

  const getName = (item) => (typeof item === 'string' ? item : item?.name)
  const byName = new Map()
  for (const item of items) {
    const name = getName(item)
    if (name != null && name !== '') byName.set(name, item)
  }

  const ordered = []
  const seen = new Set()

  for (const name of customOrder) {
    if (byName.has(name)) {
      ordered.push(byName.get(name))
      seen.add(name)
    }
  }

  for (const item of items) {
    const name = getName(item)
    if (!seen.has(name)) ordered.push(item)
  }

  return ordered
}

/**
 * @param {string[]} names - frequency-sorted names from API
 * @param {string[]} customOrder
 * @returns {string[]}
 */
export function applyCustomOrderToNames(names, customOrder) {
  return applyCustomOrder(names, customOrder)
}
