import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DetailedStats from '@/components/analytics/DetailedStats.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ({ fullPath: '/metrics', query: {}, params: {} }) }
})
vi.mock('@/components/common/StockLogo.vue', () => ({
  __esModule: true,
  default: { name: 'StockLogo', template: '<span></span>' }
}))

const overview = { sqn: '3.21', kelly_percentage: '17.89', k_ratio: '4.56', pnl_std_dev: 123.45 }

function mountStats(props = {}) {
  return mount(DetailedStats, {
    props: { overview, symbolStats: [], ...props },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
  })
}

describe('DetailedStats Pro gating', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('never renders advanced metric values for free users', () => {
    useAuthStore().user = { tier: 'free', billingEnabled: true }
    const wrapper = mountStats({ isFreeTier: true })
    const text = wrapper.text()
    expect(text).not.toContain('3.21')
    expect(text).not.toContain('17.89')
    expect(text).not.toContain('4.56')
    expect(text).toContain('Pro Feature')
  })

  it('does not render values or the lock while the user is still loading', () => {
    const wrapper = mountStats({ isFreeTier: false })
    expect(wrapper.text()).not.toContain('3.21')
    expect(wrapper.text()).not.toContain('Pro Feature')
  })

  it('renders advanced metric values for Pro users', () => {
    useAuthStore().user = { tier: 'pro', billingEnabled: true }
    const wrapper = mountStats({ isFreeTier: false })
    const text = wrapper.text()
    expect(text).toContain('3.21')
    expect(text).toContain('17.89%')
    expect(text).toContain('4.56')
    expect(text).not.toContain('Pro Feature')
  })
})
