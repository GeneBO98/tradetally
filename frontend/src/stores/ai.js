import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

/**
 * AI Store
 * Manages AI conversation sessions, messages, and credits
 */
export const useAIStore = defineStore('ai', () => {
  // Session state
  const currentSession = ref(null)
  const messages = ref([])
  const loading = ref(false)
  const generating = ref(false)
  const error = ref(null)

  // Credit state
  const credits = ref({
    allocated: null,
    used: 0,
    remaining: null,
    period_end: null,
    unlimited: false
  })

  const creditCosts = ref({
    new_session: 10,
    followup: 2
  })

  // Recent sessions
  const recentSessions = ref([])

  // Computed properties
  const hasActiveSession = computed(() => {
    return currentSession.value && currentSession.value.status === 'active'
  })

  const canAskFollowup = computed(() => {
    if (!currentSession.value) return false
    if (currentSession.value.status !== 'active') return false
    return currentSession.value.followup_count < currentSession.value.max_followups
  })

  const followupsRemaining = computed(() => {
    if (!currentSession.value) return 0
    return Math.max(0, currentSession.value.max_followups - currentSession.value.followup_count)
  })

  const hasCredits = computed(() => {
    if (credits.value.unlimited) return true
    return credits.value.remaining > 0
  })

  const canStartSession = computed(() => {
    if (credits.value.unlimited) return true
    return credits.value.remaining >= creditCosts.value.new_session
  })

  const canSendFollowup = computed(() => {
    if (!canAskFollowup.value) return false
    if (credits.value.unlimited) return true
    return credits.value.remaining >= creditCosts.value.followup
  })

  /**
   * Fetch user's credit balance
   */
  async function fetchCredits() {
    try {
      const response = await api.get('/ai/credits')
      credits.value = response.data.credits
      creditCosts.value = response.data.costs
      return response.data
    } catch (err) {
      console.error('[AI_STORE] Error fetching credits:', err)
      throw err
    }
  }

  /**
   * Create a new AI analysis session
   * @param {Object} filters - Optional filters to apply
   */
  async function createSession(filters = {}) {
    loading.value = true
    generating.value = true
    error.value = null

    try {
      console.log('[AI_STORE] Creating new session with filters:', filters)
      const response = await api.post('/ai/sessions', { filters })

      currentSession.value = {
        id: response.data.session_id,
        status: 'active',
        followup_count: 0,
        max_followups: response.data.max_followups,
        trade_summary: response.data.trade_summary,
        expires_at: response.data.expires_at
      }

      // Store initial analysis as assistant message
      messages.value = [{
        role: 'assistant',
        content: response.data.initial_analysis,
        created_at: new Date().toISOString()
      }]

      // Update credits
      if (response.data.credits_remaining !== undefined && response.data.credits_remaining !== null) {
        credits.value.remaining = response.data.credits_remaining
        credits.value.used = credits.value.allocated - response.data.credits_remaining
      }

      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || err.response?.data?.error || 'Failed to start AI session'
      throw err
    } finally {
      loading.value = false
      generating.value = false
    }
  }

  /**
   * Send a follow-up question
   * @param {string} message - The follow-up question
   */
  async function sendFollowup(message) {
    if (!currentSession.value) {
      throw new Error('No active session')
    }

    generating.value = true
    error.value = null

    // Add user message immediately for responsiveness
    messages.value.push({
      role: 'user',
      content: message,
      created_at: new Date().toISOString()
    })

    try {
      const response = await api.post(`/ai/sessions/${currentSession.value.id}/followup`, {
        message
      })

      // Add assistant response
      messages.value.push({
        role: 'assistant',
        content: response.data.response,
        created_at: new Date().toISOString()
      })

      // Update session state
      currentSession.value.followup_count = response.data.followup_count

      // Update credits
      if (response.data.credits_remaining !== undefined && response.data.credits_remaining !== null) {
        credits.value.remaining = response.data.credits_remaining
        credits.value.used = credits.value.allocated - response.data.credits_remaining
      }

      return response.data
    } catch (err) {
      // Remove the user message if the request failed
      messages.value.pop()
      error.value = err.response?.data?.message || err.response?.data?.error || 'Failed to send follow-up'
      throw err
    } finally {
      generating.value = false
    }
  }

  /**
   * Load an existing session
   * @param {string} sessionId - Session ID to load
   */
  async function loadSession(sessionId) {
    loading.value = true
    error.value = null

    try {
      const response = await api.get(`/ai/sessions/${sessionId}`)
      const session = response.data.session

      currentSession.value = {
        id: session.id,
        status: session.status,
        followup_count: session.followup_count,
        max_followups: session.max_followups,
        trade_summary: session.trade_summary,
        expires_at: session.expires_at,
        created_at: session.created_at
      }

      messages.value = session.messages || []

      return session
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load session'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch user's recent sessions
   */
  async function fetchRecentSessions(limit = 10) {
    try {
      const response = await api.get('/ai/sessions', {
        params: { limit }
      })
      recentSessions.value = response.data.sessions
      return response.data.sessions
    } catch (err) {
      console.error('[AI_STORE] Error fetching recent sessions:', err)
      throw err
    }
  }

  /**
   * Close current session
   */
  async function closeSession() {
    if (!currentSession.value) return

    try {
      await api.post(`/ai/sessions/${currentSession.value.id}/close`)
      currentSession.value.status = 'closed'
    } catch (err) {
      console.error('[AI_STORE] Error closing session:', err)
      // Don't throw - session might already be closed
    }
  }

  /**
   * Reset store state (start fresh)
   */
  function reset() {
    currentSession.value = null
    messages.value = []
    error.value = null
    loading.value = false
    generating.value = false
  }

  /**
   * Clear error state
   */
  function clearError() {
    error.value = null
  }

  return {
    // State
    currentSession,
    messages,
    loading,
    generating,
    error,
    credits,
    creditCosts,
    recentSessions,

    // Computed
    hasActiveSession,
    canAskFollowup,
    followupsRemaining,
    hasCredits,
    canStartSession,
    canSendFollowup,

    // Actions
    fetchCredits,
    createSession,
    sendFollowup,
    loadSession,
    fetchRecentSessions,
    closeSession,
    reset,
    clearError
  }
})
