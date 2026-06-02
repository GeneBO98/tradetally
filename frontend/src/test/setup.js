import { afterEach, vi } from 'vitest'

function createStorage() {
  const store = new Map()

  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(String(key))
    },
    clear() {
      store.clear()
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    }
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createStorage(),
  configurable: true
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: createStorage(),
  configurable: true
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
})
