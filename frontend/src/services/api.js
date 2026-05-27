import axios from 'axios'

let sessionAuthToken = null

function getCookie(name) {
  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))

  return cookieEntry ? decodeURIComponent(cookieEntry.split('=').slice(1).join('=')) : null
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true // Enable sending cookies with requests
  // Don't set default Content-Type - let each request set its own
})

api.interceptors.request.use(
  config => {
    const method = (config.method || 'get').toUpperCase()
    const csrfToken = getCookie('csrf_token')

    if (sessionAuthToken) {
      config.headers.Authorization = `Bearer ${sessionAuthToken}`
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
    
    // Only set JSON content type if it's not FormData
    if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }
    
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Track rate limit state to prevent cascading failures
let rateLimitState = {
  isLimited: false,
  retryAfter: 0,
  lastLimitTime: 0
}

api.interceptors.response.use(
  response => {
    // Clear rate limit state on successful response
    rateLimitState.isLimited = false
    return response
  },
  async error => {
    // Handle 429 Too Many Requests
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after']) || 60
      rateLimitState = {
        isLimited: true,
        retryAfter: retryAfter,
        lastLimitTime: Date.now()
      }

      // Log the rate limit for debugging
      console.warn(`[RATE LIMIT] Too many requests. Retry after ${retryAfter}s`)

      // Dispatch a custom event that components can listen to
      window.dispatchEvent(new CustomEvent('rate-limit-exceeded', {
        detail: { retryAfter, message: error.response?.data?.message || 'Too many requests, please try again later.' }
      }))

      // Return a more descriptive error
      error.isRateLimited = true
      error.retryAfter = retryAfter
    }

    if (error.response?.status === 401) {
      // Don't redirect to login if we're already on login/auth pages or if this is a login attempt
      const currentPath = window.location.pathname
      const isAuthPage = currentPath.includes('/login') || currentPath.includes('/register') || currentPath.includes('/forgot-password') || currentPath.includes('/reset-password')
      const isLoginRequest = error.config?.url?.includes('/auth/login')

      if (!isAuthPage && !isLoginRequest && !error.config?.skipAuthRedirect) {
        // Clear the JS-readable csrf_token cookie so the synchronous "has session"
        // hint in the auth store doesn't bounce us back to /dashboard in a loop.
        document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
        document.cookie = `csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`
        sessionAuthToken = null
        window.location.href = '/login'
      }
    }

    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'INVALID_CSRF_TOKEN' &&
      !error.config?._csrfRetry
    ) {
      document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
      document.cookie = `csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`

      const retryConfig = {
        ...error.config,
        _csrfRetry: true,
        headers: {
          ...(error.config.headers || {})
        }
      }
      delete retryConfig.headers['X-CSRF-Token']
      delete retryConfig.headers['x-csrf-token']

      await api.get('/auth/me', {
        skipAuthRedirect: true,
        _csrfRetry: true
      })

      return api.request(retryConfig)
    }
    return Promise.reject(error)
  }
)

// Export rate limit state checker for components
export const isRateLimited = () => {
  if (!rateLimitState.isLimited) return false
  // Check if the rate limit window has passed
  const elapsed = (Date.now() - rateLimitState.lastLimitTime) / 1000
  if (elapsed > rateLimitState.retryAfter) {
    rateLimitState.isLimited = false
    return false
  }
  return true
}

// Add CUSIP resolution utility
api.resolveCusip = async (cusip) => {
  return api.post('/trades/cusip/resolve', { cusip })
}

export function setSessionAuthToken(token) {
  sessionAuthToken = token || null
}

export default api
