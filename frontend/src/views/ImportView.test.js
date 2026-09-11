import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authStore: {
    user: { tier: 'pro', role: 'user' },
    onboardingStep: 0,
    fetchUser: vi.fn()
  },
  tradesStore: {
    importTrades: vi.fn(),
    fetchTrades: vi.fn(),
    fetchAnalytics: vi.fn()
  },
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} }))
  }
}))

vi.mock('@/services/api', () => ({ default: mocks.api }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.authStore }))
vi.mock('@/stores/trades', () => ({ useTradesStore: () => mocks.tradesStore }))

vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showImportantWarning: vi.fn(),
    showSuccessModal: vi.fn(),
    clearModalAlert: vi.fn()
  })
}))

vi.mock('@/composables/useUserTimezone', () => ({
  useUserTimezone: () => ({ formatDateTime: vi.fn(() => 'today') })
}))

vi.mock('@/composables/useAnalytics', () => ({
  useAnalytics: () => ({ track: vi.fn(), trackImport: vi.fn() })
}))

vi.mock('@/composables/useGrowthBook', () => ({
  useGrowthBook: () => ({ getFeatureValue: vi.fn(() => false) })
}))

vi.mock('@/composables/useNotificationCenter', () => ({
  useNotificationCenter: () => ({ addUnreadNotifications: vi.fn() })
}))

vi.mock('@/composables/usePriceAlertNotifications', () => ({
  usePriceAlertNotifications: () => ({ suppressCelebrations: vi.fn() })
}))

vi.mock('@/composables/useStrategyOrder', () => ({
  useStrategyOrder: () => ({ orderNames: (names) => names || [], refresh: vi.fn() })
}))

vi.mock('@/composables/useVisibilityPolling', () => ({
  useVisibilityPolling: () => ({ start: vi.fn(), stop: vi.fn(), isActive: { value: false } })
}))

vi.mock('@/utils/csvImportParse', () => ({
  isSierraChartBinaryFile: () => false,
  parseCSVHeaders: vi.fn(() => Promise.resolve(['Date', 'Time', 'Type', 'Ref #', 'Description'])),
  parseCSVSampleRows: vi.fn(() => Promise.resolve([]))
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: '/import', query: {}, params: {} })
}))

import ImportView from '@/views/ImportView.vue'
import { parseCSVHeaders, parseCSVSampleRows } from '@/utils/csvImportParse'

const BaseSelectStub = {
  name: 'BaseSelect',
  props: ['modelValue', 'options', 'noun'],
  emits: ['update:modelValue'],
  template: `
    <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `
}

function mountView() {
  return shallowMount(ImportView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        BaseSelect: BaseSelectStub
      }
    }
  })
}

function notesCheckbox(wrapper) {
  const label = wrapper.findAll('label').find(node => node.text().includes('Import notes and descriptions'))
  return label.find('input[type="checkbox"]')
}

async function attachCsv(wrapper, content = 'Date,Time,Type,Ref #,Description\n1,2,3,4,5') {
  const input = wrapper.get('#file-upload')
  const file = new File([content], 'trades.csv', { type: 'text/csv' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('ImportView remembered import preferences', () => {
  function apiGet(url) {
    if (url === '/settings') {
      return Promise.resolve({ data: { settings: { uiPreferences: {} } } })
    }
    if (url === '/trades/import/requirements') {
      return Promise.resolve({ data: { requiresAccountSelection: false, accounts: [] } })
    }
    if (url === '/trades/import/history') {
      return Promise.resolve({ data: { imports: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0, hasMore: false } } })
    }
    if (url === '/trades/strategies') {
      return Promise.resolve({ data: { strategies: [] } })
    }
    if (url === '/csv-mappings') {
      return Promise.resolve({ data: { success: false, data: [] } })
    }
    if (typeof url === 'string' && url.startsWith('/trades/import/status/')) {
      return Promise.resolve({ data: { importLog: { status: 'completed', trades_imported: 1, error_details: {} } } })
    }
    if (url === '/notifications') {
      return Promise.resolve({ data: { notifications: [] } })
    }
    if (url === '/billing/subscription') {
      return Promise.resolve({ data: { data: {} } })
    }
    return Promise.resolve({ data: {} })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mocks.tradesStore.importTrades.mockReset()
    mocks.tradesStore.fetchTrades.mockReset()
    mocks.tradesStore.fetchAnalytics.mockReset()
    mocks.api.get.mockImplementation(apiGet)
    parseCSVHeaders.mockResolvedValue(['Date', 'Time', 'Type', 'Ref #', 'Description'])
    parseCSVSampleRows.mockResolvedValue({})
  })

  it('defaults to automatic classification with notes off', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#import-strategy').element.value).toBe('__auto__')
    expect(notesCheckbox(wrapper).element.checked).toBe(false)
    wrapper.unmount()
  })

  it('restores remembered choices on mount', async () => {
    localStorage.setItem('import_strategy_handling', '__blank__')
    localStorage.setItem('import_notes_and_descriptions', 'true')

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#import-strategy').element.value).toBe('__blank__')
    expect(notesCheckbox(wrapper).element.checked).toBe(true)
    wrapper.unmount()
  })

  it('persists choices after an import is successfully queued', async () => {
    mocks.tradesStore.importTrades.mockResolvedValue({ importId: 'imp-1' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#import-strategy').setValue('__blank__')
    await notesCheckbox(wrapper).setValue(true)
    await attachCsv(wrapper)
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(mocks.tradesStore.importTrades).toHaveBeenCalled())
    expect(localStorage.getItem('import_strategy_handling')).toBe('__blank__')
    expect(localStorage.getItem('import_notes_and_descriptions')).toBe('true')
    wrapper.unmount()
  })

  it('does not persist choices when the import fails', async () => {
    mocks.tradesStore.importTrades.mockRejectedValue(new Error('boom'))

    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#import-strategy').setValue('__blank__')
    await notesCheckbox(wrapper).setValue(true)
    await attachCsv(wrapper)
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(mocks.tradesStore.importTrades).toHaveBeenCalled())
    expect(localStorage.getItem('import_strategy_handling')).toBeNull()
    expect(localStorage.getItem('import_notes_and_descriptions')).toBeNull()
    wrapper.unmount()
  })

  it('defaults the account to auto-detect and surfaces the detected account', async () => {
    parseCSVHeaders.mockResolvedValue(['Date', 'Symbol', 'TradeAccount', 'Price'])
    parseCSVSampleRows.mockResolvedValue({ TradeAccount: ['RTSL00000000000', 'RTSL00000000000'] })
    mocks.api.get.mockImplementation((url) => {
      if (url === '/trades/import/requirements') {
        return Promise.resolve({
          data: {
            requiresAccountSelection: true,
            accounts: [{
              id: 'acct-1',
              name: 'Tradeify (Rithmic)',
              identifier: 'RTSL00000000000',
              broker: 'sierrachart',
              isPrimary: true
            }]
          }
        })
      }
      return apiGet(url)
    })

    const wrapper = mountView()
    await flushPromises()
    await attachCsv(wrapper)
    await flushPromises()

    expect(wrapper.get('#account').element.value).toBe('auto')
    expect(wrapper.text()).toContain('Tradeify (Rithmic)')
    wrapper.unmount()
  })

  it('never auto-selects the primary account', async () => {
    mocks.api.get.mockImplementation((url) => {
      if (url === '/trades/import/requirements') {
        return Promise.resolve({
          data: {
            requiresAccountSelection: true,
            accounts: [{ id: 'acct-primary', name: 'Primary', identifier: 'PRIMARY1', broker: 'schwab', isPrimary: true }]
          }
        })
      }
      return apiGet(url)
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('#account').element.value).toBe('auto')
    wrapper.unmount()
  })
})
