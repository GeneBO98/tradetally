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

import {
  DEFAULT_IMPORT_NOTES,
  DEFAULT_IMPORT_STRATEGY,
  IMPORT_NOTES_PREFERENCE_KEY,
  IMPORT_STRATEGY_PREFERENCE_KEY,
  readImportNotesPreference,
  readImportStrategyPreference,
  useImportPreferences
} from './useImportPreferences'

describe('useImportPreferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.put.mockReset()
    localStorage.clear()
  })

  it('defaults to automatic classification with notes off', () => {
    expect(readImportStrategyPreference()).toBe(DEFAULT_IMPORT_STRATEGY)
    expect(readImportNotesPreference()).toBe(DEFAULT_IMPORT_NOTES)

    const { strategy, includeNotes } = useImportPreferences()
    expect(strategy.value).toBe('__auto__')
    expect(includeNotes.value).toBe(false)
  })

  it('hydrates remembered values from localStorage', () => {
    localStorage.setItem(IMPORT_STRATEGY_PREFERENCE_KEY, 'Breakout')
    localStorage.setItem(IMPORT_NOTES_PREFERENCE_KEY, 'true')

    const { strategy, includeNotes } = useImportPreferences()
    expect(strategy.value).toBe('Breakout')
    expect(includeNotes.value).toBe(true)

    localStorage.setItem(IMPORT_NOTES_PREFERENCE_KEY, 'false')
    const reloaded = useImportPreferences()
    expect(reloaded.includeNotes.value).toBe(false)
  })

  it('does not write preferences until persist is called', () => {
    const { strategy, includeNotes } = useImportPreferences()
    strategy.value = '__blank__'
    includeNotes.value = true

    expect(localStorage.getItem(IMPORT_STRATEGY_PREFERENCE_KEY)).toBeNull()
    expect(localStorage.getItem(IMPORT_NOTES_PREFERENCE_KEY)).toBeNull()
  })

  it('persists locally and syncs through the uiPreferences store', async () => {
    const { useUiPreferencesStore } = await import('@/stores/uiPreferences')
    api.get.mockResolvedValueOnce({ data: { settings: { uiPreferences: {} } } })
    api.put.mockResolvedValueOnce({ data: {} })

    const store = useUiPreferencesStore()
    await store.init()

    const { strategy, includeNotes, persist } = useImportPreferences()
    strategy.value = 'Breakout'
    includeNotes.value = true
    persist()

    expect(localStorage.getItem(IMPORT_STRATEGY_PREFERENCE_KEY)).toBe('Breakout')
    expect(localStorage.getItem(IMPORT_NOTES_PREFERENCE_KEY)).toBe('true')

    await store.flush()

    expect(api.put).toHaveBeenCalledWith('/settings', {
      uiPreferences: expect.objectContaining({
        import_strategy_handling: 'Breakout',
        import_notes_and_descriptions: true
      })
    })
  })

  it('falls back to the default strategy when persisting an empty value', () => {
    const { strategy, includeNotes, persist } = useImportPreferences()
    strategy.value = '   '
    includeNotes.value = 'truthy-but-not-true'
    persist()

    expect(localStorage.getItem(IMPORT_STRATEGY_PREFERENCE_KEY)).toBe(DEFAULT_IMPORT_STRATEGY)
    expect(localStorage.getItem(IMPORT_NOTES_PREFERENCE_KEY)).toBe('false')
  })

  it('refreshes from localStorage after remote hydration', () => {
    const { strategy, includeNotes, refresh } = useImportPreferences()
    expect(strategy.value).toBe(DEFAULT_IMPORT_STRATEGY)
    expect(includeNotes.value).toBe(false)

    localStorage.setItem(IMPORT_STRATEGY_PREFERENCE_KEY, '__blank__')
    localStorage.setItem(IMPORT_NOTES_PREFERENCE_KEY, 'true')
    refresh()

    expect(strategy.value).toBe('__blank__')
    expect(includeNotes.value).toBe(true)
  })
})
