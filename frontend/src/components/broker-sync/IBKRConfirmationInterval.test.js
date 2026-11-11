import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import contracts from '../../../../tests/fixtures/trading-calculation-contracts.json'
import IBKRConfirmationInterval from './IBKRConfirmationInterval.vue'
import IBKRConnectionModal from './IBKRConnectionModal.vue'
import { validConfirmationInterval, formatConfirmationInterval } from '@/utils/ibkrConfirmationInterval'

describe('confirmation intervals', () => {
  it.each([15, 30, 45, 60, 120, 1440])('accepts %s minutes', value => expect(validConfirmationInterval(value)).toBe(true))
  it.each([0, 5, 16, 22.5, 1455, '', null, '60'])('rejects invalid value %s', value => expect(validConfirmationInterval(value)).toBe(false))
  it.each(contracts.ibkr_confirmation_schedule_cases)('matches the shared schedule label for $interval_minutes minutes', ({ interval_minutes, expected_label }) => {
    expect(formatConfirmationInterval(interval_minutes)).toBe(expected_label)
  })
  it('formats the connection card cadence', () => {
    expect(formatConfirmationInterval(15)).toBe('15 minutes')
    expect(formatConfirmationInterval(60)).toBe('1 hour')
    expect(formatConfirmationInterval(120)).toBe('2 hours')
  })
  it('labels bounds and emits numeric input without losing an empty value', async () => {
    const wrapper = mount(IBKRConfirmationInterval, { props: { id: 'interval', modelValue: 15 } })
    expect(wrapper.get('label').attributes('for')).toBe('interval')
    expect(wrapper.get('input').attributes()).toMatchObject({ min: '15', max: '1440', step: '15' })
    await wrapper.get('input').setValue('60')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([60])
    await wrapper.get('input').setValue('')
    expect(wrapper.emitted('update:modelValue')[1]).toEqual([''])
  })
  it('saves the interval during setup and preserves it while reconnecting', async () => {
    const wrapper = mount(IBKRConnectionModal, { props: { reconnecting: {
      ibkrFlexQueryId: 'activity', ibkr_trade_confirmation_query_id: 'confirm', ibkr_confirmation_interval_minutes: 60,
      syncTime: '06:00:00', autoSyncEnabled: true
    } } })
    expect(wrapper.get('#newConfirmationInterval').element.value).toBe('60')
    await wrapper.get('#flexToken').setValue('renewed-token')
    await wrapper.findAll('button').find(button => button.text() === 'Connect').trigger('click')
    expect(wrapper.emitted('save')[0][0]).toMatchObject({ ibkr_confirmation_interval_minutes: 60, ibkr_trade_confirmation_query_id: 'confirm', flexQueryId: 'activity' })
    await wrapper.get('#newConfirmationInterval').setValue('10')
    expect(wrapper.findAll('button').find(button => button.text() === 'Connect').attributes('disabled')).toBeDefined()
  })
})
