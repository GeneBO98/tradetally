import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TaxReportView from './TaxReportView.vue'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))
const proAccess = vi.hoisted(() => ({ locked: false }))
vi.mock('@/composables/useProAccess', async () => {
  const { computed } = await import('vue')
  return { useProAccess: () => ({ showProLock: computed(() => proAccess.locked) }) }
})
vi.mock('@/composables/useGlobalAccountFilter', async () => {
  const { ref } = await import('vue')
  return { useGlobalAccountFilter: () => ({ selectedAccount: ref(null) }) }
})

const bucket = (count, proceeds, costBasis, adjustments, gainLoss) => ({ count, proceeds, costBasis, adjustments, gainLoss })

function reportFor(year, overrides = {}) {
  return {
    year,
    timezone: 'America/New_York',
    availableYears: [2025, 2024],
    display_currency: 'USD',
    summary: {
      shortTerm: bucket(2, 8500, 10100, 1000, -600),
      longTerm: bucket(1, 1500, 1000, 0, 500),
      section1256: { count: 3, proceeds: 0, costBasis: 0, gainLoss: 1000, longTermPortion: 600, shortTermPortion: 400 },
      washSales: { count: 1, disallowed: 1000 },
      netGainLoss: 900
    },
    excluded: { otherCurrency: 1, missingMultiplier: 0, unusable: 0, approximated: 1 },
    rows: [
      { tradeId: 't1', symbol: 'AAPL', description: '100 sh AAPL', instrumentType: 'stock', side: 'long', account: 'A', quantity: 100, dateAcquired: '2025-03-03', dateSold: '2025-03-10', proceeds: 4000, costBasis: 5000, adjustmentCode: 'W', adjustmentAmount: 1000, gainLoss: 0, term: 'short', approximate: false },
      { tradeId: 't2', symbol: 'AAPL', description: '100 sh AAPL', instrumentType: 'stock', side: 'short', account: 'A', quantity: 100, dateAcquired: '2025-06-02', dateSold: '2025-06-02', proceeds: 4500, costBasis: 5100, adjustmentCode: '', adjustmentAmount: 0, gainLoss: -600, term: 'short', approximate: true }
    ],
    pagination: { page: 1, pageSize: 100, totalRows: 2, totalPages: 1 },
    ...overrides
  }
}

const mountView = () => mount(TaxReportView, {
  global: {
    stubs: {
      ProUpgradePrompt: { props: ['description'], template: '<div data-stub="upgrade">{{ description }}</div>' },
      RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
      BaseSelect: {
        props: ['modelValue', 'options'],
        emits: ['update:modelValue'],
        template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', isNaN($event.target.value) ? $event.target.value : Number($event.target.value))"><option v-for="o in options" :key="o.value ?? o" :value="o.value ?? o">{{ o.label ?? o }}</option></select>'
      }
    }
  }
})

const reportCalls = () => api.get.mock.calls.filter(([url]) => url === '/tax-report')

describe('TaxReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proAccess.locked = false
    api.get.mockImplementation((url, config) => {
      if (url === '/tax-report') return Promise.resolve({ data: reportFor(config.params.year || 2025) })
      return Promise.resolve({ data: new Blob(['V042']) })
    })
  })

  it('loads the latest year once and shows the totals and Form 8949 lines', async () => {
    const wrapper = mountView()
    await flushPromises()

    // The server chose 2025; adopting it must not trigger a second request.
    expect(reportCalls()).toHaveLength(1)
    expect(reportCalls()[0][1].params).toEqual({ page: 1, pageSize: 100 })

    expect(wrapper.get('[data-testid="tax-net"]').text()).toBe('+$900.00')
    expect(wrapper.get('[data-testid="tax-wash"]').text()).toBe('$1,000.00')
    const totals = wrapper.get('[data-testid="tax-totals"]').text()
    expect(totals).toContain('Short-term')
    expect(totals).toContain('-$600.00')
    expect(totals).toContain('Futures (section 1256)')
    expect(wrapper.get('[data-testid="tax-1256"]').text()).toContain('60% (+$600.00)')

    const rows = wrapper.get('[data-testid="tax-rows"]').findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('03/03/2025')
    expect(rows[0].text()).toContain('W$1,000.00')
    expect(rows[1].text()).toContain('Short sale')
    expect(rows[1].text()).toContain('Estimated')
    expect(rows[0].find('a').attributes('href')).toBe('/trades/t1')

    const notices = wrapper.get('[data-testid="tax-notices"]').text()
    expect(notices).toContain('1 line marked Estimated')
    expect(notices).toContain('1 closed trade in a currency other than US dollars is left out')
    expect(wrapper.get('[data-testid="tax-disclaimer"]').text()).toContain('not tax advice')
  })

  it('reloads for another year and for the wash sale filter, one request each', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#tax-year').setValue('2024')
    await flushPromises()
    expect(reportCalls()).toHaveLength(2)
    expect(reportCalls()[1][1].params).toMatchObject({ year: 2024, page: 1 })

    const washFilter = wrapper.findAll('.segment').find((button) => button.text() === 'Wash sales')
    await washFilter.trigger('click')
    await flushPromises()
    expect(reportCalls()).toHaveLength(3)
    expect(reportCalls()[2][1].params).toMatchObject({ year: 2024, washOnly: 'true' })
  })

  it('downloads the TurboTax file for the chosen 1099-B box', async () => {
    const createObjectURL = vi.fn(() => 'blob:tax')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#tax-box').setValue('C')
    await wrapper.get('[data-testid="tax-export-txf"]').trigger('click')
    await flushPromises()

    const [, config] = api.get.mock.calls.find(([url]) => url === '/tax-report/export')
    expect(config).toEqual({ params: { year: 2025, format: 'txf', box: 'C' }, responseType: 'blob' })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tax')
    vi.unstubAllGlobals()
  })

  it('shows free plans the full report with an upgrade prompt in place of the exports', async () => {
    proAccess.locked = true

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="tax-net"]').text()).toBe('+$900.00')
    expect(wrapper.get('[data-testid="tax-rows"]').findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.get('[data-testid="tax-export-locked"]').text()).toContain('Download 2025 as a TurboTax file')
    expect(wrapper.find('[data-testid="tax-export-txf"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tax-export-csv"]').exists()).toBe(false)
  })

  it('shows an empty state when there are no closed trades', async () => {
    api.get.mockResolvedValue({
      data: reportFor(null, {
        availableYears: [],
        rows: [],
        summary: {
          shortTerm: bucket(0, 0, 0, 0, 0), longTerm: bucket(0, 0, 0, 0, 0),
          section1256: { count: 0, proceeds: 0, costBasis: 0, gainLoss: 0, longTermPortion: 0, shortTermPortion: 0 },
          washSales: { count: 0, disallowed: 0 }, netGainLoss: 0
        },
        pagination: { page: 1, pageSize: 100, totalRows: 0, totalPages: 1 }
      })
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="tax-empty"]').text()).toContain('Nothing to report yet')
    expect(wrapper.find('[data-testid="tax-export-txf"]').exists()).toBe(false)
  })

  it('shows the error and lets the user retry', async () => {
    api.get.mockRejectedValueOnce({ response: { data: { message: 'This feature requires a Pro subscription' } } })

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="tax-error"]').text()).toContain('requires a Pro subscription')

    await wrapper.get('[data-testid="tax-error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="tax-net"]').exists()).toBe(true)
  })
})
