import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({ default: apiMock }))

import TradeAllocationSettings from './TradeAllocationSettings.vue'

describe('TradeAllocationSettings opt-in behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockResolvedValue({ data: { settings: { tradeAllocationsEnabled: false } } })
    apiMock.put.mockResolvedValue({ data: { settings: { tradeAllocationsEnabled: true } } })
  })

  it('does not reveal trade allocations until optional tools are deliberately expanded', async () => {
    const wrapper = mount(TradeAllocationSettings, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Optional accounting tools')
    expect(wrapper.text()).not.toContain('Trade allocations')

    await wrapper.get('button[aria-expanded="false"]').trigger('click')
    expect(wrapper.text()).toContain('Trade allocations')
  })

  it('persists an explicit enable action before loading allocation groups', async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { settings: { tradeAllocationsEnabled: false } } })
      .mockResolvedValueOnce({ data: { groups: [] } })

    const wrapper = mount(TradeAllocationSettings, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
    })
    await flushPromises()
    await wrapper.get('button[aria-expanded="false"]').trigger('click')
    await wrapper.get('button[role="switch"]').trigger('click')
    await flushPromises()

    expect(apiMock.put).toHaveBeenCalledWith('/settings', { tradeAllocationsEnabled: true })
    expect(apiMock.get).toHaveBeenCalledWith('/trade-allocations/groups')
  })
})
