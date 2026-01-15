import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true // Enable sending cookies with requests
  // Don't set default Content-Type - let each request set its own
})

api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
  error => {
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

      if (!isAuthPage && !isLoginRequest) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
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

export default api