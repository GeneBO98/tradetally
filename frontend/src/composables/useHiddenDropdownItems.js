import { ref } from 'vue'
import { useUiPreferencesStore } from '@/stores/uiPreferences'

// Per-user lists of strategy/setup names the user has hidden from dropdowns.
// These live in user_settings.ui_preferences (synced across devices) via the
// uiPreferences store, mirrored in localStorage for synchronous reads.
//
// Tags are NOT handled here: they are a real entity with a `hidden` column and
// are managed through the tags API / TagManagement component instead.

const STRATEGY_KEY = 'hiddenStrategies'
const SETUP_KEY = 'hiddenSetups'

function readList(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Module-level singletons so every component shares the same reactive state.
const hiddenStrategies = ref(readList(STRATEGY_KEY))
const hiddenSetups = ref(readList(SETUP_KEY))

export function useHiddenDropdownItems() {
  const store = useUiPreferencesStore()

  function persist(key, listRef, list) {
    listRef.value = list
    localStorage.setItem(key, JSON.stringify(list))
    store.notifyChanged(key, list)
  }

  // Re-read from localStorage (e.g. after the store hydrates from the server
  // on login). Call in onMounted of consumers to stay in sync across devices.
  function refresh() {
    hiddenStrategies.value = readList(STRATEGY_KEY)
    hiddenSetups.value = readList(SETUP_KEY)
  }

  function isStrategyHidden(name) {
    return hiddenStrategies.value.includes(name)
  }

  function isSetupHidden(name) {
    return hiddenSetups.value.includes(name)
  }

  function toggleStrategy(name) {
    const next = hiddenStrategies.value.includes(name)
      ? hiddenStrategies.value.filter(s => s !== name)
      : [...hiddenStrategies.value, name]
    persist(STRATEGY_KEY, hiddenStrategies, next)
  }

  function toggleSetup(name) {
    const next = hiddenSetups.value.includes(name)
      ? hiddenSetups.value.filter(s => s !== name)
      : [...hiddenSetups.value, name]
    persist(SETUP_KEY, hiddenSetups, next)
  }

  return {
    hiddenStrategies,
    hiddenSetups,
    refresh,
    isStrategyHidden,
    isSetupHidden,
    toggleStrategy,
    toggleSetup
  }
}
