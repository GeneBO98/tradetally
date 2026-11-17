import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PerformanceScoreBreakdown from './PerformanceScoreBreakdown.vue'

const score = {
  ready: true,
  score: 78,
  bandLabel: 'Solid',
  tradesCounted: 64,
  minTrades: 20,
  factors: [
    { key: 'profitFactor', label: 'Profit factor', description: '', weight: 25, value: 1.9, score: 79 },
    { key: 'expectancy', label: 'Expectancy', description: '', weight: 20, value: 0.31, score: 75 },
    { key: 'drawdown', label: 'Drawdown control', description: '', weight: 20, value: null, score: 100 },
    { key: 'consistency', label: 'Consistency', description: '', weight: 15, value: 61.5, score: 77 },
    { key: 'winRate', label: 'Win rate', description: '', weight: 10, value: 54.2, score: 73 },
    { key: 'riskAdjusted', label: 'Risk-adjusted return', description: '', weight: 10, value: 0.18, score: 20 }
  ]
}

describe('PerformanceScoreBreakdown', () => {
  it('lists each factor in trader units with its 0-100 score', () => {
    const wrapper = mount(PerformanceScoreBreakdown, { props: { score } })
    const text = wrapper.text()

    expect(wrapper.findAll('dl > div')).toHaveLength(6)
    expect(text).toContain('1.90')
    expect(text).toContain('+0.31R')
    expect(text).toContain('no drawdown')
    expect(text).toContain('62%')
    expect(text).toContain('54%')
    expect(text).toContain('From 64 closed trades')
  })

  it('sizes and tones each bar by its score', () => {
    const wrapper = mount(PerformanceScoreBreakdown, { props: { score } })
    const bars = wrapper.findAll('dl > div [style]')

    expect(bars[0].attributes('style')).toContain('width: 79%')
    expect(bars[0].classes()).toContain('bg-green-600')
    expect(bars[5].classes()).toContain('bg-red-500')
  })
})
