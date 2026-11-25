import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CSVColumnMappingModal from './CSVColumnMappingModal.vue'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() })
}))

// Headers the keyword matching cannot fully place ("Lots", "Open").
const CSV = 'Instrument,Lots,Open,Close,Dir,Opened At\nEURUSD,0.5,1.0812,1.0850,Long,14/03/2026 09:30\nGBPUSD,1,1.2710,1.2690,Short,15/03/2026 10:05\n'
// Headers the keyword matching places on its own.
const RECOGNIZED_CSV = 'Symbol,Quantity,Price,Side\nAAPL,10,190.5,Buy\n'

// Mounted the way ImportView does it: created with is-open already true.
function mountModal(csv = CSV) {
  return mount(CSVColumnMappingModal, {
    props: {
      isOpen: true,
      csvFile: new File([csv], 'export.csv', { type: 'text/csv' }),
      csvHeaders: csv.split('\n')[0].split(',')
    }
  })
}

const selectFor = (wrapper, header) => {
  const row = wrapper.findAll('.divide-y > div').find(r => r.text().startsWith(header))
  return row.find('select').element.value
}

async function settle() {
  // File reads resolve on a macrotask, so flushPromises alone is not enough.
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe('CSVColumnMappingModal AI column match', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pre-fills the mapping from the AI suggestion when it opens', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          mapping: {
            symbol_column: 'Instrument',
            quantity_column: 'Lots',
            entry_price_column: 'Open',
            exit_price_column: 'Close',
            side_column: 'Dir',
            entry_date_column: 'Opened At'
          },
          date_format: 'DD/MM/YYYY'
        }
      }
    })

    const wrapper = mountModal()
    await settle()

    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/csv-mappings/suggest')
    expect(body.headers).toEqual(['Instrument', 'Lots', 'Open', 'Close', 'Dir', 'Opened At'])
    expect(body.sampleRows.Instrument[0]).toBe('EURUSD')

    expect(selectFor(wrapper, 'Instrument')).toBe('symbol_column')
    expect(selectFor(wrapper, 'Lots')).toBe('quantity_column')
    expect(selectFor(wrapper, 'Open')).toBe('entry_price_column')
    expect(selectFor(wrapper, 'Close')).toBe('exit_price_column')
    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('AI matched 6 columns')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Save mapping & import')
  })

  it('keeps the suggestion editable and saves the edited mapping', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/csv-mappings/suggest') {
        return Promise.resolve({ data: { success: true, data: { mapping: { symbol_column: 'Instrument', quantity_column: 'Lots', entry_price_column: 'Close' }, date_format: null } } })
      }
      return Promise.resolve({ data: { success: true, data: { id: 'mapping-1' } } })
    })

    const wrapper = mountModal()
    await settle()

    const openRow = wrapper.findAll('.divide-y > div').find(r => r.text().startsWith('Open'))
    await openRow.find('select').setValue('entry_price_column')
    await wrapper.find('form').trigger('submit')
    await settle()

    const saved = api.post.mock.calls.find(([url]) => url === '/csv-mappings')[1]
    expect(saved.entry_price_column).toBe('Open')
    expect(saved.symbol_column).toBe('Instrument')
    expect(wrapper.emitted('mappingSaved')).toHaveLength(1)
  })

  it('says which required fields the AI could not find', async () => {
    api.post.mockResolvedValue({
      data: { success: true, data: { mapping: { symbol_column: 'Instrument', quantity_column: 'Lots' }, date_format: null } }
    })

    const wrapper = mountModal()
    await settle()

    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('could not find Entry Price')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('falls back to the keyword matches when AI is unavailable', async () => {
    api.post.mockRejectedValue({ response: { status: 503, data: { code: 'AI_UNAVAILABLE' } } })

    const wrapper = mountModal()
    await settle()

    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain("isn't available")
    expect(wrapper.find('[data-testid="ai-match-retry"]').exists()).toBe(false)
    // "Instrument" is one of the keyword matches, so the form is still pre-filled.
    expect(selectFor(wrapper, 'Instrument')).toBe('symbol_column')
  })

  it('does not call the AI when the columns are recognized by name', async () => {
    const wrapper = mountModal(RECOGNIZED_CSV)
    await settle()

    expect(api.post).not.toHaveBeenCalled()
    expect(selectFor(wrapper, 'Symbol')).toBe('symbol_column')
    expect(selectFor(wrapper, 'Quantity')).toBe('quantity_column')
    expect(selectFor(wrapper, 'Price')).toBe('entry_price_column')
    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('recognized the required columns')
    expect(wrapper.find('button[type="submit"]').text()).toBe('Save mapping & import')
  })

  it('still lets the user ask for an AI match on a recognized file', async () => {
    api.post.mockResolvedValue({
      data: { success: true, data: { mapping: { symbol_column: 'Symbol', quantity_column: 'Quantity', entry_price_column: 'Price', side_column: 'Side' }, date_format: null } }
    })

    const wrapper = mountModal(RECOGNIZED_CSV)
    await settle()
    await wrapper.find('[data-testid="ai-match-retry"]').trigger('click')
    await settle()

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('AI matched 4 columns')
  })

  it('says AI matching is a Pro feature on a tier without AI access', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: { code: 'PRO_REQUIRED' } } })

    const wrapper = mountModal()
    await settle()

    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('Pro feature')
    expect(wrapper.find('[data-testid="ai-match-retry"]').exists()).toBe(false)
  })

  it('explains when the user is out of AI credits', async () => {
    api.post.mockRejectedValue({ response: { status: 402, data: { code: 'INSUFFICIENT_CREDITS' } } })

    const wrapper = mountModal()
    await settle()

    expect(wrapper.find('[data-testid="ai-match-status"]').text()).toContain('out of AI credits')
  })

  it('masks account numbers before the samples leave the browser', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { mapping: { symbol_column: 'Instrument' }, date_format: null } } })
    const csv = 'Instrument,Lots,Open,Account,Memo\nEURUSD,0.5,1.0812,DU7654321,from U1234567\n'

    mountModal(csv)
    await settle()

    const body = api.post.mock.calls[0][1]
    expect(body.sampleRows.Account).toEqual(['[redacted]'])
    expect(body.sampleRows.Memo).toEqual(['from U#######'])
    expect(body.sampleRows.Instrument).toEqual(['EURUSD'])
    expect(JSON.stringify(body)).not.toMatch(/7654321|1234567/)
  })

  it('keeps a keyword match the AI had no answer for', async () => {
    // "Instrument" and "Close" are placed by keyword; the AI only knows Lots and Open.
    api.post.mockResolvedValue({
      data: { success: true, data: { mapping: { quantity_column: 'Lots', entry_price_column: 'Open' }, date_format: null } }
    })

    const wrapper = mountModal()
    await settle()

    expect(selectFor(wrapper, 'Lots')).toBe('quantity_column')
    expect(selectFor(wrapper, 'Open')).toBe('entry_price_column')
    expect(selectFor(wrapper, 'Instrument')).toBe('symbol_column')
  })

  it('applies a slow AI reply around a choice the user made while waiting', async () => {
    let resolveSuggest
    api.post.mockImplementation(() => new Promise(resolve => { resolveSuggest = resolve }))

    const wrapper = mountModal()
    await settle()
    expect(wrapper.find('[data-testid="ai-match-status"]').exists()).toBe(true)

    const openRow = wrapper.findAll('.divide-y > div').find(r => r.text().startsWith('Open'))
    await openRow.find('select').setValue('exit_price_column')

    resolveSuggest({
      data: { success: true, data: { mapping: { quantity_column: 'Lots', entry_price_column: 'Open', exit_price_column: 'Close' }, date_format: null } }
    })
    await settle()

    // The user's choice stands; the rest of the paid-for reply is still used.
    expect(selectFor(wrapper, 'Open')).toBe('exit_price_column')
    expect(selectFor(wrapper, 'Lots')).toBe('quantity_column')
    expect(selectFor(wrapper, 'Close')).toBe('')
  })

  it('aborts the request when the columns are re-parsed so it is not charged', async () => {
    let signal
    api.post.mockImplementation((url, body, config) => {
      signal = config?.signal
      return new Promise(() => {})
    })

    const wrapper = mountModal()
    await settle()
    expect(signal.aborted).toBe(false)

    await wrapper.setProps({ isOpen: false })
    expect(signal.aborted).toBe(true)
  })
})
