import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

const AI_SESSION_RECOVERY_TIMEOUT_MS = 10 * 60 * 1000
const AI_SESSION_RECOVERY_POLL_MS = 3000

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRecoverableGatewayError(err) {
  const status = err.response?.status
  return !err.response || [408, 499, 502, 503, 504, 520, 521, 522, 523, 524].includes(status) ||
    ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'].includes(err.code)
}

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
   * @param {Object} options - Optional context options such as { tradeId }
   */
  async function createSession(filters = {}, options = {}) {
    loading.value = true
    generating.value = true
    error.value = null
    const request_id = createRequestId()
    const recoveryDeadline = Date.now() + AI_SESSION_RECOVERY_TIMEOUT_MS

    try {
      console.log('[AI_STORE] Creating new session with filters:', filters, 'options:', options)
      const response = await api.post('/ai/sessions', { filters, ...options, request_id })

      currentSession.value = {
        id: response.data.session_id,
        status: 'active',
        followup_count: 0,
        max_followups: response.data.max_followups,
        trade_summary: response.data.trade_summary,
        ai_metadata: response.data.ai_metadata || response.data.trade_summary?.ai_metadata || null,
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
      if (isRecoverableGatewayError(err)) {
        console.warn('[AI_STORE] AI session connection ended before completion; waiting for the backend session', {
          request_id,
          status: err.response?.status,
          code: err.code
        })

        try {
          return await recoverCreatedSession(request_id, recoveryDeadline)
        } catch (recoveryError) {
          error.value = recoveryError.message
          throw recoveryError
        }
      }

      error.value = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to start AI session'
      throw err
    } finally {
      loading.value = false
      generating.value = false
    }
  }

  async function recoverCreatedSession(request_id, deadline) {
    while (Date.now() < deadline) {
      try {
        const sessionsResponse = await api.get('/ai/sessions', { params: { limit: 20 } })
        const recoveredSession = sessionsResponse.data.sessions?.find(session => session.request_id === request_id)

        if (recoveredSession) {
          const sessionResponse = await api.get(`/ai/sessions/${recoveredSession.id}`)
          const session = sessionResponse.data.session

          currentSession.value = {
            id: session.id,
            status: session.status,
            followup_count: session.followup_count,
            max_followups: session.max_followups,
            trade_summary: session.trade_summary,
            ai_metadata: session.ai_metadata || session.trade_summary?.ai_metadata || null,
            expires_at: session.expires_at,
            created_at: session.created_at
          }
          messages.value = session.messages || []

          try {
            await fetchCredits()
          } catch (creditError) {
            console.warn('[AI_STORE] Session recovered but credits could not be refreshed:', creditError)
          }

          console.log('[AI_STORE] Recovered completed AI session:', session.id)
          return {
            session_id: session.id,
            request_id,
            initial_analysis: messages.value.find(message => message.role === 'assistant')?.content || '',
            trade_summary: session.trade_summary,
            ai_metadata: session.ai_metadata || session.trade_summary?.ai_metadata || null,
            followup_count: session.followup_count,
            max_followups: session.max_followups,
            expires_at: session.expires_at,
            recovered: true
          }
        }
      } catch (pollError) {
        if (pollError.response?.status === 401 || pollError.response?.status === 403) {
          throw pollError
        }
        console.warn('[AI_STORE] Waiting for AI session recovery:', pollError.message)
      }

      await delay(Math.min(AI_SESSION_RECOVERY_POLL_MS, Math.max(0, deadline - Date.now())))
    }

    throw new Error('The AI analysis did not finish within 10 minutes. It may still appear in your recent sessions when the provider completes.')
  }

  /**
   * Send a follow-up question
   * @param {string} message - The follow-up question
   */
  async function sendFollowup(message) {
    if (!currentSession.value) {
      throw new Error('No active session')
    }

    const sessionId = currentSession.value.id
    const startingFollowupCount = currentSession.value.followup_count
    const recoveryDeadline = Date.now() + AI_SESSION_RECOVERY_TIMEOUT_MS
    generating.value = true
    error.value = null

    // Add user message immediately for responsiveness
    messages.value.push({
      role: 'user',
      content: message,
      created_at: new Date().toISOString()
    })

    try {
      const response = await api.post(`/ai/sessions/${sessionId}/followup`, {
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
      if (isRecoverableGatewayError(err)) {
        console.warn('[AI_STORE] AI follow-up connection ended before completion; waiting for the backend response', {
          session_id: sessionId,
          status: err.response?.status,
          code: err.code
        })

        try {
          return await recoverFollowup(sessionId, startingFollowupCount, recoveryDeadline)
        } catch (recoveryError) {
          messages.value.pop()
          error.value = recoveryError.message
          throw recoveryError
        }
      }

      // Remove the user message if the request failed
      messages.value.pop()
      error.value = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to send follow-up'
      throw err
    } finally {
      generating.value = false
    }
  }

  async function recoverFollowup(sessionId, startingFollowupCount, deadline) {
    while (Date.now() < deadline) {
      try {
        const sessionResponse = await api.get(`/ai/sessions/${sessionId}`)
        const session = sessionResponse.data.session

        if (session.followup_count > startingFollowupCount) {
          currentSession.value = {
            ...currentSession.value,
            status: session.status,
            followup_count: session.followup_count,
            max_followups: session.max_followups,
            expires_at: session.expires_at
          }
          messages.value = session.messages || []

          try {
            await fetchCredits()
          } catch (creditError) {
            console.warn('[AI_STORE] Follow-up recovered but credits could not be refreshed:', creditError)
          }

          const assistantMessages = messages.value.filter(item => item.role === 'assistant')
          const response = assistantMessages.at(-1)?.content || ''
          console.log('[AI_STORE] Recovered completed AI follow-up for session:', sessionId)
          return {
            response,
            followup_count: session.followup_count,
            max_followups: session.max_followups,
            recovered: true
          }
        }
      } catch (pollError) {
        if (pollError.response?.status === 401 || pollError.response?.status === 403 || pollError.response?.status === 404) {
          throw pollError
        }
        console.warn('[AI_STORE] Waiting for AI follow-up recovery:', pollError.message)
      }

      await delay(Math.min(AI_SESSION_RECOVERY_POLL_MS, Math.max(0, deadline - Date.now())))
    }

    throw new Error('The AI follow-up did not finish within 10 minutes. Please check the session again after the provider completes.')
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
        ai_metadata: session.ai_metadata || session.trade_summary?.ai_metadata || null,
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
