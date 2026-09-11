import { ref } from 'vue'
import { useUiPreferencesStore } from '@/stores/uiPreferences'

export const IMPORT_STRATEGY_PREFERENCE_KEY = 'import_strategy_handling'
export const IMPORT_NOTES_PREFERENCE_KEY = 'import_notes_and_descriptions'

export const DEFAULT_IMPORT_STRATEGY = '__auto__'
export const DEFAULT_IMPORT_NOTES = false

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch (_) {
    return null
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (_) {}
}

export function readImportStrategyPreference() {
  const raw = safeGet(IMPORT_STRATEGY_PREFERENCE_KEY)
  return raw ? raw : DEFAULT_IMPORT_STRATEGY
}

export function readImportNotesPreference() {
  const raw = safeGet(IMPORT_NOTES_PREFERENCE_KEY)
  if (raw === null) return DEFAULT_IMPORT_NOTES
  return raw === 'true'
}

export function useImportPreferences() {
  const strategy = ref(readImportStrategyPreference())
  const includeNotes = ref(readImportNotesPreference())

  function refresh() {
    strategy.value = readImportStrategyPreference()
    includeNotes.value = readImportNotesPreference()
  }

  function persist() {
    const strategyValue = typeof strategy.value === 'string' && strategy.value.trim()
      ? strategy.value.trim()
      : DEFAULT_IMPORT_STRATEGY
    strategy.value = strategyValue
    safeSet(IMPORT_STRATEGY_PREFERENCE_KEY, strategyValue)

    const notesValue = includeNotes.value === true
    includeNotes.value = notesValue
    safeSet(IMPORT_NOTES_PREFERENCE_KEY, String(notesValue))

    try {
      const store = useUiPreferencesStore()
      store.notifyChanged(IMPORT_STRATEGY_PREFERENCE_KEY, strategyValue)
      store.notifyChanged(IMPORT_NOTES_PREFERENCE_KEY, notesValue)
    } catch (_) {}
  }

  return { strategy, includeNotes, refresh, persist }
}
