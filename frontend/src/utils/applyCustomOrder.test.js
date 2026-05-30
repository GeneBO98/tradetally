import { describe, expect, it } from 'vitest'
import { applyCustomOrder, applyCustomOrderToNames } from './applyCustomOrder'

describe('applyCustomOrder', () => {
  it('keeps frequency order when no custom order is saved', () => {
    const items = [{ name: 'a', count: 10 }, { name: 'b', count: 5 }]
    expect(applyCustomOrder(items, [])).toEqual(items)
  })

  it('places custom order first and appends remaining by frequency', () => {
    const items = [
      { name: 'day_trading', count: 20 },
      { name: 'swing', count: 10 },
      { name: 'scalper', count: 5 }
    ]
    const result = applyCustomOrder(items, ['scalper', 'day_trading'])
    expect(result.map((i) => i.name)).toEqual(['scalper', 'day_trading', 'swing'])
  })

  it('orders plain name arrays', () => {
    expect(applyCustomOrderToNames(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b'])
  })
})
