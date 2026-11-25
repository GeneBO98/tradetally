import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import WhatIfSimulatorCard from './WhatIfSimulatorCard.vue'

const apiGet = vi.fn()
vi.mock('@/services/api', () => ({
  default: {
    get: (...args) => apiGet(...args)
  }
}))

// Exercise the REAL useProAccess composable backed by a reactive auth store
const authStoreState = reactive({
  user: { id: 'user-1', tier: 'pro', role: 'user', billingEnabled: true }
})
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreState
}))

vi.mock('@/composables/useDarkMode', () => ({
  useDarkMode: () => ({ isDark: ref(false) })
}))

vi.mock('@/lib/chartSetup', () => ({
  Chart: vi.fn().mockImplementation(() => ({ destroy: vi.fn() }))
}))

vi.mock('@/composables/useAnalytics', () => ({
  useAnalytics: () => ({ track: vi.fn() })
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ fullPath: '/analytics' })
}))

describe('WhatIfSimulatorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authStoreState.user = { id: 'user-1', tier: 'pro', role: 'user', billingEnabled: true }
  })

  it('recomputes counterfactual P&L and trades skipped live as Pro user toggles scenarios', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        actual: { tradeCount: 4, totalPnl: -200, winCount: 2, lossCount: 2, winRate: 50, profitFactor: 0.67 },
        scenarios: [
          { key: 'worst_symbol', label: 'Skip TSLA', shortLabel: 'Skip TSLA', detail: 'Most expensive ticker', tradeCount: 2, recoverablePnl: 600 },
          { key: 'revenge', label: 'Post-loss re-entries', shortLabel: 'Revenge trades', detail: 'Within 30 min of prior loss', tradeCount: 1, recoverablePnl: 450 }
        ],
        trades: [
          { d: '2026-03-01', p: 200, f: [] },
          { d: '2026-03-02', p: 200, f: [] },
          { d: '2026-03-03', p: -150, f: ['worst_symbol'] },
          { d: '2026-03-03', p: -450, f: ['worst_symbol', 'revenge'] }
        ],
        maxRecoverablePnl: 600,
        behavioralRecoverablePnl: 450
      }
    })

    const wrapper = mount(WhatIfSimulatorCard, {
      props: { filterParams: { startDate: '2026-03-01' } }
    })
    await flushPromises()

    expect(apiGet).toHaveBeenCalledWith('/analytics/what-if', { params: { startDate: '2026-03-01' } })
    expect(wrapper.text()).toContain('+$600 upside')
    expect(wrapper.text()).toContain('+$400')

    const resetBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Reset')
    await resetBtn.trigger('click')
    expect(wrapper.text()).toContain('-$200')

    const revengeBtn = wrapper.findAll('button').find(b => b.text().includes('Post-loss re-entries'))
    await revengeBtn.trigger('click')
    expect(wrapper.text()).toContain('+$450 upside')
    expect(wrapper.text()).toContain('+$250')
    wrapper.unmount()
  })

  it('ignores stale out-of-order responses when filterParams change rapidly', async () => {
    let resolveFirst
    let resolveSecond
    apiGet
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))

    const wrapper = mount(WhatIfSimulatorCard, {
      props: { filterParams: { accounts: 'acct-old' } }
    })
    await wrapper.setProps({ filterParams: { accounts: 'acct-new' } })

    // Second (newer) request resolves first
    resolveSecond({
      data: {
        actual: { tradeCount: 2, totalPnl: 500, winCount: 2, lossCount: 0, winRate: 100, profitFactor: null },
        scenarios: [{ key: 'revenge', label: 'New account rule', shortLabel: 'New', detail: '', tradeCount: 1, recoverablePnl: 120 }],
        trades: [{ d: '2026-03-01', p: 500, f: [] }, { d: '2026-03-02', p: -120, f: ['revenge'] }],
        maxRecoverablePnl: 120
      }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('New account rule')

    // First (stale) request resolves later and must NOT overwrite newer data
    resolveFirst({
      data: {
        actual: { tradeCount: 2, totalPnl: -999, winCount: 0, lossCount: 2, winRate: 0, profitFactor: 0 },
        scenarios: [{ key: 'worst_symbol', label: 'Stale old account', shortLabel: 'Old', detail: '', tradeCount: 2, recoverablePnl: 999 }],
        trades: [{ d: '2026-03-01', p: -999, f: ['worst_symbol'] }],
        maxRecoverablePnl: 999
      }
    })
    await flushPromises()
    expect(wrapper.text()).toContain('New account rule')
    expect(wrapper.text()).not.toContain('Stale old account')
    wrapper.unmount()
  })

  it('shows the rules simulator even when no hindsight patterns are found', async () => {
    const T = (h, m) => Date.UTC(2026, 2, 2, h, m)
    apiGet.mockResolvedValueOnce({
      data: {
        actual: { tradeCount: 3, totalPnl: -160, winCount: 1, lossCount: 2, winRate: 33.33, profitFactor: 0.38 },
        scenarios: [],
        trades: [
          { d: '2026-03-02', p: -300, f: [], e: T(14, 0), x: T(14, 10), m: 540, tg: ['fomo'], pb: 'broken' },
          { d: '2026-03-02', p: 240, f: [], e: T(14, 20), x: T(14, 30), m: 560, tg: [], pb: 'followed' },
          { d: '2026-03-02', p: -100, f: [], e: T(14, 40), x: T(14, 50), m: 580, tg: ['fomo'], pb: null }
        ],
        maxRecoverablePnl: 0,
        behavioralRecoverablePnl: 0,
        rules: {
          dailyLossLimit: { default: 250, source: 'avg_loss', avgLoss: 200 },
          maxTradesPerDay: { default: 3, maxTradesInADay: 3, tradingDays: 1 },
          entryCutoff: { defaultMinute: 660, earliestEntryMinute: 540, latestEntryMinute: 580 },
          tags: [{ tag: 'fomo', tradeCount: 2, totalPnl: -400 }],
          playbook: { reviewedCount: 2, brokenCount: 1, brokenPnl: -300, scoreThreshold: 70 }
        }
      }
    })

    const wrapper = mount(WhatIfSimulatorCard, { props: { filterParams: {} } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Rules you could follow')
    expect(text).toContain('No net-losing repeat patterns in this range.')
    expect(text).toContain('Skip broken-playbook trades')
    expect(wrapper.find('canvas').exists()).toBe(true)

    // Tag chip shows the impact of skipping #fomo on its own (+$400)
    const fomoBtn = wrapper.findAll('button').find(b => b.text().includes('#fomo'))
    expect(fomoBtn.text()).toContain('+$400')
    await fomoBtn.trigger('click')
    expect(wrapper.find('[data-testid="what-if-summary"]').text()).toContain('+$240')

    // Reset, then the daily loss limit ($250) skips trade 2 and 3 after the -$300 loss
    await wrapper.findAll('button').find(b => b.text().trim() === 'Reset').trigger('click')
    const lossBtn = wrapper.findAll('button').find(b => b.text().includes('Daily loss limit'))
    await lossBtn.trigger('click')
    const summary = wrapper.find('[data-testid="what-if-summary"]').text()
    expect(summary).toContain('-$160')
    expect(summary).toContain('-$300')
    wrapper.unmount()
  })

  it('keeps rule settings the trader changed when filters refetch', async () => {
    const T = (h, m) => Date.UTC(2026, 2, 2, h, m)
    const payload = () => ({
      data: {
        actual: { tradeCount: 2, totalPnl: -100, winCount: 1, lossCount: 1, winRate: 50, profitFactor: 0.5 },
        scenarios: [],
        trades: [
          { d: '2026-03-02', p: -200, f: [], e: T(14, 0), x: T(14, 10), m: 540, tg: [], pb: null },
          { d: '2026-03-02', p: 100, f: [], e: T(14, 20), x: T(14, 30), m: 560, tg: [], pb: null }
        ],
        rules: {
          dailyLossLimit: { default: 400, source: 'avg_loss', avgLoss: 200 },
          maxTradesPerDay: { default: 3, maxTradesInADay: 2, tradingDays: 1 },
          entryCutoff: { defaultMinute: 660, earliestEntryMinute: 540, latestEntryMinute: 560 },
          tags: [],
          playbook: { reviewedCount: 0, brokenCount: 0, brokenPnl: 0, scoreThreshold: 70 }
        }
      }
    })
    apiGet.mockResolvedValueOnce(payload()).mockResolvedValueOnce(payload())

    const wrapper = mount(WhatIfSimulatorCard, { props: { filterParams: { startDate: '2026-03-01' } } })
    await flushPromises()

    const input = wrapper.find('input[aria-label="Daily loss limit in dollars"]')
    expect(input.element.value).toBe('400')
    await input.setValue('150')
    await wrapper.findAll('button').find(b => b.text().includes('Daily loss limit')).trigger('click')
    expect(wrapper.find('[data-testid="what-if-summary"]').text()).toContain('-$200')

    await wrapper.setProps({ filterParams: { startDate: '2026-02-01' } })
    await flushPromises()

    expect(wrapper.find('input[aria-label="Daily loss limit in dollars"]').element.value).toBe('150')
    expect(wrapper.find('[data-testid="what-if-summary"]').text()).toContain('-$200')
    wrapper.unmount()
  })

  it('shows load error with retry action when Pro simulation request fails', async () => {
    apiGet.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(WhatIfSimulatorCard, {
      props: { filterParams: {} }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Unable to load What-If simulation right now')
    const retryBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Try again')
    expect(retryBtn).toBeTruthy()
    wrapper.unmount()
  })

})
