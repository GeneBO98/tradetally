import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Regression tests for the Dashboard advanced-filter wiring (GitHub issue #350).
// These bugs lived in the view's handler/computed wiring (badge counting,
// Clear all persistence, store write-through), which util-level tests on
// tradeFilterState.js cannot see, so we mount the real DashboardView.

const { apiMock, stub } = vi.hoisted(() => {
  const stub = (name) => ({
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

vi.mock('chart.js/auto', () => ({
  default: class ChartStub {
    constructor() {}
    update() {}
    resize() {}
    destroy() {}
  }
}))

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
  default: {
    name: 'TradeFilters',
    props: { autoApplyOnMount: { type: Boolean, default: true } },
    emits: ['filter'],
    template: '<div data-stub="TradeFilters"></div>'
  }
}))

import DashboardView from '@/views/DashboardView.vue'
import { useTradesStore } from '@/stores/trades'
import { useUiPreferencesStore } from '@/stores/uiPreferences'

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
    return w.get(FILTER_BUTTON_SELECTOR).find('span')
  }

  async function openFiltersModal(w) {
    await w.get(FILTER_BUTTON_SELECTOR).trigger('click')
    expect(w.find('[role="dialog"]').exists()).toBe(true)
  }

  function findClearAllButton(w) {
    return w.findAll('button').find((b) => b.text() === 'Clear all')
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

  it('Clear all removes persisted filters from localStorage, resets the store, and clears the badge', async () => {
    localStorage.setItem('tradeFilters', JSON.stringify({ tags: ['swing'], symbolExact: false }))

    wrapper = await mountDashboard()

    const uiPreferencesStore = useUiPreferencesStore()
    const notifySpy = vi.spyOn(uiPreferencesStore, 'notifyChanged')

    await openFiltersModal(wrapper)
    const clearAll = findClearAllButton(wrapper)
    expect(clearAll).toBeTruthy()
    await clearAll.trigger('click')
    await flushPromises()

    // Persisted dashboard filters are gone (symbolExact:false must not keep
    // the storage entry alive — that kept the phantom filter resurrecting).
    expect(localStorage.getItem('tradeFilters')).toBeNull()

    // Store filters are reset.
    const tradesStore = useTradesStore()
    expect(tradesStore.filters.tags).toEqual([])
    expect(tradesStore.filters.symbolExact).toBe(false)

    // Modal closed, badge gone.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(getBadge(wrapper).exists()).toBe(false)

    // Cross-device prefs sync is told the filters were cleared.
    expect(notifySpy).toHaveBeenCalledWith('tradeFilters', null)
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
