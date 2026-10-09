import { ref, watch, toValue, getCurrentScope, onScopeDispose } from 'vue'

/**
 * Visibility-gated polling.
 *
 * Runs `callback` on an interval, but only while the tab is visible. When the
 * tab is hidden the interval is cleared entirely (no background ticks); when
 * the tab becomes visible again the interval restarts and, if a full interval
 * elapsed while hidden, the callback fires immediately (see `runOnRefocus`).
 *
 * Async callbacks never overlap: if the previous invocation is still running
 * when the next tick fires, that tick is skipped.
 *
 * @param {Function} callback - Function (sync or async) to invoke on each tick.
 * @param {number|import('vue').Ref<number>|Function} intervalMs - Poll interval
 *   in milliseconds. May be a ref or getter; it is re-read whenever the timer
 *   is (re)scheduled, so callers can change the cadence between start() calls.
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false] - Run the callback immediately on start().
 * @param {boolean} [options.runOnRefocus=true] - When the tab becomes visible
 *   again, fire the callback immediately if at least one interval elapsed
 *   since the last run.
 * @param {import('vue').Ref<boolean>} [options.enabled] - Optional ref that
 *   starts/stops polling reactively (true -> start, false -> stop).
 * @returns {{ start: Function, stop: Function, isActive: import('vue').Ref<boolean> }}
 *   `isActive` reflects the logical started state - it stays true while the
 *   tab is hidden (polling is merely paused, not stopped).
 */
export function useVisibilityPolling(callback, intervalMs, options = {}) {
  const { immediate = false, runOnRefocus = true, enabled = null } = options

  const isActive = ref(false)
  let timerId = null
  let running = false
  let lastRunAt = 0
  let listenerAttached = false

  function resolveInterval() {
    const value = Number(toValue(intervalMs))
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  function invoke() {
    if (running) return
    lastRunAt = Date.now()
    const result = callback()
    if (result && typeof result.then === 'function') {
      running = true
      result.then(
        () => { running = false },
        (error) => {
          running = false
          console.error('[POLLING] Poll callback failed:', error)
        }
      )
    }
  }

  function clearTimer() {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }

  function scheduleTimer() {
    clearTimer()
    if (!isActive.value || document.hidden) return
    const interval = resolveInterval()
    if (interval <= 0) return
    timerId = setInterval(invoke, interval)
  }

  function handleVisibilityChange() {
    if (!isActive.value) return
    if (document.hidden) {
      clearTimer()
      return
    }
    if (runOnRefocus && Date.now() - lastRunAt >= resolveInterval()) {
      invoke()
    }
    scheduleTimer()
  }

  function start() {
    if (isActive.value) return
    isActive.value = true
    if (!listenerAttached) {
      document.addEventListener('visibilitychange', handleVisibilityChange)
      listenerAttached = true
    }
    // Baseline for the refocus check so a hide/show cycle shortly after
    // start() does not trigger a premature extra invocation.
    lastRunAt = Date.now()
    if (immediate) invoke()
    scheduleTimer()
  }

  function stop() {
    isActive.value = false
    clearTimer()
    if (listenerAttached) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      listenerAttached = false
    }
  }

  if (enabled) {
    watch(enabled, (value) => (value ? start() : stop()), { immediate: true })
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return { start, stop, isActive }
}
