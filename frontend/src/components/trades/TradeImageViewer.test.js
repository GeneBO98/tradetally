import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TradeImageViewer from './TradeImageViewer.vue'
import TradeImages from './TradeImages.vue'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({ default: { defaults: { baseURL: '/api' }, get } }))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() })
}))

const image = {
  id: 'image-1', file_url: '/api/trades/trade-1/images/chart.webp',
  file_name: 'Trade screenshot.webp', file_size: 2048
}
let wrapper

beforeEach(() => {
  get.mockResolvedValue({ data: new Blob(['image'], { type: 'image/webp' }) })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:trade-image'),
    revokeObjectURL: vi.fn()
  })
})

afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})

function open(props = {}) {
  wrapper = mount(TradeImageViewer, { props: { image, ...props }, attachTo: document.body })
  return document.querySelector('[role="dialog"]')
}

describe('trade image preview', () => {
  it('loads protected images through the API and releases the blob on close', async () => {
    open()
    expect(document.querySelector('[role="status"]').textContent).toContain('Loading')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/trades/trade-1/images/chart.webp', { responseType: 'blob' })
    expect(document.querySelector('img').src).toBe('blob:trade-image')
    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:trade-image')
  })

  it('supports actual-size viewing without dismissing the preview', async () => {
    const dialog = open({ src: 'blob:existing-preview' })
    expect(get).not.toHaveBeenCalled()
    dialog.querySelector('img').click()
    expect(wrapper.emitted('close')).toBeUndefined()
    const toggle = dialog.querySelector('button')
    toggle.click()
    await flushPromises()
    expect(toggle.textContent).toContain('Fit to screen')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    toggle.click()
    await flushPromises()
    expect(toggle.textContent).toContain('Actual size')
  })

  it('keeps focus inside the dialog and restores focus and scroll on dismissal', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    document.body.style.overflow = 'auto'
    const dialog = open({ src: 'blob:existing-preview' })
    const [toggle, close] = dialog.querySelectorAll('button')
    expect(document.activeElement).toBe(close)
    expect(document.body.style.overflow).toBe('hidden')
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(toggle)
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(close)
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(trigger)
    document.body.style.overflow = ''
  })

  it('shows a load failure and keeps the close button available', async () => {
    get.mockRejectedValue(new Error('Image unavailable'))
    const dialog = open()
    await flushPromises()
    expect(dialog.querySelector('[role="alert"]').textContent).toContain('Failed to load')
    expect(dialog.querySelector('button').disabled).toBe(true)
    dialog.querySelector('[aria-label="Close image preview"]').click()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('opens the shared viewer from the detail preview without fetching the image again', async () => {
    wrapper = mount(TradeImages, {
      props: { tradeId: 'trade-1', images: [image] }, attachTo: document.body
    })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await wrapper.get(`button[aria-label="View ${image.file_name}"]`).trigger('click')
    expect(document.querySelector('[role="dialog"] img').src).toBe('blob:trade-image')
    expect(get).toHaveBeenCalledTimes(1)
    document.querySelector('[aria-label="Close image preview"]').click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
