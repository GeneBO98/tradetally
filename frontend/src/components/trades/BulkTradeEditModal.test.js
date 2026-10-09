import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BulkTradeEditModal from './BulkTradeEditModal.vue'

const { bulkUpdateMetadata, fetchAccounts, invalidateAccounts, fetchGlobalAccounts, apiGet } = vi.hoisted(() => ({
  bulkUpdateMetadata: vi.fn(),
  fetchAccounts: vi.fn(),
  invalidateAccounts: vi.fn(),
  fetchGlobalAccounts: vi.fn(),
  apiGet: vi.fn()
}))

vi.mock('@/stores/trades', () => ({ useTradesStore: () => ({ bulkUpdateMetadata }) }))
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [
      { id: 'active', accountName: 'Main', accountIdentifier: 'ACC-1', isArchived: false },
      { id: 'archived', accountName: 'Old', accountIdentifier: 'ACC-OLD', isArchived: true },
      { id: 'unidentified', accountName: 'No ID', accountIdentifier: null, isArchived: false }
    ],
    fetchAccounts,
    invalidateAccounts
  })
}))
vi.mock('@/stores/uiPreferences', () => ({ useUiPreferencesStore: () => ({ notifyChanged: vi.fn() }) }))
vi.mock('@/composables/useGlobalAccountFilter', () => ({
  useGlobalAccountFilter: () => ({ fetchAccounts: fetchGlobalAccounts })
}))
vi.mock('@/services/api', () => ({ default: { get: apiGet } }))

const BaseModalStub = {
  props: ['modelValue', 'title', 'closeOnBackdrop', 'closeOnEscape', 'showClose'],
  emits: ['update:modelValue', 'close'],
  template: '<div v-if="modelValue"><h2>{{ title }}</h2><slot/><footer><slot name="footer"/></footer></div>'
}

function findApplyButton(wrapper) {
  return wrapper.findAll('button').find(button => button.text().includes('Apply to') || button.text().includes('Applying'))
}

function actionSelects(wrapper) {
  return wrapper.findAll('select').filter(select => select.attributes('aria-label')?.endsWith('action'))
}

async function openModal() {
  const wrapper = mount(BulkTradeEditModal, {
    props: { open: true, tradeIds: ['trade-1', 'trade-2'] },
    global: { stubs: { BaseModal: BaseModalStub } }
  })
  await Promise.resolve()
  await Promise.resolve()
  return wrapper
}

describe('BulkTradeEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    fetchAccounts.mockResolvedValue([])
    fetchGlobalAccounts.mockResolvedValue(undefined)
    apiGet.mockImplementation(url => Promise.resolve({
      data: url.endsWith('/strategies') ? { strategies: ['Momentum', 'Reversal'] } : { setups: ['Breakout', 'Gap'] }
    }))
    bulkUpdateMetadata.mockResolvedValue({ updated_trade_count: 2 })
  })

  it('starts every field at Keep unchanged and disables Apply until a valid change exists', async () => {
    const wrapper = await openModal()

    const selects = actionSelects(wrapper)
    expect(selects).toHaveLength(3)
    selects.forEach(select => expect(select.element.value).toBe('keep'))
    expect(findApplyButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Changes to apply')

    // A Set mode with an empty value is still invalid
    await selects[1].setValue('set')
    expect(findApplyButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('applies independent set and clear actions per field', async () => {
    const wrapper = await openModal()

    const selects = actionSelects(wrapper)
    await selects[0].setValue('set')
    await wrapper.find('select[aria-label="Account value"]').setValue('ACC-1')
    await selects[1].setValue('clear')
    await selects[2].setValue('set')
    await wrapper.find('input[aria-label="Strategy value"]').setValue('Momentum')

    const apply = findApplyButton(wrapper)
    expect(apply.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Changes to apply')
    await apply.trigger('click')

    expect(bulkUpdateMetadata).toHaveBeenCalledWith(['trade-1', 'trade-2'], {
      account_identifier: 'ACC-1',
      setup: null,
      strategy: 'Momentum'
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('clears an account with No account and sends null', async () => {
    const wrapper = await openModal()

    await actionSelects(wrapper)[0].setValue('clear')
    expect(wrapper.text()).toContain('No account')
    expect(wrapper.text()).toContain('Account will be cleared.')
    await findApplyButton(wrapper).trigger('click')

    expect(bulkUpdateMetadata).toHaveBeenCalledWith(['trade-1', 'trade-2'], { account_identifier: null })
  })

  it('only offers active managed accounts with identifiers', async () => {
    const wrapper = await openModal()

    await actionSelects(wrapper)[0].setValue('set')
    const accountOptions = wrapper.find('select[aria-label="Account value"]').text()
    expect(accountOptions).toContain('Main (ACC-1)')
    expect(accountOptions).not.toContain('Old')
    expect(accountOptions).not.toContain('No ID')
  })

  it('allows entering brand-new setup and strategy names', async () => {
    const wrapper = await openModal()

    const selects = actionSelects(wrapper)
    await selects[1].setValue('set')
    await wrapper.find('input[aria-label="Setup value"]').setValue('Brand New Setup')
    await selects[2].setValue('set')
    await wrapper.find('input[aria-label="Strategy value"]').setValue('Never Seen Before')
    await findApplyButton(wrapper).trigger('click')

    expect(bulkUpdateMetadata).toHaveBeenCalledWith(['trade-1', 'trade-2'], {
      setup: 'Brand New Setup',
      strategy: 'Never Seen Before'
    })
  })

  it('trims entered values before submitting', async () => {
    const wrapper = await openModal()

    await actionSelects(wrapper)[1].setValue('set')
    await wrapper.find('input[aria-label="Setup value"]').setValue('  Padded  ')
    await findApplyButton(wrapper).trigger('click')

    expect(bulkUpdateMetadata).toHaveBeenCalledWith(['trade-1', 'trade-2'], { setup: 'Padded' })
  })

  it('reuses hidden-item preferences and custom ordering for strategies and setups', async () => {
    localStorage.setItem('hiddenStrategies', JSON.stringify(['Reversal']))
    localStorage.setItem('strategyOrder', JSON.stringify(['Gap Setup First']))
    apiGet.mockImplementation(url => Promise.resolve({
      data: url.endsWith('/strategies')
        ? { strategies: ['Momentum', 'Reversal'] }
        : { setups: ['Breakout', 'Gap'] }
    }))
    const wrapper = await openModal()

    await actionSelects(wrapper)[1].setValue('set')
    const setupOptions = wrapper.find('datalist#bulk-setup-options').findAll('option').map(option => option.attributes('value'))
    expect(setupOptions).toEqual(['Breakout', 'Gap'])

    await actionSelects(wrapper)[2].setValue('set')
    const strategyOptions = wrapper.find('datalist#bulk-strategy-options').findAll('option').map(option => option.attributes('value'))
    expect(strategyOptions).toEqual(['Momentum'])
  })

  it('shows a loading state and blocks duplicate submissions while saving', async () => {
    let resolveSave
    bulkUpdateMetadata.mockReturnValue(new Promise(resolve => { resolveSave = resolve }))
    const wrapper = await openModal()

    await actionSelects(wrapper)[1].setValue('clear')
    await findApplyButton(wrapper).trigger('click')

    expect(wrapper.text()).toContain('Applying...')
    const apply = findApplyButton(wrapper)
    expect(apply.attributes('disabled')).toBeDefined()
    const cancel = wrapper.findAll('button').find(button => button.text() === 'Cancel')
    expect(cancel.attributes('disabled')).toBeDefined()

    // A second click while saving must not submit again
    await apply.trigger('click')
    expect(bulkUpdateMetadata).toHaveBeenCalledTimes(1)

    resolveSave({ updated_trade_count: 2 })
    await Promise.resolve()
    await Promise.resolve()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('keeps the modal open with entered values after a request failure', async () => {
    bulkUpdateMetadata.mockRejectedValue({ response: { data: { error: 'One or more selected trades were not found' } } })
    const wrapper = await openModal()

    await actionSelects(wrapper)[2].setValue('set')
    await wrapper.find('input[aria-label="Strategy value"]').setValue('Momentum')
    await findApplyButton(wrapper).trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('One or more selected trades were not found')
    expect(wrapper.emitted('saved')).toBeFalsy()
    // Selection and entered values are preserved for a retry
    expect(wrapper.find('input[aria-label="Strategy value"]').element.value).toBe('Momentum')
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('emits saved with refresh_failed so the caller can offer a refresh-only retry', async () => {
    bulkUpdateMetadata.mockResolvedValue({ updated_trade_count: 2, refresh_failed: true })
    const wrapper = await openModal()

    await actionSelects(wrapper)[0].setValue('set')
    await wrapper.find('select[aria-label="Account value"]').setValue('ACC-1')
    await findApplyButton(wrapper).trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    const saved = wrapper.emitted('saved')
    expect(saved[0][0]).toEqual({ updated_trade_count: 2, refresh_failed: true })
    // Account reassignment force-refreshes account counts and the global selector
    expect(invalidateAccounts).toHaveBeenCalled()
    expect(fetchAccounts).toHaveBeenCalledWith({ force: true })
    expect(fetchGlobalAccounts).toHaveBeenCalledWith(true)
  })

  it('does not refresh accounts when only setup or strategy changed', async () => {
    const wrapper = await openModal()

    await actionSelects(wrapper)[1].setValue('clear')
    await findApplyButton(wrapper).trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(invalidateAccounts).not.toHaveBeenCalled()
    expect(fetchAccounts).toHaveBeenCalledTimes(1) // only loadOptions
  })

  it('refuses dismissal while saving and allows it otherwise', async () => {
    let resolveSave
    bulkUpdateMetadata.mockReturnValue(new Promise(resolve => { resolveSave = resolve }))
    const wrapper = await openModal()

    // Open modal: close works
    wrapper.vm.close()
    expect(wrapper.emitted('close')).toBeTruthy()

    await actionSelects(wrapper)[1].setValue('clear')
    await findApplyButton(wrapper).trigger('click')

    // Saving: close is suppressed
    wrapper.vm.close()
    expect(wrapper.emitted('close')).toHaveLength(1)

    resolveSave({ updated_trade_count: 2 })
    await Promise.resolve()
  })
})
