import axios from 'axios'
import { onUnmounted } from 'vue'

/**
 * Request Manager for handling API requests with cancellation support
 * Prevents race conditions and improves performance by cancelling
 * superseded requests
 */
class RequestManager {
  constructor() {
    this.pendingRequests = new Map()
  }

  /**
   * Make a cancellable request
   * @param {string} key - Unique key for this request type
   * @param {Function} requestFn - Function that returns an axios promise
   * @returns {Promise} - The request promise
   */
  async request(key, requestFn) {
    // Cancel any existing request with the same key
    this.cancel(key)

    // Create new cancel token
    const source = axios.CancelToken.source()
    this.pendingRequests.set(key, source)

    try {
      // Execute the request with cancel token
      const result = await requestFn(source.token)

      // Remove from pending requests on success
      this.pendingRequests.delete(key)

      return result
    } catch (error) {
      // Remove from pending requests
      this.pendingRequests.delete(key)

      // Don't throw error if it was a cancellation
      if (axios.isCancel(error)) {
        console.log(`[RequestManager] Request cancelled: ${key}`)
        return null
      }

      // Re-throw actual errors
      throw error
    }
  }

  /**
   * Cancel a pending request
   * @param {string} key - The request key to cancel
   */
  cancel(key) {
    const source = this.pendingRequests.get(key)
    if (source) {
      source.cancel(`Request ${key} cancelled due to new request`)
      this.pendingRequests.delete(key)
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAll() {
    for (const [key, source] of this.pendingRequests) {
      source.cancel(`Request ${key} cancelled`)
    }
    this.pendingRequests.clear()
  }

  /**
   * Check if a request is pending
   * @param {string} key - The request key
   * @returns {boolean} - True if request is pending
   */
  isPending(key) {
    return this.pendingRequests.has(key)
  }
}

// Create singleton instance
const requestManager = new RequestManager()

// Export for use in Vue composables
export default requestManager

/**
 * Vue 3 Composable for request management
 */
export function useRequestManager() {
  const manager = requestManager

  // Cancel all requests on component unmount
  onUnmounted(() => {
    // You might want to be selective about what to cancel
    // For now, we'll let requests complete even after unmount
    // to avoid interrupting important operations
  })

  return {
    request: manager.request.bind(manager),
    cancel: manager.cancel.bind(manager),
    cancelAll: manager.cancelAll.bind(manager),
    isPending: manager.isPending.bind(manager)
  }
}