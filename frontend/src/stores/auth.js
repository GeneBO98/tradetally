import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('token'))
  const loading = ref(false)
  const error = ref(null)
  const registrationConfig = ref(null)

  const isAuthenticated = computed(() => !!token.value)

  async function login(credentials) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/login', credentials)
      
      // Check if email verification is required
      if (response.data.requiresVerification) {
        error.value = response.data.error
        const verificationError = new Error('Email verification required')
        verificationError.requiresVerification = true
        verificationError.email = response.data.email
        throw verificationError
      }

      // Check if admin approval is required
      if (response.data.requiresApproval) {
        error.value = response.data.error
        const approvalError = new Error('Admin approval required')
        approvalError.requiresApproval = true
        approvalError.email = response.data.email
        throw approvalError
      }
      
      const { user: userData, token: authToken } = response.data
      
      user.value = userData
      token.value = authToken
      localStorage.setItem('token', authToken)
      
      router.push({ name: 'dashboard' })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Login failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function register(userData) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/register', userData)
      
      // Check if email verification or admin approval is required (new flow)
      if (response.data.requiresVerification || response.data.requiresApproval) {
        // Don't auto-login, just return the response
        return response.data
      }
      
      // Legacy flow for existing users (if any)
      const { user: newUser, token: authToken } = response.data
      
      if (authToken) {
        user.value = newUser
        token.value = authToken
        localStorage.setItem('token', authToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`
        router.push({ name: 'dashboard' })
      }
      
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Registration failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      user.value = null
      token.value = null
      localStorage.removeItem('token')
      router.push({ name: 'home' })
    }
  }

  async function fetchUser() {
    if (!token.value) return
    
    try {
      const response = await api.get('/auth/me')
      user.value = response.data.user
      return response.data.user
    } catch (err) {
      if (err.response?.status === 401) {
        logout()
      }
      throw err
    }
  }

  async function resendVerification(email) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/resend-verification', { email })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to resend verification email'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function forgotPassword(email) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/forgot-password', { email })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to send password reset email'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(token, password) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/reset-password', { token, password })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to reset password'
      throw err
    } finally {
      loading.value = false
    }
  }

  function checkAuth() {
    if (token.value) {
      // Set the authorization header for subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
      fetchUser()
    }
  }

  async function getRegistrationConfig() {
    try {
      const response = await api.get('/auth/config')
      registrationConfig.value = response.data
      return response.data
    } catch (err) {
      console.error('Failed to fetch registration config:', err)
      // Return default values as fallback
      return {
        registrationMode: 'open',
        emailVerificationEnabled: false,
        allowRegistration: true
      }
    }
  }

  return {
    user,
    token,
    loading,
    error,
    registrationConfig,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    checkAuth,
    resendVerification,
    forgotPassword,
    resetPassword,
    getRegistrationConfig
  }
})