import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useSymbolMetadata', async () => {
  const { reactive } = await import('vue')
  const metadataBySymbol = reactive({})

  return {
    useSymbolMetadata: () => ({
      metadataBySymbol,
      ensureSymbolMetadata: vi.fn(),
      normalizeSymbol: (symbol) => (typeof symbol === 'string' ? symbol.trim().toUpperCase() : '')
    })
  }
})

import { useSymbolMetadata } from '@/composables/useSymbolMetadata'
import StockLogo from './StockLogo.vue'

const { metadataBySymbol } = useSymbolMetadata()

function clearMetadata() {
  for (const key of Object.keys(metadataBySymbol)) delete metadataBySymbol[key]
}

async function failCurrentImage(wrapper) {
  await wrapper.get('img').trigger('error')
  await nextTick()
}

describe('StockLogo', () => {
  beforeEach(clearMetadata)

  it('walks the CDN candidates before landing on initials', async () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'EXCO.DE' } })

    expect(wrapper.get('img').attributes('src')).toContain('parqet.com')
    await failCurrentImage(wrapper)
    expect(wrapper.get('img').attributes('src')).toContain('financialmodelingprep.com')
    await failCurrentImage(wrapper)

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('EX')
  })

  it('tries a provider logo that arrives after the CDN candidates failed', async () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'EXCO.DE' } })

    await failCurrentImage(wrapper)
    await failCurrentImage(wrapper)
    expect(wrapper.find('img').exists()).toBe(false)

    metadataBySymbol['EXCO.DE'] = { symbol: 'EXCO.DE', logo: 'https://provider.example/exco.png' }
    await flushPromises()

    expect(wrapper.get('img').attributes('src')).toBe('https://provider.example/exco.png')
  })

  it('falls back to the CDNs again when the late provider logo also fails', async () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'EXCO.DE' } })

    await failCurrentImage(wrapper)
    await failCurrentImage(wrapper)

    metadataBySymbol['EXCO.DE'] = { symbol: 'EXCO.DE', logo: 'https://provider.example/exco.png' }
    await flushPromises()
    await failCurrentImage(wrapper)

    expect(wrapper.get('img').attributes('src')).toContain('parqet.com')
  })

  it('restarts the candidate list when the symbol changes', async () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'EXCO.DE' } })

    await failCurrentImage(wrapper)
    expect(wrapper.get('img').attributes('src')).toContain('financialmodelingprep.com')

    await wrapper.setProps({ symbol: 'OTHER.L' })
    await nextTick()

    const src = wrapper.get('img').attributes('src')
    expect(src).toContain('parqet.com')
    expect(src).toContain('OTHER.L')
  })

  it('shows the company name on hover once metadata resolves', async () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'EXCO.DE' } })

    metadataBySymbol['EXCO.DE'] = { symbol: 'EXCO.DE', companyName: 'Example Company AG', logo: null }
    await flushPromises()

    expect(wrapper.get('img').attributes('title')).toBe('Example Company AG')
  })

  it('has no CDN candidate for an option contract symbol', () => {
    const wrapper = mount(StockLogo, { props: { symbol: 'TSLA 2026-06-18 350P' } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('TS')
  })
})
