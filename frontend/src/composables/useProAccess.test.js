import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { hasProAccess, useProAccess } from '@/composables/useProAccess'
import { useAuthStore } from '@/stores/auth'

describe('hasProAccess', () => {
  it('is false while the user is not loaded', () => {
    expect(hasProAccess(null)).toBe(false)
    expect(hasProAccess(undefined)).toBe(false)
  })

  it('is true when billing is disabled (self-hosted)', () => {
    expect(hasProAccess({ tier: 'free', billingEnabled: false })).toBe(true)
  })

  it('is true for pro tier', () => {
    expect(hasProAccess({ tier: 'pro', billingEnabled: true })).toBe(true)
  })

  it('is true for admins and owners', () => {
    expect(hasProAccess({ tier: 'free', billingEnabled: true, role: 'admin' })).toBe(true)
    expect(hasProAccess({ tier: 'free', billingEnabled: true, role: 'owner' })).toBe(true)
  })

  it('is false for free users on a billing-enabled instance', () => {
    expect(hasProAccess({ tier: 'free', billingEnabled: true, role: 'user' })).toBe(false)
    expect(hasProAccess({ role: 'user' })).toBe(false)
  })
})

describe('useProAccess', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows neither Pro content nor locks until the user loads', () => {
    const { isProUser, isTierResolved, showProLock } = useProAccess()
    expect(isTierResolved.value).toBe(false)
    expect(isProUser.value).toBe(false)
    expect(showProLock.value).toBe(false)
  })

  it('shows locks only once a free user is loaded', () => {
    const authStore = useAuthStore()
    const { isProUser, showProLock } = useProAccess()
    authStore.user = { tier: 'free', billingEnabled: true }
    expect(isProUser.value).toBe(false)
    expect(showProLock.value).toBe(true)
  })

  it('unlocks for a loaded Pro user', () => {
    const authStore = useAuthStore()
    const { isProUser, showProLock } = useProAccess()
    authStore.user = { tier: 'pro', billingEnabled: true }
    expect(isProUser.value).toBe(true)
    expect(showProLock.value).toBe(false)
  })
})
