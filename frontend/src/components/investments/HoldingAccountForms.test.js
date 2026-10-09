import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AddHoldingModal from './AddHoldingModal.vue'
import AddLotModal from './AddLotModal.vue'

const { accountsStore, investmentsStore } = vi.hoisted(() => ({
  accountsStore: {
    accounts: [
      {
        id: 'account-1',
        accountName: 'Cold Wallet',
        accountIdentifier: 'cold-wallet',
        broker: 'Cold storage'
      }
    ],
    loading: false,
    fetchAccounts: vi.fn(() => Promise.resolve())
  },
  investmentsStore: {
    createHolding: vi.fn(() => Promise.resolve({ id: 'holding-1' })),
    addLot: vi.fn(() => Promise.resolve({ id: 'lot-1' }))
  }
}))

vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => accountsStore
}))

vi.mock('@/stores/investments', () => ({
  useInvestmentsStore: () => investmentsStore
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({ formatCurrency: value => `$${value}` })
}))

const BaseSelectStub = {
  props: ['modelValue'],
  emits: ['update:modelValue', 'change'],
  template: `
    <select
      data-test="account"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
    >
      <option value=""></option>
      <option value="cold-wallet">Cold Wallet</option>
    </select>
  `
}

const SymbolAutocompleteStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input data-test="symbol" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}

function mountOptions() {
  return {
    global: {
      stubs: {
        BaseSelect: BaseSelectStub,
        SymbolAutocomplete: SymbolAutocompleteStub
      }
    }
  }
}

describe('investment holding account forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links a new crypto holding to the selected manual account', async () => {
    const wrapper = mount(AddHoldingModal, mountOptions())

    await wrapper.get('[data-test="symbol"]').setValue('btc')
    const numbers = wrapper.findAll('input[type="number"]')
    await numbers[0].setValue('0.25')
    await numbers[1].setValue('50000')
    await wrapper.get('[data-test="account"]').setValue('cold-wallet')
    await wrapper.get('form').trigger('submit')

    expect(investmentsStore.createHolding).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'BTC',
      shares: 0.25,
      costPerShare: 50000,
      accountIdentifier: 'cold-wallet',
      broker: 'Cold storage'
    }))
  })

  it('links an added lot to the selected manual account', async () => {
    const wrapper = mount(AddLotModal, {
      ...mountOptions(),
      props: { holdingId: 'holding-1' }
    })

    const numbers = wrapper.findAll('input[type="number"]')
    await numbers[0].setValue('0.1')
    await numbers[1].setValue('60000')
    await wrapper.get('[data-test="account"]').setValue('cold-wallet')
    await wrapper.get('form').trigger('submit')

    expect(investmentsStore.addLot).toHaveBeenCalledWith(
      'holding-1',
      expect.objectContaining({
        shares: 0.1,
        costPerShare: 60000,
        accountIdentifier: 'cold-wallet',
        broker: 'Cold storage'
      })
    )
  })
})
