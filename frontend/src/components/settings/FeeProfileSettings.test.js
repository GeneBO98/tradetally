import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FeeProfileSettings from './FeeProfileSettings.vue'

const accounts = [
  { id: 'account-1', accountName: 'Tradeify', accountIdentifier: 'RTSL1', isArchived: false },
  { id: 'account-2', accountName: 'Archived', accountIdentifier: 'OLD1', isArchived: true },
  { id: 'account-3', accountName: 'Unlinked', accountIdentifier: null, isArchived: false }
]

const profile = {
  id: 'profile-1',
  name: 'Tradeify Rithmic',
  notes: 'MES schedule',
  isZeroFee: false,
  rates: [{
    id: 'rate-1',
    broker: 'sierrachart',
    instrument: 'MES',
    commissionPerContract: 0.91,
    commissionPerSide: 0,
    exchangeFeePerContract: 0,
    nfaFeePerContract: 0,
    clearingFeePerContract: 0,
    platformFeePerContract: 0
  }],
  accountIds: ['account-1'],
  accounts: [{ id: 'account-1', accountName: 'Tradeify', accountIdentifier: 'RTSL1' }]
}

describe('FeeProfileSettings', () => {
  it('shows assigned profiles and only assignable active accounts', () => {
    const wrapper = mount(FeeProfileSettings, {
      props: { profiles: [profile], accounts }
    })

    expect(wrapper.text()).toContain('Tradeify Rithmic')
    const rows = wrapper.findAll('input[type="checkbox"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].element.checked).toBe(true)
    expect(rows[0].element.closest('label').textContent).toContain('Tradeify')
  })

  it('names the profile an account currently uses when it is a different one', () => {
    const otherProfile = { ...profile, id: 'profile-2', name: 'Lucid Tradovate', accountIds: [], accounts: [] }
    const wrapper = mount(FeeProfileSettings, {
      props: {
        profiles: [profile, otherProfile],
        accounts: [{ ...accounts[0], feeProfileId: 'profile-1' }]
      }
    })

    const cards = wrapper.findAll('article')
    expect(cards[0].text()).not.toContain('Uses Tradeify Rithmic')
    expect(cards[1].text()).toContain('Uses Tradeify Rithmic')
  })

  it('emits a profile payload with normalized instrument names', async () => {
    const wrapper = mount(FeeProfileSettings, { props: { profiles: [], accounts } })
    await wrapper.find('button').trigger('click')
    await wrapper.find('#fee-profile-name').setValue('Lucid Tradovate')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      name: 'Lucid Tradovate',
      is_zero_fee: false,
      rates: []
    })
  })

  it('emits account assignment changes', async () => {
    const wrapper = mount(FeeProfileSettings, {
      props: { profiles: [profile], accounts }
    })
    await wrapper.find('input[type="checkbox"]').setValue(false)

    expect(wrapper.emitted('assign')?.[0]?.[0]).toEqual({
      profileId: 'profile-1',
      accountIds: []
    })
  })

  it('closes a successfully created profile and edits it using its saved ID', async () => {
    const wrapper = mount(FeeProfileSettings, { props: { profiles: [], accounts } })
    await wrapper.find('button').trigger('click')
    await wrapper.find('#fee-profile-name').setValue(profile.name)
    await wrapper.find('form').trigger('submit')
    const [, on_saved] = wrapper.emitted('save')[0]
    on_saved()
    await wrapper.setProps({ profiles: [profile] })
    expect(wrapper.find('form').exists()).toBe(false)
    const edit = wrapper.findAll('button').find(button => button.text() === 'Edit')
    await edit.trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('save')[1][0].id).toBe(profile.id)
  })

  it('keeps unsaved input when a save has not succeeded', async () => {
    const wrapper = mount(FeeProfileSettings, { props: { profiles: [], accounts } })
    await wrapper.find('button').trigger('click')
    await wrapper.find('#fee-profile-name').setValue('Retry me')
    await wrapper.find('form').trigger('submit')
    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ loading: false })
    expect(wrapper.find('#fee-profile-name').element.value).toBe('Retry me')
  })
})
