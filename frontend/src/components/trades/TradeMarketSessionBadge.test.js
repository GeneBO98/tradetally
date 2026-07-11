import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TradeMarketSessionBadge from './TradeMarketSessionBadge.vue'

describe('TradeMarketSessionBadge', () => {
  it('shows the stock entry session', () => {
    const wrapper = mount(TradeMarketSessionBadge, {
      props: {
        trade: {
          instrument_type: 'stock',
          entry_time: '2025-01-02T13:00:00.000Z',
        },
      },
    })

    expect(wrapper.text()).toBe('Pre-market')
    expect(wrapper.get('span').attributes('title')).toContain('8:00 AM ET')
  })

  it('does not apply US equity sessions to futures', () => {
    const wrapper = mount(TradeMarketSessionBadge, {
      props: {
        trade: {
          instrument_type: 'future',
          entry_time: '2025-01-02T13:00:00.000Z',
        },
      },
    })

    expect(wrapper.html()).toBe('<!--v-if-->')
  })
})
