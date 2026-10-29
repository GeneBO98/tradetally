import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RateSourceAttribution from './RateSourceAttribution.vue'

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { isAuthenticated: true } }))
vi.mock('@/services/api', () => ({ default: { get } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

describe('RateSourceAttribution', () => {
  beforeEach(() => {
    get.mockReset()
    auth.isAuthenticated = true
  })

  it('shows a followable link when the served rates require attribution', async () => {
    get.mockResolvedValue({ data: {
      source: 'allratestoday', rateDate: '2026-10-29',
      attribution: { name: 'AllRatesToday', url: 'https://allratestoday.com/' }
    } })

    const wrapper = mount(RateSourceAttribution)
    await flushPromises()

    const link = wrapper.find('a')
    expect(get).toHaveBeenCalledWith('/settings/fx-source')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://allratestoday.com/')
    expect(link.attributes('rel')).not.toContain('nofollow')
    expect(link.text()).toContain('AllRatesToday')
  })

  it('renders nothing for a provider with no attribution requirement', async () => {
    get.mockResolvedValue({ data: { source: 'frankfurter', rateDate: '2026-10-29', attribution: null } })

    const wrapper = mount(RateSourceAttribution)
    await flushPromises()

    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('does not call the API or render when logged out', async () => {
    auth.isAuthenticated = false

    const wrapper = mount(RateSourceAttribution)
    await flushPromises()

    expect(get).not.toHaveBeenCalled()
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('stays empty when the lookup fails', async () => {
    get.mockRejectedValue(new Error('network'))

    const wrapper = mount(RateSourceAttribution)
    await flushPromises()

    expect(wrapper.find('a').exists()).toBe(false)
  })
})
