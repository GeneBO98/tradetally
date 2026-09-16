import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const {
  showSuccess,
  showWarning,
  refreshAfterBulkUpdate,
  fetchTrades,
  setFilters
} = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  refreshAfterBulkUpdate: vi.fn().mockResolvedValue(undefined),
  fetchTrades: vi.fn().mockResolvedValue(undefined),
  setFilters: vi.fn()
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
    },
    {
      id: 'trade-2',
      symbol: 'MSFT',
      side: 'short',
      quantity: 5,
      entry_price: 400,
      exit_price: 390,
      entry_time: '2026-09-02T14:30:00Z',
      exit_time: '2026-09-02T16:00:00Z',
      trade_date: '2026-09-02',
      pnl: 50,
      pnl_percent: 2.5,
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
  totalPnL: 100,
  totalNetPnL: 100,
  totalGrossPnL: 100,
  totalCosts: 0,
  winRate: '100.00',
  winRateExcludingBreakeven: '100.00',
  totalTrades: 2,
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  filters: { accounts: '', includeArchived: false, tags: [] },
  fetchTrades,
  fetchAnalytics: vi.fn().mockResolvedValue(undefined),
  setFilters,
  setPage: vi.fn(),
  nextPage: vi.fn(),
  prevPage: vi.fn(),
  bulkDeleteTrades: vi.fn(),
  bulkUpdateMetadata: vi.fn(),
  refreshAfterBulkUpdate
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), resolve: vi.fn() })
}))
vi.mock('@/stores/trades', () => ({ useTradesStore: () => tradesStoreMock }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({}) }))
vi.mock('@/stores/uiPreferences', () => ({ useUiPreferencesStore: () => ({ notifyChanged: vi.fn() }) }))
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
  useNotification: () => ({ showSuccess, showWarning })
}))
vi.mock('@/services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: {} }) }
}))

describe('TradeListView bulk edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    fetchTrades.mockResolvedValue(undefined)
    refreshAfterBulkUpdate.mockResolvedValue(undefined)
  })

  async function mountView() {
    const { default: TradeListView } = await import('./TradeListView.vue')
    const wrapper = mount(TradeListView, {
      global: {
        mocks: {
          $route: { query: {} },
          $router: { push: vi.fn() }
        },
        stubs: {
          TradeCommentsDialog: true,
          EnrichmentStatus: true,
          ColumnCustomizer: true,
          TagManagement: true,
          StockLogo: true,
          MdiIcon: true,
          TradeMarketSessionBadge: true,
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

  function findButtonByText(wrapper, text) {
    return wrapper.findAll('button').find(button => button.text().trim() === text)
  }

  async function openBulkEdit(wrapper) {
    wrapper.vm.selectedTrades = ['trade-1', 'trade-2']
    await nextTick()
    const editButton = findButtonByText(wrapper, 'Edit selected')
    expect(editButton).toBeDefined()
    await editButton.trigger('click')
    await nextTick()
    return wrapper.findComponent({ name: 'BulkTradeEditModal' })
  }

  it('adds an Edit selected action to the bulk action bar', async () => {
    const wrapper = await mountView()
    const modal = await openBulkEdit(wrapper)

    expect(modal.exists()).toBe(true)
    expect(wrapper.vm.showBulkEditModal).toBe(true)
    // The action bar reflects the selection the modal will operate on
    expect(wrapper.text()).toContain('2 trades selected')
  })

  it('clears selection and reports the updated count on success', async () => {
    const wrapper = await mountView()
    const modal = await openBulkEdit(wrapper)

    modal.vm.$emit('saved', { updated_trade_count: 2, refresh_failed: false })
    await nextTick()

    expect(wrapper.vm.selectedTrades).toEqual([])
    expect(wrapper.vm.showBulkEditModal).toBe(false)
    expect(showSuccess).toHaveBeenCalledWith('Trades updated', 'Updated 2 trades.')
  })

  it('offers a refresh-only retry after a save whose refresh failed', async () => {
    const wrapper = await mountView()
    const modal = await openBulkEdit(wrapper)

    modal.vm.$emit('saved', { updated_trade_count: 2, refresh_failed: true })
    await nextTick()

    expect(wrapper.vm.selectedTrades).toEqual([])
    expect(showSuccess).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledTimes(1)

    const [title, message, options] = showWarning.mock.calls[0]
    expect(title).toBe('Trades updated')
    expect(message).toContain('Updated 2 trades')
    const retryAction = options.actions.find(action => action.label === 'Retry refresh')
    expect(retryAction).toBeDefined()

    retryAction.onClick()
    // The retry refreshes through the store without re-submitting the edit
    expect(refreshAfterBulkUpdate).toHaveBeenCalledWith(['trade-1', 'trade-2'])
    expect(wrapper.vm.selectedTrades).toEqual([])
  })

  it('reports a failed retry refresh without resubmitting the edit', async () => {
    const wrapper = await mountView()
    const modal = await openBulkEdit(wrapper)

    modal.vm.$emit('saved', { updated_trade_count: 1, refresh_failed: true })
    await nextTick()

    const [, , options] = showWarning.mock.calls[0]
    const retryAction = options.actions.find(action => action.label === 'Retry refresh')

    refreshAfterBulkUpdate.mockRejectedValueOnce(new Error('still down'))
    await retryAction.onClick()
    await Promise.resolve()
    await Promise.resolve()

    expect(showWarning).toHaveBeenCalledTimes(2)
    expect(showWarning.mock.calls[1][0]).toBe('Refresh failed')
  })
})
