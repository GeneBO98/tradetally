import { useNamedOrder } from './useNamedOrder'

const STRATEGY_ORDER_KEY = 'strategyOrder'

export function useStrategyOrder() {
  const o = useNamedOrder(STRATEGY_ORDER_KEY)
  return {
    strategyOrder: o.order,
    refresh: o.refresh,
    setStrategyOrder: o.setOrder,
    orderUsageItems: o.orderUsageItems,
    orderNames: o.orderNames,
    moveStrategyInUsage: o.moveInUsage
  }
}
