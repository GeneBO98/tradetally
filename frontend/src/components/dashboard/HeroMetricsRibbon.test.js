import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import HeroMetricsRibbon from './HeroMetricsRibbon.vue'

const performanceScore = {
  ready: true,
  score: 68,
  band: 'solid',
  bandLabel: 'Solid',
  tradesCounted: 500,
  minTrades: 20,
  factors: [
    { key: 'profitFactor', label: 'Profit factor', description: '', weight: 25, value: 1.63, score: 69 },
    { key: 'winRate', label: 'Win rate', description: '', weight: 10, value: 58.2, score: 81 }
  ]
}

const analytics = (score) => ({
  summary: { totalTrades: 500, winningTrades: 290, losingTrades: 208, breakevenTrades: 2, totalNetPnL: 18334.24, profitFactor: 1.63 },
  dailyPnL: [],
  ...(score === undefined ? {} : { performanceScore: score })
})

describe('HeroMetricsRibbon performance score', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
  })

  const mountRibbon = (score) => mount(HeroMetricsRibbon, {
    props: { analytics: analytics(score) },
    global: { plugins: [pinia] }
  })

  it('shows the score collapsed by default', () => {
    const wrapper = mountRibbon(performanceScore)
    const cell = wrapper.get('[data-testid="performance-score"]')

    expect(cell.text()).toContain('68')
    expect(cell.text()).toContain('/ 100')
    expect(cell.text()).toContain('Solid')
    expect(cell.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="performance-score-breakdown"]').exists()).toBe(false)
  })

  it('expands to the factor breakdown on click and remembers the choice', async () => {
    const wrapper = mountRibbon(performanceScore)

    await wrapper.get('[data-testid="performance-score"]').trigger('click')

    expect(wrapper.get('[data-testid="performance-score"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="performance-score-breakdown"]').text()).toContain('Profit factor')
    expect(localStorage.getItem('dashboard_score_expanded')).toBe('true')

    // A fresh mount starts expanded.
    expect(mountRibbon(performanceScore).find('[data-testid="performance-score-breakdown"]').exists()).toBe(true)

    await wrapper.get('[data-testid="performance-score"]').trigger('click')
    expect(wrapper.find('[data-testid="performance-score-breakdown"]').exists()).toBe(false)
    expect(localStorage.getItem('dashboard_score_expanded')).toBe('false')
  })

  it('shows progress instead of a score when there are too few trades, and does not expand', async () => {
    const wrapper = mountRibbon({ ready: false, score: null, tradesCounted: 13, minTrades: 20, factors: [] })
    const cell = wrapper.get('[data-testid="performance-score"]')

    expect(cell.text()).toContain('13/20 trades')
    expect(cell.attributes('disabled')).toBeDefined()
    await cell.trigger('click')
    expect(wrapper.find('[data-testid="performance-score-breakdown"]').exists()).toBe(false)
  })

  it('renders a dash when the backend sends no score', () => {
    const cell = mountRibbon(undefined).get('[data-testid="performance-score"]')

    expect(cell.text()).toContain('Score')
    expect(cell.text()).toContain('—')
    expect(cell.attributes('disabled')).toBeDefined()
  })
})
