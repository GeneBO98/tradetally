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
  const pendingOnboarding = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const showOnboardingModal = computed(() => {
    if (!user.value) return false
    return pendingOnboarding.value || !user.value.onboarding_completed
  })

  async function login(credentials, returnUrl = null) {
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

      // Check if 2FA is required
      if (response.data.requires2FA) {
        const twoFactorError = new Error('Two-factor authentication required')
        twoFactorError.requires2FA = true
        twoFactorError.tempToken = response.data.tempToken
        twoFactorError.message = response.data.message
        throw twoFactorError
      }

      const { user: userData, token: authToken } = response.data

      token.value = authToken
      localStorage.setItem('token', authToken)

      // Set authorization header for subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`

      if (response.data.is_first_login === true) {
        pendingOnboarding.value = true
      }

      // Fetch complete user data with settings
      await fetchUser()

      // If there's a return URL (from OAuth flow), redirect there instead of dashboard
      if (returnUrl) {
        window.location.href = decodeURIComponent(returnUrl)
      } else {
        router.push({ name: 'dashboard' })
      }

      return response.data
    } catch (err) {
      // Don't set error for 2FA, verification, or approval - these are normal flows
      if (!err.requires2FA && !err.requiresVerification && !err.requiresApproval) {
        error.value = err.response?.data?.error || 'Login failed'
      }
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
      // Merge settings into user object (convert snake_case to camelCase)
      const settings = response.data.settings || {}
      const u = response.data.user || {}
      user.value = {
        ...u,
        onboarding_completed: u.onboarding_completed ?? false,
        settings: {
          publicProfile: settings.public_profile ?? false,
          emailNotifications: settings.email_notifications ?? true,
          defaultTags: settings.default_tags || [],
          accountEquity: settings.account_equity || 0,
          // Add other settings as needed
          ...settings
        }
      }
      return user.value
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

  async function checkAuth() {
    if (token.value) {
      // Set the authorization header for subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
      await fetchUser()
    }
  }

  async function verify2FA(tempToken, twoFactorCode) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/auth/verify-2fa', { 
        tempToken,
        twoFactorCode 
      })
      
      const { user: userData, token: authToken } = response.data

      if (response.data.is_first_login === true) {
        pendingOnboarding.value = true
      }

      token.value = authToken
      localStorage.setItem('token', authToken)
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`

      await fetchUser()

      router.push({ name: 'dashboard' })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || '2FA verification failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function completeOnboarding() {
    try {
      await api.post('/users/onboarding-completed')
      pendingOnboarding.value = false
      if (user.value) {
        user.value = { ...user.value, onboarding_completed: true }
      }
    } catch (err) {
      console.error('Failed to mark onboarding completed:', err)
      pendingOnboarding.value = false
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
    pendingOnboarding,
    showOnboardingModal,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    checkAuth,
    resendVerification,
    forgotPassword,
    resetPassword,
    verify2FA,
    completeOnboarding,
    getRegistrationConfig
  }
})