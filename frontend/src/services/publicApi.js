import axios from 'axios'

/**
 * API client for public, unauthenticated endpoints (e.g. /api/tools/*).
 * Deliberately omits the auth-token request interceptor and the 401 →
 * /login response interceptor so that a stale localStorage token in a
 * visitor's browser cannot force them off a public marketing page.
 */
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
})

publicApi.interceptors.request.use(
  config => {
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }
    return config
  },
  error => Promise.reject(error)
)

export default publicApi
