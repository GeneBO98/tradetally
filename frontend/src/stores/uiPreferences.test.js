import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    put: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

describe('ui preferences store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.put.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('deduplicates concurrent settings hydration', async () => {
    const { useUiPreferencesStore } = await import('./uiPreferences')
    api.get.mockResolvedValueOnce({
      data: {
        settings: {
          uiPreferences: {
            passkey_prompt_dismissed: true
          }
        }
      }
    })

    const store = useUiPreferencesStore()
    await Promise.all([store.init(), store.init()])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('passkey_prompt_dismissed')).toBe('true')
    expect(store.initialized).toBe(true)
  })

  it('flushes the passkey dismissal to remote preferences', async () => {
    const { useUiPreferencesStore } = await import('./uiPreferences')
    api.get.mockResolvedValueOnce({
      data: {
        settings: {
          uiPreferences: {}
        }
      }
    })
    api.put.mockResolvedValueOnce({ data: {} })

    const store = useUiPreferencesStore()
    await store.init()

    localStorage.setItem('passkey_prompt_dismissed', 'true')
    store.notifyChanged('passkey_prompt_dismissed', true)
    await store.flush()

    expect(api.put).toHaveBeenCalledWith('/settings', {
      uiPreferences: {
        passkey_prompt_dismissed: true
      }
    })
  })
})
