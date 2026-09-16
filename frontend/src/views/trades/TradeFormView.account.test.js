import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  route: { params: {}, query: {} },
  fetchTrade: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() })
}))
vi.mock('@/stores/trades', () => ({
  useTradesStore: () => ({ fetchTrade: mocks.fetchTrade })
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { timezone: 'UTC' } })
}))
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { accounts: ['****1611', '****6987'] } }))
  }
}))

import TradeFormView from './TradeFormView.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { useGlobalAccountFilter, UNSORTED_ACCOUNT } from '@/composables/useGlobalAccountFilter'

describe('manual trade account assignment', () => {
  let wrapper
  let filter

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    filter = useGlobalAccountFilter()
    filter.clearAccount()
    mocks.route.params = {}
    mocks.fetchTrade.mockResolvedValue({
      id: 'trade-1', symbol: 'AAPL', side: 'long', instrument_type: 'stock',
      entry_time: '2026-09-10T14:30:00Z', entry_price: 100, quantity: 1,
      account_identifier: '****6987', executions: []
    })
  })

  afterEach(() => wrapper?.unmount())

  async function mountForm() {
    wrapper = shallowMount(TradeFormView, { attachTo: document.body })
    await flushPromises()
  }

  function accountSelect() {
    return wrapper.findAllComponents(BaseSelect).find(select => select.attributes('noun') === 'accounts')
  }

  it('defaults to the active account without reassigning a draft when the filter changes', async () => {
    filter.setAccount('****1611')
    await mountForm()
    expect(accountSelect().props('modelValue')).toBe('****1611')
    expect(wrapper.text()).not.toContain('This trade will be saved without an account.')

    filter.setAccount('****6987')
    await nextTick()
    expect(accountSelect().props('modelValue')).toBe('****1611')
  })

  it.each([null, UNSORTED_ACCOUNT])('leaves %s unassigned and explains its visibility', async selected => {
    filter.setAccount(selected)
    localStorage.setItem('tradeFormSections', JSON.stringify({ additionalFields: false }))
    await mountForm()
    expect(accountSelect().props('modelValue')).toBe('')
    expect(wrapper.get('[role="status"]').isVisible()).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('All Accounts and Unsorted')
    wrapper.get('[data-trade-account-field]').element.scrollIntoView = vi.fn()
    expect(wrapper.get('[data-trade-account-field]').isVisible()).toBe(false)
    await wrapper.get('[role="status"] button').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-trade-account-field]').isVisible()).toBe(true)

    accountSelect().vm.$emit('update:modelValue', '****6987')
    await nextTick()
    expect(wrapper.text()).not.toContain('This trade will be saved without an account.')
  })

  it.each(['****6987', ''])('preserves the saved account "%s" when editing under a different account filter', async account_identifier => {
    filter.setAccount('****1611')
    mocks.route.params = { id: 'trade-1' }
    mocks.fetchTrade.mockResolvedValue({
      id: 'trade-1', symbol: 'AAPL', side: 'long', instrument_type: 'stock',
      entry_time: '2026-09-10T14:30:00Z', entry_price: 100, quantity: 1,
      account_identifier, executions: []
    })
    await mountForm()
    expect(mocks.fetchTrade).toHaveBeenCalledWith('trade-1', { raw: true })
    expect(accountSelect().props('modelValue')).toBe(account_identifier)
  })
})
