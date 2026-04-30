import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api, router } = vi.hoisted(() => ({
  api: {
    defaults: {
      headers: {
        common: {}
      }
    },
    get: vi.fn(),
    post: vi.fn()
  },
  router: {
    push: vi.fn()
  }
}))

vi.mock('@/services/api', () => ({
  default: api
}))

vi.mock('@/router', () => ({
  default: router
}))

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.defaults.headers.common = {}
    api.get.mockReset()
    api.post.mockReset()
    router.push.mockReset()
    localStorage.clear()
  })

  it('logs in, stores token, fetches the user, and navigates to the return URL', async () => {
    const { useAuthStore } = await import('./auth')
    api.post.mockResolvedValueOnce({
      data: {
        token: 'token-123',
        is_first_login: true
      }
    })
    api.get.mockResolvedValueOnce({
      data: {
        user: {
          id: 42,
          email: 'trader@example.com',
          onboarding_completed: false,
          onboarding_step: 2
        },
        settings: {
          public_profile: true,
          email_notifications: false
        }
      }
    })

    const store = useAuthStore()
    const result = await store.login({ email: 'trader@example.com', password: 'secret' }, '%2Fdashboard%3Ftab%3Dstats')

    expect(result.token).toBe('token-123')
    expect(store.token).toBe('token-123')
    expect(store.user.email).toBe('trader@example.com')
    expect(store.user.settings.publicProfile).toBe(true)
    expect(store.pendingOnboarding).toBe(true)
    expect(localStorage.getItem('token')).toBe('token-123')
    expect(api.defaults.headers.common.Authorization).toBe('Bearer token-123')
    expect(router.push).toHaveBeenCalledWith('/dashboard?tab=stats')
  })

  it('throws the 2FA flow error without setting a generic login error', async () => {
    const { useAuthStore } = await import('./auth')
    api.post.mockResolvedValueOnce({
      data: {
        requires2FA: true,
        tempToken: 'temp-token',
        message: 'Enter your code'
      }
    })

    const store = useAuthStore()
    await expect(store.login({ email: 'trader@example.com', password: 'secret' })).rejects.toMatchObject({
      requires2FA: true,
      tempToken: 'temp-token'
    })

    expect(store.error).toBe(null)
    expect(localStorage.getItem('token')).toBe(null)
  })

  it('throws the approval flow error and exposes the server message', async () => {
    const { useAuthStore } = await import('./auth')
    api.post.mockResolvedValueOnce({
      data: {
        requiresApproval: true,
        email: 'pending@example.com',
        error: 'Admin approval required'
      }
    })

    const store = useAuthStore()
    await expect(store.login({ email: 'pending@example.com', password: 'secret' })).rejects.toMatchObject({
      requiresApproval: true,
      email: 'pending@example.com'
    })

    expect(store.error).toBe('Admin approval required')
    expect(localStorage.getItem('token')).toBe(null)
  })
})
