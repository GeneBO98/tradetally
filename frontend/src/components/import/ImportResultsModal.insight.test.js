import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ImportResultsModal from './ImportResultsModal.vue'

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', tier: 'free' } }),
}))

function mountModal(propsOverrides = {}) {
  setActivePinia(createPinia())
  return mount(ImportResultsModal, {
    props: {
      isOpen: true,
      tradesImported: 24,
      duplicatesSkipped: 0,
      diagnostics: { totalRows: 24, parsedRows: 24, skippedRows: 0, invalidRows: 0, skippedReasons: [], warnings: [] },
      failedTrades: [],
      manualReviewItems: [],
      achievements: [],
      importInsight: null,
      selectedBroker: 'schwab',
      fileName: 'trades.csv',
      userEmail: 'trader@example.com',
      ...propsOverrides,
    },
    global: {
      stubs: { RouterLink: RouterLinkStub, teleport: true },
    },
  })
}

describe('ImportResultsModal first leak diagnosis', () => {
  it('renders the personalized diagnosis card with CTA link when insight is ready', async () => {
    const wrapper = mountModal({
      importInsight: {
        ready: true,
        scope: 'import',
        trade_count: 24,
        insight: {
          kind: 'revenge_proxy',
          tone: 'danger',
          headline: 'Post-loss re-entries cost you $920',
          detail: '4 trades opened within 30 minutes of a loss (3 lost).',
          cta_label: 'Inspect in Behavioral Analytics',
          cta_route: '/metrics/behavioral',
        },
      },
    })

    const card = wrapper.find('[data-testid="import-first-diagnosis"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('First leak diagnosis')
    expect(card.find('[data-testid="import-insight-scope"]').text().replace(/\s+/g, ' ').trim()).toContain('This import · 24 closed trades')
    expect(card.text()).toContain('Post-loss re-entries cost you $920')
    const link = card.findComponent(RouterLinkStub)
    expect(link.props('to')).toBe('/metrics/behavioral')

    await link.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('labels account-history fallback scope explicitly when import has fewer than 5 closed trades', () => {
    const wrapper = mountModal({
      tradesImported: 2,
      importInsight: {
        ready: true,
        scope: 'account',
        trade_count: 35,
        insight: {
          kind: 'worst_hour',
          tone: 'warning',
          headline: 'Entries around 2:00 PM cost you $410',
          detail: '5 trades in that hour across your recent history.',
          cta_label: 'Explore analytics',
          cta_route: '/analytics',
        },
      },
    })

    const scope = wrapper.find('[data-testid="import-insight-scope"]')
    expect(scope.exists()).toBe(true)
    expect(scope.text().replace(/\s+/g, ' ').trim()).toContain('Account history · 35 closed trades')
  })

  it('hides the diagnosis card when no trades were imported or insight is not ready', () => {
    const wrapper = mountModal({
      tradesImported: 0,
      importInsight: { ready: true, insight: { headline: 'Should not show' } },
    })
    expect(wrapper.find('[data-testid="import-first-diagnosis"]').exists()).toBe(false)
  })
})
