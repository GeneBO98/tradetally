import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { notifyChanged, fetchTrades } = vi.hoisted(() => ({
  notifyChanged: vi.fn(),
  fetchTrades: vi.fn().mockResolvedValue(undefined)
}))

const tradesStoreMock = {
  trades: [
    {
      id: 'trade-1',
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      entry_price: 100,
      exit_price: 105,
      entry_time: '2026-09-01T14:30:00Z',
      exit_time: '2026-09-01T15:00:00Z',
      trade_date: '2026-09-01',
      pnl: 50,
      pnl_percent: 5,
      commission: 0,
      fees: 0,
      tags: [],
      executions: [],
      instrument_type: 'stock',
      comment_count: 0
    }
  ],
  currentTrade: null,
  loading: false,
  initialLoading: false,
  analyticsLoading: false,
  error: null,
  analytics: null,
  totalPnL: 50,
  totalNetPnL: 50,
  totalGrossPnL: 50,
  totalCosts: 0,
  winRate: '100.00',
  winRateExcludingBreakeven: '100.00',
  totalTrades: 1,
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  filters: { accounts: '', includeArchived: false, tags: [] },
  fetchTrades,
  fetchAnalytics: vi.fn().mockResolvedValue(undefined),
  setFilters: vi.fn(),
  setPage: vi.fn(),
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  bulkDeleteTrades: vi.fn(),
  bulkUpdateMetadata: vi.fn(),
  refreshAfterBulkUpdate: vi.fn().mockResolvedValue(undefined)
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), resolve: vi.fn() })
}))
vi.mock('@/stores/trades', () => ({ useTradesStore: () => tradesStoreMock }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({}) }))
vi.mock('@/stores/uiPreferences', () => ({ useUiPreferencesStore: () => ({ notifyChanged }) }))
vi.mock('@/composables/useGlobalAccountFilter', () => ({
  useGlobalAccountFilter: () => ({ selectedAccount: { value: null } })
}))
vi.mock('@/composables/useUserTimezone', () => ({
  useUserTimezone: () => ({ formatTime: (value) => value, userTimezone: 'UTC' })
}))
vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    formatCurrency: (value) => String(value ?? 0),
    formatSignedCurrency: (value) => String(value ?? 0),
    currencySymbol: '$'
  })
}))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showWarning: vi.fn() })
}))
vi.mock('@/services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: {} }) }
}))

const WIDTHS_KEY = 'tradeListColumnWidths'

describe('TradeListView column resizing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  async function mountView() {
    const { default: TradeListView } = await import('./TradeListView.vue')
    const wrapper = mount(TradeListView, {
      attachTo: document.body,
      global: {
        mocks: {
          $route: { query: {} },
          $router: { push: vi.fn() }
        },
        stubs: {
          TradeCommentsDialog: true,
          EnrichmentStatus: true,
          TagManagement: true,
          StockLogo: true,
          MdiIcon: true,
          TradeFilters: true,
          BulkTradeAllocationModal: true,
          BulkTradeEditModal: true
        }
      }
    })
    await nextTick()
    await nextTick()
    return wrapper
  }

  function handleFor(wrapper, key) {
    return wrapper.find(`th[data-column-key="${key}"] [role="separator"]`)
  }

  function colStyles(wrapper) {
    return wrapper.findAll('colgroup col').map(col => col.attributes('style') || '')
  }

  async function drag(wrapper, key, deltaX) {
    await handleFor(wrapper, key).trigger('mousedown', { clientX: 200 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 + deltaX }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()
  }

  it('stores the width a drag lands on and syncs it as a preference', async () => {
    const wrapper = await mountView()

    await drag(wrapper, 'pnl', 60)

    // jsdom reports no layout, so the drag starts from the minimum width
    expect(wrapper.vm.columnWidths.pnl).toBe(108)
    expect(JSON.parse(localStorage.getItem(WIDTHS_KEY))).toEqual({ pnl: 108 })
    expect(notifyChanged).toHaveBeenCalledWith(WIDTHS_KEY, { pnl: 108 })
    expect(colStyles(wrapper)).toContain('width: 108px;')
  })

  it('leaves widths untouched when a click never moves', async () => {
    const wrapper = await mountView()

    await handleFor(wrapper, 'pnl').trigger('mousedown', { clientX: 200 })
    window.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    expect(wrapper.vm.columnWidths).toEqual({})
    expect(localStorage.getItem(WIDTHS_KEY)).toBeNull()
    expect(notifyChanged).not.toHaveBeenCalled()
  })

  it('never drags a column below the minimum width', async () => {
    const wrapper = await mountView()

    await drag(wrapper, 'pnl', -400)

    expect(wrapper.vm.columnWidths.pnl).toBe(48)
  })

  it('pins widths under a fixed layout so one drag moves one column', async () => {
    const wrapper = await mountView()
    expect(wrapper.vm.columnWidths).toEqual({})

    await drag(wrapper, 'symbol', 40)

    expect(wrapper.find('table').attributes('style')).toContain('table-layout: fixed')
    // Only the dragged column carries a width; the rest stay auto-sized
    expect(Object.keys(wrapper.vm.columnWidths)).toEqual(['symbol'])
  })

  it('restores saved widths on load', async () => {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify({ symbol: 240, pnl: 'nonsense', side: 4 }))
    const wrapper = await mountView()

    // Unusable entries are dropped rather than pinning a column at 4px
    expect(wrapper.vm.columnWidths).toEqual({ symbol: 240 })
    expect(colStyles(wrapper)).toContain('width: 240px;')
  })

  it('hands a column back to auto-sizing on double-click', async () => {
    const wrapper = await mountView()
    await drag(wrapper, 'pnl', 60)

    await handleFor(wrapper, 'pnl').trigger('dblclick')
    await nextTick()

    expect(wrapper.vm.columnWidths).toEqual({})
    expect(localStorage.getItem(WIDTHS_KEY)).toBeNull()
    expect(notifyChanged).toHaveBeenLastCalledWith(WIDTHS_KEY, null)
  })

  it('clears every width when the column panel asks for a reset', async () => {
    const wrapper = await mountView()
    await drag(wrapper, 'pnl', 60)
    await drag(wrapper, 'side', 30)
    expect(Object.keys(wrapper.vm.columnWidths)).toHaveLength(2)

    wrapper.findComponent({ name: 'ColumnCustomizer' }).vm.$emit('reset-widths')
    await nextTick()

    expect(wrapper.vm.columnWidths).toEqual({})
    expect(localStorage.getItem(WIDTHS_KEY)).toBeNull()
  })
})
