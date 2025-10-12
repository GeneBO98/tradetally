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

api.interceptors.response.use(
  response => response,
  error => {
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

// Add CUSIP resolution utility
api.resolveCusip = async (cusip) => {
  return api.post('/trades/cusip/resolve', { cusip })
}

export default api