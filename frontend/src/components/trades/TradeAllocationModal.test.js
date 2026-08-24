import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({ default: apiMock }))

import TradeAllocationModal from './TradeAllocationModal.vue'

const groups = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Core', color: '#111111' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Kids', color: '#222222' }
]

function buttonByText(wrapper, label) {
  return wrapper.findAll('button').find((button) => button.text().trim() === label)
}

describe('TradeAllocationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockResolvedValue({
      data: { trade_id: 'trade-1', basis_quantity: 100, allocations: [] }
    })
    apiMock.put.mockResolvedValue({
      data: { trade_id: 'trade-1', basis_quantity: 100, allocations: [] }
    })
  })

  it('keeps allocations separate from tags and saves a proportional quantity split', async () => {
    const wrapper = mount(TradeAllocationModal, {
      props: {
        open: true,
        trade: { id: 'trade-1', symbol: 'AAPL', quantity: 100, pnl: 500 },
        groups
      },
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('without changing its tags')
    await buttonByText(wrapper, 'Quantity').trigger('click')

    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0].setValue('60')
    await inputs[1].setValue('40')
    await buttonByText(wrapper, 'Save allocation').trigger('click')
    await flushPromises()

    expect(apiMock.put).toHaveBeenCalledWith('/trade-allocations/trades/trade-1', {
      allocations: [
        {
          allocation_group_id: groups[0].id,
          allocation_ratio: 0.6,
          input_method: 'quantity'
        },
        {
          allocation_group_id: groups[1].id,
          allocation_ratio: 0.4,
          input_method: 'quantity'
        }
      ]
    })
    expect(apiMock.put.mock.calls.flat().join(' ')).not.toContain('/tags')
  })

  it('does not allow saving until the split totals 100 percent', async () => {
    const wrapper = mount(TradeAllocationModal, {
      props: {
        open: true,
        trade: { id: 'trade-1', symbol: 'AAPL', quantity: 100 },
        groups
      },
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } }
      }
    })
    await flushPromises()

    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0].setValue('60')
    expect(buttonByText(wrapper, 'Save allocation').attributes('disabled')).toBeDefined()
  })
})
