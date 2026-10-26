import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OandaConnectionModal from './OandaConnectionModal.vue'
import api from '@/services/api'

vi.mock('@/services/api', () => ({ default: { post: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true })
})

describe('OANDA connection', () => {
  it('loads accounts before connecting and never persists the token in the browser', async () => {
    api.post.mockResolvedValueOnce({ data: { data: [{ account_id: '101-001-123456-001' }] } })
      .mockResolvedValueOnce({ data: { success: true } })
    const wrapper = mount(OandaConnectionModal)
    expect(wrapper.text()).toContain('tokens also permit trading')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('#oanda-token').setValue('test-token')
    await wrapper.findAll('button').find(button => button.text() === 'Load accounts').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenNthCalledWith(1, '/broker-sync/connections/oanda/accounts', {
      api_token: 'test-token', broker_environment: 'practice'
    })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenNthCalledWith(2, '/broker-sync/connections/oanda', expect.objectContaining({
      api_token: 'test-token', account_id: '101-001-123456-001', broker_environment: 'practice'
    }))
    expect(wrapper.emitted('connected')).toHaveLength(1)
    expect(wrapper.find('#oanda-token').element.value).toBe('')
    wrapper.unmount()
  })

  it('clears account selection when credentials or environment change', async () => {
    api.post.mockResolvedValue({ data: { data: [{ account_id: '101-001-123456-001' }] } })
    const wrapper = mount(OandaConnectionModal)
    await wrapper.find('#oanda-token').setValue('test-token')
    await wrapper.findAll('button').find(button => button.text() === 'Load accounts').trigger('click')
    await flushPromises()
    await wrapper.find('#oanda-environment').setValue('live')
    expect(wrapper.find('#oanda-account').exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps reconnect pinned to its account and environment', async () => {
    api.post.mockResolvedValue({ data: { data: [{ account_id: 'other' }] } })
    const wrapper = mount(OandaConnectionModal, { props: { reconnecting: {
      externalAccountId: '101-001-123456-001', brokerEnvironment: 'live'
    } } })
    expect(wrapper.find('#oanda-environment').attributes('disabled')).toBeDefined()
    await wrapper.find('#oanda-token').setValue('test-token')
    await wrapper.findAll('button').find(button => button.text() === 'Load accounts').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No eligible')
    wrapper.unmount()
  })
})
