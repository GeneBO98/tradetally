const DEFAULT_MAX_AGE_MS = 60_000

export function saveReloadScrollPosition(storage, key, scroll_y, saved_at = Date.now()) {
  const normalized_scroll_y = Number(scroll_y)
  if (!storage || !key || !Number.isFinite(normalized_scroll_y)) return false

  try {
    storage.setItem(key, JSON.stringify({
      scroll_y: Math.max(0, normalized_scroll_y),
      saved_at,
    }))
    return true
  } catch {
    return false
  }
}

export function consumeReloadScrollPosition(
  storage,
  key,
  now = Date.now(),
  max_age_ms = DEFAULT_MAX_AGE_MS
) {
  if (!storage || !key) return null

  let raw_value
  try {
    raw_value = storage.getItem(key)
    storage.removeItem(key)
  } catch {
    return null
  }

  if (!raw_value) return null

  try {
    const value = JSON.parse(raw_value)
    const scroll_y = Number(value?.scroll_y)
    const saved_at = Number(value?.saved_at)
    const age_ms = now - saved_at
    if (!Number.isFinite(scroll_y) || !Number.isFinite(saved_at)) return null
    if (age_ms < 0 || age_ms > max_age_ms) return null
    return Math.max(0, scroll_y)
  } catch {
    return null
  }
}
