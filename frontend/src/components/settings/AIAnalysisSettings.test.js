import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/services/api', () => ({ default: api }))
import AIAnalysisSettings from './AIAnalysisSettings.vue'

beforeEach(() => {
  api.get.mockResolvedValue({ data: { ai_analysis_instructions: 'Yellow support; purple resistance.' } })
  api.put.mockImplementation(async (_url, body) => ({ data: body }))
})

describe('personal analysis instruction editor', () => {
  it('loads, edits, and saves instructions using the dedicated API', async () => {
    const wrapper = mount(AIAnalysisSettings)
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('Yellow support; purple resistance.')
    await wrapper.get('textarea').setValue('Focus on entry timing.')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.put).toHaveBeenCalledWith('/settings/ai-analysis', { ai_analysis_instructions: 'Focus on entry timing.' })
    expect(wrapper.get('textarea').exists()).toBe(true)
    wrapper.unmount()
  })
  it('clears the persisted preference', async () => {
    const wrapper = mount(AIAnalysisSettings)
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Clear instructions').trigger('click')
    await flushPromises()
    expect(api.put).toHaveBeenCalledWith('/settings/ai-analysis', { ai_analysis_instructions: '' })
    expect(wrapper.get('textarea').element.value).toBe('')
    wrapper.unmount()
  })
  it('restores edited text if clearing fails', async () => {
    api.put.mockRejectedValueOnce(new Error('Unavailable'))
    const wrapper = mount(AIAnalysisSettings)
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Clear instructions').trigger('click')
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toContain('Yellow support')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    wrapper.unmount()
  })
  it('prevents accidental overwrite when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('Unavailable'))
    const wrapper = mount(AIAnalysisSettings)
    await flushPromises()
    expect(wrapper.get('textarea').element.disabled).toBe(true)
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true)
    wrapper.unmount()
  })
})
