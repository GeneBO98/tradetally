import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('@/composables/useUserTimezone', () => ({ useUserTimezone: () => ({ formatDateTime: value => value }) }))
import api from '@/services/api'
import ConfirmationSyncDay from './ConfirmationSyncDay.vue'
const group = { id: 'day', connectionId: 'owned-connection', local_date: '2026-11-11', createdAt: '2026-11-11T10:00:00Z' }
const check = id => ({ id, startedAt: '2026-11-11T09:30:00Z', status: 'completed', tradesImported: 1,
  syncDetails: { updated_count: 2, warnings: ['Commissions pending'], outcome: 'warning' } })
beforeEach(() => vi.resetAllMocks())

describe('expanded confirmation history', () => {
  it('loads the selected day and paginates individual checks without dropping existing rows', async () => {
    api.get.mockResolvedValueOnce({ data: { data: [check('first')], has_more: true } })
      .mockResolvedValueOnce({ data: { data: [check('second')], has_more: false } })
    const wrapper = mount(ConfirmationSyncDay, { props: { group } })
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/broker-sync/connections/owned-connection/logs', {
      params: { group_date: '2026-11-11', limit: 50, offset: 0 }
    })
    expect(wrapper.text()).toContain('Commissions pending')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.get.mock.calls[1][1].params.offset).toBe(1)
    expect(wrapper.findAll('tbody > tr')).toHaveLength(4)
    expect(wrapper.find('button').exists()).toBe(false)
  })
  it('refreshes an open day when new checks arrive and keeps content visible during loading', async () => {
    let resolve
    api.get.mockResolvedValueOnce({ data: { data: [check('first')] } })
      .mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mount(ConfirmationSyncDay, { props: { group } })
    await flushPromises()
    await wrapper.setProps({ group: { ...group, createdAt: '2026-11-11T11:00:00Z' } })
    expect(wrapper.text()).toContain('Commissions pending')
    resolve({ data: { data: [check('newest'), check('first')] } })
    await flushPromises()
    expect(wrapper.findAll('tbody > tr')).toHaveLength(4)
  })
  it('can retry an error without affecting the parent history', async () => {
    api.get.mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce({ data: { data: [check('first')] } })
    const wrapper = mount(ConfirmationSyncDay, { props: { group } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Commissions pending')
  })
})
