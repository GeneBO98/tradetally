import { shallowMount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: null
}))

vi.mock('@/stores/brokerSync', () => ({
  useBrokerSyncStore: () => mocks.store
}))

import BrokerReconnectBanner from '@/components/broker-sync/BrokerReconnectBanner.vue'

describe('BrokerReconnectBanner', () => {
  beforeEach(() => {
    mocks.store = reactive({
      connections: [],
      fetchConnections: vi.fn(),
      initSchwabOAuth: vi.fn()
    })
  })

  it('stays visible with a direct reconnect action while Schwab is expired', async () => {
    mocks.store.connections = [{
      id: 'connection-1',
      brokerType: 'schwab',
      connectionStatus: 'expired'
    }]

    const wrapper = shallowMount(BrokerReconnectBanner, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Broker reconnect required')
    expect(wrapper.text()).toContain('New trades will not sync')
    expect(wrapper.get('button').text()).toBe('Reconnect Schwab')
    expect(mocks.store.fetchConnections).toHaveBeenCalledTimes(1)
  })

  it('does not render when every broker connection is active', async () => {
    mocks.store.connections = [{
      id: 'connection-1',
      brokerType: 'schwab',
      connectionStatus: 'active'
    }]

    const wrapper = shallowMount(BrokerReconnectBanner)
    await flushPromises()

    expect(wrapper.text()).toBe('')
  })

  it('prompts for reauthorization before the Schwab deadline', async () => {
    mocks.store.connections = [{
      id: 'connection-1',
      brokerType: 'schwab',
      connectionStatus: 'active',
      schwab_refresh_token_expires_at: new Date(Date.now() + (12 * 60 * 60 * 1000)).toISOString()
    }]

    const wrapper = shallowMount(BrokerReconnectBanner)
    await flushPromises()

    expect(wrapper.text()).toContain('Schwab authorization expires soon')
    expect(wrapper.text()).toContain('keep automatic trade syncing uninterrupted')
    expect(wrapper.get('button').text()).toBe('Reauthorize Schwab')
  })
})
