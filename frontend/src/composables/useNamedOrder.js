import { ref } from 'vue'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { applyCustomOrder } from '@/utils/applyCustomOrder'

// Generic user-defined ordering for dropdown lists (strategies, setups, tags).
// The order is a plain array of names persisted under `storageKey` in
// localStorage (for synchronous reads) and synced across devices via the
// uiPreferences store. One reactive ref per key is shared by every consumer of
// that key, so the trade form and the filters always see the same order.

const orderRefs = new Map()

function readOrder(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getOrderRef(key) {
  if (!orderRefs.has(key)) orderRefs.set(key, ref(readOrder(key)))
  return orderRefs.get(key)
}

export function useNamedOrder(storageKey) {
  const store = useUiPreferencesStore()
  const order = getOrderRef(storageKey)

  function persist(list) {
    order.value = list
    localStorage.setItem(storageKey, JSON.stringify(list))
    store.notifyChanged(storageKey, list)
  }

  function refresh() {
    order.value = readOrder(storageKey)
  }

  function setOrder(list) {
    persist(Array.isArray(list) ? list : [])
  }

  function orderUsageItems(usageItems) {
    return applyCustomOrder(usageItems || [], order.value)
  }

  function orderNames(names) {
    return applyCustomOrder(names || [], order.value)
  }

  // Move `name` one slot up/down within the currently ordered list and persist
  // the new order. Returns the freshly ordered usage items.
  function moveInUsage(usageItems, name, direction) {
    const ordered = orderUsageItems(usageItems)
    const names = ordered.map((u) => (typeof u === 'string' ? u : u?.name))
    const idx = names.indexOf(name)
    if (idx < 0) return ordered
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= names.length) return ordered
    const next = [...names]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    persist(next)
    return orderUsageItems(usageItems)
  }

  return {
    order,
    refresh,
    setOrder,
    orderUsageItems,
    orderNames,
    moveInUsage
  }
}
