import { shallowMount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ store: null, route: null, replace: vi.fn() }))

vi.mock('@/stores/brokerSync', () => ({ useBrokerSyncStore: () => mocks.store }))
vi.mock('@/stores/trades', () => ({
  useTradesStore: () => ({ fetchTrades: vi.fn(), fetchAnalytics: vi.fn() })
}))
vi.mock('@/services/api', () => ({ default: { get: vi.fn(async () => ({ data: { exclusions: [] } })) } }))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showConfirmation: vi.fn(), showDangerConfirmation: vi.fn() })
}))
vi.mock('@/composables/useUserTimezone', () => ({
  useUserTimezone: () => ({ formatDateTime: vi.fn() })
}))
vi.mock('vue-router', async import_original => ({
  ...(await import_original()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace })
}))

import BrokerSyncView from '@/views/BrokerSyncView.vue'

describe('BrokerSyncView OAuth cancellation', () => {
  let wrapper
  let original_url

  beforeEach(() => {
    window.sessionStorage.clear()
    original_url = window.location.href
    mocks.replace.mockReset()
    mocks.route = reactive({ query: {} })
    mocks.store = reactive({
      connections: [], syncLogs: [], loading: false, error: null,
      access: { billingEnabled: false, isPro: true, canCreate: true, canSync: true },
      hasConnections: false, ibkrConnections: [], schwabConnection: null,
      trading212Connections: [], providers: {},
      fetchConnections: vi.fn(), fetchSyncLogs: vi.fn(), fetchProviders: vi.fn(),
      clearError: vi.fn(),
      initBrokerOAuth: vi.fn(async () => `${original_url.split('#')[0]}#webull-login`),
      initSchwabOAuth: vi.fn()
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    window.sessionStorage.clear()
    window.history.replaceState(null, '', original_url)
    vi.restoreAllMocks()
  })

  async function mount_page() {
    wrapper = shallowMount(BrokerSyncView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
    })
    await flushPromises()
  }

  function webull_card() {
    return wrapper.findAll('div.p-6.border-2').find(card => card.text().includes('Webull'))
  }

  it.each(['webull', 'tradestation', 'alpacaLive', 'alpacaPaper'])(
    'allows another attempt after refreshing an abandoned %s login', async pending_key => {
      window.sessionStorage.setItem('broker_sync_pending', pending_key)
      await mount_page()

      expect(wrapper.text()).not.toContain('Connecting...')
      expect(window.sessionStorage.getItem('broker_sync_pending')).toBeNull()
      await webull_card().trigger('click')
      await flushPromises()
      expect(mocks.store.initBrokerOAuth).toHaveBeenCalledWith('webull', {})
    }
  )

  it('clears an abandoned Schwab login on refresh', async () => {
    window.sessionStorage.setItem('broker_sync_schwab_pending', 'true')
    await mount_page()
    expect(wrapper.text()).not.toContain('Connecting...')
    expect(window.sessionStorage.getItem('broker_sync_schwab_pending')).toBeNull()
  })

  it('clears Connecting when Back restores the page from the browser cache', async () => {
    await mount_page()
    await webull_card().trigger('click')
    await flushPromises()
    expect(webull_card().text()).toContain('Connecting...')

    const page_show = new Event('pageshow')
    Object.defineProperty(page_show, 'persisted', { value: true })
    window.dispatchEvent(page_show)
    await flushPromises()

    expect(webull_card().text()).toContain('Connect via OAuth')
    expect(webull_card().classes()).not.toContain('cursor-not-allowed')
    await webull_card().trigger('click')
    await flushPromises()
    expect(mocks.store.initBrokerOAuth).toHaveBeenCalledTimes(2)
  })

  it('clears Connecting when the OAuth initialization request fails', async () => {
    let reject_request
    mocks.store.initBrokerOAuth.mockImplementation(() => new Promise((_, reject) => { reject_request = reject }))
    await mount_page()
    await webull_card().trigger('click')
    expect(webull_card().text()).toContain('Connecting...')
    reject_request(new Error('Request failed'))
    await flushPromises()
    expect(webull_card().text()).toContain('Connect via OAuth')
  })

  it.each([
    [{ success: 'webull' }, 'Webull account connected successfully'],
    [{ error: 'access_denied' }, 'Connection failed: access_denied']
  ])('clears Connecting and processes the callback %j', async (query, expected_message) => {
    await mount_page()
    await webull_card().trigger('click')
    await flushPromises()
    mocks.route.query = query
    await flushPromises()
    expect(webull_card().text()).not.toContain('Connecting...')
    expect(wrapper.text()).toContain(expected_message)
    expect(mocks.replace).toHaveBeenCalledWith({ query: {} })
  })
})
