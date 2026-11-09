import { shallowMount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import IBKRReconciliationStatus from './IBKRReconciliationStatus.vue'

describe('IBKR reconciliation labels', () => {
  it('explains provisional totals and removes the label after Activity reconciliation', async () => {
    const wrapper = shallowMount(IBKRReconciliationStatus, { props: { status: 'pending' } })
    expect(wrapper.text()).toBe('Awaiting Activity reconciliation')
    expect(wrapper.get('span').attributes('title')).toContain('included in P&L')
    await wrapper.setProps({ status: 'reconciled' })
    expect(wrapper.text()).toBe('')
    await wrapper.setProps({ status: 'needs_review' })
    expect(wrapper.text()).toContain('needs review')
  })
})
