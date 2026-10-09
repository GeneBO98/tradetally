import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mount the real dashboard and vuedraggable item slots: replacing the draggable
// with an empty stub misses render errors that it displays as red stack traces.
// Heavy child cards remain stubbed; these tests cover view loading and filters.

const { apiMock, defaultGetImplementation, stub } = vi.hoisted(() => {
  // __esModule marks the mock as an ES module namespace so Vue's
  // defineAsyncComponent unwraps `.default` (several of these components are now
  // lazy-loaded). Without it, Vitest's mock-namespace proxy throws when Vue
  // probes __esModule/__isTeleport on the resolved module.
  const stub = (name) => ({
    __esModule: true,
    default: { name, template: `<div data-stub="${name}"></div>` }
  })

  const defaultGetImplementation = (url) => {
    if (typeof url === 'string') {
      if (url.startsWith('/settings')) {
        return Promise.resolve({ data: { settings: { statisticsCalculation: 'average' } } })
      }
      if (url.startsWith('/trades/analytics')) {
        return Promise.resolve({
          data: {
            summary: {},
            performanceBySymbol: [],
            dailyPnL: [],
            dailyWinRate: [],
            topTrades: { best: [], worst: [] }
          }
        })
      }
      if (url.startsWith('/trades?')) {
        return Promise.resolve({ data: { trades: [] } })
      }
      if (url === '/trades/open-positions-quotes') {
        return Promise.resolve({ data: { positions: [] } })
      }
    }
    return Promise.resolve({ data: {} })
  }

  return {
    stub,
    defaultGetImplementation,
    apiMock: {
      get: vi.fn(defaultGetImplementation),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} }))
    }
  }
})

vi.mock('@/services/api', () => ({ default: apiMock }))

// Partial mock: the auth store pulls in the real app router module, which
// needs createRouter/createWebHistory; only the composables are stubbed.
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useRoute: () => ({ path: '/dashboard', query: {}, params: {} })
  }
})

vi.mock('@/lib/chartSetup', () => {
  class ChartStub {
    constructor() {}
    update() {}
    resize() {}
    destroy() {}
  }
  return { Chart: ChartStub, default: ChartStub }
})

vi.mock('@/composables/useGlobalAccountFilter', async () => {
  const { ref, computed } = await import('vue')
  const selectedAccount = ref(null)
  return {
    STORAGE_KEY: 'tradetally_global_account',
    UNSORTED_ACCOUNT: '__unsorted__',
    useGlobalAccountFilter: () => ({
      selectedAccount,
      selectedAccountLabel: computed(() => 'All Accounts'),
      accounts: ref([]),
      loading: ref(false),
      initialize: vi.fn(),
      refresh: vi.fn(),
      setAccount: vi.fn()
    })
  }
})

// Heavy child components — visual only, irrelevant to the filter wiring.
vi.mock('@/components/dashboard/TradeNewsSection.vue', () => stub('TradeNewsSection'))
vi.mock('@/components/dashboard/UpcomingEarningsSection.vue', () => stub('UpcomingEarningsSection'))
vi.mock('@/components/diary/TodaysJournalEntry.vue', () => stub('TodaysJournalEntry'))
vi.mock('@/components/dashboard/HeroMetricsRibbon.vue', () => stub('HeroMetricsRibbon'))
vi.mock('@/components/dashboard/AiInsightCard.vue', () => stub('AiInsightCard'))
vi.mock('@/components/dashboard/CalendarHeatmap.vue', () => stub('CalendarHeatmap'))
vi.mock('@/components/dashboard/StreakMomentumCard.vue', () => stub('StreakMomentumCard'))
vi.mock('@/components/dashboard/BehavioralAlertsCard.vue', () => stub('BehavioralAlertsCard'))
vi.mock('@/components/dashboard/RecentTradesTimeline.vue', () => stub('RecentTradesTimeline'))
vi.mock('@/components/dashboard/WinLossPulse.vue', () => stub('WinLossPulse'))
vi.mock('@/components/MdiIcon.vue', () => stub('MdiIcon'))
vi.mock('@/components/yearWrapped/YearWrappedBanner.vue', () => stub('YearWrappedBanner'))
vi.mock('@/components/yearWrapped/YearWrappedModal.vue', () => stub('YearWrappedModal'))
vi.mock('@/components/onboarding/OnboardingCard.vue', () => stub('OnboardingCard'))
vi.mock('@/components/common/StockLogo.vue', () => stub('StockLogo'))

// TradeFilters is stubbed but keeps its `filter` emit contract so the test
// can drive the exact event the real component fires from the modal.
vi.mock('@/components/trades/TradeFilters.vue', () => ({
  // TradeFilters is lazy-loaded via defineAsyncComponent in DashboardView;
  // __esModule lets Vue unwrap `.default` from the mocked module namespace.
  __esModule: true,
  default: {
    name: 'TradeFilters',
    props: {
      autoApplyOnMount: { type: Boolean, default: true },
      hideTimePeriod: { type: Boolean, default: false }
    },
    emits: ['filter'],
    template: '<div data-stub="TradeFilters"></div>'
  }
}))

import DashboardView from '@/views/DashboardView.vue'
import { useTradesStore } from '@/stores/trades'

const FILTER_BUTTON_SELECTOR = 'button[aria-label="More filters"]'

describe('DashboardView loading and advanced filter wiring', () => {
  let wrapper
  let pinia

  beforeEach(() => {
    // One pinia shared by the mounted view and the test's useXStore() calls.
    pinia = createPinia()
    setActivePinia(pinia)
    apiMock.get.mockImplementation(defaultGetImplementation)
    sessionStorage.clear()
  })

  afterEach(() => {
    // Unmount so the view's auto-update intervals are cleared.
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
  })

  async function mountDashboard() {
    const mounted = mount(DashboardView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()
    expect(mounted.findAll('pre').map(node => node.text())).toEqual([])
    return mounted
  }

  function getBadge(w) {
    // The button also contains a visible "Filters" label span; the count
    // badge is the rounded pill.
    return w.get(FILTER_BUTTON_SELECTOR).find('span.rounded-full')
  }

  async function openFiltersModal(w) {
    await w.get(FILTER_BUTTON_SELECTOR).trigger('click')
    expect(w.find('[role="dialog"]').exists()).toBe(true)
    // TradeFilters is a defineAsyncComponent; flush the loader microtask so it
    // resolves and mounts before the test queries it via findComponent.
    await flushPromises()
  }

  it('hydrates persisted filters on mount without counting symbolExact:false toward the badge', async () => {
    localStorage.setItem('tradeFilters', JSON.stringify({ tags: ['swing'], symbolExact: false }))

    wrapper = await mountDashboard()

    // Badge shows 1 — only the tags filter counts; the persisted
    // symbolExact:false toggle must not produce a phantom second filter.
    const badge = getBadge(wrapper)
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')

    // Hydration writes through to the shared trades store.
    const tradesStore = useTradesStore()
    expect(tradesStore.filters.tags).toEqual(['swing'])
    expect(tradesStore.filters.symbolExact).toBe(false)
  })

  it('shows no badge when only inactive values (symbolExact:false) are persisted', async () => {
    localStorage.setItem('tradeFilters', JSON.stringify({ symbolExact: false }))

    wrapper = await mountDashboard()

    expect(getBadge(wrapper).exists()).toBe(false)
  })

  it('hides the duplicate Time Period date control in the dashboard modal', async () => {
    // The dashboard header owns the date range (quick-range selector) and
    // ignores date filters from this panel, so the panel's own date picker is
    // hidden to avoid the confusing non-functional duplicate (issue #350).
    wrapper = await mountDashboard()
    await openFiltersModal(wrapper)

    const tradeFilters = wrapper.findComponent({ name: 'TradeFilters' })
    expect(tradeFilters.exists()).toBe(true)
    expect(tradeFilters.props('hideTimePeriod')).toBe(true)
  })

  it('an empty filter emit (Reset) clears the store, closes the modal, and clears the badge', async () => {
    localStorage.setItem('tradeFilters', JSON.stringify({ tags: ['swing'], symbolExact: false }))

    wrapper = await mountDashboard()

    // Sanity: the hydrated tags filter shows on the badge.
    expect(getBadge(wrapper).text()).toBe('1')

    await openFiltersModal(wrapper)

    // Reset inside TradeFilters emits an empty spec; the dashboard treats that
    // as "no advanced filters" (this is the path that replaced "Clear all").
    const tradeFilters = wrapper.findComponent({ name: 'TradeFilters' })
    expect(tradeFilters.exists()).toBe(true)
    tradeFilters.vm.$emit('filter', {})
    await flushPromises()

    // Store filters are reset.
    const tradesStore = useTradesStore()
    expect(tradesStore.filters.tags).toEqual([])

    // Modal closed, badge gone.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(getBadge(wrapper).exists()).toBe(false)
  })

  it('applying filters from the modal writes normalized arrays to the trades store and counts the badge', async () => {
    wrapper = await mountDashboard()

    expect(getBadge(wrapper).exists()).toBe(false)

    await openFiltersModal(wrapper)

    // The real TradeFilters panel can emit comma-separated strings; the view
    // must normalize them before pushing into the shared store.
    const tradeFilters = wrapper.findComponent({ name: 'TradeFilters' })
    expect(tradeFilters.exists()).toBe(true)
    tradeFilters.vm.$emit('filter', { tags: 'a,b', symbolExact: false })
    await flushPromises()

    const tradesStore = useTradesStore()
    expect(Array.isArray(tradesStore.filters.tags)).toBe(true)
    expect(tradesStore.filters.tags).toEqual(['a', 'b'])

    // Modal closes on apply.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    // Badge counts the tags filter once; symbolExact:false stays excluded.
    const badge = getBadge(wrapper)
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')

    // Applying refetches dashboard data with the advanced filters appended.
    const analyticsCalls = apiMock.get.mock.calls
      .map(([url]) => url)
      .filter((url) => typeof url === 'string' && url.startsWith('/trades/analytics'))
    expect(analyticsCalls.at(-1)).toContain('tags=a%2Cb')
  })

  it('keeps the initial loader visible until uncached dashboard data settles', async () => {
    let resolveAnalytics
    let resolveOpenPositions

    apiMock.get.mockImplementation((url) => {
      if (typeof url === 'string' && url.startsWith('/trades/analytics')) {
        return new Promise((resolve) => { resolveAnalytics = resolve })
      }
      if (url === '/trades/open-positions-quotes') {
        return new Promise((resolve) => { resolveOpenPositions = resolve })
      }
      return defaultGetImplementation(url)
    })

    wrapper = mount(DashboardView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })

    await flushPromises()

    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'draggable' }).exists()).toBe(false)

    resolveAnalytics({
      data: {
        summary: {},
        performanceBySymbol: [],
        dailyPnL: [],
        dailyWinRate: [],
        topTrades: { best: [], worst: [] }
      }
    })
    resolveOpenPositions({ data: { positions: [] } })
    await flushPromises()

    // fetchOpenTrades performs a fast request followed by the quote request.
    resolveOpenPositions({ data: { positions: [] } })
    await flushPromises()

    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'draggable' }).exists()).toBe(true)
    expect(wrapper.findAll('pre')).toHaveLength(0)
  })

  it.each([null, { summary: {} }, { summary: {}, topTrades: { best: null } }])('ignores incomplete cached analytics while fresh data loads: %j', async cached_data => {
    wrapper = await mountDashboard()
    const cache_key = wrapper.vm.getAnalyticsCacheKey()
    expect(cache_key).toBeTruthy()
    wrapper.unmount()
    wrapper = null
    sessionStorage.setItem(cache_key, JSON.stringify(cached_data))

    let resolve_analytics
    apiMock.get.mockImplementation(url => {
      if (url.startsWith('/trades/analytics')) {
        return new Promise(resolve => { resolve_analytics = resolve })
      }
      return defaultGetImplementation(url)
    })
    wrapper = await mountDashboard()
    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(true)
    resolve_analytics(await defaultGetImplementation('/trades/analytics'))
    await flushPromises()
    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(false)
    expect(wrapper.findAll('pre')).toHaveLength(0)
  })

  it('does not render stale cached positions without their trade list', async () => {
    wrapper = await mountDashboard()
    const cache_key = wrapper.vm.getOpenPositionsCacheKey()
    wrapper.unmount()
    wrapper = null
    sessionStorage.setItem(cache_key, JSON.stringify([{ symbol: 'PLTR', instrumentType: 'option', totalQuantity: 1 }]))
    let resolve_positions
    apiMock.get.mockImplementation(url => {
      if (url === '/trades/open-positions-quotes') {
        return new Promise(resolve => { resolve_positions = resolve })
      }
      return defaultGetImplementation(url)
    })
    wrapper = await mountDashboard()
    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(true)
    resolve_positions({ data: { positions: [] } })
    await flushPromises()
    resolve_positions({ data: { positions: [] } })
    await flushPromises()
    expect(wrapper.findAll('pre')).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'draggable' }).exists()).toBe(true)
  })

  it('keeps valid cached content mounted through delayed and malformed refreshes', async () => {
    const positions = [{
      symbol: 'PLTR', side: 'short', instrumentType: 'option',
      totalQuantity: 1, totalCost: 350, currentValue: null,
      unrealizedPnL: null, requires_manual_price: true,
      trades: [{ id: 'trade-1', quantity: 1, entry_price: 3.5 }]
    }]
    apiMock.get.mockImplementation(url => url === '/trades/open-positions-quotes'
      ? Promise.resolve({ data: { positions } }) : defaultGetImplementation(url))
    wrapper = await mountDashboard()
    wrapper.unmount()
    wrapper = null

    let resolve_analytics
    let resolve_positions
    apiMock.get.mockImplementation(url => {
      if (url.startsWith('/trades/analytics')) return new Promise(resolve => { resolve_analytics = resolve })
      if (url === '/trades/open-positions-quotes') return new Promise(resolve => { resolve_positions = resolve })
      return defaultGetImplementation(url)
    })
    wrapper = await mountDashboard()
    const dashboard_element = wrapper.findComponent({ name: 'draggable' }).element
    expect(wrapper.find('.animate-spin.h-12.w-12').exists()).toBe(false)
    expect(wrapper.text()).toContain('PLTR')

    resolve_analytics({ data: null })
    resolve_positions({ data: { positions: [{ symbol: 'PLTR' }] } })
    await flushPromises()
    resolve_positions({ data: { positions: null } })
    await flushPromises()
    expect(wrapper.findAll('pre')).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'draggable' }).element).toBe(dashboard_element)
    expect(wrapper.text()).toContain('PLTR')
  })
})
