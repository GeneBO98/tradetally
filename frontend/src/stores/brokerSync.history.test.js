import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))
import api from '@/services/api'
import { useBrokerSyncStore } from './brokerSync'
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks() })
describe('broker sync history pages', () => {
  it('loads grouped history and appends older rows without duplicates', async () => {
    api.get.mockResolvedValueOnce({ data: { data: [{ id: 'daily' }, { id: 'activity' }], has_more: true } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'activity' }, { id: 'older' }], has_more: false } })
    const store = useBrokerSyncStore()
    await store.fetchSyncLogs(null, 20, { group_by: 'day' })
    expect(api.get).toHaveBeenCalledWith('/broker-sync/logs', { params: { limit: 20, group_by: 'day', offset: 0 } })
    expect(store.history_has_more).toBe(true)
    await store.fetchSyncLogs(null, 20, { group_by: 'day', offset: 2, append: true })
    expect(store.syncLogs.map(log => log.id)).toEqual(['daily', 'activity', 'older'])
    expect(store.history_has_more).toBe(false)
    store.reset()
    expect(store.syncLogs).toEqual([])
  })
  it('leaves the raw endpoint interface unchanged', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 'raw' }] } })
    const store = useBrokerSyncStore()
    await store.fetchSyncLogs('connection')
    expect(api.get).toHaveBeenCalledWith('/broker-sync/connections/connection/logs', { params: { limit: 20 } })
  })
})
