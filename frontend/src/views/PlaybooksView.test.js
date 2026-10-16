import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import PlaybooksView from './PlaybooksView.vue'

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn().mockResolvedValue({}) }))
vi.mock('@/services/api', () => ({ default: { get, put } }))
vi.mock('@/composables/useGlobalAccountFilter', () => ({ useGlobalAccountFilter: () => ({ selectedAccount: ref(null) }) }))
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showConfirmation: vi.fn() })
}))

describe('playbook checklist editing', () => {
  it('sends stable IDs for existing items and leaves new item IDs to the server', async () => {
    const playbook = { id: 'plan-1', name: 'Plan', reviewMode: 'checklist',
      checklistItems: [{ id: 'item-1', label: 'Original', isRequired: false }] };
    get.mockImplementation(async url => ({ data: url === '/playbooks'
      ? { playbooks: [playbook] } : { overview: {}, playbooks: [], recentTrades: [] } }))
    const wrapper = shallowMount(PlaybooksView)
    await flushPromises()
    wrapper.vm.selectPlaybook(playbook)
    wrapper.vm.form.checklistItems[0].label = 'Renamed'
    wrapper.vm.form.checklistItems[0].isRequired = true
    wrapper.vm.addChecklistItem()
    wrapper.vm.form.checklistItems[1].label = 'New item'
    await wrapper.vm.savePlaybook()
    expect(put).toHaveBeenCalledWith('/playbooks/plan-1', expect.objectContaining({
      checklistItems: [
        { id: 'item-1', label: 'Renamed', itemOrder: 0, weight: 1, isRequired: true },
        { label: 'New item', itemOrder: 1, weight: 1, isRequired: false }
      ]
    }))
    wrapper.unmount()
  })
})
