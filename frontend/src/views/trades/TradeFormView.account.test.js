import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import contracts from '../../../../tests/fixtures/trading-calculation-contracts.json'

const mocks = vi.hoisted(() => ({
  route: { params: {}, query: {} },
  fetchTrade: vi.fn(),
  updateTrade: vi.fn().mockResolvedValue({})
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() })
}))
vi.mock('@/stores/trades', () => ({
  useTradesStore: () => ({ fetchTrade: mocks.fetchTrade, updateTrade: mocks.updateTrade, fetchTrades: vi.fn(), fetchAnalytics: vi.fn() })
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
    wrapper = shallowMount(TradeFormView, {
      attachTo: document.body,
      global: { stubs: { ImageUpload: { template: '<div />', data: () => ({ selectedFiles: [] }) } } }
    })
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

  it('preserves futures excursion dollars when editing a multi-contract trade (issue 415)', async () => {
    const fixture = contracts.futures_excursion_edit
    mocks.route.params = { id: 'trade-1' }
    mocks.fetchTrade.mockResolvedValue({ ...fixture.trade, id: 'trade-1', executions: [] })
    await mountForm()
    expect(Number(wrapper.get('#mfe').element.value)).toBe(fixture.expected_points)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.updateTrade).toHaveBeenCalledWith('trade-1', expect.objectContaining({
      mae: 0, mfe: fixture.trade.mfe, postExitMae: 0, postExitMfe: fixture.trade.post_exit_mfe
    }))
  })
  it.each(contracts.excursion_unit_cases)('supports entry and unit switching for $id (issue 427)', async fixture => {
    mocks.route.params = { id: 'trade-1' }
    mocks.fetchTrade.mockResolvedValue({
      ...fixture.trade, id: 'trade-1', mae: 0, mfe: fixture.dollars,
      post_exit_mae: null, post_exit_mfe: fixture.dollars,
      entry_time: '2026-10-15T14:00:00Z', exit_time: '2026-10-15T15:00:00Z', executions: []
    })
    await mountForm()
    for (const [unit, expected] of [['r', fixture.r], ['points', fixture.points], ['dollars', fixture.dollars], ['r', fixture.r]]) {
      await wrapper.get('#excursion_unit').setValue(unit)
      expect(Number(wrapper.get('#mfe').element.value)).toBeCloseTo(expected, 8)
      expect(Number(wrapper.get('#postExitMfe').element.value)).toBeCloseTo(expected, 8)
      expect(wrapper.get('#postExitMae').element.value).toBe('')
    }
    await wrapper.get('#mfe').setValue(fixture.r + 1)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const risk = fixture.trade.quantity * (fixture.trade.point_value || fixture.trade.contract_size || 1) * Math.abs(fixture.trade.entry_price - fixture.trade.stop_loss)
    expect(mocks.updateTrade).toHaveBeenLastCalledWith('trade-1', expect.objectContaining({
      mae: 0, mfe: fixture.dollars + risk, postExitMae: null, postExitMfe: fixture.dollars
    }))
  })

  it('disables R entry until a stop defines positive risk', async () => {
    mocks.route.params = { id: 'trade-1' }
    await mountForm()
    expect(wrapper.get('#excursion_unit option[value="r"]').element.disabled).toBe(true)
  })

})
