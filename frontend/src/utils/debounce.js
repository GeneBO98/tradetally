import { ref, watchEffect } from 'vue'

/**
 * Creates a debounced version of a function that delays invoking until after
 * the specified wait milliseconds have elapsed since the last time it was invoked.
 *
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @param {Object} options - Options object
 * @param {boolean} options.leading - Trigger on leading edge (default: false)
 * @param {boolean} options.trailing - Trigger on trailing edge (default: true)
 * @returns {Function} The debounced function
 */
export function debounce(func, wait, options = {}) {
  const { leading = false, trailing = true } = options
  let timeout
  let lastArgs
  let lastThis
  let result

  function invokeFunc() {
    const args = lastArgs
    const thisArg = lastThis

    lastArgs = lastThis = undefined
    result = func.apply(thisArg, args)
    return result
  }

  // Fires the trailing edge. invokeFunc clears lastArgs, so a leading-edge
  // call that saw no further invocations during the wait won't double-fire.
  function timerExpired() {
    timeout = undefined
    if (trailing && lastArgs) {
      invokeFunc()
    }
  }

  function debounced(...args) {
    lastArgs = args
    lastThis = this

    const callNow = leading && timeout === undefined

    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(timerExpired, wait)

    if (callNow) {
      return invokeFunc()
    }
    return result
  }

  debounced.cancel = function() {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
    lastArgs = lastThis = timeout = undefined
  }

  debounced.flush = function() {
    if (timeout === undefined) {
      return result
    }
    clearTimeout(timeout)
    timerExpired()
    return result
  }

  return debounced
}

/**
 * Vue 3 composable for creating debounced refs
 */
export function useDebouncedRef(initialValue, delay = 300) {
  const rawValue = ref(initialValue)
  const debouncedValue = ref(initialValue)

  const updateDebouncedValue = debounce((newVal) => {
    debouncedValue.value = newVal
  }, delay)

  watchEffect(() => {
    updateDebouncedValue(rawValue.value)
  })

  return { rawValue, debouncedValue }
}