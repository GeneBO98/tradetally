import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Regression tests for the Dashboard advanced-filter wiring (GitHub issue #350).
// These bugs lived in the view's handler/computed wiring (badge counting,
// clear/reset store write-through, hiding the duplicate date control), which
// util-level tests on tradeFilterState.js cannot see, so we mount the real
// DashboardView.

const { apiMock, stub } = vi.hoisted(() => {
  // __esModule marks the mock as an ES module namespace so Vue's
  // defineAsyncComponent unwraps `.default` (several of these components are now
  // lazy-loaded). Without it, Vitest's mock-namespace proxy throws when Vue
  // probes __esModule/__isTeleport on the resolved module.
  const stub = (name) => ({
    __esModule: true,
    default: { name, template: `<div data-stub="${name}"></div>` }
  })

  const get = vi.fn((url) => {
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
    }
    return Promise.resolve({ data: {} })
  })

  return {
    stub,
    apiMock: {
      get,
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

vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'list', 'itemKey', 'handle', 'disabled', 'animation', 'ghostClass', 'dragClass'],
    emits: ['update:modelValue', 'start', 'end', 'change'],
    template: '<div data-stub="draggable"></div>'
  }
}))

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

describe('DashboardView advanced filter wiring (issue #350)', () => {
  let wrapper
  let pinia

  beforeEach(() => {
    // One pinia shared by the mounted view and the test's useXStore() calls.
    pinia = createPinia()
    setActivePinia(pinia)
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
})
