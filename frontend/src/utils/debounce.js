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
  let lastCallTime
  let result

  function invokeFunc() {
    const args = lastArgs
    const thisArg = lastThis

    lastArgs = lastThis = undefined
    result = func.apply(thisArg, args)
    return result
  }

  function leadingEdge() {
    // Reset any timeout
    timeout = undefined

    // Execute function if leading=true
    if (leading) {
      return invokeFunc()
    }
  }

  function remainingWait() {
    const timeSinceLastCall = Date.now() - lastCallTime
    const timeWaiting = wait - timeSinceLastCall

    return timeWaiting
  }

  function shouldInvoke() {
    return lastCallTime === undefined || Date.now() - lastCallTime >= wait
  }

  function timerExpired() {
    if (trailing && lastArgs) {
      return invokeFunc()
    }
    timeout = lastArgs = lastThis = undefined
  }

  function debounced(...args) {
    const time = Date.now()
    const isInvoking = shouldInvoke()

    lastArgs = args
    lastThis = this
    lastCallTime = time

    if (isInvoking) {
      if (timeout === undefined) {
        return leadingEdge()
      }
    }

    if (timeout !== undefined) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(timerExpired, wait)

    return result
  }

  debounced.cancel = function() {
    if (timeout !== undefined) {
      clearTimeout(timeout)
    }
    lastArgs = lastThis = timeout = undefined
  }

  debounced.flush = function() {
    return timeout === undefined ? result : timerExpired()
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