import { useNamedOrder } from './useNamedOrder'

const TAG_ORDER_KEY = 'tagOrder'

export function useTagOrder() {
  const o = useNamedOrder(TAG_ORDER_KEY)
  return {
    tagOrder: o.order,
    refresh: o.refresh,
    setTagOrder: o.setOrder,
    orderUsageItems: o.orderUsageItems,
    orderNames: o.orderNames,
    moveTagInUsage: o.moveInUsage
  }
}
