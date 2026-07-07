import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useVisibilityPolling } from './useVisibilityPolling'

function setDocumentHidden(hidden) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useVisibilityPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete document.hidden
  })

  it('polls on the interval after start and stops on stop', () => {
    const callback = vi.fn()
    const { start, stop, isActive } = useVisibilityPolling(callback, 1000)

    expect(isActive.value).toBe(false)
    start()
    expect(isActive.value).toBe(true)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(3)

    stop()
    expect(isActive.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('runs immediately on start when immediate is true', () => {
    const callback = vi.fn()
    const { start } = useVisibilityPolling(callback, 1000, { immediate: true })

    start()
    expect(callback).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('pauses while the tab is hidden and resumes on visible', () => {
    const callback = vi.fn()
    const { start, isActive } = useVisibilityPolling(callback, 1000, { runOnRefocus: false })

    start()
    vi.advanceTimersByTime(2000)
    expect(callback).toHaveBeenCalledTimes(2)

    setDocumentHidden(true)
    expect(isActive.value).toBe(true) // paused, not stopped
    vi.advanceTimersByTime(10000)
    expect(callback).toHaveBeenCalledTimes(2)

    setDocumentHidden(false)
    // runOnRefocus disabled: no immediate call, but ticks resume
    expect(callback).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('fires immediately on refocus when the interval elapsed while hidden', () => {
    const callback = vi.fn()
    const { start } = useVisibilityPolling(callback, 1000)

    start()
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    setDocumentHidden(true)
    vi.advanceTimersByTime(5000) // more than one interval elapses while hidden
    setDocumentHidden(false)
    expect(callback).toHaveBeenCalledTimes(2) // fired on refocus

    // and the regular cadence continues afterwards
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('does not fire on refocus when hidden for less than one interval', () => {
    const callback = vi.fn()
    const { start } = useVisibilityPolling(callback, 10000)

    start()
    setDocumentHidden(true)
    vi.advanceTimersByTime(2000)
    setDocumentHidden(false)
    expect(callback).not.toHaveBeenCalled()
  })

  it('skips ticks while an async callback is still running', async () => {
    let resolveFirst
    const callback = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFirst = resolve })
    )
    const { start } = useVisibilityPolling(callback, 1000)

    start()
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    // Two more ticks fire while the first invocation is pending - both skipped.
    vi.advanceTimersByTime(2000)
    expect(callback).toHaveBeenCalledTimes(1)

    resolveFirst()
    await Promise.resolve() // let the finally block release the guard
    await Promise.resolve()

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('supports an enabled ref to start and stop polling', async () => {
    const callback = vi.fn()
    const enabled = ref(false)
    const scope = effectScope()
    let isActive

    scope.run(() => {
      ;({ isActive } = useVisibilityPolling(callback, 1000, { enabled }))
    })

    expect(isActive.value).toBe(false)

    enabled.value = true
    await Promise.resolve() // flush watcher
    await vi.advanceTimersByTimeAsync(0)
    expect(isActive.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    enabled.value = false
    await vi.advanceTimersByTimeAsync(0)
    expect(isActive.value).toBe(false)
    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('stops polling when the owning scope is disposed', () => {
    const callback = vi.fn()
    const scope = effectScope()
    let poller

    scope.run(() => {
      poller = useVisibilityPolling(callback, 1000)
      poller.start()
    })

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    scope.stop()
    expect(poller.isActive.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('keeps multiple instances independent', () => {
    const first = vi.fn()
    const second = vi.fn()
    const pollerA = useVisibilityPolling(first, 1000)
    const pollerB = useVisibilityPolling(second, 2000)

    pollerA.start()
    pollerB.start()
    vi.advanceTimersByTime(2000)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(1)

    pollerA.stop()
    vi.advanceTimersByTime(2000)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('re-reads a getter interval when the timer is rescheduled', () => {
    const callback = vi.fn()
    let interval = 1000
    const { start, stop } = useVisibilityPolling(callback, () => interval)

    start()
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    stop()
    interval = 5000
    start()
    vi.advanceTimersByTime(4999)
    expect(callback).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
