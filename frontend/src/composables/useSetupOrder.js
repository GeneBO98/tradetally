import { useNamedOrder } from './useNamedOrder'

const SETUP_ORDER_KEY = 'setupOrder'

export function useSetupOrder() {
  const o = useNamedOrder(SETUP_ORDER_KEY)
  return {
    setupOrder: o.order,
    refresh: o.refresh,
    setSetupOrder: o.setOrder,
    orderUsageItems: o.orderUsageItems,
    orderNames: o.orderNames,
    moveSetupInUsage: o.moveInUsage
  }
}
