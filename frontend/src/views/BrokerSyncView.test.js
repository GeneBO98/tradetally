import { shallowMount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  brokerStore: null,
  tradesStore: {
    fetchTrades: vi.fn(),
    fetchAnalytics: vi.fn()
  }
}))

vi.mock('@/stores/brokerSync', () => ({
  useBrokerSyncStore: () => mocks.brokerStore
}))

vi.mock('@/stores/trades', () => ({
  useTradesStore: () => mocks.tradesStore
}))

vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({
    showConfirmation: vi.fn(),
    showDangerConfirmation: vi.fn()
  })
}))

vi.mock('@/composables/useUserTimezone', () => ({
  useUserTimezone: () => ({
    formatDateTime: vi.fn(() => 'Jul 31, 2026, 18:00:00')
  })
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() })
}))

vi.mock('@/services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }))

import BrokerSyncView from '@/views/BrokerSyncView.vue'

describe('BrokerSyncView sync outcomes', () => {
  beforeEach(() => {
    mocks.brokerStore = reactive({
      connections: [],
      syncLogs: [
        {
          id: 'warning-log',
          brokerType: 'ibkr',
          syncType: 'manual',
          status: 'completed',
          startedAt: '2026-07-31T22:00:00Z',
          syncDetails: {
            outcome: 'warning',
            warnings: ['Open position quantity could not be reconciled safely.']
          }
        },
        {
          id: 'success-log',
          brokerType: 'ibkr',
          syncType: 'manual',
          status: 'completed',
          startedAt: '2026-07-31T22:00:00Z',
          syncDetails: { outcome: 'success', warnings: [] }
        }
      ],
      loading: false,
      error: null,
      access: { billingEnabled: false, isPro: true, canCreate: true, canSync: true },
      hasConnections: false,
      ibkrConnections: [],
      schwabConnection: null,
      trading212Connections: [],
      fetchConnections: vi.fn(),
      fetchSyncLogs: vi.fn(),
      fetchProviders: vi.fn(),
      clearError: vi.fn()
    })
  })

  it('renders warning completions in yellow without changing completed polling semantics', async () => {
    const wrapper = shallowMount(BrokerSyncView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    const warningBadge = wrapper.findAll('span').find(node => node.text() === 'Completed with warnings')
    const successBadge = wrapper.findAll('span').find(node => node.text() === 'completed')

    expect(warningBadge).toBeTruthy()
    expect(warningBadge.classes()).toContain('bg-yellow-100')
    expect(successBadge).toBeTruthy()
    expect(successBadge.classes()).toContain('bg-green-100')
    expect(wrapper.text()).toContain('Jul 31, 2026, 18:00:00')
    expect(wrapper.get('details').text()).toContain('Open position quantity could not be reconciled safely.')
    expect(mocks.brokerStore.fetchSyncLogs).toHaveBeenCalled()
  })
  it('expands daily summaries while failures remain visible and can load older grouped history', async () => {
    mocks.brokerStore.syncLogs.push({ id: 'daily', daily_summary: true, connectionId: 'connection',
      brokerType: 'ibkr', syncType: 'ibkr_confirmation', status: 'completed', local_date: '2026-11-11',
      sync_count: 96, warning_count: 1, syncDetails: { warnings: ['One delayed report'], outcome: 'warning' } })
    mocks.brokerStore.syncLogs.push({ id: 'failure', brokerType: 'ibkr', syncType: 'ibkr_confirmation', status: 'failed' })
    mocks.brokerStore.history_has_more = true
    const wrapper = shallowMount(BrokerSyncView)
    await flushPromises()
    expect(mocks.brokerStore.fetchSyncLogs).toHaveBeenCalledWith(null, 20, { group_by: 'day', offset: 0, append: false })
    expect(wrapper.text()).toContain('96 checks')
    expect(wrapper.text()).toContain('failed')
    const toggle = wrapper.findAll('button').find(button => button.text() === 'Show checks')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findComponent({ name: 'ConfirmationSyncDay' }).props('group').id).toBe('daily')
    await wrapper.findAll('button').find(button => button.text() === 'Load older history').trigger('click')
    expect(mocks.brokerStore.fetchSyncLogs).toHaveBeenLastCalledWith(null, 20, { group_by: 'day', offset: 4, append: true })
  })

})
