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
