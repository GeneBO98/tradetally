import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import TradeSummaryMetrics from './TradeSummaryMetrics.vue'
import PositionSummaryMetrics from './PositionSummaryMetrics.vue'

const trade = {
  id: 'trade-429', symbol: 'AAPL', side: 'long', quantity: '10',
  entry_price: '100', exit_price: '110', stop_loss: '95',
  take_profit: null, take_profit_targets: [], trade_date: '2026-11-06'
}

const analysis = {
  risk_amount: 50, risk_per_share: 5, actual_pl_amount: 100,
  actual_r: 2, target_r: null, target_pl_amount: null, management_r: null
}

function metric_value(wrapper, label) {
  return wrapper.findAll('.text-label').find(node => node.text() === label).element.nextElementSibling
}

describe('Trade Management summary rendering (issue 429)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it.each([
    ['profit', '100.00', 'text-green-700'],
    ['loss', '-100.00', 'text-red-600'],
    ['breakeven', '0.00', 'text-gray-500']
  ])('renders an individual trade with %s and updates its P&L color', async (_, pnl, expected_class) => {
    const wrapper = shallowMount(TradeSummaryMetrics, {
      props: { trade: { ...trade, pnl, pnl_percent: '10' }, analysis: { ...analysis, actual_pl_amount: Number(pnl) } },
      global: { stubs: { RouterLink: true } }
    })

    expect(wrapper.text()).toContain('Trade Summary')
    expect(metric_value(wrapper, 'Actual P&L').classList.contains(expected_class)).toBe(true)
    expect(metric_value(wrapper, 'Exit Price').classList.contains(expected_class)).toBe(true)
    await wrapper.setProps({ trade: { ...trade, pnl: '-50.00' } })
    expect(metric_value(wrapper, 'Actual P&L').classList.contains('text-red-600')).toBe(true)
    wrapper.unmount()
  })

  it('renders a grouped position with separate colors for the total and each leg', () => {
    const wrapper = shallowMount(PositionSummaryMetrics, {
      props: {
        trade: {
          ...trade, pnl: '50.00', position_grouped: true, leg_count: 2,
          legs: [
            { ...trade, pnl: '100.00', actual_r: 2, included_in_analysis: true },
            { ...trade, id: 'losing-leg', pnl: '-50.00', actual_r: -1, included_in_analysis: true }
          ]
        },
        analysis: { ...analysis, analyzed_leg_count: 2 }
      },
      global: { stubs: { RouterLink: true } }
    })

    expect(metric_value(wrapper, 'Net P&L').classList.contains('text-green-700')).toBe(true)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('td')[6].classes()).toContain('text-green-700')
    expect(rows[1].findAll('td')[6].classes()).toContain('text-red-600')
    expect(rows[0].findAll('td')[7].get('span').classes()).toContain('text-green-700')
    expect(rows[1].findAll('td')[7].get('span').classes()).toContain('text-red-600')
    wrapper.unmount()
  })
})
