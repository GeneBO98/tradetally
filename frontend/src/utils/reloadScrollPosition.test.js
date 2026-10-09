import { describe, expect, it } from 'vitest'
import {
  consumeReloadScrollPosition,
  saveReloadScrollPosition,
} from './reloadScrollPosition'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

describe('reload scroll position', () => {
  it('saves and consumes a recent scroll position once', () => {
    const storage = createStorage()
    saveReloadScrollPosition(storage, 'trade:1', 1425, 10_000)

    expect(consumeReloadScrollPosition(storage, 'trade:1', 10_500)).toBe(1425)
    expect(consumeReloadScrollPosition(storage, 'trade:1', 10_500)).toBeNull()
  })

  it('discards stale and malformed values', () => {
    const storage = createStorage()
    saveReloadScrollPosition(storage, 'trade:1', 900, 10_000)
    expect(consumeReloadScrollPosition(storage, 'trade:1', 80_001)).toBeNull()

    storage.setItem('trade:1', 'not-json')
    expect(consumeReloadScrollPosition(storage, 'trade:1', 10_500)).toBeNull()
  })
})
