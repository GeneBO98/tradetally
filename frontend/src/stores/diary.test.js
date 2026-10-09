import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({ default: api }))

import { useDiaryStore } from './diary'

describe('diary store AI analysis recovery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
  })

  it('polls for the saved result after a gateway timeout', async () => {
    api.get
      .mockRejectedValueOnce({
        response: { status: 524 },
        message: 'Gateway timeout'
      })
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          analysis: 'Recovered journal analysis',
          entriesAnalyzed: 3
        }
      })

    const store = useDiaryStore()
    const result = await store.analyzeEntries('2026-07-01', '2026-07-31')

    expect(result).toEqual(expect.objectContaining({
      status: 'completed',
      analysis: 'Recovered journal analysis'
    }))
    expect(api.get).toHaveBeenCalledTimes(2)

    const requestId = api.get.mock.calls[0][1].params.request_id
    expect(requestId).toBeTruthy()
    expect(api.get.mock.calls[1][0]).toBe(`/diary/analyze/${encodeURIComponent(requestId)}`)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('does not poll after an application error', async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'AI provider not configured' } },
      message: 'Bad request'
    })

    const store = useDiaryStore()

    await expect(store.analyzeEntries('2026-07-01', '2026-07-31')).rejects.toEqual(
      expect.objectContaining({ response: expect.objectContaining({ status: 400 }) })
    )
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(store.error).toBe('AI provider not configured')
  })

  it('stops polling when the saved analysis failed', async () => {
    api.get
      .mockRejectedValueOnce({
        response: { status: 524 },
        message: 'Gateway timeout'
      })
      .mockResolvedValueOnce({
        data: {
          status: 'failed',
          error: 'Failed to analyze diary entries'
        }
      })

    const store = useDiaryStore()

    await expect(store.analyzeEntries('2026-07-01', '2026-07-31')).rejects.toThrow(
      'Failed to analyze diary entries'
    )
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(store.error).toBe('Failed to analyze diary entries')
  })
})

describe('diary store multiple same-day entries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
  })

  it('keeps all entries returned for today', async () => {
    const entries = [
      { id: 'entry-2', entry_date: '2026-08-03', entry_type: 'diary' },
      { id: 'entry-1', entry_date: '2026-08-03', entry_type: 'diary' }
    ]
    api.get.mockResolvedValueOnce({ data: { entries, entry: entries[0] } })

    const store = useDiaryStore()
    await store.fetchTodaysEntry()

    expect(store.todaysEntries).toEqual(entries)
    expect(store.todaysEntry.id).toBe('entry-2')
    expect(store.hasTodaysEntry).toBe(true)
  })
})
