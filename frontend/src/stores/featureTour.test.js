import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}))
vi.mock('@/services/api', () => ({ default: api }))

const authState = vi.hoisted(() => ({ value: null }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState.value }))

vi.mock('@/constants/featureTours', async (importOriginal) => {
  const actual = await importOriginal()
  const tours = [
    { id: 'tour-b', releasedAt: '2026-02-01', title: 'B', summary: 's', steps: [{ id: 'x', route: '/x', title: 't', body: 'b' }] },
    { id: 'tour-a', releasedAt: '2026-01-01', title: 'A', summary: 's', steps: [{ id: 'y', route: '/y', title: 't', body: 'b' }] },
    { id: 'tour-future', releasedAt: '2999-01-01', title: 'F', summary: 's', steps: [{ id: 'z', route: '/z', title: 't', body: 'b' }] }
  ]
  return {
    ...actual,
    FEATURE_TOURS: tours,
    findFeatureTour: id => tours.find(t => t.id === id) || null
  }
})

import { useFeatureTourStore, isOnboardingTourInProgress } from './featureTour'

function setUser(overrides = {}) {
  authState.value = {
    user: { id: 'u1', email: 'trader@example.com', feature_tours: {}, ...overrides },
    onboardingStep: 0,
    proOnboardingStep: 0
  }
}

describe('feature tour store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    setUser()
  })

  it('offers the oldest live unseen tour', () => {
    const store = useFeatureTourStore()
    expect(store.pendingTour.id).toBe('tour-a')
  })

  it('shows nothing while tour state is unknown', () => {
    setUser({ feature_tours: null })
    expect(useFeatureTourStore().pendingTour).toBeNull()
    setUser({ feature_tours: undefined })
    setActivePinia(createPinia())
    expect(useFeatureTourStore().pendingTour).toBeNull()
  })

  it('skips tours the user completed or dismissed', () => {
    setUser({ feature_tours: { 'tour-a': { status: 'completed' } } })
    expect(useFeatureTourStore().pendingTour.id).toBe('tour-b')
    setActivePinia(createPinia())
    setUser({ feature_tours: { 'tour-a': { status: 'completed' }, 'tour-b': { status: 'dismissed' } } })
    expect(useFeatureTourStore().pendingTour).toBeNull()
  })

  it('never prompts the demo account', () => {
    setUser({ email: 'Demo@Example.com' })
    expect(useFeatureTourStore().pendingTour).toBeNull()
  })

  it('waits while the onboarding tour is in progress, ignoring the unused Pro step', () => {
    expect(isOnboardingTourInProgress(0)).toBe(false)
    expect(isOnboardingTourInProgress(2)).toBe(false)
    expect(isOnboardingTourInProgress(3)).toBe(true)
    expect(isOnboardingTourInProgress(6)).toBe(false)

    // Billing sets the Pro step when someone subscribes, but nothing in the
    // self-hosted app advances it; it must not block tours.
    authState.value.proOnboardingStep = 1
    expect(useFeatureTourStore().pendingTour.id).toBe('tour-a')

    setActivePinia(createPinia())
    authState.value.onboardingStep = 4
    expect(useFeatureTourStore().pendingTour).toBeNull()
  })

  it('hides a dismissed tour immediately and keeps it hidden when saving fails', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'))
    const store = useFeatureTourStore()
    await store.finish('tour-a', 'dismissed', null)
    expect(api.post).toHaveBeenCalledWith('/users/feature-tours/tour-a', { status: 'dismissed', lastStep: null })
    expect(store.statusOf('tour-a')).toBe('dismissed')
    expect(store.pendingTour.id).toBe('tour-b')
  })

  it('resumes an in-progress tour from session storage and clears it when finished', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    const store = useFeatureTourStore()
    store.start('tour-a')
    store.goToStep(1)
    expect(JSON.parse(sessionStorage.getItem('tt-feature-tour-active'))).toEqual({ tourId: 'tour-a', stepIndex: 1 })
    expect(store.pendingTour).toBeNull()

    setActivePinia(createPinia())
    const resumed = useFeatureTourStore()
    expect(resumed.active).toEqual({ tourId: 'tour-a', stepIndex: 1 })
    await resumed.finish('tour-a', 'completed', 1)
    expect(sessionStorage.getItem('tt-feature-tour-active')).toBeNull()
    expect(authState.value.user.feature_tours['tour-a'].status).toBe('completed')
  })

  it('replay clears the record and starts the tour', async () => {
    api.delete.mockResolvedValue({ data: { success: true } })
    setUser({ feature_tours: { 'tour-a': { status: 'completed' } } })
    const store = useFeatureTourStore()
    await store.replay('tour-a')
    expect(api.delete).toHaveBeenCalledWith('/users/feature-tours/tour-a')
    expect(store.statusOf('tour-a')).toBeNull()
    expect(store.active).toEqual({ tourId: 'tour-a', stepIndex: 0 })
  })
})
