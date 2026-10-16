import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BulkTradeChartsModal from './BulkTradeChartsModal.vue'

const { post, refresh } = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }))
vi.mock('@/services/api', () => ({ default: { post } }))
vi.mock('@/stores/trades', () => ({ useTradesStore: () => ({ refreshAfterBulkUpdate: refresh }) }))

function open() {
  return mount(BulkTradeChartsModal, {
    props: { open: true, trade_ids: ['trade-1', 'trade-2'] },
    global: { stubs: { BaseModal: { template: '<div><slot/><slot name="footer"/></div>' } } }
  })
}

describe('bulk TradingView chart links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({ data: { updated_trade_count: 2, skipped_trade_count: 0 } })
    refresh.mockResolvedValue()
  })

  it('saves the link to all selected trades and awaits the store refresh', async () => {
    const wrapper = open()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('#bulk-chart-url').setValue('https://www.tradingview.com/x/abc123/')
    await wrapper.get('#bulk-chart-title').setValue('Re-entry setup')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/trades/bulk/charts', {
      trade_ids: ['trade-1', 'trade-2'], chart_url: 'https://www.tradingview.com/x/abc123/', chart_title: 'Re-entry setup'
    })
    expect(refresh).toHaveBeenCalledWith(['trade-1', 'trade-2'])
    expect(wrapper.emitted('saved')[0][0].refresh_failed).toBe(false)
  })

  it('reports a successful save separately from a failed refresh', async () => {
    refresh.mockRejectedValue(new Error('offline'))
    const wrapper = open()
    await wrapper.get('#bulk-chart-url').setValue('https://www.tradingview.com/x/abc123/')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('saved')[0][0].refresh_failed).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('keeps the modal open and displays server validation errors', async () => {
    post.mockRejectedValue({ response: { data: { error: 'Enter a TradingView snapshot or chart link' } } })
    const wrapper = open()
    await wrapper.get('#bulk-chart-url').setValue('https://example.com/')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('TradingView')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(refresh).not.toHaveBeenCalled()
  })
});
