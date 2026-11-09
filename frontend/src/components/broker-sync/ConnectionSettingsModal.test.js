import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useUserTimezone', () => ({
  useUserTimezone: () => ({
    formatDateTime: vi.fn(() => 'Aug 21, 2026, 09:00:00')
  })
}))

import ConnectionSettingsModal from '@/components/broker-sync/ConnectionSettingsModal.vue'

function schwabConnection() {
  return {
    id: 'connection-1',
    brokerType: 'schwab',
    accountLabel: 'My Schwab',
    autoSyncEnabled: true,
    syncFrequency: 'daily',
    syncTime: '06:00:00',
    syncStartDate: null,
    connectionStatus: 'active',
    createdAt: '2026-08-21T12:00:00Z',
    excluded_account_identifiers: ['****1111']
  }
}

describe('ConnectionSettingsModal Schwab account exclusions', () => {
  it('shows included state and saves excluded account identifiers', async () => {
    const wrapper = shallowMount(ConnectionSettingsModal, {
      props: {
        connection: schwabConnection(),
        schwabAccounts: [
          { account_identifier: '****1111' },
          { account_identifier: '****2222' }
        ]
      }
    })

    expect(wrapper.text()).toContain('Accounts included in sync')
    expect(wrapper.text()).toContain('Schwab ****1111')
    expect(wrapper.text()).toContain('Schwab ****2222')

    const accountCheckboxes = wrapper.findAll('input[type="checkbox"]')
    expect(accountCheckboxes).toHaveLength(2)
    expect(accountCheckboxes[0].element.checked).toBe(false)
    expect(accountCheckboxes[1].element.checked).toBe(true)

    await accountCheckboxes[1].setValue(false)
    await wrapper.findAll('button').find(button => button.text() === 'Save Changes').trigger('click')

    expect(wrapper.emitted('save')[0][0]).toMatchObject({
      excluded_account_identifiers: ['****1111', '****2222']
    })
  })

  it('explains that exclusions do not remove previously imported trades', () => {
    const wrapper = shallowMount(ConnectionSettingsModal, {
      props: {
        connection: schwabConnection(),
        schwabAccounts: [{ account_identifier: '****1111' }]
      }
    })

    expect(wrapper.text()).toContain('does not delete trades already imported')
  })
})

describe('IBKR optional confirmation query', () => {
  it('saves a new ID with the stored token and sends explicit null when removed', async () => {
    const connection = { ...schwabConnection(), brokerType: 'ibkr', ibkr_trade_confirmation_query_id: '123' }
    const wrapper = shallowMount(ConnectionSettingsModal, { props: { connection } })
    expect(wrapper.text()).toContain('every 15 minutes')
    await wrapper.get('#settingsConfirmationQuery').setValue('456')
    await wrapper.findAll('button').find(button => button.text() === 'Save Changes').trigger('click')
    expect(wrapper.emitted('save')[0][0]).toMatchObject({ ibkr_trade_confirmation_query_id: '456' })
    expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('flexToken')
    await wrapper.get('#settingsConfirmationQuery').setValue('')
    await wrapper.findAll('button').find(button => button.text() === 'Save Changes').trigger('click')
    expect(wrapper.emitted('save')[1][0]).toMatchObject({ ibkr_trade_confirmation_query_id: null })
  })
  it('omits an unchanged confirmation ID so ordinary schedule changes do not revalidate the broker', async () => {
    const wrapper = shallowMount(ConnectionSettingsModal, { props: { connection: { ...schwabConnection(), brokerType: 'ibkr', ibkr_trade_confirmation_query_id: '123' } } })
    await wrapper.findAll('button').find(button => button.text() === 'Save Changes').trigger('click')
    expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('ibkr_trade_confirmation_query_id')
  })
})

it('revalidates a suspended confirmation query even when its ID is unchanged', async () => {
  const wrapper = shallowMount(ConnectionSettingsModal, { props: { connection: { ...schwabConnection(), brokerType: 'ibkr',
    ibkr_trade_confirmation_query_id: '123', brokerMetadata: { ibkr_confirmation: { suspended: true } } } } })
  await wrapper.findAll('button').find(button => button.text() === 'Save Changes').trigger('click')
  expect(wrapper.emitted('save')[0][0]).toMatchObject({ ibkr_trade_confirmation_query_id: '123' })
})
