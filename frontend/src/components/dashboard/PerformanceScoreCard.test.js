import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PerformanceScoreCard from './PerformanceScoreCard.vue'

const ready = {
  ready: true,
  score: 78,
  band: 'solid',
  bandLabel: 'Solid',
  tradesCounted: 64,
  minTrades: 20,
  factors: [
    { key: 'profitFactor', label: 'Profit factor', description: '', weight: 25, value: 1.9, score: 79 },
    { key: 'expectancy', label: 'Expectancy', description: '', weight: 20, value: 0.31, score: 75 },
    { key: 'drawdown', label: 'Drawdown control', description: '', weight: 20, value: null, score: 100 },
    { key: 'consistency', label: 'Consistency', description: '', weight: 15, value: 61.5, score: 77 },
    { key: 'winRate', label: 'Win rate', description: '', weight: 10, value: 54.2, score: 73 },
    { key: 'riskAdjusted', label: 'Risk-adjusted return', description: '', weight: 10, value: 0.18, score: 69 }
  ]
}

describe('PerformanceScoreCard', () => {
  it('shows the score, its band and each factor in trader units', () => {
    const wrapper = mount(PerformanceScoreCard, { props: { score: ready, rangeLabel: 'Last 90 days' } })
    const text = wrapper.text()

    expect(text).toContain('78')
    expect(text).toContain('/ 100')
    expect(text).toContain('Solid')
    expect(text).toContain('Last 90 days')
    expect(text).toContain('From 64 closed trades')
    expect(text).toContain('1.90')
    expect(text).toContain('+0.31R')
    expect(text).toContain('no drawdown')
    expect(text).toContain('62%')
    expect(text).toContain('54%')
    expect(wrapper.find('[data-testid="performance-score-pending"]').exists()).toBe(false)
  })

  it('shows progress toward the minimum when there are too few trades', () => {
    const wrapper = mount(PerformanceScoreCard, {
      props: { score: { ready: false, score: null, tradesCounted: 13, minTrades: 20, factors: [] } }
    })

    const pending = wrapper.find('[data-testid="performance-score-pending"]')
    expect(pending.text()).toContain('7 more closed trades')
    expect(pending.text()).toContain('13 / 20 closed trades')
    expect(pending.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('13')
  })

  it('renders the pending state when the backend sends no score', () => {
    const wrapper = mount(PerformanceScoreCard, { props: { score: null } })

    expect(wrapper.find('[data-testid="performance-score-pending"]').text()).toContain('20 more closed trades')
  })
})
