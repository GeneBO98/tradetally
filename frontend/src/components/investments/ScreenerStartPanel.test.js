import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ScreenerStartPanel from './ScreenerStartPanel.vue'

const { investmentsStore } = vi.hoisted(() => ({
  investmentsStore: {
    screenerDiscover: null,
    screenerDiscoverLoading: false,
    fetchScreenerDiscover: null
  }
}))

vi.mock('@/stores/investments', () => ({
  useInvestmentsStore: () => investmentsStore
}))

vi.mock('@/components/common/StockLogo.vue', () => ({
  default: { name: 'StockLogo', props: ['symbol', 'logoUrl', 'sizeClass'], template: '<span class="logo" />' }
}))

const pick = (overrides = {}) => ({
  symbol: 'ABC',
  companyName: 'ABC Corp',
  industry: 'Technology',
  logo: null,
  pillarsPassed: 7,
  fiveYearPe: 8.456,
  priceToFcf: 12,
  marketCap: 2_400_000_000,
  currentPrice: 42,
  analysisDate: '2026-10-01T00:00:00.000Z',
  ...overrides
})

const discoverPayload = () => ({
  lowestPe: [pick({ symbol: 'LOW', fiveYearPe: 5.2 })],
  mostPillars: [pick({ symbol: 'BIG', pillarsPassed: 8, marketCap: 1.5e12 })],
  upcomingEarnings: [pick({ symbol: 'ERN', earningsDate: '2026-11-05', earningsHour: 'amc' })],
  meta: {
    analyzedSymbols: 1789,
    latestAnalysisDate: '2026-10-29T16:04:28.000Z',
    hasScanData: true,
    earningsWindow: { from: '2026-10-29', to: '2026-11-12' },
    thresholds: { lowestPeMinPillars: 6, mostPillarsMin: 7, earningsMinPillars: 5, minMarketCap: 250000000 }
  }
})

function setStore(payload) {
  const state = ref(payload)
  Object.defineProperty(investmentsStore, 'screenerDiscover', {
    configurable: true,
    get: () => state.value
  })
  investmentsStore.fetchScreenerDiscover = vi.fn(async () => {
    if (payload instanceof Error) throw payload
    state.value = payload
    return payload
  })
  return state
}

describe('ScreenerStartPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a skeleton until the first fetch resolves, then renders all three lists', async () => {
    let resolveFetch
    const state = ref(null)
    Object.defineProperty(investmentsStore, 'screenerDiscover', { configurable: true, get: () => state.value })
    investmentsStore.fetchScreenerDiscover = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve }))

    const wrapper = mount(ScreenerStartPanel)
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Nothing to browse yet')

    state.value = discoverPayload()
    resolveFetch(state.value)
    await flushPromises()

    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
    const text = wrapper.text()
    expect(text).toContain('Value picks')
    expect(text).toContain('Most pillars passed')
    expect(text).toContain('Earnings in the next two weeks')
    expect(text).toContain('LOW')
    expect(text).toContain('5.2')
    expect(text).toContain('BIG')
    expect(text).toContain('8/8')
    expect(text).toContain('$1.50T')
    expect(text).toContain('ERN')
    expect(text).toContain('Thu, Nov 5')
    expect(text).toContain('After close')
    expect(text).toContain('Based on 1,789 analyzed stocks')
    expect(text).toContain('Open full scanner')
  })

  it('emits select with the symbol when a row is clicked and open-scanner from the header link', async () => {
    setStore(discoverPayload())
    const wrapper = mount(ScreenerStartPanel)
    await flushPromises()

    const row = wrapper.findAll('li button').find((b) => b.text().includes('LOW'))
    await row.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['LOW']])

    const link = wrapper.findAll('button').find((b) => b.text() === 'Open full scanner')
    await link.trigger('click')
    expect(wrapper.emitted('open-scanner')).toHaveLength(1)
  })

  it('falls back to starter symbols when no scan data exists', async () => {
    setStore({ lowestPe: [], mostPillars: [], upcomingEarnings: [], meta: { hasScanData: false, analyzedSymbols: 0 } })
    const wrapper = mount(ScreenerStartPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('Nothing to browse yet')
    expect(wrapper.text()).not.toContain('Open full scanner')
    const chip = wrapper.findAll('button').find((b) => b.text() === 'AAPL')
    await chip.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['AAPL']])
  })

  it('explains a pending rescan when the last scan used an outdated formula', async () => {
    setStore({ lowestPe: [], mostPillars: [], upcomingEarnings: [], meta: { hasScanData: false, analyzedSymbols: 5, rescanPending: true, rescanReason: 'outdated_formula' } })
    const wrapper = mount(ScreenerStartPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('Scan results are being refreshed')
    expect(wrapper.text()).toContain('formula changed since the last scan')
    expect(wrapper.findAll('button').some((b) => b.text() === 'MSFT')).toBe(true)
  })

  it('shows per-list empty text when a single list is empty', async () => {
    const payload = discoverPayload()
    payload.upcomingEarnings = []
    setStore(payload)
    const wrapper = mount(ScreenerStartPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('No quality names report in the next two weeks')
  })

  it('shows a retry state when the fetch fails and retries with force', async () => {
    setStore(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mount(ScreenerStartPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('Starter lists are unavailable right now')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Try again')
    await retry.trigger('click')
    expect(investmentsStore.fetchScreenerDiscover).toHaveBeenLastCalledWith({ force: true })
    errorSpy.mockRestore()
  })
})
