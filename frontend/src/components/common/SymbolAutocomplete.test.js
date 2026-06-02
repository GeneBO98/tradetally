import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SymbolAutocomplete from './SymbolAutocomplete.vue'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

vi.mock('@/components/common/StockLogo.vue', () => ({
  default: {
    name: 'StockLogo',
    props: ['symbol'],
    template: '<span data-test="stock-logo">{{ symbol }}</span>'
  }
}))

describe('SymbolAutocomplete', () => {
  it('uppercases input and fetches debounced suggestions', async () => {
    vi.useFakeTimers()
    api.get.mockResolvedValueOnce({
      data: {
        results: [
          { symbol: 'AAPL', company_name: 'Apple Inc.', source: 'user_trades' }
        ]
      }
    })

    const wrapper = mount(SymbolAutocomplete, {
      props: {
        modelValue: '',
        id: 'symbol'
      }
    })

    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('aapl')

    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['AAPL'])
    expect(api.get).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    await nextTick()

    expect(api.get).toHaveBeenCalledWith('/symbols/search', { params: { q: 'AAPL' } })
    expect(wrapper.text()).toContain('Apple Inc.')
    expect(wrapper.text()).toContain('Traded')
  })

  it('selects a highlighted suggestion with the keyboard', async () => {
    vi.useFakeTimers()
    const suggestion = { symbol: 'MSFT', company_name: 'Microsoft Corp.' }
    api.get.mockResolvedValueOnce({ data: { results: [suggestion] } })

    const wrapper = mount(SymbolAutocomplete, {
      props: {
        modelValue: ''
      }
    })

    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('ms')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()

    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['MSFT'])
    expect(wrapper.emitted('select')[0]).toEqual([suggestion])
  })

  it('clears suggestions after a failed search', async () => {
    vi.useFakeTimers()
    api.get.mockRejectedValueOnce(new Error('Network failed'))

    const wrapper = mount(SymbolAutocomplete, {
      props: {
        modelValue: ''
      }
    })

    await wrapper.get('input').trigger('focus')
    await wrapper.get('input').setValue('bad')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()

    expect(wrapper.find('[role="option"]').exists()).toBe(false)
  })
})
