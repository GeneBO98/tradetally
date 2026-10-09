import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SymbolCurrentPrice from './SymbolCurrentPrice.vue'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

describe('SymbolCurrentPrice', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads and displays the current price for a symbol', async () => {
    vi.useFakeTimers()
    api.get.mockResolvedValueOnce({ data: { current_price: 415.27 } })

    const wrapper = mount(SymbolCurrentPrice, {
      props: { symbol: 'msft' }
    })

    expect(wrapper.text()).toContain('Current price for MSFT')
    expect(wrapper.text()).toContain('Loading quote...')

    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/symbols/quote', {
      params: { symbol: 'MSFT' }
    })
    expect(wrapper.text()).toContain('$415.27')
  })

  it('displays an unavailable state and retries the quote', async () => {
    vi.useFakeTimers()
    api.get
      .mockRejectedValueOnce({ response: { data: { error: 'Current price unavailable for BAD' } } })
      .mockResolvedValueOnce({ data: { current_price: 12.5 } })

    const wrapper = mount(SymbolCurrentPrice, {
      props: { symbol: 'BAD' }
    })

    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(wrapper.text()).toContain('Current price unavailable for BAD')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('$12.50')
  })

  it('ignores a stale response after the symbol changes', async () => {
    vi.useFakeTimers()
    let resolveFirst
    api.get
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ data: { current_price: 200 } })

    const wrapper = mount(SymbolCurrentPrice, {
      props: { symbol: 'AAPL' }
    })

    await vi.advanceTimersByTimeAsync(400)
    await wrapper.setProps({ symbol: 'MSFT' })
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    resolveFirst({ data: { current_price: 100 } })
    await flushPromises()

    expect(wrapper.text()).toContain('Current price for MSFT')
    expect(wrapper.text()).toContain('$200.00')
    expect(wrapper.text()).not.toContain('$100.00')
  })
})
