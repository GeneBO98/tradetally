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

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() })
}))

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
      clearError: vi.fn()
    })
  })

  it('renders warning completions in amber without changing completed polling semantics', async () => {
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
    expect(warningBadge.classes()).toContain('bg-amber-100')
    expect(successBadge).toBeTruthy()
    expect(successBadge.classes()).toContain('bg-green-100')
    expect(wrapper.get('details').text()).toContain('Open position quantity could not be reconciled safely.')
    expect(mocks.brokerStore.fetchSyncLogs).toHaveBeenCalled()
  })
})
