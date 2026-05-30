import { ref } from 'vue'
import { useUiPreferencesStore } from '@/stores/uiPreferences'
import { applyCustomOrder } from '@/utils/applyCustomOrder'

const STRATEGY_ORDER_KEY = 'strategyOrder'

function readOrder() {
  try {
    const raw = localStorage.getItem(STRATEGY_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const strategyOrder = ref(readOrder())

export function useStrategyOrder() {
  const store = useUiPreferencesStore()

  function persist(list) {
    strategyOrder.value = list
    localStorage.setItem(STRATEGY_ORDER_KEY, JSON.stringify(list))
    store.notifyChanged(STRATEGY_ORDER_KEY, list)
  }

  function refresh() {
    strategyOrder.value = readOrder()
  }

  function setStrategyOrder(order) {
    persist(Array.isArray(order) ? order : [])
  }

  function orderUsageItems(usageItems) {
    return applyCustomOrder(usageItems || [], strategyOrder.value)
  }

  function orderNames(names) {
    return applyCustomOrder(names || [], strategyOrder.value)
  }

  function moveStrategyInUsage(usageItems, name, direction) {
    const ordered = orderUsageItems(usageItems)
    const names = ordered.map((u) => u.name)
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
    strategyOrder,
    refresh,
    setStrategyOrder,
    orderUsageItems,
    orderNames,
    moveStrategyInUsage
  }
}
