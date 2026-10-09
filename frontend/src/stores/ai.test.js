import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

async function loadStore() {
  vi.resetModules()
  const { useAIStore } = await import('./ai')
  return useAIStore()
}

describe('AI store session recovery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
  })

  it('recovers a completed session after a gateway timeout', async () => {
    let request_id
    api.post.mockImplementation(async (_url, body) => {
      request_id = body.request_id
      throw { response: { status: 504 } }
    })
    api.get.mockImplementation(async (url) => {
      if (url === '/ai/sessions') {
        return { data: { sessions: [{ id: 'session-1', request_id }] } }
      }
      if (url === '/ai/sessions/session-1') {
        return {
          data: {
            session: {
              id: 'session-1',
              status: 'active',
              followup_count: 0,
              max_followups: 5,
              trade_summary: { trade_count: 4 },
              messages: [{ role: 'assistant', content: 'Recovered analysis' }]
            }
          }
        }
      }
      if (url === '/ai/credits') {
        return {
          data: {
            credits: { allocated: null, used: 0, remaining: null, unlimited: true },
            costs: { new_session: 10, followup: 2 }
          }
        }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const store = await loadStore()
    const result = await store.createSession({ symbol: 'AAPL' })

    expect(request_id).toBeTruthy()
    expect(result).toMatchObject({ session_id: 'session-1', recovered: true })
    expect(store.currentSession.id).toBe('session-1')
    expect(store.messages).toEqual([{ role: 'assistant', content: 'Recovered analysis' }])
    expect(store.error).toBeNull()
  })

  it('does not hide application errors behind recovery polling', async () => {
    api.post.mockRejectedValue({
      response: { status: 500, data: { message: 'Ollama model is not available' } }
    })

    const store = await loadStore()

    await expect(store.createSession()).rejects.toMatchObject({ response: { status: 500 } })
    expect(api.get).not.toHaveBeenCalled()
    expect(store.error).toBe('Ollama model is not available')
  })

  it('recovers a completed follow-up after a gateway timeout', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        session_id: 'session-1',
        initial_analysis: 'Initial analysis',
        trade_summary: {},
        max_followups: 5
      }
    })

    const store = await loadStore()
    await store.createSession()

    api.post.mockRejectedValueOnce({ response: { status: 524 } })
    api.get.mockImplementation(async (url) => {
      if (url === '/ai/sessions/session-1') {
        return {
          data: {
            session: {
              id: 'session-1',
              status: 'active',
              followup_count: 1,
              max_followups: 5,
              messages: [
                { role: 'assistant', content: 'Initial analysis' },
                { role: 'user', content: 'What should I improve?' },
                { role: 'assistant', content: 'Recovered follow-up' }
              ]
            }
          }
        }
      }
      if (url === '/ai/credits') {
        return {
          data: {
            credits: { allocated: null, used: 0, remaining: null, unlimited: true },
            costs: { new_session: 10, followup: 2 }
          }
        }
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const result = await store.sendFollowup('What should I improve?')

    expect(result).toMatchObject({ response: 'Recovered follow-up', recovered: true })
    expect(store.currentSession.followup_count).toBe(1)
    expect(store.messages.at(-1)).toEqual({ role: 'assistant', content: 'Recovered follow-up' })
    expect(store.error).toBeNull()
  })
})
