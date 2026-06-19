import { reactive, watch } from 'vue'

/**
 * Reactive form state that persists to localStorage under a stable key.
 * Reads on first use, writes on every change.
 */
export function useToolFormState(storageKey, defaults) {
  let initial = { ...defaults }
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        initial = { ...defaults, ...parsed }
      }
    }
  } catch (e) {
    // ignore — fall back to defaults
  }

  const state = reactive(initial)

  watch(state, (val) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(val))
    } catch (e) {
      // ignore quota or serialization errors
    }
  }, { deep: true })

  function reset() {
    Object.assign(state, defaults)
  }

  return { state, reset }
}
