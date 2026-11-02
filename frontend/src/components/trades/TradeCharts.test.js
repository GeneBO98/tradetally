import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TradeCharts from './TradeCharts.vue'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({ default: { defaults: { baseURL: '/api' }, get } }))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() })
}))

function render(chart) {
  return mount(TradeCharts, { props: { tradeId: 'trade-426', charts: [{ id: 'chart-426', ...chart }] } })
}

describe('chart link previews (issue 426)', () => {
  it.each([
    { chart_url: 'https://www.youtube.com/watch?v=review123&list=unlisted&t=30s' },
    { chartUrl: 'https://youtu.be/review123?t=30' }
  ])('shows a video link without attempting an image preview: %o', async chart => {
    const wrapper = render(chart)
    await flushPromises()
    expect(wrapper.text()).toContain('YouTube Video')
    expect(wrapper.text()).toContain('Watch Video')
    expect(wrapper.text()).not.toContain('Preview Unavailable')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.animate-spin').exists()).toBe(false)
    expect(get).not.toHaveBeenCalled()
    const chart_url = chart.chart_url ?? chart.chartUrl
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: chart_url, target: '_blank', rel: 'noopener noreferrer'
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await wrapper.get('a .cursor-pointer').trigger('click')
    expect(open).toHaveBeenCalledWith(chart_url, '_blank', 'noopener,noreferrer')
    wrapper.unmount()
  })

  it.each([
    'https://placehold.co/2560x1440/png?text=test',
    'https://charts.example.com/image?id=426',
    'https://charts.example.com/snapshot.png?download=1#chart'
  ])('previews image links without requiring a filename extension: %s', async chart_url => {
    const wrapper = render({ chart_url, chart_title: 'Entry setup' })
    await flushPromises()
    expect(wrapper.get('h3').text()).toBe('Chart Links')
    expect(wrapper.get('img').attributes('src')).toBe(chart_url)
    expect(wrapper.get('img').attributes('alt')).toBe('Entry setup')
    expect(wrapper.get('img').element.closest('a').getAttribute('href')).toBe(chart_url)
    expect(get).not.toHaveBeenCalled()

    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await wrapper.get('img').trigger('click')
    expect(open).toHaveBeenCalledWith(chart_url, '_blank', 'noopener,noreferrer')
    wrapper.unmount()
  })

  it('keeps non-image and failed image links clickable without mutating the chart', async () => {
    const chart_url = 'https://charts.example.com/shared-chart'
    const chart = { id: 'chart-426', chart_url }
    const wrapper = mount(TradeCharts, { props: { tradeId: 'trade-426', charts: [chart] } })
    await flushPromises()
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Chart Preview Unavailable')
    expect(wrapper.text()).not.toContain('TradingView')
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: chart_url, target: '_blank', rel: 'noopener noreferrer'
    })
    expect(chart).toEqual({ id: 'chart-426', chart_url })
    wrapper.unmount()
  })

  it('preserves authenticated TradingView snapshot previews and legacy field names', async () => {
    const chartUrl = 'https://www.tradingview.com/x/Abc123/'
    get.mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }) })
    const create = vi.fn().mockReturnValue('blob:chart-426')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    })
    try {
      const wrapper = render({ chartUrl, chartTitle: 'Snapshot' })
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/trades/tradingview/snapshot/Abc123', { responseType: 'blob' })
      expect(wrapper.get('img').attributes('src')).toBe('blob:chart-426')
      expect(wrapper.get('a').attributes('href')).toBe(chartUrl)
      wrapper.unmount()
      expect(revoke).toHaveBeenCalledWith('blob:chart-426')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
